#!/usr/bin/env tsx
/**
 * E2 analysis — assemble the 2×2 store×prompt table, decompose main effects
 * and interaction, attach the confound classification, and write
 * beam-e2-FINAL.json.
 *
 * Metrics per cell: mean nugget score (0..1) and pass rate (judgment==PASS).
 * Uncertainty: conversation-cluster bootstrap. The 70 questions are 2 per
 * conversation × 35 conversations; resampling INDEPENDENT questions would
 * understate variance because the two questions from one conversation share a
 * store. So we resample the 35 conversation clusters with replacement (B=10000)
 * and recompute every statistic on each resample.
 *
 * Cells:
 *   A raw        v2         (retain dated turns + conflict-aware prompt)
 *   B raw        incumbent  (retain dated turns + prefer-most-recent prompt)
 *   C reconciled v2         (collapsed current-state store + conflict-aware)
 *   D reconciled incumbent  (collapsed current-state store + prefer-recent)
 *
 * STORE main effect  = mean(raw {A,B})        − mean(reconciled {C,D})
 * PROMPT main effect = mean(v2 {A,C})         − mean(incumbent {B,D})
 * INTERACTION        = (A−B) − (C−D)  [ = does the prompt gap depend on store ]
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = url.fileURLToPath(import.meta.url);
const outDir = path.resolve(path.dirname(here), '..', '..', 'results', 'beam');

interface Row {
  instance_id: string;
  conv: number;
  score: number;
  judgment: string;
}

function load(file: string): Row[] {
  const p = path.join(outDir, file);
  if (!fs.existsSync(p)) throw new Error(`missing ${file}`);
  return fs.readFileSync(p, 'utf-8').split('\n').filter(l => l.trim()).map(l => {
    const r = JSON.parse(l);
    return { instance_id: r.instance_id, conv: r.conv, score: r.score, judgment: r.judgment };
  });
}

const CELL_FILES: Record<string, string> = {
  A: 'beam-e2-cellA.jsonl', B: 'beam-e2-cellB.jsonl',
  C: 'beam-e2-cellC.jsonl', D: 'beam-e2-cellD.jsonl',
};

function mean(xs: number[]): number { return xs.reduce((s, x) => s + x, 0) / xs.length; }
function passRate(rows: Row[]): number { return rows.filter(r => r.judgment === 'PASS').length / rows.length; }
function meanScore(rows: Row[]): number { return mean(rows.map(r => r.score)); }

// Align all cells to a common instance_id ordering so cluster resampling picks
// the SAME conversation across cells.
function main(): void {
  const cells: Record<string, Row[]> = {};
  for (const [c, f] of Object.entries(CELL_FILES)) cells[c] = load(f);

  const ids = cells.A.map(r => r.instance_id);
  const convOf: Record<string, number> = {};
  for (const r of cells.A) convOf[r.instance_id] = r.conv;

  // index each cell by instance_id for aligned lookup
  const byId: Record<string, Record<string, Row>> = {};
  for (const [c, rows] of Object.entries(cells)) {
    byId[c] = {};
    for (const r of rows) byId[c][r.instance_id] = r;
  }
  for (const c of Object.keys(cells)) {
    for (const id of ids) if (!byId[c][id]) throw new Error(`cell ${c} missing ${id}`);
  }

  const convs = [...new Set(ids.map(id => convOf[id]))];
  const idsByConv: Record<number, string[]> = {};
  for (const id of ids) (idsByConv[convOf[id]] ??= []).push(id);

  // point estimates
  const point: Record<string, { mean: number; pass: number; n: number }> = {};
  for (const c of Object.keys(cells)) {
    point[c] = { mean: meanScore(cells[c]), pass: passRate(cells[c]), n: cells[c].length };
  }

  // statistic vector computed from a set of instance ids on a given metric
  const cellStat = (c: string, sampleIds: string[], metric: 'mean' | 'pass'): number => {
    const rows = sampleIds.map(id => byId[c][id]);
    return metric === 'mean' ? meanScore(rows) : passRate(rows);
  };

  const B = 10000;
  // seeded RNG (mulberry32) for reproducibility
  let seed = 0x9e3779b9;
  const rng = (): number => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // accumulate bootstrap distributions
  const dist: Record<string, number[]> = {};
  const push = (k: string, v: number) => (dist[k] ??= []).push(v);

  for (let b = 0; b < B; b++) {
    // resample conversation clusters with replacement
    const sampleIds: string[] = [];
    for (let i = 0; i < convs.length; i++) {
      const conv = convs[Math.floor(rng() * convs.length)];
      sampleIds.push(...idsByConv[conv]);
    }
    for (const metric of ['mean', 'pass'] as const) {
      const A = cellStat('A', sampleIds, metric);
      const Bc = cellStat('B', sampleIds, metric);
      const C = cellStat('C', sampleIds, metric);
      const D = cellStat('D', sampleIds, metric);
      push(`A_${metric}`, A); push(`B_${metric}`, Bc); push(`C_${metric}`, C); push(`D_${metric}`, D);
      push(`store_${metric}`, (A + Bc) / 2 - (C + D) / 2);      // raw − reconciled
      push(`prompt_${metric}`, (A + C) / 2 - (Bc + D) / 2);     // v2 − incumbent
      push(`interaction_${metric}`, (A - Bc) - (C - D));        // prompt gap: raw − reconciled
      push(`prompt_within_raw_${metric}`, A - Bc);
      push(`prompt_within_recon_${metric}`, C - D);
      push(`store_within_v2_${metric}`, A - C);
      push(`store_within_incumbent_${metric}`, Bc - D);
    }
  }

  const ci = (k: string): { lo: number; hi: number; se: number } => {
    const xs = [...dist[k]].sort((a, b) => a - b);
    const lo = xs[Math.floor(0.025 * xs.length)];
    const hi = xs[Math.floor(0.975 * xs.length)];
    const m = mean(xs);
    const se = Math.sqrt(mean(xs.map(x => (x - m) ** 2)));
    return { lo, hi, se };
  };

  // confound (optional)
  let confound: unknown = null;
  const confP = path.join(outDir, 'beam-e2-confound.json');
  if (fs.existsSync(confP)) confound = JSON.parse(fs.readFileSync(confP, 'utf-8'));

  const round = (x: number) => Math.round(x * 10000) / 10000;
  const fmtCi = (k: string) => { const c = ci(k); return { lo: round(c.lo), hi: round(c.hi), se: round(c.se) }; };

  const final = {
    experiment: 'E2 — BEAM 2×2 store×prompt causal ablation (contradiction_resolution)',
    n_questions: cells.A.length,
    n_conversations: convs.length,
    bootstrap: { method: 'conversation-cluster', B, seed_rng: 'mulberry32' },
    external_anchor: { published_cellA_subset_mean: 0.5875, published_cellA_subset_pass: 0.8714, mem0_mean: 0.3571 },
    design: {
      A: { store: 'raw', prompt: 'v2' },
      B: { store: 'raw', prompt: 'incumbent' },
      C: { store: 'reconciled', prompt: 'v2' },
      D: { store: 'reconciled', prompt: 'incumbent' },
    },
    cells: Object.fromEntries(Object.keys(cells).map(c => [c, {
      mean: round(point[c].mean), pass: round(point[c].pass), n: point[c].n,
      mean_ci: fmtCi(`${c}_mean`), pass_ci: fmtCi(`${c}_pass`),
    }])),
    effects: {
      mean: {
        store_raw_minus_reconciled: { point: round((point.A.mean + point.B.mean) / 2 - (point.C.mean + point.D.mean) / 2), ci: fmtCi('store_mean') },
        prompt_v2_minus_incumbent: { point: round((point.A.mean + point.C.mean) / 2 - (point.B.mean + point.D.mean) / 2), ci: fmtCi('prompt_mean') },
        interaction: { point: round((point.A.mean - point.B.mean) - (point.C.mean - point.D.mean)), ci: fmtCi('interaction_mean') },
        prompt_within_raw: { point: round(point.A.mean - point.B.mean), ci: fmtCi('prompt_within_raw_mean') },
        prompt_within_reconciled: { point: round(point.C.mean - point.D.mean), ci: fmtCi('prompt_within_recon_mean') },
        store_within_v2: { point: round(point.A.mean - point.C.mean), ci: fmtCi('store_within_v2_mean') },
        store_within_incumbent: { point: round(point.B.mean - point.D.mean), ci: fmtCi('store_within_incumbent_mean') },
      },
      pass: {
        store_raw_minus_reconciled: { point: round((point.A.pass + point.B.pass) / 2 - (point.C.pass + point.D.pass) / 2), ci: fmtCi('store_pass') },
        prompt_v2_minus_incumbent: { point: round((point.A.pass + point.C.pass) / 2 - (point.B.pass + point.D.pass) / 2), ci: fmtCi('prompt_pass') },
        interaction: { point: round((point.A.pass - point.B.pass) - (point.C.pass - point.D.pass)), ci: fmtCi('interaction_pass') },
        prompt_within_raw: { point: round(point.A.pass - point.B.pass), ci: fmtCi('prompt_within_raw_pass') },
        prompt_within_reconciled: { point: round(point.C.pass - point.D.pass), ci: fmtCi('prompt_within_recon_pass') },
        store_within_v2: { point: round(point.A.pass - point.C.pass), ci: fmtCi('store_within_v2_pass') },
        store_within_incumbent: { point: round(point.B.pass - point.D.pass), ci: fmtCi('store_within_incumbent_pass') },
      },
    },
    confound,
  };

  const outP = path.join(outDir, 'beam-e2-FINAL.json');
  fs.writeFileSync(outP, JSON.stringify(final, null, 2) + '\n', 'utf-8');

  // console summary
  console.log('\n=== E2 2×2 (contradiction_resolution, n=' + cells.A.length + ') ===');
  console.log('cell            mean    pass');
  for (const c of ['A', 'B', 'C', 'D']) {
    console.log(`${c} ${final.design[c as 'A'].store.padEnd(11)}${final.design[c as 'A'].prompt.padEnd(10)} ${point[c].mean.toFixed(4)}  ${(point[c].pass * 100).toFixed(1)}%`);
  }
  const e = final.effects;
  console.log('\nMAIN EFFECTS (mean nugget):');
  console.log(`  STORE  (raw−recon):  ${e.mean.store_raw_minus_reconciled.point.toFixed(4)}  95%CI[${e.mean.store_raw_minus_reconciled.ci.lo},${e.mean.store_raw_minus_reconciled.ci.hi}]`);
  console.log(`  PROMPT (v2−incumb):  ${e.mean.prompt_v2_minus_incumbent.point.toFixed(4)}  95%CI[${e.mean.prompt_v2_minus_incumbent.ci.lo},${e.mean.prompt_v2_minus_incumbent.ci.hi}]`);
  console.log(`  INTERACTION:         ${e.mean.interaction.point.toFixed(4)}  95%CI[${e.mean.interaction.ci.lo},${e.mean.interaction.ci.hi}]`);
  console.log('MAIN EFFECTS (pass rate):');
  console.log(`  STORE  (raw−recon):  ${(e.pass.store_raw_minus_reconciled.point * 100).toFixed(1)}pp  95%CI[${(e.pass.store_raw_minus_reconciled.ci.lo * 100).toFixed(1)},${(e.pass.store_raw_minus_reconciled.ci.hi * 100).toFixed(1)}]`);
  console.log(`  PROMPT (v2−incumb):  ${(e.pass.prompt_v2_minus_incumbent.point * 100).toFixed(1)}pp  95%CI[${(e.pass.prompt_v2_minus_incumbent.ci.lo * 100).toFixed(1)},${(e.pass.prompt_v2_minus_incumbent.ci.hi * 100).toFixed(1)}]`);
  console.log(`  INTERACTION:         ${(e.pass.interaction.point * 100).toFixed(1)}pp  95%CI[${(e.pass.interaction.ci.lo * 100).toFixed(1)},${(e.pass.interaction.ci.hi * 100).toFixed(1)}]`);
  console.log(`\n→ ${outP}`);
}

main();
