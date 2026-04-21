#!/usr/bin/env node
// Sprint 10 Task 2.1 — Ensemble baseline analyzer.
//
// Reads a judge-calibration ensemble JSON artifact and reports:
//   1. Per-vendor match rate vs PM ground-truth labels (verdict + failure_mode).
//   2. Per-pair Cohen-style agreement (verdict+failure_mode joint category).
//   3. Dataset-wide Fleiss' kappa across all instances × 3 raters.
//   4. Cost + latency per vendor (verdict-specific breakdown).
//   5. Instance-level disagreement log.
//
// This is the analysis half of Task 2.1. The calibration artifact itself
// is produced by judge-calibration.mjs --ensemble ... — this script
// consumes that artifact and produces the baseline markdown report.
//
// Usage:
//   node scripts/analyze-ensemble-baseline.mjs \
//     --in preflight-results/judge-calibration-ensemble-<ISO>.json \
//     [--out docs/reports/multi-vendor-ensemble-baseline-<ISO>.md]

import fs from 'node:fs';
import path from 'node:path';

const args = (() => {
  const out = { inPath: undefined, outPath: undefined };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--in') { out.inPath = argv[++i]; }
    else if (argv[i] === '--out') { out.outPath = argv[++i]; }
  }
  if (!out.inPath) throw new Error('--in <path-to-ensemble-json> required');
  if (!out.outPath) {
    const base = path.basename(out.inPath, '.json').replace('judge-calibration-ensemble-', 'multi-vendor-ensemble-baseline-');
    out.outPath = `docs/reports/${base}.md`;
  }
  return out;
})();

// ── Fleiss' kappa across N items × k raters × c categories ────────────────

/**
 * Fleiss' kappa for multiple raters on categorical ratings.
 * Input: n×c matrix where cell [i][j] = number of raters who assigned
 * category j to item i. Sum of each row = number of raters (constant k).
 *
 * Formula per Fleiss (1971):
 *   P_j = sum_i(n_ij) / (N * k)       # overall proportion of cat j
 *   P_i = (1/(k*(k-1))) * (sum_j n_ij^2 - k)   # agreement on item i
 *   P_bar = mean(P_i)
 *   P_e = sum_j P_j^2
 *   kappa = (P_bar - P_e) / (1 - P_e)
 */
function fleissKappa(matrix) {
  const N = matrix.length;
  if (N === 0) return NaN;
  const c = matrix[0].length;
  const k = matrix[0].reduce((s, v) => s + v, 0);
  if (k < 2) return NaN;

  // P_j
  const totalRatings = N * k;
  const P_j = new Array(c).fill(0);
  for (const row of matrix) {
    for (let j = 0; j < c; j++) P_j[j] += row[j];
  }
  for (let j = 0; j < c; j++) P_j[j] /= totalRatings;

  // P_i and mean
  let P_bar = 0;
  for (const row of matrix) {
    let sumSq = 0;
    for (let j = 0; j < c; j++) sumSq += row[j] * row[j];
    const Pi = (sumSq - k) / (k * (k - 1));
    P_bar += Pi;
  }
  P_bar /= N;

  // P_e
  let P_e = 0;
  for (let j = 0; j < c; j++) P_e += P_j[j] * P_j[j];

  if (P_e >= 1) return NaN;
  return (P_bar - P_e) / (1 - P_e);
}

/** Cohen's kappa between exactly two raters on categorical ratings. */
function cohensKappa(rater1, rater2) {
  if (rater1.length !== rater2.length || rater1.length === 0) return NaN;
  const n = rater1.length;
  const categories = new Set([...rater1, ...rater2]);
  let agree = 0;
  for (let i = 0; i < n; i++) if (rater1[i] === rater2[i]) agree++;
  const P_o = agree / n;
  let P_e = 0;
  for (const cat of categories) {
    const p1 = rater1.filter(c => c === cat).length / n;
    const p2 = rater2.filter(c => c === cat).length / n;
    P_e += p1 * p2;
  }
  if (P_e >= 1) return NaN;
  return (P_o - P_e) / (1 - P_e);
}

