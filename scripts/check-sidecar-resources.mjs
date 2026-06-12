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
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const resourcesDir = path.join(root, 'app', 'src-tauri', 'resources');

const missing = [];

const nodeBinary = process.platform === 'win32' ? 'node.exe' : 'node';
if (!fs.existsSync(path.join(resourcesDir, nodeBinary))) {
  missing.push(`resources/${nodeBinary} (run: node scripts/bundle-node.mjs)`);
}

const nativeDir = path.join(resourcesDir, 'native');
const nativeEntries = fs.existsSync(nativeDir)
  ? fs.readdirSync(nativeDir).filter((e) => e !== '.gitkeep' && e !== 'onnxruntime')
  : [];
if (nativeEntries.length === 0) {
  missing.push('resources/native/* (run: node scripts/bundle-native-deps.mjs)');
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

console.log('[check-sidecar-resources] OK — Node runtime + native deps staged');
