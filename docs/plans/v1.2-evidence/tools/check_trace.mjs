// Mechanical PRD <-> FRD coverage check over FRD §16.1 (v1.2 planning package tool).
// Usage (from the repo root): node docs/plans/v1.2-evidence/tools/check_trace.mjs [docsDir]
//   docsDir = directory holding Waggle_PRD_v1.2_DRAFT.md and Waggle_FRD_v1.2_DRAFT.md
//   (default: the repo's docs/, i.e. three levels up from this file). Read-only; writes nothing.
// Counting rule:
//   PRD defined  = lines starting with "| PRD-SS-NN" or "**PRD-SS-NN" in the PRD.
//   FRD defined  = lines starting with "### FRD-nn.m", "| FRD-nn.m" or "**FRD-nn.m" in the FRD
//                  (so bold-defined FRD-01.9, FRD-03.0, FRD-03.9 count).
//   FRD contracts = FRD defined minus section 16 (FRD-16.1/16.2 are maps, not contracts).
//   Covered      = token in the PRD column / FRD column of the FRD §16.1 table. Ranges are expanded:
//                  "FRD-a.b–c.d", "FRD-a.b–FRD-c.d", bare "a.b–c.d" / "c.d" after an FRD-a prefix,
//                  and "PRD-SS-NN..SS-MM".
// Exit code 1 when any PRD id or FRD contract is uncovered, or a referenced id is undefined.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DOCS = process.argv[2] ?? path.join(here, '..', '..', '..');
const prd = fs.readFileSync(path.join(DOCS, 'Waggle_PRD_v1.2_DRAFT.md'), 'utf8');
const frd = fs.readFileSync(path.join(DOCS, 'Waggle_FRD_v1.2_DRAFT.md'), 'utf8');
const pad = (n) => String(n).padStart(2, '0');

const prdDefined = new Set();
for (const line of prd.split('\n')) {
  const m = line.match(/^(?:\| |\*\*)(PRD-\d\d-\d\d)\b/);
  if (m) prdDefined.add(m[1]);
}
const frdDefined = new Set();
for (const line of frd.split('\n')) {
  const m = line.match(/^(?:### |\| |\*\*)(FRD-\d\d\.\d+)\b/);
  if (m) frdDefined.add(m[1]);
}
const frdContracts = [...frdDefined].filter((id) => !id.startsWith('FRD-16.'));

const start = frd.indexOf('### FRD-16.1');
const end = frd.indexOf('### FRD-16.2');
if (start < 0 || end < 0) throw new Error('FRD §16.1 / §16.2 headings not found');
const rows = frd.slice(start, end).split('\n').filter((l) => l.startsWith('| PRD'));

const prdCovered = new Set();
const frdCovered = new Set();
const addFrdRange = (sec, from, to) => {
  for (let i = from; i <= to; i++) frdCovered.add(`FRD-${sec}.${i}`);
};

for (const row of rows) {
  const cells = row.split('|').map((c) => c.trim());
  const prdCell = cells[1];
  const frdCell = cells[3];

  // PRD column
  let prefix = null;
  for (const tok of prdCell.replace(/\.\./g, ' .. ').split(/[\s,;()]+/)) {
    let m;
    if ((m = tok.match(/^PRD-(\d\d)-(\d\d)$/))) { prefix = m[1]; prdCovered.add(tok); }
    else if ((m = tok.match(/^(\d\d)-(\d\d)$/)) && prefix) { prdCovered.add(`PRD-${m[1]}-${m[2]}`); }
    else if ((m = tok.match(/^PRD-(\d\d)$/))) {
      prefix = m[1];
      for (const id of prdDefined) if (id.startsWith(`PRD-${m[1]}-`)) prdCovered.add(id);
    }
  }
  for (const m of prdCell.matchAll(/PRD-(\d\d)-(\d\d)\.\.(\d\d)-(\d\d)/g)) {
    for (let i = +m[2]; i <= +m[4]; i++) prdCovered.add(`PRD-${m[1]}-${pad(i)}`);
  }

  // FRD column
  let fprefix = null;
  for (const tok of frdCell.split(/[\s,;()+]+/)) {
    let m;
    if ((m = tok.match(/^(?:FRD-)?(\d\d)\.(\d+)(?:[–-]|\.\.)(?:FRD-)?(\d\d)\.(\d+)$/)) && (tok.startsWith('FRD-') || fprefix)) {
      if (m[1] !== m[3]) throw new Error(`cross-section range not supported: ${tok}`);
      fprefix = m[1];
      addFrdRange(m[1], +m[2], +m[4]);
    } else if ((m = tok.match(/^FRD-(\d\d)\.(\d+)$/))) { fprefix = m[1]; frdCovered.add(tok); }
    else if ((m = tok.match(/^FRD-(\d\d)\.\*$/))) {
      fprefix = m[1];
      for (const id of frdDefined) if (id.startsWith(`FRD-${m[1]}.`)) frdCovered.add(id);
    } else if ((m = tok.match(/^(\d\d)\.(\d+)$/)) && fprefix) { frdCovered.add(`FRD-${m[1]}.${m[2]}`); }
  }
}

const prdMissing = [...prdDefined].filter((id) => !prdCovered.has(id)).sort();
const frdMissing = frdContracts.filter((id) => !frdCovered.has(id)).sort();
const frdUnknown = [...frdCovered].filter((id) => !frdDefined.has(id)).sort();
const prdUnknown = [...prdCovered].filter((id) => !prdDefined.has(id)).sort();

console.log(`PRD defined: ${prdDefined.size}; covered in §16.1: ${prdDefined.size - prdMissing.length}`);
console.log('PRD missing:', prdMissing.join(', ') || '(none)');
console.log(`FRD defined: ${frdDefined.size}; contracts (§1–§14, minus FRD-16.x maps): ${frdContracts.length}; covered in §16.1: ${frdContracts.length - frdMissing.length}`);
console.log('FRD contracts missing:', frdMissing.join(', ') || '(none)');
console.log('FRD referenced but not defined:', frdUnknown.join(', ') || '(none)');
console.log('PRD referenced but not defined:', prdUnknown.join(', ') || '(none)');
process.exitCode = prdMissing.length || frdMissing.length || frdUnknown.length || prdUnknown.length ? 1 : 0;