function interpretKappa(k) {
  if (isNaN(k)) return 'undefined';
  if (k < 0) return 'worse than chance';
  if (k < 0.20) return 'slight';
  if (k < 0.40) return 'fair';
  if (k < 0.60) return 'moderate';
  if (k < 0.80) return 'substantial';
  return 'strong';
}

// ── Joint category builder ───────────────────────────────────────────────

/** Joint category key for (verdict, failure_mode). Matches PM label space. */
function joinLabel(verdict, failureMode) {
  const fm = failureMode === null || failureMode === undefined ? 'null' : failureMode;
  return `${verdict}/${fm}`;
}

// ── Main ─────────────────────────────────────────────────────────────────

const data = JSON.parse(fs.readFileSync(args.inPath, 'utf-8'));
const instances = data.perInstance;
const ensembleModels = data.ensemble;
const majorityMatches = data.matchRate.matches;
const total = data.matchRate.total;

// Per-vendor match rate vs PM
const perVendor = ensembleModels.map(model => {
  let matches = 0;
  const disagreements = [];
  for (const inst of instances) {
    const vendorVerdict = inst.judgeOutput.ensemble.find(e => e.model === model);
    if (!vendorVerdict) continue;
    const pmLabel = joinLabel(inst.humanVerdict, inst.humanFailureMode);
    const vendorLabel = joinLabel(vendorVerdict.verdict, vendorVerdict.failure_mode);
    if (pmLabel === vendorLabel) matches++;
    else disagreements.push({
      index: inst.index,
      instanceId: inst.instanceId,
      pm: pmLabel,
      vendor: vendorLabel,
      rationale: vendorVerdict.rationale,
    });
  }
  return { model, matches, total: instances.length, disagreements };
});

// Per-pair Cohen's kappa (joint labels across vendors only, not PM)
const pairKappas = [];
for (let i = 0; i < ensembleModels.length; i++) {
  for (let j = i + 1; j < ensembleModels.length; j++) {
    const labels1 = instances.map(inst => {
      const v = inst.judgeOutput.ensemble.find(e => e.model === ensembleModels[i]);
      return joinLabel(v.verdict, v.failure_mode);
    });
    const labels2 = instances.map(inst => {
      const v = inst.judgeOutput.ensemble.find(e => e.model === ensembleModels[j]);
      return joinLabel(v.verdict, v.failure_mode);
    });
    const agree = labels1.filter((l, k) => l === labels2[k]).length;
    const k = cohensKappa(labels1, labels2);
    pairKappas.push({ a: ensembleModels[i], b: ensembleModels[j], kappa: k, agreePct: (agree / labels1.length) * 100 });
  }
}

// Dataset-wide Fleiss' kappa across 3 vendor raters on joint labels
const allCategories = new Set();
for (const inst of instances) {
  for (const v of inst.judgeOutput.ensemble) allCategories.add(joinLabel(v.verdict, v.failure_mode));
}
const cats = [...allCategories].sort();
const fleissMatrix = instances.map(inst => {
  const row = new Array(cats.length).fill(0);
  for (const v of inst.judgeOutput.ensemble) {
    const lbl = joinLabel(v.verdict, v.failure_mode);
    row[cats.indexOf(lbl)]++;
  }
  return row;
});
const fleissK = fleissKappa(fleissMatrix);

