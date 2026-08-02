#!/usr/bin/env node
/**
 * Build the Node.js sidecar for Tauri production.
 *
 * Bundles packages/server/src/local/service.ts into a single JS file
 * at app/src-tauri/resources/service.js using esbuild JS API.
 *
 * Usage:
 *   node scripts/build-sidecar.mjs
 */

import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const resourcesDir = path.join(root, 'app', 'src-tauri', 'resources');
const outFile = path.join(resourcesDir, 'service.js');
const sourceMapFile = `${outFile}.map`;
const entryPoint = path.join(root, 'packages', 'server', 'src', 'local', 'service.ts');
const marketplaceDb = path.join(root, 'packages', 'marketplace', 'marketplace.db');
const marketplaceResource = path.join(resourcesDir, 'marketplace.db');
const provenancePrefix = '// Waggle-Sidecar-Provenance: ';
const buildScriptRelative = 'scripts/build-sidecar.mjs';
const entryPointRelative = 'packages/server/src/local/service.ts';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function repositoryRelative(absolutePath) {
  const relative = path.relative(root, absolutePath);
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Sidecar input is outside the repository: ${absolutePath}`);
  }
  return relative.split(path.sep).join('/');
}

function addImplicitBuildInputs(localInputs, inputRelative) {
  let current = path.dirname(path.join(root, ...inputRelative.split('/')));
  while (true) {
    for (const name of ['package.json', 'tsconfig.json']) {
      const candidate = path.join(current, name);
      if (fs.existsSync(candidate)) localInputs.add(repositoryRelative(candidate));
    }
    if (current === root) break;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

function addExtendedTsconfigs(localInputs) {
  const visited = new Set();
  const pending = [...localInputs].filter((relative) => path.basename(relative) === 'tsconfig.json');
  while (pending.length > 0) {
    const relative = pending.pop();
    if (visited.has(relative)) continue;
    visited.add(relative);
    const absolute = path.join(root, ...relative.split('/'));
    const parsed = ts.parseConfigFileTextToJson(absolute, fs.readFileSync(absolute, 'utf8'));
    if (parsed.error) throw new Error(`Could not parse sidecar tsconfig: ${relative}`);
    const rawExtends = parsed.config?.extends;
    const extendedConfigs = Array.isArray(rawExtends)
      ? rawExtends
      : typeof rawExtends === 'string'
        ? [rawExtends]
        : [];
    for (const extendedConfig of extendedConfigs) {
      if (typeof extendedConfig !== 'string' || !extendedConfig.startsWith('.')) continue;
      let extended = path.resolve(path.dirname(absolute), extendedConfig);
      if (!fs.existsSync(extended) && fs.existsSync(`${extended}.json`)) extended += '.json';
      const extendedRelative = repositoryRelative(extended);
      if (!fs.existsSync(extended)) {
        throw new Error(`Extended sidecar tsconfig is missing: ${extendedRelative}`);
      }
      localInputs.add(extendedRelative);
      pending.push(extendedRelative);
    }
  }
}
// Metafile goes to a temp path (NOT resources/) so it's neither bundled into
// the app nor left as an untracked repo artifact. stage-sidecar-deps.mjs reads
// it back from the same well-known path. Keep the two in sync.
const metaFile = path.join(os.tmpdir(), 'waggle-sidecar-meta.json');

// Ensure resources directory exists
fs.mkdirSync(resourcesDir, { recursive: true });
// Production resources are shipped verbatim by Tauri. Remove maps left by an
// older build before bundling so full TypeScript sources cannot ride along in
// an installer even when the resources directory is reused.
fs.rmSync(sourceMapFile, { force: true });

console.log('[build-sidecar] Bundling server into', outFile);

// Native modules that can't be bundled — must be installed alongside the sidecar
const EXTERNAL = [
  'better-sqlite3',
  '@vscode/sqlite3',
  'bullmq',
  'ioredis',
  'pg',
  'postgres',
  'drizzle-orm',
  'drizzle-orm/*',
  'mammoth',
  'pdf-parse',
  'exceljs',
  'archiver',
  '@fastify/static',
  '@huggingface/transformers',
  'onnxruntime-node',
  'onnxruntime-common',
  'onnxruntime-web',
  'sharp',
  'playwright-core',
  'playwright-core/*',
  '@playwright/*',
  'chromium-bidi',
  'chromium-bidi/*',
];

try {
  if (
    !fs.existsSync(marketplaceDb)
    || !fs.lstatSync(marketplaceDb).isFile()
    || fs.lstatSync(marketplaceDb).isSymbolicLink()
  ) {
    throw new Error(`Required marketplace database is missing or unsafe: ${marketplaceDb}`);
  }

  // Dynamic import esbuild (available via vite dependency)
  const esbuild = await import('esbuild');

  const result = await esbuild.build({
    entryPoints: [entryPoint],
    absWorkingDir: root,
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    outfile: outFile,
    external: EXTERNAL,
    // P4/D12: workspace package metadata can resolve to gitignored dist/.
    // Alias all bundled first-party packages to their tracked source entry.
    // Without these aliases the bundle silently embeds whatever dist/ was
    // last compiled — the same stale-server-in-the-binary class D12 exists
    // to kill — and a clean checkout can't build at all without
    // build:packages. Alias to source so the bundle ALWAYS compiles from
    // src, like the vitest aliases do. (No subpath imports of either
    // package exist — verified before aliasing the bare names.)
    alias: {
      '@waggle/agent': path.join(root, 'packages', 'agent', 'src', 'index.ts'),
      '@waggle/core': path.join(root, 'packages', 'core', 'src', 'index.ts'),
      '@waggle/marketplace': path.join(root, 'packages', 'marketplace', 'src', 'index.ts'),
      '@waggle/shared': path.join(root, 'packages', 'shared', 'src', 'index.ts'),
      '@waggle/hive-mind-core': path.join(root, 'packages', 'hive-mind-core', 'src', 'index.ts'),
      '@waggle/waggle-dance': path.join(root, 'packages', 'waggle-dance', 'src', 'index.ts'),
      '@waggle/weaver': path.join(root, 'packages', 'weaver', 'src', 'index.ts'),
      '@waggle/wiki-compiler': path.join(root, 'packages', 'wiki-compiler', 'src', 'index.ts'),
    },
    sourcemap: false,
    minify: true,
    // metafile lets stage-sidecar-deps.mjs enumerate exactly which of the
    // EXTERNAL packages the bundle actually `require()`s at runtime, so it
    // stages precisely that set (and its transitive prod deps) into
    // resources/node_modules/ — no more, no less. Written next to the bundle.
    metafile: true,
    banner: {
      js: '// Waggle Sidecar — bundled server for Tauri desktop\n'
        + '// Generated by scripts/build-sidecar.mjs\n'
        + 'import { createRequire } from "node:module";\n'
        + 'const require = createRequire(import.meta.url);\n',
    },
    logLevel: 'warning',
  });

  if (result.errors.length > 0) {
    console.error('[build-sidecar] Build errors:', result.errors);
    process.exit(1);
  }

  if (result.warnings.length > 0) {
    console.warn(`[build-sidecar] ${result.warnings.length} warnings (non-blocking)`);
  }

  fs.writeFileSync(metaFile, JSON.stringify(result.metafile));
  console.log('[build-sidecar] Wrote esbuild metafile', metaFile);

  const sourceRevision = execFileSync(
    'git',
    ['-C', root, 'rev-parse', 'HEAD'],
    { encoding: 'utf8', windowsHide: true },
  ).trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sourceRevision)) {
    throw new Error(`Could not resolve an exact source revision: ${sourceRevision}`);
  }

  const trackedFiles = new Set(
    execFileSync(
      'git',
      ['-C', root, 'ls-files', '-z'],
      { encoding: 'utf8', windowsHide: true },
    ).split('\0').filter(Boolean),
  );
  const localInputs = new Set([buildScriptRelative, 'package.json', 'package-lock.json']);
  for (const input of Object.keys(result.metafile.inputs)) {
    const relative = repositoryRelative(path.resolve(root, input));
    if (relative === 'node_modules' || relative.startsWith('node_modules/')) continue;
    localInputs.add(relative);
  }
  for (const relative of [...localInputs]) {
    addImplicitBuildInputs(localInputs, relative);
  }
  addExtendedTsconfigs(localInputs);

  const sourceInputs = [...localInputs]
    .sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
    .map((relative) => {
      if (!trackedFiles.has(relative)) {
        throw new Error(`Sidecar repository input is not tracked: ${relative}`);
      }
      const absolute = path.join(root, ...relative.split('/'));
      const stat = fs.lstatSync(absolute);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new Error(`Sidecar repository input is not a regular file: ${relative}`);
      }
      return {
        path: relative,
        sha256: sha256(fs.readFileSync(absolute)),
      };
    });
  const bundlePayload = fs.readFileSync(outFile);
  const provenance = {
    schemaVersion: 1,
    sourceRevision,
    entryPoint: entryPointRelative,
    sourceInputs,
    bundlePayload: {
      sizeBytes: bundlePayload.byteLength,
      sha256: sha256(bundlePayload),
    },
  };
  const provenanceLine = Buffer.from(
    `${provenancePrefix}${Buffer.from(JSON.stringify(provenance)).toString('base64')}\n`,
    'utf8',
  );
  const provenanceTemp = `${outFile}.provenance-${process.pid}.tmp`;
  try {
    fs.writeFileSync(provenanceTemp, Buffer.concat([provenanceLine, bundlePayload]));
    fs.rmSync(outFile, { force: true });
    fs.renameSync(provenanceTemp, outFile);
  } finally {
    fs.rmSync(provenanceTemp, { force: true });
  }
  console.log(
    `[build-sidecar] Embedded ${sourceInputs.length} source inputs at ${sourceRevision.slice(0, 12)}`,
  );

  const stat = fs.statSync(outFile);
  const sizeMB = (stat.size / 1024 / 1024).toFixed(1);
  console.log(`[build-sidecar] Done. Output: ${sizeMB} MB`);

  // Production startup seeds the user's writable DB from this immutable
  // packaged resource. Remove a stale destination (including a symlink)
  // before copying the tracked canonical database byte-for-byte.
  fs.rmSync(marketplaceResource, { force: true });
  fs.copyFileSync(marketplaceDb, marketplaceResource);
  console.log('[build-sidecar] Copied canonical marketplace.db');
} catch (err) {
  console.error('[build-sidecar] Build failed:', err.message);
  process.exit(1);
}
