/**
 * E-4 — Regression guard for scripts/oss-subtree-split.sh.
 *
 * This is mostly a STATIC analysis of the script + the package structure it
 * operates on. Only the ref-preservation test runs `git subtree split`, and
 * only against a throwaway fixture repo. The static tests lock down:
 *
 *   1. The script exists and is executable.
 *   2. The list of forbidden top-level entries the script checks for
 *      is the actual list of monorepo-only directories. If we ever
 *      add a new monorepo-level dir (e.g. `tools/`) without updating
 *      the script's forbidden list, a real subtree-split could leak
 *      it; this test surfaces that gap.
 *   3. Every `packages/hive-mind-*` directory contains the package-
 *      level files an OSS-mirror expects (package.json + a real src/
 *      or index file at minimum). If a package is gutted to `export {}`
 *      we don't want the OSS mirror to ship an empty shell.
 *   4. The forbidden list does NOT include legitimate package-internal
 *      directories (docs/, assets/, src/, tests/, dist/) — those exist
 *      inside packages and must be allowed.
 */

import { describe, it, expect } from 'vitest';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..');
const SCRIPT_PATH = join(REPO_ROOT, 'scripts', 'oss-subtree-split.sh');
const DRIFT_SCRIPT_PATH = join(REPO_ROOT, 'scripts', 'oss-drift-check.sh');
const DRIFT_NODE_PATH = join(REPO_ROOT, 'scripts', 'oss-drift-check.mjs');
const DRIFT_BASELINE_PATH = join(REPO_ROOT, 'scripts', 'oss-drift-baseline.json');
const RETIRED_PARITY_SCRIPT_PATH = join(REPO_ROOT, 'scripts', 'parity-check.sh');
const SUPERSEDED_PLAN_PATH = join(
  REPO_ROOT,
  'docs',
  'plans',
  'E-4-OSS-EXTRACTION-VERIFIED-2026-05-20.md',
);
const PACKAGES_DIR = join(REPO_ROOT, 'packages');

// The ref-preservation test runs the real script four times (six subtree splits).
// On Windows each split plus the script's grep pipelines costs MSYS process spawns:
// measured 28–54 s alone on 2026-09-21, so the 30 s default fails even unloaded.
const REAL_SPLIT_TIMEOUT_MS = 120_000;

