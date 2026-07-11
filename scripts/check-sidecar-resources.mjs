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

const missing = [];

const nodeBinary = process.platform === 'win32' ? 'node.exe' : 'node';
const nodePath = path.join(resourcesDir, nodeBinary);
if (!fs.existsSync(nodePath)) {
  missing.push(`resources/${nodeBinary} (run: node scripts/bundle-node.mjs)`);
} else {
  try {
    const bundledAbi = execFileSync(nodePath, ['-p', 'process.versions.modules'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    const currentAbi = process.versions.modules;
    if (bundledAbi !== currentAbi) {
      missing.push(
        `resources/${nodeBinary} ABI ${bundledAbi} does not match current Node ABI ${currentAbi} ` +
        '(run: node scripts/bundle-node.mjs with the same Node used for npm install/stage-sidecar-deps)',
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
if (nativeEntries.length === 0) {
  missing.push('resources/native/* (run: node scripts/bundle-native-deps.mjs)');
}

// Staged production node_modules for the esbuild-externalized packages
// (better-sqlite3, @fastify/static, mammoth, …). The bundled service.js
// `require()`s these by bare name and resolves them via NODE_PATH=resources/
// node_modules (service.rs). Like the native deps above, staging is done by the
// npm scripts / CI (stage-sidecar-deps.mjs), NOT the arch-blind beforeBuildCommand
// hook — so a raw `npx tauri build` that skips those would package a sidecar that
// dies with MODULE_NOT_FOUND on first boot. Probe a canonical external.
const stagedDepsDir = path.join(resourcesDir, 'node_modules');
if (!fs.existsSync(path.join(stagedDepsDir, 'better-sqlite3', 'package.json'))) {
  missing.push('resources/node_modules/* (run: node scripts/stage-sidecar-deps.mjs)');
}

// External agents and hook management run directly from this staged payload;
// none of these packages are available from npm in a packaged installation.
const hookRuntimeEntries = [
  '@waggle/hive-mind-cli/dist/index.js',
  '@waggle/hive-mind-hooks-claude-code/dist/bin/claude-code-hooks-cli.js',
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

if (missing.length > 0) {
  console.error('[check-sidecar-resources] FATAL — sidecar runtime artifacts missing:');
  for (const m of missing) console.error(`  - ${m}`);
  console.error(
    '[check-sidecar-resources] Stage them with the bundle scripts (set TARGET_ARCH for\n' +
    'cross-arch builds) or use the npm tauri:build* scripts / CI, which run them for you.',
  );
  process.exit(1);
}

console.log('[check-sidecar-resources] OK — Node runtime + native deps + staged node_modules present');
