#!/usr/bin/env node
/**
 * P4/D12 preflight — fail a Tauri build LOUDLY when the arch-parameterized
 * sidecar resources are missing.
 *
 * The tauri.conf.json beforeBuildCommand regenerates ONLY the sidecar JS
 * bundle (build-sidecar.mjs — arch-independent, safe to run arch-blind). The
 * Node runtime and native modules are arch-PARAMETERIZED (TARGET_ARCH) and
 * must be staged by the explicit npm scripts / CI steps that set it — the
 * hook must never regenerate them (an arch-blind re-run on a cross-arch
 * matrix leg clobbers the staged artifacts; P4 review HIGH). But the bundle
 * resources glob (`resources/*`) silently tolerates ABSENT files — a raw
 * `npx tauri build` on a fresh clone would package a binary with no Node
 * runtime at all. This check turns that silent miss into a hard stop.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const resourcesDir = path.join(root, 'app', 'src-tauri', 'resources');
const stagedDepsDir = path.join(resourcesDir, 'node_modules');
const targetArch = process.env.TARGET_ARCH || process.arch;

const missing = [];
const unsafe = [];

const servicePath = path.join(resourcesDir, 'service.js');
if (!fs.existsSync(servicePath)) {
  missing.push('resources/service.js (run: node scripts/build-sidecar.mjs)');
} else {
  const service = fs.readFileSync(servicePath, 'utf8');
  if (/(?:\/\/|\/\*)[#@]\s*sourceMappingURL\s*=/.test(service)) {
    unsafe.push('resources/service.js contains a sourceMappingURL directive');
  }
}

const sourceArtifacts = fs.existsSync(resourcesDir)
  ? fs.readdirSync(resourcesDir, { withFileTypes: true })
    .filter((entry) => /\.(?:map|tsx?)$/i.test(entry.name))
    .map((entry) => entry.name)
  : [];
for (const artifact of sourceArtifacts) {
  unsafe.push(`resources/${artifact} must not be packaged`);
}

const nodeBinary = process.platform === 'win32' ? 'node.exe' : 'node';
const nodePath = path.join(resourcesDir, nodeBinary);
if (!fs.existsSync(nodePath)) {
  missing.push(`resources/${nodeBinary} (run: node scripts/bundle-node.mjs)`);
} else {
  try {
    const bundledRuntime = JSON.parse(execFileSync(nodePath, [
      '-p',
      'JSON.stringify({ arch: process.arch, modules: process.versions.modules })',
    ], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim());
    const currentAbi = process.versions.modules;
    if (bundledRuntime.modules !== currentAbi) {
      missing.push(
        `resources/${nodeBinary} ABI ${bundledRuntime.modules} does not match current Node ABI ${currentAbi} ` +
        '(run: node scripts/bundle-node.mjs with the same Node used for npm install/stage-sidecar-deps)',
      );
    }
    if (bundledRuntime.arch !== targetArch) {
      missing.push(
        `resources/${nodeBinary} architecture ${bundledRuntime.arch} does not match target ${targetArch}`,
      );
    }
  } catch (err) {
    missing.push(`resources/${nodeBinary} is not executable (${err.message})`);
  }
}

const nativeDir = path.join(resourcesDir, 'native');
const nativeEntries = fs.existsSync(nativeDir)
  ? fs.readdirSync(nativeDir).filter((e) => e !== '.gitkeep' && e !== 'onnxruntime')
  : [];
const requiredWindowsNativeFiles = [
  'better_sqlite3.node',
  'vec0.dll',
  'onnxruntime/onnxruntime_binding.node',
];
if (process.platform === 'win32') {
  for (const entry of requiredWindowsNativeFiles) {
    if (!fs.existsSync(path.join(nativeDir, ...entry.split('/')))) {
      missing.push(
        `resources/native/${entry} (run: node scripts/bundle-native-deps.mjs)`,
      );
    }
  }
} else if (process.platform === 'darwin') {
  const requiredMacNativeFiles = [
    'better_sqlite3.node',
    'vec0.dylib',
    'onnxruntime/onnxruntime_binding.node',
  ];
  for (const entry of requiredMacNativeFiles) {
    if (!fs.existsSync(path.join(nativeDir, ...entry.split('/')))) {
      missing.push(`resources/native/${entry} (run: node scripts/bundle-native-deps.mjs)`);
    }
  }
  const onnxDir = path.join(nativeDir, 'onnxruntime');
  const hasOnnxLibrary = fs.existsSync(onnxDir)
    && fs.readdirSync(onnxDir).some((entry) => entry.endsWith('.dylib'));
  if (!hasOnnxLibrary) {
    missing.push('resources/native/onnxruntime/*.dylib (run: node scripts/bundle-native-deps.mjs)');
  }
} else if (nativeEntries.length === 0) {
  missing.push('resources/native/* (run: node scripts/bundle-native-deps.mjs)');
}

// Staged production node_modules for the esbuild-externalized packages
// (better-sqlite3, @fastify/static, mammoth, …). The bundled service.js
// `require()`s these by bare name and resolves them via NODE_PATH=resources/
// node_modules (service.rs). Like the native deps above, staging is done by the
// npm scripts / CI (stage-sidecar-deps.mjs), NOT the arch-blind beforeBuildCommand
// hook — so a raw `npx tauri build` that skips those would package a sidecar that
// dies with MODULE_NOT_FOUND on first boot. Probe a canonical external.
const stagedBetterSqlite = path.join(stagedDepsDir, 'better-sqlite3');
const stagedOnnxRuntime = path.join(stagedDepsDir, 'onnxruntime-node');
const vecExtension = path.join(
  nativeDir,
  `vec0.${process.platform === 'win32' ? 'dll' : process.platform === 'darwin' ? 'dylib' : 'so'}`,
);
if (!fs.existsSync(path.join(stagedBetterSqlite, 'package.json'))) {
  missing.push('resources/node_modules/* (run: node scripts/stage-sidecar-deps.mjs)');
}
if (!fs.existsSync(path.join(stagedOnnxRuntime, 'package.json'))) {
  missing.push('resources/node_modules/onnxruntime-node (run: node scripts/stage-sidecar-deps.mjs)');
}
if (
  fs.existsSync(nodePath)
  && fs.existsSync(path.join(stagedBetterSqlite, 'package.json'))
  && fs.existsSync(path.join(stagedOnnxRuntime, 'package.json'))
  && fs.existsSync(vecExtension)
) {
  try {
    const probe = [
      'const Database = require(process.argv[1]);',
      'if (process.arch !== process.argv[2]) throw new Error(`architecture ${process.arch}`);',
      'const database = new Database(\':memory:\');',
      'database.loadExtension(process.argv[3]);',
      'const row = database.prepare(\'SELECT 1 AS ok\').get();',
      'const vec = database.prepare(\'SELECT vec_version() AS version\').get();',
      'database.close();',
      'if (row.ok !== 1) throw new Error(\'SQLite query failed\');',
      'if (typeof vec.version !== \'string\' || vec.version.length === 0) throw new Error(\'sqlite-vec query failed\');',
      'const onnx = require(process.argv[4]);',
      'if (typeof onnx.InferenceSession !== \'function\') throw new Error(\'ONNX binding failed\');',
    ].join('');
    execFileSync(nodePath, [
      '-e',
      probe,
      stagedBetterSqlite,
      targetArch,
      vecExtension,
      stagedOnnxRuntime,
    ], {
      cwd: resourcesDir,
      env: { ...process.env, NODE_PATH: stagedDepsDir },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    missing.push(
      `resources native runtime probe failed for better-sqlite3, sqlite-vec, or onnxruntime-node `
      + `using bundled ${nodeBinary} for ${targetArch}`,
    );
  }
}

// External agents and hook management run directly from this staged payload;
// none of these packages are available from npm in a packaged installation.
const hookRuntimeEntries = [
  '@waggle/hive-mind-cli/dist/index.js',
  '@waggle/hive-mind-hooks-claude-code/dist/bin/claude-code-hooks-cli.js',
  '@waggle/hive-mind-hooks-claude-desktop/dist/bin/claude-desktop-hooks.js',
  '@waggle/hive-mind-hooks-codex/dist/bin/codex-hooks.js',
  '@waggle/hive-mind-hooks-codex-desktop/dist/bin/codex-desktop-hooks.js',
  '@waggle/hive-mind-hooks-cursor/dist/bin/cursor-hooks.js',
  '@waggle/hive-mind-hooks-hermes/dist/bin/hermes-hooks.js',
  '@waggle/hive-mind-hooks-openclaw/dist/bin/openclaw-hooks.js',
];
for (const entry of hookRuntimeEntries) {
  if (!fs.existsSync(path.join(stagedDepsDir, ...entry.split('/')))) {
    missing.push(`resources/node_modules/${entry} (run: node scripts/stage-sidecar-deps.mjs)`);
  }
}

if (missing.length > 0 || unsafe.length > 0) {
  console.error('[check-sidecar-resources] FATAL — sidecar resources are not release-safe:');
  for (const m of missing) console.error(`  - ${m}`);
  for (const item of unsafe) console.error(`  - ${item}`);
  console.error(
    '[check-sidecar-resources] Stage them with the bundle scripts (set TARGET_ARCH for\n' +
    'cross-arch builds) or use the npm tauri:build* scripts / CI, which run them for you.',
  );
  process.exit(1);
}

console.log('[check-sidecar-resources] OK — Node runtime + native deps + staged node_modules present');
