#!/usr/bin/env node
/**
 * ux-gate · text-color-guard  (the generation-vector ban)
 * ────────────────────────────────────────────────────────────────────────────
 * Pillar 4.2(a). Token-pair math (contrast-tokens.mjs) buys one clean round;
 * this buys a FLOOR by banning the vectors that regenerate off-token text
 * colours. Scans apps/web/src for:
 *
 *   hex-class          `text-[#...]`                     (arbitrary hex text)
 *   palette-class      `text-hive-<n>`                   (raw palette, not a token)
 *   inline-hex         `color|background|backgroundColor: #...`  (inline raw hex)
 *   low-opacity-token  `text-<text-token>/<N>` with N<60  (token dimmed below AA)
 *
 * It is a RATCHET, not a big-bang: `color-guard-baseline.json` freezes today's
 * grandfathered instances; the gate fails only on NEW instances beyond the
 * frozen multiset. `text-<token>/N` with 60≤N<100 is reported as a WARNING
 * (allowed, listed), never a failure.
 *
 * Excludes tests, the token source files (index.css / waggle-theme.css), and
 * the motion-spec demo page. No dependencies.
 *
 * Run:  npm run ux:color-guard
 * Update the frozen baseline (after an intentional, reviewed change):
 *       node scripts/ux-gates/text-color-guard.mjs --update-baseline
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCAN_DIR = path.join(ROOT, 'apps/web/src');
const BASELINE = path.join(ROOT, 'scripts/ux-gates/color-guard-baseline.json');
const OPACITY_FLOOR = 60; // Tailwind opacity % below which a text token is an offense.

const EXTS = new Set(['.tsx', '.ts', '.jsx', '.js']);
const EXCLUDE_FILES = new Set(['index.css', 'waggle-theme.css', 'MotionSpec.tsx']);
const isExcluded = (rel) =>
  /(^|\/)(test|__tests__|__mocks__)\//.test(rel) ||
  /\.(test|spec)\.(t|j)sx?$/.test(rel) ||
  EXCLUDE_FILES.has(path.basename(rel));

// Neutral text-tier tokens whose opacity we police (brand accents excluded — a
// low-opacity honey is a design choice, not a body-legibility violation).
const TEXT_TIERS =
  'foreground|muted-foreground|text|text-2|text-muted|text-dim|text-tertiary|text-bright' +
  '|card-foreground|popover-foreground|secondary-foreground|accent-foreground';

const DETECTORS = [
  { kind: 'hex-class', re: /text-\[#[0-9a-fA-F]{3,8}\]/g },
  { kind: 'palette-class', re: /\btext-hive-\d{2,3}\b/g },
  { kind: 'inline-hex', re: /\b(?:color|background|backgroundColor)\s*:\s*['"]?#[0-9a-fA-F]{3,8}\b/g },
];
// Opacity detectors capture N so we can split offense (<60) vs warning (60–99).
const OPACITY_DETECTORS = [
  new RegExp(`\\btext-(?:${TEXT_TIERS})\\/(\\d{1,3})\\b`, 'g'),
  /\btext-\[var\(--[\w-]+\)\]\/(\d{1,3})\b/g,
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (EXTS.has(path.extname(name))) out.push(full);
  }
  return out;
}

const rel = (full) => path.relative(ROOT, full).split(path.sep).join('/');
const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;
const normSnippet = (s) => s.trim().replace(/\s+/g, '').replace(/['"]/g, '');

/** Scan the tree → { offenses:[{file,line,kind,snippet}], warnings:[…] }. */
function scan() {
  const offenses = [];
  const warnings = [];
  for (const full of walk(SCAN_DIR)) {
    const relFile = rel(full);
    if (isExcluded(relFile)) continue;
    const text = readFileSync(full, 'utf8');
    for (const { kind, re } of DETECTORS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) {
        offenses.push({ file: relFile, line: lineOf(text, m.index), kind, snippet: normSnippet(m[0]) });
      }
    }
    for (const re of OPACITY_DETECTORS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) {
        const n = Number.parseInt(m[1], 10);
        const rec = { file: relFile, line: lineOf(text, m.index), snippet: normSnippet(m[0]) };
        if (n < OPACITY_FLOOR) offenses.push({ ...rec, kind: 'low-opacity-token' });
        else if (n < 100) warnings.push({ ...rec, kind: 'mid-opacity-token' });
      }
    }
  }
  const sort = (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.snippet.localeCompare(b.snippet);
  return { offenses: offenses.sort(sort), warnings: warnings.sort(sort) };
}

