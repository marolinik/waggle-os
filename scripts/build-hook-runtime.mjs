#!/usr/bin/env node
/** Build the npm-free hook + collaboration CLI payload staged into Tauri. */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');

const projects = [
  'packages/hive-mind-cli/tsconfig.json',
  'packages/hive-mind-hooks-claude-code/tsconfig.json',
  'packages/hive-mind-hooks-codex/tsconfig.json',
  'packages/hive-mind-hooks-codex-desktop/tsconfig.json',
  'packages/hive-mind-hooks-cursor/tsconfig.json',
  'packages/hive-mind-hooks-hermes/tsconfig.json',
  'packages/hive-mind-hooks-openclaw/tsconfig.json',
];

if (!fs.existsSync(tsc)) {
  console.error('[build-hook-runtime] FATAL - TypeScript is not installed; run npm install first.');
  process.exit(1);
}

console.log('[build-hook-runtime] Building CLI and six hook adapters...');
execFileSync(process.execPath, [tsc, '--build', ...projects], {
  cwd: root,
  stdio: 'inherit',
});
execFileSync(process.execPath, [
  path.join(root, 'packages/hive-mind-hooks-openclaw/scripts/build-handler.mjs'),
], {
  cwd: root,
  stdio: 'inherit',
});

const expected = [
  'packages/hive-mind-cli/dist/index.js',
  'packages/hive-mind-hooks-claude-code/dist/bin/claude-code-hooks-cli.js',
  'packages/hive-mind-hooks-codex/dist/bin/codex-hooks.js',
  'packages/hive-mind-hooks-codex-desktop/dist/bin/codex-desktop-hooks.js',
  'packages/hive-mind-hooks-cursor/dist/bin/cursor-hooks.js',
  'packages/hive-mind-hooks-hermes/dist/bin/hermes-hooks.js',
  'packages/hive-mind-hooks-openclaw/dist/bin/openclaw-hooks.js',
  'packages/hive-mind-hooks-openclaw/dist/handler.bundle.cjs',
];
const missing = expected.filter((entry) => !fs.existsSync(path.join(root, entry)));
if (missing.length > 0) {
  console.error('[build-hook-runtime] FATAL - build did not produce:');
  for (const entry of missing) console.error(`  - ${entry}`);
  process.exit(1);
}
console.log(`[build-hook-runtime] OK - ${expected.length} runtime entries built`);