// Dataset-wide Fleiss' kappa INCLUDING PM as a 4th rater (agreement with ground truth)
const fleissMatrixWithPM = instances.map(inst => {
  const row = new Array(cats.length).fill(0);
  for (const v of inst.judgeOutput.ensemble) {
    const lbl = joinLabel(v.verdict, v.failure_mode);
    row[cats.indexOf(lbl)]++;
  }
  const pmLbl = joinLabel(inst.humanVerdict, inst.humanFailureMode);
  const pmIdx = cats.indexOf(pmLbl);
  if (pmIdx >= 0) {
    row[pmIdx]++;
  } else {
    // PM's label isn't in the vendors' category set — extend
    cats.push(pmLbl);
    row.push(1);
  }
  return row;
});
// Pad all rows to match new cats length
for (const row of fleissMatrixWithPM) while (row.length < cats.length) row.push(0);
const fleissKWithPM = fleissKappa(fleissMatrixWithPM);

// Cost by vendor
const costByVendor = Object.fromEntries(ensembleModels.map(m => [m, { calls: 0, usd: 0, latencyMsTotal: 0 }]));
for (const entry of data.cost.entries) {
  if (costByVendor[entry.model]) {
    costByVendor[entry.model].calls++;
    costByVendor[entry.model].usd += entry.usd;
    costByVendor[entry.model].latencyMsTotal += entry.latencyMs;
  }
}

// ── Emit markdown report ──────────────────────────────────────────────────

const now = new Date().toISOString();
const md = [];
md.push(`# Multi-Vendor Ensemble Baseline — Sprint 10 Task 2.1`);
md.push('');
md.push(`**Generated:** ${now}`);
md.push(`**Calibration artifact:** \`${args.inPath}\``);
md.push(`**Labels source:** \`${data.labelsSource}\``);
md.push(`**Ensemble vendors:** ${ensembleModels.join(', ')}`);
md.push(`**Instances:** ${instances.length}`);
md.push('');
md.push('---');
md.push('');
md.push('## 1. Per-vendor match rate vs PM ground truth');
md.push('');
md.push('| Vendor | Match rate | Spend | Avg latency | Disagreements |');
md.push('|---|---|---|---|---|');
for (const pv of perVendor) {
  const cost = costByVendor[pv.model];
  const avgLatMs = cost.calls > 0 ? Math.round(cost.latencyMsTotal / cost.calls) : 0;
  md.push(`| \`${pv.model}\` | ${pv.matches}/${pv.total} | $${cost.usd.toFixed(6)} | ${avgLatMs}ms | ${pv.disagreements.length} |`);
}
md.push('');
md.push(`**Ensemble majority match rate:** ${majorityMatches}/${total}`);
md.push(`**Total ensemble spend:** $${data.cost.totalUsd.toFixed(6)} (${data.cost.judgeCalls} calls across ${ensembleModels.length} vendors × ${instances.length} instances)`);
md.push('');
md.push('---');
md.push('');
md.push('## 2. Pair-wise Cohen\'s kappa (inter-rater, vendors only)');
md.push('');
md.push('| Pair | Kappa | Band | Agree% |');
md.push('|---|---|---|---|');
for (const p of pairKappas) {
  md.push(`| \`${p.a}\` ↔ \`${p.b}\` | ${p.kappa.toFixed(4)} | ${interpretKappa(p.kappa)} | ${p.agreePct.toFixed(1)}% |`);
}
md.push('');
md.push(`### Dataset-wide Fleiss' kappa`);
md.push('');
md.push(`- **Vendors only (3 raters):** κ = **${fleissK.toFixed(4)}** → ${interpretKappa(fleissK)}`);
md.push(`- **Vendors + PM (4 raters):** κ = **${fleissKWithPM.toFixed(4)}** → ${interpretKappa(fleissKWithPM)}`);
md.push('');
md.push('### Interpretation band (brief §2.2)');
md.push('');
md.push('| κ range | Band | Stage 2 implication |');
md.push('|---|---|---|');
md.push('| ≥ 0.80 | strong | ensemble ready; ensemble verdict primary |');
md.push('| 0.60 — 0.80 | substantial | ensemble ready + tie-breaker policy documented |');
md.push('| 0.40 — 0.60 | moderate | **PM review required before Stage 2 kickoff** |');
md.push('| < 0.40 | fair or worse | **go/no-go review**; scope pivot to single-judge Opus + rubric refinement |');
md.push('');
md.push('---');
md.push('');
md.push('## 3. Disagreement log (vendor vs PM)');
md.push('');
for (const pv of perVendor) {
  if (pv.disagreements.length === 0) continue;
  md.push(`### \`${pv.model}\` — ${pv.disagreements.length} disagreement(s)`);
  md.push('');
  for (const d of pv.disagreements) {
    md.push(`**Instance ${d.index}** (${d.instanceId})`);
    md.push(`- PM: \`${d.pm}\``);
    md.push(`- Vendor: \`${d.vendor}\``);
    md.push(`- Rationale: ${d.rationale}`);
    md.push('');
  }
}

