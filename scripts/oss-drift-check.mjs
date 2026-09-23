#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import { dirname, isAbsolute, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(SCRIPT_DIR, 'oss-drift-baseline.json');
const MAPPING = Object.freeze({
  canonical: 'packages/hive-mind-core/src',
  oss: 'packages/core/src',
  ignoredDirectories: ['dist', 'node_modules'],
  ignoredFileSuffixes: ['.test.ts', '.tsbuildinfo'],
});
const FORBIDDEN_EXPORTS = Object.freeze({
  paths: [
    'mind/evolution-runs.ts',
    'mind/execution-traces.ts',
    'mind/improvement-signals.ts',
  ],
  pathPrefixes: ['vault.ts', 'compliance/', 'governance/'],
  markers: [
    { path: 'mind/db.ts', token: 'install_audit' },
    { path: 'mind/schema.ts', token: 'install_audit' },
    // The governance context (D-1). The mirror's schema.ts names ai_interactions
    // in a comment listing what it excludes, so the schema marker is the DDL.
    { path: 'mind/db.ts', token: 'ai_interactions' },
    { path: 'mind/schema.ts', token: 'CREATE TABLE IF NOT EXISTS ai_interactions' },
  ],
});
const VALID_ADAPTATION_KINDS = new Set(['branding', 'import', 'layout', 'logger']);
const VALID_STATES = new Set(['different', 'only-canonical', 'only-oss']);
const VALID_DISPOSITIONS = new Set([
  'forward-port',
  'product-curation',
  'reconcile',
  'reverse-port',
]);
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const decoder = new TextDecoder('utf-8', { fatal: true });

class ConfigurationError extends Error {}

function compareOrdinal(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertRecord(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ConfigurationError(`${label} must be an object`);
  }
}

function assertExactKeys(value, expected, label) {
  assertRecord(value, label);
  const actual = Object.keys(value).sort(compareOrdinal);
  const wanted = [...expected].sort(compareOrdinal);
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new ConfigurationError(
      `${label} has unexpected keys: expected ${wanted.join(', ')}, got ${actual.join(', ')}`,
    );
  }
}

function assertExactArray(actual, expected, label) {
  if (!Array.isArray(actual) || JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new ConfigurationError(`${label} does not match the hardcoded publication policy`);
  }
}

function assertCanonicalPath(value, label) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.includes('\\') ||
    isAbsolute(value) ||
    value.startsWith('/') ||
    value.split('/').some((segment) => segment === '' || segment === '.' || segment === '..') ||
    posix.normalize(value) !== value
  ) {
    throw new ConfigurationError(`${label} must be a canonical repository-relative path`);
  }
}

function assertSortedUnique(values, label, pathSelector = (value) => value) {
  if (!Array.isArray(values)) {
    throw new ConfigurationError(`${label} must be an array`);
  }
  const paths = values.map(pathSelector);
  const expected = [...new Set(paths)].sort(compareOrdinal);
  if (JSON.stringify(paths) !== JSON.stringify(expected)) {
    throw new ConfigurationError(`${label} must be sorted by path and contain no duplicates`);
  }
}

