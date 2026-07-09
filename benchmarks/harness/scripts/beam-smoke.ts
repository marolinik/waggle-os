#!/usr/bin/env tsx
/**
 * BEAM 1M — judge/metric plumbing SMOKE (no-context cell).
 *
 * PURPOSE: validate the full graded-nugget-judge + metric pipeline end-to-end
 * on a cheap cell, per the build-phase brief. This is NOT a scored result — the
 * "no-context" cell gives the answerer zero memories, so it should abstain on
 * almost everything and score near-floor except on abstention questions (whose
 * gold answer IS "I don't have enough information"). The point is to confirm the
 * plumbing works and the metric distinguishes abilities, before any expensive
 * substrate ingest.
 *
 * PIPELINE per question:
 *   1. no-context answer  : gpt-4o, buildAnswerGenerationPrompt(question, [])
 *   2. graded judge       : gpt-4o, each rubric nugget -> {0,0.5,1}, mean = score
 *   3. metrics            : Avg Score (micro) + Pass Rate (>=0.5), overall + per-ability
 *
 * SAMPLING: deterministic — the first N (default 5) questions per memory_ability
 * encountered in the canonical's instance_id sort order (= 50 questions total).
 *
 * COST: hard-capped (default $4, under the $5 authorized). gpt-4o answerer+judge.
 * OPENAI_API_KEY is read from waggle-os/.env (loadDotEnv).
 *
 * Usage:
 *   tsx benchmarks/harness/scripts/beam-smoke.ts \
 *     [--per-ability 5] [--model gpt-4o] [--budget 4] [--tau] \
 *     [--data benchmarks/data/beam/beam-1M.jsonl]
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import url from 'node:url';
import process from 'node:process';

import { createBeamOpenAiClient } from '../src/beam-openai-client.js';
import { buildAnswerGenerationPrompt, judgeQuestion } from '../src/beam-nugget-judge.js';
import type { BeamLlmResult } from '../src/beam-nugget-judge.js';
import { computeBeamMetrics, formatBeamMetrics } from '../src/beam-metrics.js';
import type { BeamQuestionResult } from '../src/beam-metrics.js';

const ALL_ABILITIES = [
  'abstention', 'contradiction_resolution', 'event_ordering', 'information_extraction',
  'instruction_following', 'knowledge_update', 'multi_session_reasoning',
  'preference_following', 'summarization', 'temporal_reasoning',
];

interface CompactInstance {
  instance_id: string;
  question: string;
  memory_ability: string;
  rubric: string[];
  expected: string[];
}

interface Args {
  perAbility: number;
  model: string;
  budget: number;
  computeTau: boolean;
  dataPath: string;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const here = url.fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(here), '..', '..', '..');
  let perAbility = 5;
  let model = 'gpt-4o';
  let budget = 4;
  let computeTau = false;
  let dataPath = path.join(repoRoot, 'benchmarks', 'data', 'beam', 'beam-1M.jsonl');
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i];
    const next = argv[i + 1];
    if (f === '--per-ability' && next) { perAbility = parseInt(next, 10); i++; }
    else if (f === '--model' && next) { model = next; i++; }
    else if (f === '--budget' && next) { budget = parseFloat(next); i++; }
    else if (f === '--tau') { computeTau = true; }
    else if (f === '--data' && next) { dataPath = path.resolve(next); i++; }
  }
  return { perAbility, model, budget, computeTau, dataPath };
}

/**
 * Stream the (large, ~3 GB) canonical and collect the first `perAbility`
 * instances per memory_ability. Early-terminates once every ability is full,
 * so only a handful of conversations are ever parsed. Drops the giant `context`
 * field immediately — the no-context cell does not use it.
 */
async function sampleInstances(dataPath: string, perAbility: number): Promise<CompactInstance[]> {
  if (!fs.existsSync(dataPath)) {
    throw new Error(`BEAM canonical not found at ${dataPath}. Build it via build-beam-canonical.ts --chat-size 1M`);
  }
  const buckets = new Map<string, CompactInstance[]>();
  for (const a of ALL_ABILITIES) buckets.set(a, []);
  const full = (): boolean => ALL_ABILITIES.every(a => (buckets.get(a)?.length ?? 0) >= perAbility);

  const rl = readline.createInterface({ input: fs.createReadStream(dataPath, 'utf-8'), crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let row: Record<string, unknown>;
      try { row = JSON.parse(trimmed); } catch { continue; }
      const ability = String(row.memory_ability ?? '');
      const bucket = buckets.get(ability);
      if (!bucket || bucket.length >= perAbility) {
        if (full()) break;
        continue;
      }
      bucket.push({
        instance_id: String(row.instance_id ?? ''),
        question: String(row.question ?? ''),
        memory_ability: ability,
        rubric: Array.isArray(row.rubric) ? (row.rubric as unknown[]).map(String) : [],
        expected: Array.isArray(row.expected) ? (row.expected as unknown[]).map(String) : [],
      });
      if (full()) break;
    }
  } finally {
    rl.close();
  }
  return ALL_ABILITIES.flatMap(a => buckets.get(a) ?? []);
}