md.push('---');
md.push('');
md.push('## 4. Notes for Stage 2 primary-judge selection');
md.push('');
md.push('Sprint 10 brief §1.3 + §2.1 decision tree:');
md.push('- Task 1.3 Sonnet calibration produced 8/10 match → borderline 7-8 band → **multi-vendor kappa required before Stage 2 primary lock**.');
md.push(`- Task 2.1 ensemble majority produced ${majorityMatches}/${total} match → ${majorityMatches === total ? 'unanimous with PM' : majorityMatches >= Math.floor(total * 0.9) ? 'near-unanimous' : 'moderate agreement'} with PM on the current 10-instance dataset.`);
md.push(`- Fleiss' κ (vendors only) = ${fleissK.toFixed(3)} → **${interpretKappa(fleissK)}** band.`);
md.push('');
md.push(`**Task 2.2 scope:** brief §2.2 calls for 15 triples (10 Sprint-9 + 5 new PM-authored) to extend this baseline. The 10-instance result above is INDICATIVE, not final — full band assessment requires the additional 5 triples to avoid small-sample bias.`);
md.push('');
md.push('**Open signal (flagged to PM):**');
md.push('- Instance 9 (`locomo_conv-50_q037`) — PM labeled `correct/null`; Haiku (Sprint 9 Task 4), Sonnet (Sprint 10 Task 1.3), and 2-of-3 ensemble vendors (GPT-5.4 + Gemini 3.1 Pro) flag `incorrect/F4` (fabrication: "touring with Frank Ocean" + "Tokyo stage").');
md.push('- Sprint 9 Task 4 Opus 4.7 solo agreed with PM. Today\'s ensemble Opus 4.7 also agrees with PM.');
md.push('- Signal: one PM label may warrant re-review. Not a judge weakness; a consistent-across-3-vendor-families disagreement on a specific instance.');
md.push('');
md.push('---');
md.push('');
md.push('*End of Task 2.1 baseline report. Task 2.2 (full 15-triple Fleiss\' kappa) opens next after PM authors the 5 additional ground-truth triples.*');

fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
fs.writeFileSync(args.outPath, md.join('\n') + '\n', 'utf-8');
console.log(`[ensemble-baseline] wrote ${args.outPath}`);

// Also print the key numbers to stdout for quick eyeballing
console.log(`[ensemble-baseline:summary] majority=${majorityMatches}/${total}`);
for (const pv of perVendor) {
  console.log(`  ${pv.model.padEnd(22,' ')} match=${pv.matches}/${pv.total} spend=$${costByVendor[pv.model].usd.toFixed(6)}`);
}
console.log(`  fleiss_kappa_vendors_only=${fleissK.toFixed(4)} (${interpretKappa(fleissK)})`);
console.log(`  fleiss_kappa_vendors_plus_pm=${fleissKWithPM.toFixed(4)} (${interpretKappa(fleissKWithPM)})`);
for (const p of pairKappas) {
  console.log(`  cohen_kappa ${p.a} x ${p.b} = ${p.kappa.toFixed(4)} (${interpretKappa(p.kappa)}, ${p.agreePct.toFixed(1)}% agree)`);
}