function loadBaseline() {
  let baseline;
  try {
    baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'));
  } catch (error) {
    throw new ConfigurationError(`cannot read baseline ${BASELINE_PATH}: ${error.message}`);
  }

  assertExactKeys(
    baseline,
    [
      'schemaVersion',
      'mapping',
      'parityPaths',
      'intentionalAdaptations',
      'knownReviewedBlockers',
      'unreviewedDifferences',
      'forbiddenExports',
    ],
    'baseline',
  );
  if (baseline.schemaVersion !== 1) {
    throw new ConfigurationError('baseline.schemaVersion must be 1');
  }

  assertExactKeys(
    baseline.mapping,
    ['canonical', 'oss', 'ignoredDirectories', 'ignoredFileSuffixes'],
    'baseline.mapping',
  );
  for (const key of Object.keys(MAPPING)) {
    const expected = MAPPING[key];
    if (Array.isArray(expected)) {
      assertExactArray(baseline.mapping[key], expected, `baseline.mapping.${key}`);
    } else if (baseline.mapping[key] !== expected) {
      throw new ConfigurationError(`baseline.mapping.${key} does not match the hardcoded mapping`);
    }
  }

  assertExactKeys(
    baseline.forbiddenExports,
    ['paths', 'pathPrefixes', 'markers'],
    'baseline.forbiddenExports',
  );
  assertExactArray(
    baseline.forbiddenExports.paths,
    FORBIDDEN_EXPORTS.paths,
    'baseline.forbiddenExports.paths',
  );
  assertExactArray(
    baseline.forbiddenExports.pathPrefixes,
    FORBIDDEN_EXPORTS.pathPrefixes,
    'baseline.forbiddenExports.pathPrefixes',
  );
  assertExactArray(
    baseline.forbiddenExports.markers,
    FORBIDDEN_EXPORTS.markers,
    'baseline.forbiddenExports.markers',
  );

  assertSortedUnique(baseline.parityPaths, 'baseline.parityPaths', (entry) => entry?.path);
  for (const [index, entry] of baseline.parityPaths.entries()) {
    const label = `baseline.parityPaths[${index}]`;
    assertExactKeys(entry, ['path', 'sha256'], label);
    assertCanonicalPath(entry.path, `${label}.path`);
    if (!HASH_PATTERN.test(entry.sha256)) {
      throw new ConfigurationError(`${label}.sha256 must be a lowercase SHA-256 hash`);
    }
  }

  assertSortedUnique(
    baseline.intentionalAdaptations,
    'baseline.intentionalAdaptations',
    (entry) => entry?.path,
  );
  for (const [index, entry] of baseline.intentionalAdaptations.entries()) {
    const label = `baseline.intentionalAdaptations[${index}]`;
    assertExactKeys(entry, ['path', 'kinds', 'canonicalSha256', 'ossSha256'], label);
    assertCanonicalPath(entry.path, `${label}.path`);
    assertSortedUnique(entry.kinds, `${label}.kinds`);
    if (entry.kinds.length === 0 || entry.kinds.some((kind) => !VALID_ADAPTATION_KINDS.has(kind))) {
      throw new ConfigurationError(`${label}.kinds contains an unsupported adaptation kind`);
    }
    if (!HASH_PATTERN.test(entry.canonicalSha256) || !HASH_PATTERN.test(entry.ossSha256)) {
      throw new ConfigurationError(`${label} must contain lowercase SHA-256 hashes`);
    }
    if (entry.canonicalSha256 === entry.ossSha256) {
      throw new ConfigurationError(`${label} must describe an actual adaptation, not parity`);
    }
  }

  assertSortedUnique(
    baseline.knownReviewedBlockers,
    'baseline.knownReviewedBlockers',
    (entry) => entry?.path,
  );
  for (const [index, entry] of baseline.knownReviewedBlockers.entries()) {
    const label = `baseline.knownReviewedBlockers[${index}]`;
    assertExactKeys(entry, ['path', 'state', 'disposition'], label);
    assertCanonicalPath(entry.path, `${label}.path`);
    if (!VALID_STATES.has(entry.state)) {
      throw new ConfigurationError(`${label}.state is unsupported`);
    }
    if (!VALID_DISPOSITIONS.has(entry.disposition)) {
      throw new ConfigurationError(`${label}.disposition is unsupported`);
    }
  }

  assertSortedUnique(
    baseline.unreviewedDifferences,
    'baseline.unreviewedDifferences',
    (entry) => entry?.path,
  );
  for (const [index, entry] of baseline.unreviewedDifferences.entries()) {
    const label = `baseline.unreviewedDifferences[${index}]`;
    assertExactKeys(entry, ['path', 'state'], label);
    assertCanonicalPath(entry.path, `${label}.path`);
    if (!VALID_STATES.has(entry.state)) {
      throw new ConfigurationError(`${label}.state is unsupported`);
    }
  }

  const classified = [
    ...baseline.parityPaths.map((entry) => entry.path),
    ...baseline.intentionalAdaptations.map((entry) => entry.path),
    ...baseline.knownReviewedBlockers.map((entry) => entry.path),
    ...baseline.unreviewedDifferences.map((entry) => entry.path),
  ];
  const duplicate = classified.find((path, index) => classified.indexOf(path) !== index);
  if (duplicate) {
    throw new ConfigurationError(`baseline classifies ${duplicate} more than once`);
  }
  const privateCategory = classified.find((path) => isPrivateExclusion(path));
  if (privateCategory) {
    throw new ConfigurationError(`baseline must not reclassify private exclusion ${privateCategory}`);
  }

  return baseline;
}