function stripAnswerPrefix(text: string): string {
  return text.includes('ANSWER:') ? text.split('ANSWER:').pop()!.trim() : text.trim();
}

async function main(): Promise<void> {
  const args = parseArgs();
  const startedAt = new Date();
  console.log(`[beam-smoke] model=${args.model} per-ability=${args.perAbility} budget=$${args.budget} tau=${args.computeTau}`);
  console.log(`[beam-smoke] data=${args.dataPath}`);

  const client = createBeamOpenAiClient({ model: args.model });

  console.log('[beam-smoke] sampling instances (streaming canonical)…');
  const instances = await sampleInstances(args.dataPath, args.perAbility);
  console.log(`[beam-smoke] sampled ${instances.length} instances across ${ALL_ABILITIES.length} abilities`);

  let costUsd = 0;
  let answerCalls = 0;
  let judgeCalls = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  const acc = (r: BeamLlmResult): void => {
    costUsd += r.costUsd; inputTokens += r.inputTokens; outputTokens += r.outputTokens;
  };

  const perQuestion: BeamQuestionResult[] = [];
  const records: Record<string, unknown>[] = [];
  let budgetStopped = false;

  for (const inst of instances) {
    if (costUsd >= args.budget) {
      budgetStopped = true;
      console.warn(`[beam-smoke] budget cap $${args.budget} reached — stopping at ${perQuestion.length} questions`);
      break;
    }

    // 1. Generate no-context answer.
    const ans = await client.chat({
      system: '',
      user: buildAnswerGenerationPrompt(inst.question, []),
      maxTokens: 400,
    });
    acc(ans); answerCalls++;
    const answer = stripAnswerPrefix(ans.text);

    // 2. Judge nuggets.
    const { judgement, llmResults } = await judgeQuestion(
      client,
      { question: inst.question, rubric: inst.rubric, memoryAbility: inst.memory_ability, answer },
      { computeTau: args.computeTau },
    );
    for (const r of llmResults) { acc(r); judgeCalls++; }

    perQuestion.push({
      instanceId: inst.instance_id,
      memoryAbility: inst.memory_ability,
      score: judgement.score,
      ...(judgement.error ? { error: judgement.error } : {}),
    });
    records.push({
      instance_id: inst.instance_id,
      memory_ability: inst.memory_ability,
      question: inst.question,
      answer,
      answer_failure_mode: ans.failureMode,
      score: judgement.score,
      judgment: judgement.judgment,
      nugget_scores: judgement.nuggetScores,
      ...(judgement.scoreWithTau !== undefined ? { score_with_tau: judgement.scoreWithTau } : {}),
      ...(judgement.eventOrdering ? { event_ordering: judgement.eventOrdering } : {}),
      n_nuggets: inst.rubric.length,
    });
    process.stdout.write(
      `  [${perQuestion.length}/${instances.length}] ${inst.memory_ability.padEnd(24)} ` +
      `score=${judgement.score.toFixed(2)} (${judgement.judgment})  nuggets=${inst.rubric.length}  $${costUsd.toFixed(3)}\n`,
    );
  }

  const metrics = computeBeamMetrics(perQuestion);
  const finishedAt = new Date();

  // Write outputs.
  const here = url.fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(here), '..', '..', '..');
  const outDir = path.join(repoRoot, 'benchmarks', 'results', 'beam');
  fs.mkdirSync(outDir, { recursive: true });
  const ts = startedAt.toISOString().replace(/[:.]/g, '-');
  const jsonlPath = path.join(outDir, `beam-1m-smoke-nocontext-${ts}.jsonl`);
  const summaryPath = path.join(outDir, `beam-1m-smoke-nocontext-${ts}.summary.json`);
  fs.writeFileSync(jsonlPath, records.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf-8');

  const summary = {
    run: {
      cell: 'no-context',
      dataset: 'beam-1m',
      model: args.model,
      judge_model: args.model,
      protocol: 'mem0-nugget-graded (0/0.5/1 avg-score, pass>=0.5)',
      per_ability: args.perAbility,
      compute_tau: args.computeTau,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      budgetStopped,
    },
    metrics: {
      overall_avg_score: metrics.overall.avgScore,
      overall_pass_rate_pct: metrics.overall.accuracy,
      total: metrics.overall.total,
      correct: metrics.overall.correct,
      errors: metrics.overall.errors,
      by_ability: metrics.byAbility,
    },
    cost: {
      total_usd: costUsd,
      answer_calls: answerCalls,
      judge_calls: judgeCalls,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    },
  };
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n', 'utf-8');

  console.log('\n════════ BEAM 1M smoke (no-context) — metric plumbing ════════');
  console.log(formatBeamMetrics(metrics));
  console.log('──────────────────────────────────────────────────────────────');
  console.log(`cost=$${costUsd.toFixed(4)}  answer_calls=${answerCalls}  judge_calls=${judgeCalls}  ` +
              `in=${inputTokens} out=${outputTokens}`);
  console.log(`jsonl:   ${jsonlPath}`);
  console.log(`summary: ${summaryPath}`);
}

main().catch(err => {
  console.error('[beam-smoke] FATAL:', err);
  process.exit(1);
});
