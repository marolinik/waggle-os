#!/usr/bin/env tsx
/**
 * E1 aggregation — Eywa answers @ OUR gpt-5 judge vs Eywa self-judge.
 * Reads e1-eywa-ourjudge.jsonl + the original Eywa JSON, emits console + markdown.
 */
import fs from 'node:fs';

const EYWA_JSON =
  'D:/Projects/KorroResearch/benchmarks/eywa-artifacts/eywa-beam-sonnet46-answers.json';
const OUT_JSONL =
  'D:/Projects/KorroResearch/benchmarks/eywa-artifacts/e1-eywa-ourjudge.jsonl';

interface EywaRecord { id: string; cat: string; eywaNugget: number[]; }
interface OutRecord {
  id: string; cat: string; our_raw_score: number;
  our_nugget_scores: number[]; eywa_raw: number;
}

const OUR_OWN_HEADLINE = 0.6482; // our own answers @ our gpt-5 judge

function mean(xs: number[]): number { return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0; }
function pct(x: number): string { return (x * 100).toFixed(2) + '%'; }

const eywaRecords = JSON.parse(fs.readFileSync(EYWA_JSON, 'utf-8')) as EywaRecord[];
const eywaById = new Map(eywaRecords.map(r => [r.id, r]));

const out: OutRecord[] = [];
for (const line of fs.readFileSync(OUT_JSONL, 'utf-8').split('\n')) {
  const t = line.trim(); if (!t) continue;
  out.push(JSON.parse(t) as OutRecord);
}
// dedup by id (last wins)
const outById = new Map(out.map(r => [r.id, r]));
const rows = [...outById.values()];

console.log(`[agg] scored records: ${rows.length}/700`);

// Overall
const ourOverall = mean(rows.map(r => r.our_raw_score));
const eywaOverall = mean(rows.map(r => r.eywa_raw));

// Per-category
const cats = [...new Set(rows.map(r => r.cat))].sort();
interface CatStat { cat: string; n: number; our: number; eywa: number; delta: number; }
const catStats: CatStat[] = cats.map(cat => {
  const rs = rows.filter(r => r.cat === cat);
  const our = mean(rs.map(r => r.our_raw_score));
  const eywa = mean(rs.map(r => r.eywa_raw));
  return { cat, n: rs.length, our, eywa, delta: our - eywa };
});

// Per-nugget agreement (align our_nugget_scores to eywaNugget by index)
let nTotal = 0, nOurLess = 0, nOurMore = 0, nEqual = 0;
let sumOur = 0, sumEywa = 0;
for (const r of rows) {
  const e = eywaById.get(r.id);
  if (!e) continue;
  const our = r.our_nugget_scores;
  const eyw = e.eywaNugget;
  const k = Math.min(our.length, eyw.length);
  for (let i = 0; i < k; i++) {
    nTotal++;
    sumOur += our[i]; sumEywa += eyw[i];
    if (our[i] < eyw[i]) nOurLess++;
    else if (our[i] > eyw[i]) nOurMore++;
    else nEqual++;
  }
}

// ── Console report ──
console.log('\n=== OVERALL ===');
console.log(`Eywa answers @ OUR gpt-5 judge : ${pct(ourOverall)}`);
console.log(`Eywa self-judge (Sonnet 4.6)   : ${pct(eywaOverall)}  (published headline 81.45%)`);
console.log(`Self-judge inflation delta     : ${((eywaOverall - ourOverall) * 100).toFixed(2)} pp`);
console.log(`\nHONEST SAME-JUDGE LEADERBOARD (gpt-5 nugget judge):`);
console.log(`  Eywa answers @ gpt-5 judge : ${pct(ourOverall)}`);
console.log(`  OUR answers  @ gpt-5 judge : ${pct(OUR_OWN_HEADLINE)}`);
console.log(`  Eywa - ours = ${((ourOverall - OUR_OWN_HEADLINE) * 100).toFixed(2)} pp`);