function resolveGitRoot(candidate, label) {
  let resolved;
  try {
    resolved = realpathSync(candidate);
    const root = execFileSync('git', ['-C', resolved, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    }).trim();
    return realpathSync(root);
  } catch (error) {
    throw new ConfigurationError(`${label} is not a readable Git worktree: ${candidate}`);
  }
}

function readUtf8Normalized(filePath) {
  let text;
  try {
    text = decoder.decode(readFileSync(filePath));
  } catch (error) {
    throw new ConfigurationError(`cannot read UTF-8 source file ${filePath}: ${error.message}`);
  }
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

function inventory(root, label) {
  let rootStat;
  try {
    rootStat = lstatSync(root);
  } catch {
    throw new ConfigurationError(`${label} mapped source directory is missing: ${root}`);
  }
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new ConfigurationError(`${label} mapped source must be a real directory: ${root}`);
  }

  const files = new Map();
  const casing = new Map();
  const walk = (directory, prefix = '') => {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
        compareOrdinal(left.name, right.name),
      );
    } catch (error) {
      throw new ConfigurationError(`cannot inventory ${label} directory ${directory}: ${error.message}`);
    }

    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolutePath = join(directory, entry.name);
      const stat = lstatSync(absolutePath);
      if (stat.isSymbolicLink()) {
        throw new ConfigurationError(`${label} mapped inventory contains symlink: ${relativePath}`);
      }
      if (stat.isDirectory()) {
        if (!MAPPING.ignoredDirectories.includes(entry.name)) {
          walk(absolutePath, relativePath);
        }
        continue;
      }
      if (!stat.isFile()) {
        throw new ConfigurationError(`${label} mapped inventory contains special node: ${relativePath}`);
      }
      if (MAPPING.ignoredFileSuffixes.some((suffix) => relativePath.endsWith(suffix))) {
        continue;
      }

      const folded = relativePath.toLowerCase();
      const previous = casing.get(folded);
      if (previous && previous !== relativePath) {
        throw new ConfigurationError(
          `${label} mapped inventory has case collision: ${previous} / ${relativePath}`,
        );
      }
      casing.set(folded, relativePath);
      const text = readUtf8Normalized(absolutePath);
      files.set(relativePath, {
        hash: createHash('sha256').update(text, 'utf-8').digest('hex'),
        text,
      });
    }
  };

  walk(root);
  if (files.size === 0) {
    throw new ConfigurationError(`${label} mapped inventory is empty: ${root}`);
  }
  return files;
}

function resolveMappedRoot(repositoryRoot, relativePath, label) {
  let current = repositoryRoot;
  for (const segment of relativePath.split('/')) {
    current = join(current, segment);
    let stat;
    try {
      stat = lstatSync(current);
    } catch {
      throw new ConfigurationError(`${label} mapped path component is missing: ${current}`);
    }
    if (stat.isSymbolicLink()) {
      throw new ConfigurationError(`${label} mapped path contains ancestor symlink: ${current}`);
    }
    if (!stat.isDirectory()) {
      throw new ConfigurationError(`${label} mapped path component is not a directory: ${current}`);
    }
  }
  return current;
}

function isPrivateExclusion(path) {
  if (FORBIDDEN_EXPORTS.paths.includes(path)) return true;
  return FORBIDDEN_EXPORTS.pathPrefixes.some((prefix) =>
    prefix.endsWith('/') ? path.startsWith(prefix) : path === prefix || path.startsWith(`${prefix}/`),
  );
}