function normalizedDriftHash(content: string): string {
  return createHash('sha256')
    .update(content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'), 'utf-8')
    .digest('hex');
}

function commitFixtureRepo(repo: string): void {
  execFileSync('git', ['init', '--quiet'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['config', 'core.autocrlf', 'false'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'drift-test@example.invalid'], {
    cwd: repo,
    stdio: 'ignore',
  });
  execFileSync('git', ['config', 'user.name', 'Drift Test'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['add', '--all'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: repo, stdio: 'ignore' });
}

function createDriftFixture() {
  const tempRoot = mkdtempSync(join(tmpdir(), 'waggle oss drift-'));
  const monoRepo = join(tempRoot, 'mono');
  const ossRepo = join(tempRoot, 'oss');
  const canonicalRoot = join(monoRepo, 'packages', 'hive-mind-core', 'src');
  const ossRoot = join(ossRepo, 'packages', 'core', 'src');
  const scriptsRoot = join(monoRepo, 'scripts');
  const canonicalAdaptation = "import { logger } from '@waggle/core';\n";
  const ossAdaptation = "import { logger } from './logger.js';\r\n";
  const baseline = {
    schemaVersion: 1,
    mapping: {
      canonical: 'packages/hive-mind-core/src',
      oss: 'packages/core/src',
      ignoredDirectories: ['dist', 'node_modules'],
      ignoredFileSuffixes: ['.test.ts', '.tsbuildinfo'],
    },
    parityPaths: [
      {
        path: 'equal.ts',
        sha256: normalizedDriftHash('export const equal = true;\n'),
      },
    ],
    intentionalAdaptations: [
      {
        path: 'logger.ts',
        kinds: ['import', 'logger'],
        canonicalSha256: normalizedDriftHash(canonicalAdaptation),
        ossSha256: normalizedDriftHash(ossAdaptation),
      },
    ],
    knownReviewedBlockers: [] as Array<Record<string, string>>,
    unreviewedDifferences: [] as Array<Record<string, string>>,
    forbiddenExports: {
      paths: [
        'mind/evolution-runs.ts',
        'mind/execution-traces.ts',
        'mind/improvement-signals.ts',
      ],
      pathPrefixes: ['vault.ts', 'compliance/'],
      markers: [
        { path: 'mind/db.ts', token: 'install_audit' },
        { path: 'mind/schema.ts', token: 'install_audit' },
      ],
    },
  };

  mkdirSync(join(canonicalRoot, 'mind'), { recursive: true });
  mkdirSync(join(ossRoot, 'mind'), { recursive: true });
  mkdirSync(scriptsRoot, { recursive: true });
  copyFileSync(DRIFT_NODE_PATH, join(scriptsRoot, 'oss-drift-check.mjs'));
  writeFileSync(join(canonicalRoot, 'equal.ts'), 'export const equal = true;\n');
  writeFileSync(join(ossRoot, 'equal.ts'), 'export const equal = true;\r\n');
  writeFileSync(join(canonicalRoot, 'logger.ts'), canonicalAdaptation);
  writeFileSync(join(ossRoot, 'logger.ts'), ossAdaptation);
  writeFileSync(join(canonicalRoot, 'mind', 'evolution-runs.ts'), 'private implementation\n');

  const writeBaseline = () =>
    writeFileSync(
      join(scriptsRoot, 'oss-drift-baseline.json'),
      `${JSON.stringify(baseline, null, 2)}\n`,
    );
  writeBaseline();
  commitFixtureRepo(monoRepo);
  commitFixtureRepo(ossRepo);

  return {
    tempRoot,
    monoRepo,
    ossRepo,
    canonicalRoot,
    ossRoot,
    baseline,
    writeBaseline,
    run: () =>
      spawnSync(process.execPath, ['scripts/oss-drift-check.mjs', ossRepo], {
        cwd: monoRepo,
        encoding: 'utf-8',
        env: { ...process.env, OSS_HIVE_MIND_DIR: undefined },
      }),
  };
}

function resolveBashExecutable(): string {
  if (process.platform !== 'win32') return 'bash';

  let current = resolve(execFileSync('git', ['--exec-path'], { encoding: 'utf-8' }).trim());
  for (let depth = 0; depth < 6; depth += 1) {
    for (const candidate of [
      join(current, 'bash.exe'),
      join(current, 'bin', 'bash.exe'),
      join(current, 'usr', 'bin', 'bash.exe'),
    ]) {
      if (existsSync(candidate)) return candidate;
    }
    current = resolve(current, '..');
  }

  throw new Error('Git Bash was not found relative to the active git.exe installation.');
}

describe('oss-subtree-split.sh — static guards', () => {
  it('script exists at the documented path', () => {
    expect(existsSync(SCRIPT_PATH)).toBe(true);
    expect(statSync(SCRIPT_PATH).isFile()).toBe(true);
  });

  it('script has a shebang for bash', () => {
    const content = readFileSync(SCRIPT_PATH, 'utf-8');
    expect(content.startsWith('#!/usr/bin/env bash')).toBe(true);
  });

  it('script uses set -euo pipefail (fail-fast)', () => {
    const content = readFileSync(SCRIPT_PATH, 'utf-8');
    expect(content).toMatch(/set -euo pipefail/);
  });

  it('discovers packages/hive-mind-* directories dynamically (Wave 2/3 auto-included)', () => {
    const content = readFileSync(SCRIPT_PATH, 'utf-8');
    // The default-PACKAGES discovery loop is the seam that picks up
    // newly-added hive-mind-* packages without script edits.
    expect(content).toMatch(/packages\/hive-mind-\*/);
    expect(content).toMatch(/mapfile.*PACKAGES.*ls -1d/);
  });
});

describe('oss-subtree-split.sh — forbidden monorepo-level entries', () => {
  /**
   * Mirror of the script's forbidden-list. If you add a new monorepo-
   * level top-level dir, update BOTH the script and this test (and
   * verify no package legitimately uses that name internally).
   */
  const FORBIDDEN: readonly string[] = [
    'apps',
    'packages',
    'sidecar',
    '.planning',
    '.scratch',
    '.mind',
    'benchmarks',
  ];

  // .planning / .scratch / .mind are gitignored working dirs — forbidden from
  // the OSS export if present, but legitimately ABSENT on a clean checkout (CI).
  // The "dead guard" existence check therefore applies only to the tracked dirs;
  // a gitignored working dir that's simply not present is fine.
  const GITIGNORED_WORKING_DIRS = new Set(['.planning', '.scratch', '.mind']);
  it('every tracked forbidden entry exists as a monorepo-level dir (otherwise the guard is dead)', () => {
    for (const f of FORBIDDEN) {
      const monorepoLevel = join(REPO_ROOT, f);
      if (GITIGNORED_WORKING_DIRS.has(f) && !existsSync(monorepoLevel)) continue;
      expect(
        existsSync(monorepoLevel),
        `Forbidden entry '${f}' is not present at monorepo root — the script's negative-assertion guard is dead.`,
      ).toBe(true);
    }
  });

  it('script lists every forbidden entry in its loop', () => {
    const content = readFileSync(SCRIPT_PATH, 'utf-8');
    for (const f of FORBIDDEN) {
      // Each forbidden token appears in the `for forbidden in …` loop.
      expect(
        content,
        `Script does not list '${f}' as a forbidden top-level entry.`,
      ).toContain(f);
    }
  });

  it('forbidden list does not include legitimate package-internal dirs', () => {
    const PACKAGE_INTERNAL_DIRS: readonly string[] = ['src', 'tests', 'dist', 'docs', 'assets'];
    const content = readFileSync(SCRIPT_PATH, 'utf-8');
    // Locate the `for forbidden in` line specifically — we want to
    // ensure the FORBIDDEN tokens don't accidentally include things
    // every package has internally.
    const match = content.match(/for forbidden in\s+([^\n;]+)/);
    expect(match).toBeTruthy();
    const tokens = (match![1] ?? '').trim().split(/\s+/);
    for (const internal of PACKAGE_INTERNAL_DIRS) {
      expect(
        tokens.includes(internal),
        `Script forbids '${internal}' but that's a legitimate package-internal dir — splits would always fail.`,
      ).toBe(false);
    }
  });
});

describe('oss-subtree-split.sh — package-level shape', () => {
  function listHiveMindPackages(): string[] {
    return readdirSync(PACKAGES_DIR)
      .filter((name) => name.startsWith('hive-mind-'))
      .filter((name) => statSync(join(PACKAGES_DIR, name)).isDirectory());
  }

  it('at least one hive-mind-* package exists (so the script has something to split)', () => {
    expect(listHiveMindPackages().length).toBeGreaterThan(0);
  });

  it.each(listHiveMindPackages())('package %s has package.json', (name) => {
    const pkgJson = join(PACKAGES_DIR, name, 'package.json');
    expect(existsSync(pkgJson), `${name} missing package.json`).toBe(true);
  });

  it.each(listHiveMindPackages())('package %s has src/ (real code, not a placeholder)', (name) => {
    const src = join(PACKAGES_DIR, name, 'src');
    expect(existsSync(src), `${name} missing src/`).toBe(true);
  });

  it.each(listHiveMindPackages())('package %s package.json declares Apache-2.0 license', (name) => {
    const pkg = JSON.parse(readFileSync(join(PACKAGES_DIR, name, 'package.json'), 'utf-8'));
    expect(
      pkg.license,
      `${name} must be Apache-2.0 to participate in the curated OSS distribution.`,
    ).toBe('Apache-2.0');
  });
});

describe('hive-mind publication boundary', () => {
  it('keeps the canonical monorepo core package private', () => {
    const pkg = JSON.parse(
      readFileSync(join(PACKAGES_DIR, 'hive-mind-core', 'package.json'), 'utf-8'),
    );

    expect(
      pkg.private,
      'The canonical package contains Waggle-only source and must never be published directly.',
    ).toBe(true);
  });

  it('routes mirror remediation through a curated forward-port, never a raw split push', () => {
    const splitScript = readFileSync(SCRIPT_PATH, 'utf-8');
    const driftScript = readFileSync(DRIFT_NODE_PATH, 'utf-8');

    expect(splitScript).toContain('DO NOT push them raw');
    expect(splitScript).toContain('NOT OSS-publishable as-is');
    expect(driftScript).toContain('curated forward-port');
    expect(driftScript).not.toContain(
      'regenerate the mirror via scripts/oss-subtree-split.sh',
    );
  });

  it('validates detached split commits before replacing named export branches', () => {
    const content = readFileSync(SCRIPT_PATH, 'utf-8');
    const splitAt = content.indexOf('CANDIDATE_SHA=$(git subtree split --prefix="$PREFIX" | tail -n 1)');
    const promoteAt = content.indexOf('git update-ref --stdin');

    expect(content).not.toContain('git subtree split --prefix="$PREFIX" --branch=');
    expect(content).toContain('VALIDATED_BRANCHES+=("$BRANCH")');
    expect(content).toContain('EXPECTED_OLD_SHAS');
    expect(content).toContain('if ! WORKTREE_LIST=$(git worktree list --porcelain); then');
    expect(content).not.toMatch(/git worktree list --porcelain\s*\|/);
    expect(splitAt).toBeGreaterThan(-1);
    expect(promoteAt).toBeGreaterThan(splitAt);
  });

  it('preserves the last validated ref and removes a rejected candidate', () => {
    const tempRepo = mkdtempSync(join(tmpdir(), 'waggle-oss-split-'));
    const bash = resolveBashExecutable();
    const runGit = (...args: string[]): string =>
      execFileSync('git', args, { cwd: tempRepo, encoding: 'utf-8' }).trim();

    try {
      mkdirSync(join(tempRepo, 'packages', 'hive-mind-test', 'src'), { recursive: true });
      mkdirSync(join(tempRepo, 'packages', 'hive-mind-bad', 'src'), { recursive: true });
      mkdirSync(join(tempRepo, 'scripts'), { recursive: true });
      writeFileSync(join(tempRepo, 'packages', 'hive-mind-test', 'src', 'index.ts'), 'export {};\n');
      writeFileSync(join(tempRepo, 'packages', 'hive-mind-bad', 'src', 'index.ts'), 'export {};\n');
      copyFileSync(SCRIPT_PATH, join(tempRepo, 'scripts', 'oss-subtree-split.sh'));
      runGit('init');
      runGit('config', 'user.email', 'oss-guard@example.invalid');
      runGit('config', 'user.name', 'OSS Guard Test');
      runGit('add', '.');
      runGit('commit', '-m', 'initial safe package');

      const first = spawnSync(
        bash,
        ['scripts/oss-subtree-split.sh', 'hive-mind-test', 'hive-mind-bad'],
        { cwd: tempRepo, encoding: 'utf-8' },
      );
      expect(first.status, first.stderr).toBe(0);
      const stableBefore = runGit('rev-parse', 'oss-hive-mind-test-export');
      const secondStableBefore = runGit('rev-parse', 'oss-hive-mind-bad-export');

      writeFileSync(
        join(tempRepo, 'packages', 'hive-mind-test', 'src', 'index.ts'),
        'export const changed = true;\n',
      );
      mkdirSync(join(tempRepo, 'packages', 'hive-mind-bad', 'packages'), { recursive: true });
      writeFileSync(
        join(tempRepo, 'packages', 'hive-mind-bad', 'packages', 'leak.txt'),
        'must be rejected\n',
      );
      runGit('add', '.');
      runGit('commit', '-m', 'introduce forbidden top-level path');

      const rejected = spawnSync(
        bash,
        ['scripts/oss-subtree-split.sh', 'hive-mind-test', 'hive-mind-bad'],
        { cwd: tempRepo, encoding: 'utf-8' },
      );
      expect(rejected.status, rejected.stderr).toBe(2);
      expect(runGit('rev-parse', 'oss-hive-mind-test-export')).toBe(stableBefore);
      expect(runGit('rev-parse', 'oss-hive-mind-bad-export')).toBe(secondStableBefore);
      expect(runGit('branch', '--list', '*-candidate-*')).toBe('');

      const missingPackage = spawnSync(
        bash,
        ['scripts/oss-subtree-split.sh', 'hive-mind-missing'],
        { cwd: tempRepo, encoding: 'utf-8' },
      );
      expect(missingPackage.status, missingPackage.stderr).toBe(2);
      expect(runGit('rev-parse', 'oss-hive-mind-test-export')).toBe(stableBefore);

      rmSync(join(tempRepo, 'packages', 'hive-mind-bad', 'packages'), {
        recursive: true,
        force: true,
      });
      writeFileSync(
        join(tempRepo, 'packages', 'hive-mind-bad', 'src', 'index.ts'),
        'export const changedToo = true;\n',
      );
      runGit('add', '.');
      runGit('commit', '-m', 'make both candidates safe');

      const blockedRefLock = join(
        tempRepo,
        '.git',
        'refs',
        'heads',
        'oss-hive-mind-bad-export.lock',
      );
      writeFileSync(blockedRefLock, 'locked\n');
      const rejectedTransaction = spawnSync(
        bash,
        ['scripts/oss-subtree-split.sh', 'hive-mind-test', 'hive-mind-bad'],
        { cwd: tempRepo, encoding: 'utf-8' },
      );
      expect(rejectedTransaction.status, rejectedTransaction.stderr).toBe(4);
      expect(runGit('rev-parse', 'oss-hive-mind-test-export')).toBe(stableBefore);
      expect(runGit('rev-parse', 'oss-hive-mind-bad-export')).toBe(secondStableBefore);
    } finally {
      rmSync(tempRepo, { recursive: true, force: true });
    }
  }, REAL_SPLIT_TIMEOUT_MS);

  it('invalidates the historical raw-push plan', () => {
    const content = readFileSync(SUPERSEDED_PLAN_PATH, 'utf-8');

    expect(content).toContain('SUPERSEDED');
    expect(content).toContain('DO NOT FOLLOW');
    expect(content).not.toMatch(/git push\s/);
  });

  it('uses Node as the primary drift checker and keeps the shell entrypoint thin', () => {
    const wrapper = readFileSync(DRIFT_SCRIPT_PATH, 'utf-8');
    const checker = readFileSync(DRIFT_NODE_PATH, 'utf-8');

    expect(wrapper).toContain('oss-drift-check.mjs');
    expect(wrapper).not.toMatch(/\b(find|awk|comm|diff)\b/);
    expect(checker).toContain('KNOWN REVIEWED BLOCKERS');
    expect(checker).toContain('UNREVIEWED DIFFERENCES');
    expect(checker).toContain('FORBIDDEN EXPORTS');
  });

  it('pins parity and reviewed adaptations without storing proprietary source', () => {
    const baseline = JSON.parse(readFileSync(DRIFT_BASELINE_PATH, 'utf-8')) as Record<
      string,
      unknown
    >;
    const serializedBaseline = JSON.stringify(baseline);

    expect(serializedBaseline.match(/[Ss]ha256/g)).toHaveLength(
      ((baseline.intentionalAdaptations as unknown[])?.length ?? 0) * 2 +
        ((baseline.parityPaths as unknown[])?.length ?? 0),
    );
    expect(serializedBaseline).not.toMatch(/"(content|source|excerpt)"\s*:/);
  });

  it('accepts only the exact reviewed adaptation and intentional exclusion state', () => {
    const fixture = createDriftFixture();
    try {
      const clean = fixture.run();
      expect(clean.status, `${clean.stdout}\n${clean.stderr}`).toBe(0);
      expect(clean.stdout).toContain('REVIEWED ADAPTATIONS: 1');
      expect(clean.stdout).toContain('INTENTIONAL OSS EXCLUSIONS: 1');

      writeFileSync(join(fixture.canonicalRoot, 'equal.ts'), 'export const changed = true;\n');
      writeFileSync(join(fixture.ossRoot, 'equal.ts'), 'export const changed = true;\n');
      const changedParity = fixture.run();
      expect(changedParity.status, changedParity.stderr).toBe(1);
      expect(changedParity.stdout).toContain('equal.ts');

      writeFileSync(join(fixture.canonicalRoot, 'equal.ts'), 'export const equal = true;\n');
      writeFileSync(join(fixture.ossRoot, 'equal.ts'), 'export const equal = true;\r\n');
      writeFileSync(join(fixture.ossRoot, 'logger.ts'), 'changed after review\n');
      const changedHash = fixture.run();
      expect(changedHash.status, changedHash.stderr).toBe(1);
      expect(changedHash.stdout).toContain('UNREVIEWED DIFFERENCES');
      expect(changedHash.stdout).toContain('logger.ts');
    } finally {
      rmSync(fixture.tempRoot, { recursive: true, force: true });
    }
  });

  it('separates known blockers, new differences, and forbidden exports', () => {
    const fixture = createDriftFixture();
    try {
      writeFileSync(join(fixture.canonicalRoot, 'blocker.ts'), 'canonical\n');
      writeFileSync(join(fixture.ossRoot, 'blocker.ts'), 'oss\n');
      fixture.baseline.knownReviewedBlockers.push({
        path: 'blocker.ts',
        state: 'different',
        disposition: 'forward-port',
      });
      fixture.writeBaseline();
      const blocker = fixture.run();
      expect(blocker.status, blocker.stderr).toBe(1);
      expect(blocker.stdout).toContain('KNOWN REVIEWED BLOCKERS');
      expect(blocker.stdout).toContain('blocker.ts');

      writeFileSync(join(fixture.canonicalRoot, 'listed-unreviewed.ts'), 'canonical\n');
      writeFileSync(join(fixture.ossRoot, 'listed-unreviewed.ts'), 'oss\n');
      fixture.baseline.unreviewedDifferences.push({
        path: 'listed-unreviewed.ts',
        state: 'different',
      });
      fixture.writeBaseline();
      const listedUnreviewed = fixture.run();
      expect(listedUnreviewed.status, listedUnreviewed.stderr).toBe(1);
      expect(listedUnreviewed.stdout).toContain('listed-unreviewed.ts');

      writeFileSync(join(fixture.ossRoot, 'new-drift.ts'), 'unreviewed\n');
      const unreviewed = fixture.run();
      expect(unreviewed.status, unreviewed.stderr).toBe(1);
      expect(unreviewed.stdout).toContain('UNREVIEWED DIFFERENCES');
      expect(unreviewed.stdout).toContain('new-drift.ts');

      writeFileSync(
        join(fixture.ossRoot, 'mind', 'evolution-runs.ts'),
        'forbidden implementation\n',
      );
      writeFileSync(join(fixture.ossRoot, 'mind', 'db.ts'), 'const install_audit = true;\n');
      const forbidden = fixture.run();
      expect(forbidden.status, forbidden.stderr).toBe(1);
      expect(forbidden.stdout).toContain('FORBIDDEN EXPORTS');
      expect(forbidden.stdout).toContain('FORBIDDEN-OSS-CONTENT');
      expect(forbidden.stdout).toContain('FORBIDDEN-OSS-MARKER');

      rmSync(join(fixture.ossRoot, 'mind', 'evolution-runs.ts'));
      writeFileSync(join(fixture.ossRoot, 'mind', 'db.ts'), '// install_audit is private\n');
      const commentMention = fixture.run();
      expect(commentMention.status, commentMention.stderr).toBe(1);
      expect(commentMention.stdout).toContain('FORBIDDEN-OSS-MARKER');

      writeFileSync(
        join(fixture.ossRoot, 'mind', 'db.ts'),
        '/* install_audit is private */ const install_audit = true;\n',
      );
      const afterClosedComment = fixture.run();
      expect(afterClosedComment.status, afterClosedComment.stderr).toBe(1);
      expect(afterClosedComment.stdout).toContain('FORBIDDEN-OSS-MARKER');

      for (const source of [
        'const INSTALL_AUDIT = true;\n',
        '// decoy\u2028const install_audit = true;\n',
        '// decoy\u2029const install_audit = true;\n',
        'const matcher = /[//]/; const INSTALL_AUDIT = true;\n',
        'const matcher = /[/*]/; const install_audit = true;\n',
        'const sql = `\n// install_audit\n`;\n',
        'const sql = "\\\n// install_audit";\n',
      ]) {
        writeFileSync(join(fixture.ossRoot, 'mind', 'db.ts'), source);
        const bypassAttempt = fixture.run();
        expect(bypassAttempt.status, bypassAttempt.stderr).toBe(1);
        expect(bypassAttempt.stdout).toContain('FORBIDDEN-OSS-MARKER');
      }
    } finally {
      rmSync(fixture.tempRoot, { recursive: true, force: true });
    }
  });

  it('returns configuration error for a non-worktree or any mapped symlink', () => {
    const fixture = createDriftFixture();
    try {
      const plainDirectory = join(fixture.tempRoot, 'plain');
      mkdirSync(join(plainDirectory, 'packages', 'core', 'src'), { recursive: true });
      writeFileSync(join(plainDirectory, 'packages', 'core', 'src', 'file.ts'), 'export {};\n');
      const nonWorktree = spawnSync(
        process.execPath,
        ['scripts/oss-drift-check.mjs', plainDirectory],
        {
          cwd: fixture.monoRepo,
          encoding: 'utf-8',
          env: { ...process.env, GIT_CEILING_DIRECTORIES: fixture.tempRoot },
        },
      );
      expect(nonWorktree.status).toBe(2);
      expect(nonWorktree.stderr).toContain('Git worktree');

      const target = join(fixture.canonicalRoot, 'junction-target');
      mkdirSync(target);
      symlinkSync(
        target,
        join(fixture.canonicalRoot, 'mapped-link'),
        process.platform === 'win32' ? 'junction' : 'dir',
      );
      const symlink = fixture.run();
      expect(symlink.status, symlink.stdout).toBe(2);
      expect(symlink.stderr).toContain('symlink');

      rmSync(join(fixture.canonicalRoot, 'mapped-link'), { recursive: true, force: true });
      const ossTarget = join(fixture.ossRoot, 'junction-target');
      mkdirSync(ossTarget);
      symlinkSync(
        ossTarget,
        join(fixture.ossRoot, 'mapped-link'),
        process.platform === 'win32' ? 'junction' : 'dir',
      );
      const ossSymlink = fixture.run();
      expect(ossSymlink.status, ossSymlink.stdout).toBe(2);
      expect(ossSymlink.stderr).toContain('symlink');

      rmSync(join(fixture.ossRoot, 'mapped-link'), { recursive: true, force: true });
      writeFileSync(join(fixture.canonicalRoot, 'CaseCollision.ts'), 'canonical\n');
      writeFileSync(join(fixture.ossRoot, 'casecollision.ts'), 'oss\n');
      const caseCollision = fixture.run();
      expect(caseCollision.status, caseCollision.stdout).toBe(2);
      expect(caseCollision.stderr).toContain('case collision');
    } finally {
      rmSync(fixture.tempRoot, { recursive: true, force: true });
    }
  });

  it.each(['canonical', 'oss'] as const)(
    'rejects a symlink in the %s mapped-path ancestry',
    (side) => {
      const fixture = createDriftFixture();
      try {
        const mappedPackage =
          side === 'canonical'
            ? join(fixture.monoRepo, 'packages', 'hive-mind-core')
            : join(fixture.ossRepo, 'packages', 'core');
        const outsidePackage = join(fixture.tempRoot, `${side}-outside-package`);
        renameSync(mappedPackage, outsidePackage);
        symlinkSync(
          outsidePackage,
          mappedPackage,
          process.platform === 'win32' ? 'junction' : 'dir',
        );

        const result = fixture.run();
        expect(result.status, result.stdout).toBe(2);
        expect(result.stderr).toContain('ancestor symlink');
      } finally {
        rmSync(fixture.tempRoot, { recursive: true, force: true });
      }
    },
  );

  it('rejects baseline policy tampering and unknown schema fields', () => {
    const fixture = createDriftFixture();
    try {
      fixture.baseline.forbiddenExports.paths.pop();
      fixture.writeBaseline();
      const weakenedPolicy = fixture.run();
      expect(weakenedPolicy.status).toBe(2);
      expect(weakenedPolicy.stderr).toContain('forbiddenExports.paths');

      fixture.baseline.forbiddenExports.paths.push('mind/improvement-signals.ts');
      const malformed = fixture.baseline as typeof fixture.baseline & { source?: string };
      malformed.source = 'private source must never be accepted';
      fixture.writeBaseline();
      const extraField = fixture.run();
      expect(extraField.status).toBe(2);
      expect(extraField.stderr).toContain('unexpected keys');
    } finally {
      rmSync(fixture.tempRoot, { recursive: true, force: true });
    }
  });

  it('blocks dirty mapped bytes even when the editable baseline is changed to match them', () => {
    const fixture = createDriftFixture();
    try {
      const changedCanonical = "import { logger } from '@waggle/changed';\n";
      const changedOss = "import { logger } from './changed.js';\n";
      writeFileSync(join(fixture.canonicalRoot, 'logger.ts'), changedCanonical);
      writeFileSync(join(fixture.ossRoot, 'logger.ts'), changedOss);
      fixture.baseline.intentionalAdaptations[0].canonicalSha256 =
        normalizedDriftHash(changedCanonical);
      fixture.baseline.intentionalAdaptations[0].ossSha256 = normalizedDriftHash(changedOss);
      fixture.writeBaseline();

      const tampered = fixture.run();
      expect(tampered.status, tampered.stderr).toBe(1);
      expect(tampered.stdout).toContain('SCOPED-DIRTY canonical');
      expect(tampered.stdout).toContain('SCOPED-DIRTY OSS');
    } finally {
      rmSync(fixture.tempRoot, { recursive: true, force: true });
    }
  });

  it('fails closed instead of executing the retired pre-migration parity workflow', () => {
    const content = readFileSync(RETIRED_PARITY_SCRIPT_PATH, 'utf-8');

    expect(content).toContain('RETIRED');
    expect(content).toContain('exit 2');
    expect(content).not.toContain('packages/core/src/mind');
  });
});
