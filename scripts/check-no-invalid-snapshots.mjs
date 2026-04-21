#!/usr/bin/env node
// CI lint guard — invalid Claude 4.6 family dated snapshots.
//
// Authority: PM-Waggle-OS/decisions/2026-04-22-model-route-naming-locked.md §4
//
// The suffix -20250514 was never a valid snapshot ID for the Claude 4.6
// family (Sonnet 4.6 + Opus 4.6). Any occurrence of this suffix in
// runtime source under packages/server/src/ sends an invalid model ID to
// Anthropic and causes 404 model_not_found at request time.
//
// This script freezes the regression: fail CI if the invalid snapshot
// appears in runtime source. Test-fixture occurrences under
// packages/*/tests/ are scoped separately and may remain until the LOW
// priority test-fixture migration ticket lands.
//
// Exit code 0 = clean. Exit code 1 = regression detected.

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const INVALID_SNAPSHOT_REGEX = /claude-(sonnet|opus)-4-20250514/g;

// Runtime source only. Tests are scoped separately.
const SCAN_ROOTS = [
  path.join(REPO_ROOT, 'packages', 'server', 'src'),
  path.join(REPO_ROOT, 'packages', 'cli', 'src'),
];

function walk(dir, out) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.turbo') continue;
      walk(full, out);
    } else if (entry.isFile() && /\.(ts|tsx|js|mjs|cjs|jsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function scanFile(file) {
  const content = fs.readFileSync(file, 'utf-8');
  const hits = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const matches = lines[i].match(INVALID_SNAPSHOT_REGEX);
    if (matches) {
      for (const m of matches) {
        hits.push({ file, line: i + 1, match: m, context: lines[i].trim().slice(0, 120) });
      }
    }
  }
  return hits;
}

function main() {
  const files = [];
  for (const root of SCAN_ROOTS) walk(root, files);

  const allHits = [];
  for (const file of files) {
    for (const hit of scanFile(file)) allHits.push(hit);
  }

  if (allHits.length === 0) {
    console.log('[check-no-invalid-snapshots] PASS: no -20250514 references in runtime source');
    console.log('[check-no-invalid-snapshots] scanned ' + files.length + ' files across ' + SCAN_ROOTS.length + ' roots');
    process.exit(0);
  }

  console.error('[check-no-invalid-snapshots] FAIL: ' + allHits.length + ' invalid snapshot reference(s) detected:');
  for (const hit of allHits) {
    const rel = path.relative(REPO_ROOT, hit.file);
    console.error('  ' + rel + ':' + hit.line + '  ' + hit.match);
    console.error('    -> ' + hit.context);
  }
  console.error('');
  console.error('These IDs were never valid for the Claude 4.6 family. Use:');
  console.error('  - Floating alias for runtime code: claude-sonnet-4-6, claude-opus-4-6');
  console.error('  - Dated snapshot for benchmarks only: claude-opus-4-6-20250610 (verify against Anthropic docs)');
  console.error('');
  console.error('See PM-Waggle-OS/decisions/2026-04-22-model-route-naming-locked.md for the LOCK.');
  process.exit(1);
}

main();