function observedState(canonical, oss) {
  if (canonical && oss) return canonical.hash === oss.hash ? 'equal' : 'different';
  if (canonical) return 'only-canonical';
  if (oss) return 'only-oss';
  return 'absent';
}

function hasForbiddenMarker(text, token) {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
}

function gitReceipt(root, scopedPaths) {
  const head = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {
    encoding: 'utf-8',
    windowsHide: true,
  }).trim();
  const status = execFileSync(
    'git',
    ['-C', root, 'status', '--porcelain=v1', '--untracked-files=all'],
    { encoding: 'utf-8', windowsHide: true },
  ).trim();
  const scopedStatus = execFileSync(
    'git',
    ['-C', root, 'status', '--porcelain=v1', '--untracked-files=all', '--', ...scopedPaths],
    { encoding: 'utf-8', windowsHide: true },
  ).trim();
  return { head, dirty: status.length > 0, scopedStatus };
}

function showSection(title, entries) {
  console.log(`${title}: ${entries.length}`);
  for (const entry of [...entries].sort(compareOrdinal)) {
    console.log(`  ${entry}`);
  }
}

function run() {
  if (process.argv.length > 3) {
    throw new ConfigurationError('usage: node scripts/oss-drift-check.mjs [path-to-oss-checkout]');
  }
  const baseline = loadBaseline();
  const canonicalRoot = resolveGitRoot(join(SCRIPT_DIR, '..'), 'canonical repository');
  const requestedOss =
    process.argv[2] ??
    (process.env.OSS_HIVE_MIND_DIR?.trim() || resolve(canonicalRoot, '..', 'hive-mind'));
  const ossRoot = resolveGitRoot(resolve(process.cwd(), requestedOss), 'OSS repository');
  if (canonicalRoot.toLowerCase() === ossRoot.toLowerCase()) {
    throw new ConfigurationError('canonical and OSS repositories must be different Git worktrees');
  }

  const canonicalFiles = inventory(
    resolveMappedRoot(canonicalRoot, MAPPING.canonical, 'canonical'),
    'canonical',
  );
  const ossFiles = inventory(resolveMappedRoot(ossRoot, MAPPING.oss, 'OSS'), 'OSS');
  const crossRepoCasing = new Map();
  for (const path of [...canonicalFiles.keys(), ...ossFiles.keys()]) {
    const folded = path.toLowerCase();
    const previous = crossRepoCasing.get(folded);
    if (previous && previous !== path) {
      throw new ConfigurationError(`mapped inventories have case collision: ${previous} / ${path}`);
    }
    crossRepoCasing.set(folded, path);
  }

  const parity = new Map(baseline.parityPaths.map((entry) => [entry.path, entry]));
  const adaptations = new Map(baseline.intentionalAdaptations.map((entry) => [entry.path, entry]));
  const blockers = new Map(baseline.knownReviewedBlockers.map((entry) => [entry.path, entry]));
  const knownUnreviewed = new Map(
    baseline.unreviewedDifferences.map((entry) => [entry.path, entry]),
  );
  const reviewedAdaptations = [];
  const intentionalExclusions = [];
  const knownBlockers = [];
  const unreviewed = [];
  const forbidden = [];
  const observedPaths = new Set();
  const union = [...new Set([...canonicalFiles.keys(), ...ossFiles.keys()])].sort(compareOrdinal);

  for (const path of union) {
    observedPaths.add(path);
    const canonical = canonicalFiles.get(path);
    const oss = ossFiles.get(path);
    const state = observedState(canonical, oss);
    if (isPrivateExclusion(path)) {
      if (oss) {
        forbidden.push(`FORBIDDEN-OSS-CONTENT ${path}`);
      } else if (canonical) {
        intentionalExclusions.push(path);
      }
      continue;
    }

    const parityEntry = parity.get(path);
    if (parityEntry) {
      if (
        state === 'equal' &&
        canonical.hash === parityEntry.sha256 &&
        oss.hash === parityEntry.sha256
      ) {
        continue;
      }
      unreviewed.push(`BASELINE-DRIFT ${path} expected equal, observed ${state}`);
      continue;
    }

    const adaptation = adaptations.get(path);
    if (adaptation) {
      if (
        state === 'different' &&
        canonical.hash === adaptation.canonicalSha256 &&
        oss.hash === adaptation.ossSha256
      ) {
        reviewedAdaptations.push(`${path} [${adaptation.kinds.join(',')}]`);
      } else {
        unreviewed.push(`BASELINE-DRIFT ${path} reviewed adaptation bytes changed (${state})`);
      }
      continue;
    }

    const blocker = blockers.get(path);
    if (blocker) {
      if (state === blocker.state) {
        knownBlockers.push(`${path} (${state}; ${blocker.disposition})`);
      } else {
        unreviewed.push(
          `BASELINE-DRIFT ${path} expected ${blocker.state}, observed ${state}`,
        );
      }
      continue;
    }

    const unreviewedEntry = knownUnreviewed.get(path);
    if (unreviewedEntry) {
      if (state === unreviewedEntry.state) {
        unreviewed.push(`${path} (${state})`);
      } else {
        unreviewed.push(
          `BASELINE-DRIFT ${path} expected ${unreviewedEntry.state}, observed ${state}`,
        );
      }
      continue;
    }

    unreviewed.push(`NEW ${path} (${state})`);
  }

  for (const path of [
    ...parity.keys(),
    ...adaptations.keys(),
    ...blockers.keys(),
    ...knownUnreviewed.keys(),
  ]) {
    if (!observedPaths.has(path)) {
      unreviewed.push(`STALE-BASELINE ${path} (absent)`);
    }
  }

  for (const marker of FORBIDDEN_EXPORTS.markers) {
    const file = ossFiles.get(marker.path);
    if (!file) continue;
    if (hasForbiddenMarker(file.text, marker.token)) {
      forbidden.push(`FORBIDDEN-OSS-MARKER ${marker.path}:${marker.token}`);
    }
  }

  const canonicalReceipt = gitReceipt(canonicalRoot, [
    MAPPING.canonical,
    'scripts/oss-drift-check.mjs',
    'scripts/oss-drift-baseline.json',
    'scripts/oss-drift-check.sh',
  ]);
  const ossReceipt = gitReceipt(ossRoot, [MAPPING.oss]);
  if (canonicalReceipt.scopedStatus) {
    unreviewed.push('SCOPED-DIRTY canonical checker, baseline, wrapper, or mapped source');
  }
  if (ossReceipt.scopedStatus) {
    unreviewed.push('SCOPED-DIRTY OSS mapped source');
  }
  console.log(
    `CANONICAL ${canonicalReceipt.head} ${canonicalReceipt.dirty ? 'dirty' : 'clean'} ${canonicalRoot}`,
  );
  console.log(`OSS ${ossReceipt.head} ${ossReceipt.dirty ? 'dirty' : 'clean'} ${ossRoot}`);
  console.log(`PARITY: ${parity.size}`);
  showSection('REVIEWED ADAPTATIONS', reviewedAdaptations);
  showSection('INTENTIONAL OSS EXCLUSIONS', intentionalExclusions);
  showSection('KNOWN REVIEWED BLOCKERS', knownBlockers);
  showSection('UNREVIEWED DIFFERENCES', unreviewed);
  showSection('FORBIDDEN EXPORTS', forbidden);

  const blocked = knownBlockers.length || unreviewed.length || forbidden.length;
  if (blocked) {
    console.log(
      '[oss-drift-check] release blocked: reconcile in the canonical monorepo, then use a curated forward-port; never publish a raw split.',
    );
  }
  return blocked ? 1 : 0;
}

try {
  process.exitCode = run();
} catch (error) {
  if (error instanceof ConfigurationError) {
    console.error(`[oss-drift-check] CONFIGURATION ERROR: ${error.message}`);
  } else {
    console.error(`[oss-drift-check] UNEXPECTED ERROR: ${error?.stack ?? error}`);
  }
  process.exitCode = 2;
}