console.log('\n=== PER CATEGORY ===');
console.log('cat'.padEnd(28), 'n'.padStart(4), 'ourJ%'.padStart(8), 'eywaSelf%'.padStart(10), 'delta_pp'.padStart(9));
for (const c of catStats.sort((a, b) => a.delta - b.delta)) {
  console.log(
    c.cat.padEnd(28), String(c.n).padStart(4),
    pct(c.our).padStart(8), pct(c.eywa).padStart(10),
    ((c.delta) * 100).toFixed(2).padStart(9),
  );
}

console.log('\n=== PER-NUGGET AGREEMENT ===');
console.log(`total nuggets compared: ${nTotal}`);
console.log(`our < eywa (we stricter): ${nOurLess} (${pct(nOurLess / nTotal)})`);
console.log(`our > eywa (we lenient) : ${nOurMore} (${pct(nOurMore / nTotal)})`);
console.log(`equal                  : ${nEqual} (${pct(nEqual / nTotal)})`);
console.log(`mean(our) - mean(eywa) per nugget: ${((sumOur - sumEywa) / nTotal).toFixed(4)}`);

// ── Markdown ──
const md: string[] = [];
md.push('# E1 — Eywa BEAM answers re-judged with OUR canonical gpt-5 nugget judge\n');
md.push(`_Judge: gpt-5 (model id \`gpt-5\`), verbatim mem0 graded nugget prompt from \`src/beam-nugget-judge.ts\` — the SAME judge behind our published 0.6482 headline. Per-question score = mean of 0/0.5/1 nugget scores._\n`);
md.push(`_Scored ${rows.length}/700 Eywa Sonnet-4.6 answers over ${nTotal} rubric nuggets._\n`);
md.push('## Headline\n');
md.push('| Metric | Value |');
md.push('|---|---|');
md.push(`| Eywa answers @ **our gpt-5 judge** | **${pct(ourOverall)}** |`);
md.push(`| Eywa self-judge (Sonnet 4.6), our recompute | ${pct(eywaOverall)} |`);
md.push(`| Eywa published headline | 81.45% |`);
md.push(`| **Self-judge inflation** (eywa-self − our-judge) | **${((eywaOverall - ourOverall) * 100).toFixed(2)} pp** |`);
md.push('');
md.push('## Honest same-judge leaderboard (both @ gpt-5 nugget judge)\n');
md.push('| System | Answers @ gpt-5 judge |');
md.push('|---|---|');
md.push(`| Eywa (Sonnet 4.6 answers) | **${pct(ourOverall)}** |`);
md.push(`| Ours (published) | ${pct(OUR_OWN_HEADLINE)} |`);
md.push(`| Gap (Eywa − ours) | ${((ourOverall - OUR_OWN_HEADLINE) * 100).toFixed(2)} pp |`);
md.push('');
md.push('## Per-category (n=70 each)\n');
md.push('| Category | n | Our gpt-5 judge % | Eywa self-judge % | Delta (pp) |');
md.push('|---|---|---|---|---|');
for (const c of catStats.sort((a, b) => a.delta - b.delta)) {
  md.push(`| ${c.cat} | ${c.n} | ${pct(c.our)} | ${pct(c.eywa)} | ${(c.delta * 100).toFixed(2)} |`);
}
md.push('');
md.push('_Delta = our-judge − eywa-self-judge. Large negative delta = Eywa self-judge inflated that category. Small delta = self-judge was honest there._\n');
md.push('## Per-nugget judge agreement\n');
md.push(`- Total nuggets compared: ${nTotal}`);
md.push(`- Our score **< **Eywa (we stricter / leniency in their favor): ${nOurLess} (${pct(nOurLess / nTotal)})`);
md.push(`- Our score **>** Eywa (we more lenient): ${nOurMore} (${pct(nOurMore / nTotal)})`);
md.push(`- Equal: ${nEqual} (${pct(nEqual / nTotal)})`);
md.push(`- mean(our) − mean(eywa) per nugget: **${((sumOur - sumEywa) / nTotal).toFixed(4)}**`);
md.push('');

fs.writeFileSync(
  'D:/Projects/KorroResearch/benchmarks/eywa-artifacts/E1-eywa-answers-ourjudge.md',
  md.join('\n'),
);
console.log('\n[agg] wrote E1-eywa-answers-ourjudge.md');
