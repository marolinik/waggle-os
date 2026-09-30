// SHA-256 table of the v1.2 planning package (docs/plans/WAGGLE-V1.2-PACKAGE-MANIFEST.md §3).
// Usage (from the repo root): node docs/plans/v1.2-evidence/tools/manifest_hashes.mjs [--write]
//   default  read-only check: every file listed in manifest §3 exists and has the listed SHA-256,
//            and every package file (fixed path set below) is listed. Exit 1 on any difference.
//   --write  recompute and replace only the table between the HASHES markers in the manifest and
//            in its English pair (.en.md, same rows). Run it after every DOCX export or package edit;
//            neither manifest lists its own hash or the other's (each carries a copy of the table).
// Text files (.md/.csv/.json/.mjs/...) are hashed after CRLF -> LF, DOCX as raw bytes.
// A pass proves only that the documents are identical to the manifest; it says nothing about the application.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DOCS = path.resolve(here, '..', '..', '..');
const MANIFEST_REL = 'plans/WAGGLE-V1.2-PACKAGE-MANIFEST.md';
const MANIFEST = path.join(DOCS, MANIFEST_REL);
const MANIFEST_EN_REL = MANIFEST_REL.replace(/\.md$/, '.en.md');
const MANIFEST_EN = path.join(DOCS, MANIFEST_EN_REL);
const BEGIN = '<!-- HASHES:BEGIN -->';
const END = '<!-- HASHES:END -->';

// Package path set (relative to docs/). Directories are walked recursively.
const ROOT_FILES = /^Waggle_(PRD|FRD)_v1\.2_DRAFT(\.en)?\.(md|docx)$/;
const DECISIONS = /^(2026-09-27-ADR-\d\d-.*|ADR-INDEX(\.en)?\.md)$/;
const PLANS = /^(SAFE-IMPLEMENTATION-CHECKLIST|WAGGLE-AUDIT-DISPOSITION-v1\.2|WAGGLE-BENCHMARK-PROTOCOL-DRAFT|WAGGLE-BUILD-VS-BORROW-v1\.2|WAGGLE-DELIVERY-PLAN-v1\.2|WAGGLE-MIGRATIONS-v1\.2|WAGGLE-V1\.2-[A-Z-]+)(\.en)?\.md$/;
const WALK_DIRS = ['handoff', 'plans/v1.2-evidence'];

const posix = (p) => p.split(path.sep).join('/');
const listDir = (rel, re) => fs.readdirSync(path.join(DOCS, rel), { withFileTypes: true })
  .filter((d) => d.isFile() && re.test(d.name)).map((d) => posix(path.join(rel, d.name)));
const walk = (rel) => fs.readdirSync(path.join(DOCS, rel), { withFileTypes: true }).flatMap((d) => {
  const child = posix(path.join(rel, d.name));
  if (d.isDirectory()) return d.name.startsWith('shadow-') ? [] : walk(child);
  return d.isFile() ? [child] : [];
});

function packageFiles() {
  const files = [...listDir('.', ROOT_FILES), ...listDir('decisions', DECISIONS), ...listDir('plans', PLANS), ...WALK_DIRS.flatMap(walk)];
  return [...new Set(files.map((f) => f.replace(/^\.\//, '')))].filter((f) => f !== MANIFEST_REL && f !== MANIFEST_EN_REL).sort();
}

// Text files are hashed with CRLF normalized to LF, so the hash does not depend on the clone's
// core.autocrlf; binary files (DOCX) are hashed as raw bytes.
const TEXT = /\.(md|csv|json|mjs|js|py|txt)$/i;
const sha256 = (rel) => {
  const raw = fs.readFileSync(path.join(DOCS, rel));
  const bytes = TEXT.test(rel) ? Buffer.from(raw.toString('latin1').replace(/\r\n/g, '\n'), 'latin1') : raw;
  return crypto.createHash('sha256').update(bytes).digest('hex');
};

function splitManifest(file = MANIFEST, rel = MANIFEST_REL) {
  const text = fs.readFileSync(file, 'utf8');
  const a = text.indexOf(BEGIN);
  const b = text.indexOf(END);
  if (a < 0 || b < a) throw new Error(`markers ${BEGIN} / ${END} not found in ${rel}`);
  return { head: text.slice(0, a + BEGIN.length), body: text.slice(a + BEGIN.length, b), tail: text.slice(b) };
}

function render(files, header = 'Fajl') {
  const rows = files.map((f) => `| \`docs/${f}\` | \`${sha256(f)}\` |`);
  return `\n| ${header} | SHA-256 |\n|---|---|\n${rows.join('\n')}\n`;
}

const rowsOf = (body) => new Map([...body.matchAll(/^\| `docs\/([^`]+)` \| `([0-9a-f]{64})` \|$/gm)].map((m) => [m[1], m[2]]));

const { head, body, tail } = splitManifest();
const files = packageFiles();

if (process.argv.includes('--write')) {
  fs.writeFileSync(MANIFEST, head + render(files) + tail, 'utf8');
  const en = splitManifest(MANIFEST_EN, MANIFEST_EN_REL);
  fs.writeFileSync(MANIFEST_EN, en.head + render(files, 'File') + en.tail, 'utf8');
  console.log(`wrote ${files.length} rows to ${MANIFEST_REL} §3 and ${MANIFEST_EN_REL} §3`);
  process.exit(0);
}

const listed = rowsOf(body);
let fail = 0;
const listedEn = rowsOf(splitManifest(MANIFEST_EN, MANIFEST_EN_REL).body);
if (listedEn.size !== listed.size || [...listed].some(([f, h]) => listedEn.get(f) !== h)) {
  console.log(`FAIL en-table ${MANIFEST_EN_REL} §3 se razlikuje od ${MANIFEST_REL} §3`); fail++;
}
for (const [f, h] of listed) {
  if (!fs.existsSync(path.join(DOCS, f))) { console.log(`FAIL missing  docs/${f}`); fail++; continue; }
  const actual = sha256(f);
  if (actual !== h) { console.log(`FAIL hash     docs/${f}  manifest ${h.slice(0, 12)}… actual ${actual.slice(0, 12)}…`); fail++; }
}
for (const f of files) if (!listed.has(f)) { console.log(`FAIL unlisted docs/${f}`); fail++; }
console.log(fail ? `${fail} razlika (paket nije istovetan manifestu)` : `OK   ${listed.size} fajlova odgovara manifestu §3 (dokumentacija, ne aplikacija)`);
process.exit(fail ? 1 : 0);
