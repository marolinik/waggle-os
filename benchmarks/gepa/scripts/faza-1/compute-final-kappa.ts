#!/usr/bin/env tsx
/**
 * GEPA Faza 1 — final κ_trio recompute on combined 135 evals.
 *
 * Per launch decision §F condition_3 + manifest v7 §canonical_kappa_anchor.
 *
 * Combines:
 *   - Gen 1 eval JSONL (120 records)
 *   - Checkpoint C eval JSONL (15 records)
 *
 * For each eval, derives per-judge binary pass (mean ≥ 4.0) and computes
 * pairwise Cohen's κ for the 3 judge pairs (Opus↔GPT, Opus↔MiniMax,
 * GPT↔MiniMax). Reports κ_trio (= min of pairs) + audit verdict.
 *
 * Per Amendment 5 §judge_metric_design: also reports raw agreement rate
 * (primary metric for synthesis Likert).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  auditKappa,
  computeCohensKappa,
  CANONICAL_KAPPA,
  KAPPA_DRIFT_BAND_LOW,
  KAPPA_DRIFT_BAND_HIGH,
} from '../../src/faza-1/kappa-audit.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../..');

const GEN_1_JSONL = path.join(REPO_ROOT, 'benchmarks/results/gepa-faza1/gen-1/gen-1-eval.jsonl');
const CHECKPOINT_C_JSONL = path.join(REPO_ROOT, 'benchmarks/results/gepa-faza1/checkpoint-c/checkpoint-c-eval.jsonl');
const OUT_JSON = path.join(REPO_ROOT, 'benchmarks/results/gepa-faza1/checkpoint-c/final-kappa-audit.json');

const PASS_THRESHOLD = 4.0;
const JUDGE_ORDER = ['claude-opus-4-7', 'gpt-5.4', 'minimax-m27-via-openrouter'] as const;

interface JudgeRec { judge_model: string; mean: number; raw: any }
interface EvalRec {
  candidateId: string;
  judgeRecords: JudgeRec[];
  evalSet?: 'held-out';
}

function loadJsonl(filepath: string): EvalRec[] {
  if (!fs.existsSync(filepath)) {
    console.error(`MISSING: ${filepath}`);
    return [];
  }
  return fs.readFileSync(filepath, 'utf-8').trim().split(/\n+/).filter(Boolean).map(l => JSON.parse(l));
}

function judgePassPerEval(rec: EvalRec): { opus: boolean | null; gpt: boolean | null; minimax: boolean | null } {
  const findBy = (model: string) => rec.judgeRecords.find(j => j.judge_model === model);
  const opus = findBy('claude-opus-4-7');
  const gpt = findBy('gpt-5.4');
  const minimax = findBy('minimax-m27-via-openrouter');
  return {
    opus: opus && opus.mean > 0 ? opus.mean >= PASS_THRESHOLD : null,
    gpt: gpt && gpt.mean > 0 ? gpt.mean >= PASS_THRESHOLD : null,
    minimax: minimax && minimax.mean > 0 ? minimax.mean >= PASS_THRESHOLD : null,
  };
}

interface ConfusionMatrix {
  bothCorrect: number;
  bothIncorrect: number;
  firstCorrectSecondIncorrect: number;
  firstIncorrectSecondCorrect: number;
}

function buildConfusion(pairs: Array<[boolean, boolean]>): ConfusionMatrix {
  const m: ConfusionMatrix = { bothCorrect: 0, bothIncorrect: 0, firstCorrectSecondIncorrect: 0, firstIncorrectSecondCorrect: 0 };
  for (const [a, b] of pairs) {
    if (a && b) m.bothCorrect++;
    else if (!a && !b) m.bothIncorrect++;
    else if (a && !b) m.firstCorrectSecondIncorrect++;
    else m.firstIncorrectSecondCorrect++;
  }
  return m;
}

function rawAgreement(pairs: Array<[boolean, boolean]>): number {
  if (pairs.length === 0) return NaN;
  let agree = 0;
  for (const [a, b] of pairs) if (a === b) agree++;
  return agree / pairs.length;
}

function main() {
  const gen1 = loadJsonl(GEN_1_JSONL);
  const cpc = loadJsonl(CHECKPOINT_C_JSONL);
  const combined = [...gen1, ...cpc];
  console.log(`Loaded: gen-1=${gen1.length}, checkpoint-c=${cpc.length}, combined=${combined.length}`);

  // Build per-judge pass arrays (skip evals where any judge failed parse)
  const opusGpt: Array<[boolean, boolean]> = [];
  const opusMinimax: Array<[boolean, boolean]> = [];
  const gptMinimax: Array<[boolean, boolean]> = [];
  let droppedDueToFailedJudge = 0;

  for (const rec of combined) {
    const v = judgePassPerEval(rec);
    if (v.opus === null || v.gpt === null || v.minimax === null) {
      droppedDueToFailedJudge++;
      continue;
    }
    opusGpt.push([v.opus, v.gpt]);
    opusMinimax.push([v.opus, v.minimax]);
    gptMinimax.push([v.gpt, v.minimax]);
  }
  console.log(`Effective N (after dropping failed-judge evals): ${opusGpt.length} (dropped: ${droppedDueToFailedJudge})`);

  const kOpusGpt = computeCohensKappa(buildConfusion(opusGpt));
  const kOpusMinimax = computeCohensKappa(buildConfusion(opusMinimax));
  const kGptMinimax = computeCohensKappa(buildConfusion(gptMinimax));

  const audit = auditKappa({ kOpusGpt, kOpusMinimax, kGptMinimax });

  const rawOG = rawAgreement(opusGpt);
  const rawOM = rawAgreement(opusMinimax);
  const rawGM = rawAgreement(gptMinimax);
  const rawMin = Math.min(rawOG, rawOM, rawGM);

  const passRates = {
    opus: opusGpt.filter(p => p[0]).length / opusGpt.length,
    gpt: opusGpt.filter(p => p[1]).length / opusGpt.length,
    minimax: opusMinimax.filter(p => p[1]).length / opusMinimax.length,
  };

  const result = {
    generated_at: new Date().toISOString(),
    inputs: {
      gen_1_jsonl_records: gen1.length,
      checkpoint_c_jsonl_records: cpc.length,
      combined_records: combined.length,
      effective_n_after_judge_failures: opusGpt.length,
      dropped_due_to_failed_judge: droppedDueToFailedJudge,
      threshold: PASS_THRESHOLD,
    },
    pairwise_kappa: {
      opus_gpt: kOpusGpt,
      opus_minimax: kOpusMinimax,
      gpt_minimax: kGptMinimax,
    },
    pairwise_raw_agreement: {
      opus_gpt: rawOG,
      opus_minimax: rawOM,
      gpt_minimax: rawGM,
      min: rawMin,
    },
    per_judge_pass_rates: passRates,
    canonical_kappa: CANONICAL_KAPPA,
    drift_band: { low: KAPPA_DRIFT_BAND_LOW, high: KAPPA_DRIFT_BAND_HIGH },
    audit: audit,
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(result, null, 2));

  console.log('');
  console.log('━'.repeat(76));
  console.log('  Faza 1 final κ audit on combined 135 evals');
  console.log('━'.repeat(76));
  console.log(`  N effective              : ${opusGpt.length}`);
  console.log(`  Per-judge pass rate@4.0  : Opus=${(passRates.opus*100).toFixed(1)}%  GPT=${(passRates.gpt*100).toFixed(1)}%  MiniMax=${(passRates.minimax*100).toFixed(1)}%`);
  console.log('');
  console.log('  PAIRWISE Cohen\'s κ:');
  console.log(`    Opus↔GPT       : ${kOpusGpt.toFixed(4)}`);
  console.log(`    Opus↔MiniMax   : ${kOpusMinimax.toFixed(4)}`);
  console.log(`    GPT↔MiniMax    : ${kGptMinimax.toFixed(4)}`);
  console.log('');
  console.log('  PAIRWISE raw agreement (Amendment 5 PRIMARY for synthesis Likert):');
  console.log(`    Opus↔GPT       : ${(rawOG*100).toFixed(1)}%`);
  console.log(`    Opus↔MiniMax   : ${(rawOM*100).toFixed(1)}%`);
  console.log(`    GPT↔MiniMax    : ${(rawGM*100).toFixed(1)}%`);
  console.log(`    MIN raw         : ${(rawMin*100).toFixed(1)}%`);
  console.log('');
  console.log(`  κ_conservative_trio    : ${audit.kConservativeTrio.toFixed(4)}`);
  console.log(`  Canonical κ            : ${CANONICAL_KAPPA.toFixed(4)}`);
  console.log(`  Drift band             : [${KAPPA_DRIFT_BAND_LOW.toFixed(4)}, ${KAPPA_DRIFT_BAND_HIGH.toFixed(4)}]`);
  console.log(`  §F.3 verdict           : ${audit.verdict}`);
  console.log(`  v6 policy floor (≥0.70): ${audit.v6PolicyFloorPass ? 'PASS' : 'FAIL'}`);
  console.log(`  Amendment 5 raw 65% min: ${rawMin >= 0.65 ? 'PASS' : 'FAIL'} (observed ${(rawMin*100).toFixed(1)}%)`);
  console.log('');
  console.log(`  Audit log: ${audit.auditLogLine}`);
  console.log('');
  console.log(`Wrote: ${OUT_JSON}`);
}

main();