const keyOf = (e) => `${e.file}|${e.kind}|${e.snippet}`;
function multiset(entries) {
  const m = new Map();
  for (const e of entries) m.set(keyOf(e), (m.get(keyOf(e)) ?? 0) + 1);
  return m;
}

function loadBaseline() {
  if (!existsSync(BASELINE)) return { entries: [] };
  try { return JSON.parse(readFileSync(BASELINE, 'utf8')); }
  catch { return { entries: [] }; }
}

// ── Run ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const { offenses, warnings } = scan();

if (args.includes('--update-baseline')) {
  const payload = {
    generatedAt: new Date().toISOString().slice(0, 10),
    note: 'Frozen grandfathered off-token text colours. Regenerate ONLY after a reviewed, intentional change. The gate fails on NEW instances beyond this multiset.',
    floor: OPACITY_FLOOR,
    entries: offenses,
  };
  writeFileSync(BASELINE, JSON.stringify(payload, null, 2) + '\n');
  console.log(`ux-gate · text-color-guard — baseline written: ${offenses.length} grandfathered offense(s), ${warnings.length} warning(s).`);
  process.exit(0);
}

const baseline = loadBaseline();
const baseCounts = multiset(baseline.entries ?? []);
const curCounts = multiset(offenses);

// NEW = current keys whose count exceeds the frozen baseline count.
const seen = new Map();
const newEntries = [];
for (const e of offenses) {
  const k = keyOf(e);
  const used = seen.get(k) ?? 0;
  if (used >= (baseCounts.get(k) ?? 0)) newEntries.push(e);
  seen.set(k, used + 1);
}
// Baseline entries no longer present (fixed) — informational; suggests re-freeze.
let removed = 0;
for (const [k, n] of baseCounts) removed += Math.max(0, n - (curCounts.get(k) ?? 0));

if (args.includes('--json')) {
  console.log(JSON.stringify({ offenses, warnings, newEntries, removed }, null, 2));
  process.exit(newEntries.length > 0 ? 1 : 0);
}

console.log('\nux-gate · text-color-guard — off-token text-colour ratchet\n');
console.log(`  scanned:      apps/web/src (${EXTS.size} JS/TS extensions, tests + token files + MotionSpec excluded)`);
console.log(`  offenses:     ${offenses.length} total  ·  ${baseline.entries?.length ?? 0} frozen in baseline`);
console.log(`  warnings:     ${warnings.length} (text token at 60–99% opacity — allowed)`);
if (removed > 0) console.log(`  note:         ${removed} baseline offense(s) fixed since freeze — run --update-baseline to tighten the ratchet.`);

if (warnings.length) {
  const sample = warnings.slice(0, 8).map((w) => `    ${w.file}:${w.line}  ${w.snippet}`).join('\n');
  console.log(`\n  warning list (first ${Math.min(8, warnings.length)} of ${warnings.length}):\n${sample}`);
}

if (newEntries.length > 0) {
  console.error(`\n✗ text-color-guard FAILED — ${newEntries.length} NEW off-token text colour(s):\n`);
  for (const e of newEntries) console.error(`    ${e.file}:${e.line}  [${e.kind}]  ${e.snippet}`);
  console.error('\n  Use a semantic token (--text / --text-2 / --text-muted / --text-tertiary) instead of a raw');
  console.error('  hex, palette class, or sub-60% opacity. If this IS intentional and reviewed, re-freeze with');
  console.error('  `node scripts/ux-gates/text-color-guard.mjs --update-baseline`.\n');
  process.exit(1);
}

console.log('\n✓ text-color-guard PASSED — no new off-token text colours beyond the frozen baseline.\n');
