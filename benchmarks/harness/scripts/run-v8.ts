#!/usr/bin/env tsx
/**
 * v8 Multi-Benchmark Runner — manifest-v8.2-final.md
 *
 * Executes the 4-track v8 ablation programme in strict order:
 *
 *   Track A0 — LongMemEval V1  (500 questions, 4 cells, $20 budget)
 *   Track A  — BEAM 128K       (~300 questions, 4 cells, $50 budget)
 *   Track B  — GAIA 2          (BLOCKED: requires WSL2 / SIGALRM fix)
 *   Track D  — Terminal-Bench  (external infra, zero cost)
 *
 * 4-cell ablation grid per track:
 *   no-context        → zero-memory baseline
 *   retrieval         → HybridSearch recall only
 *   hive_mind_ipb     → HybridSearch + I/P/B frame writes (primary treatment)
 *   hive_mind_ipb_strong → same as hive_mind_ipb, Opus 4.x model
 *
 * Usage:
 *   npx tsx benchmarks/harness/scripts/run-v8.ts [options]
 *
 * Options:
 *   --track a0|a|b|d|all      Which track(s) to run (default: all)
 *   --limit N                 Instance count cap per cell (default: full)
 *   --budget-a0 USD           Hard USD cap for Track A0 (default: 20)
 *   --budget-a USD            Hard USD cap for Track A  (default: 50)
 *   --model-primary ID        Primary subject model     (default: qwen3.6-35b-a3b)
 *   --model-strong ID         Strong subject model      (default: claude-opus-4-x)
 *   --lme-data-path P         Path to longmemeval.jsonl (default: auto-discover)
 *   --beam-data-path P        Path to beam-128K.jsonl   (default: auto-discover)
 *   --dry-run                 Stub LLM calls
 *   --no-ipb-strong           Skip hive_mind_ipb_strong cell (saves Opus spend)
 *   --judge ID                Enable per-instance judge (default: none)
 *   --seed N                  PRNG seed (default: 42)
 *
 * Env:
 *   LITELLM_URL       default http://localhost:4000
 *   LITELLM_API_KEY   default sk-waggle-dev
 *
 * Output:
 *   benchmarks/results/v8/<track>/<cell>-<dataset>-<ts>.jsonl
 *   benchmarks/results/v8/<track>/<cell>-<dataset>-<ts>.summary.json
 *   benchmarks/results/v8/run-v8-<ts>.log  (full run log)
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import process from 'node:process';

import { generateTurnId, logTurnEvent } from '@waggle/agent';
import type {
  CellName, DatasetSpec, JsonlRecord, ModelSpec, RunConfig,
} from '../src/types.js';
import { loadDataset, getDatasetVersion, sampleInstances } from '../src/datasets.js';
import { createLlmClient } from '../src/llm.js';
import { JsonlWriter, buildAggregate, scoreAccuracy, percentile } from '../src/metrics.js';
import { cells, isCellName } from '../src/cells.js';
import { hiveMindIpbCell } from '../src/cells-ipb.js';
import type { CellInput } from '../src/cells-ipb.js';
import { createSubstrate } from '../src/substrate.js';
import type { Substrate } from '../src/substrate.js';
import { extractTurnsFromLongMemEval, ingestLongMemEvalCorpus } from '../src/ingest-longmemeval.js';
import { extractTurnsFromBeam, ingestBeamCorpus } from '../src/ingest-beam.js';
import { StreakTracker } from '../src/streak-tracker.js';
import { preCellHealthCheck } from '../src/health-check.js';
import { acquireRunnerLock } from '../src/runner-lock.js';
import type { LockHandle } from '../src/runner-lock.js';
import { createJudgeLlmClient } from '../src/judge-client.js';
import { runJudge } from '../src/judge-runner.js';
import type { JudgeConfig, JudgePayload } from '../src/judge-runner.js';
import type { JudgeClientCostEntry } from '../src/judge-client.js';

// ── Extended cell name (adds hive_mind_ipb) ────────────────────────────────

type V8CellName = CellName | 'hive_mind_ipb';

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_SEED = 42;
const DEFAULT_BUDGET_A0 = 20;  // Track A0: LME V1  ($20 hard halt)
const DEFAULT_BUDGET_A = 50;   // Track A:  BEAM     ($50 hard halt)

// v8 4-cell ablation grid (in run order)
const V8_CELLS: readonly V8CellName[] = [
  'no-context',
  'retrieval',
  'hive_mind_ipb',
  // hive_mind_ipb_strong is added at runtime when --model-strong is set and
  // --no-ipb-strong is NOT passed. It runs as a separate hive_mind_ipb cell
  // invocation with the strong model id.
];

// ── Path helpers ──────────────────────────────────────────────────────────────

function harnessRoot(): string {
  const here = url.fileURLToPath(import.meta.url);
  // scripts/ → harness root
  return path.resolve(path.dirname(here), '..');
}

function benchRoot(): string {
  return path.resolve(harnessRoot(), '..');
}

function defaultOutputDir(track: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(benchRoot(), 'results', 'v8', track);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function outputPath(dir: string, cell: string, dataset: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(dir, `${cell}-${dataset}-${ts}.jsonl`);
}

// ── Config loaders ────────────────────────────────────────────────────────────

function loadModels(): Record<string, ModelSpec> {
  const cfg = path.join(harnessRoot(), 'config', 'models.json');
  return JSON.parse(fs.readFileSync(cfg, 'utf-8')) as Record<string, ModelSpec>;
}

function loadDatasets(): Record<string, DatasetSpec> {
  const cfg = path.join(harnessRoot(), 'config', 'datasets.json');
  return JSON.parse(fs.readFileSync(cfg, 'utf-8')) as Record<string, DatasetSpec>;
}

// ── CLI arg parsing ────────────────────────────────────────────────────────────

interface V8Args {
  tracks: Array<'a0' | 'a' | 'b' | 'd'>;
  limit: number;
  budgetA0: number;
  budgetA: number;
  modelPrimary: string;
  modelStrong?: string;
  runIpbStrong: boolean;
  lmeDataPath?: string;
  beamDataPath?: string;
  dryRun?: boolean;
  judge?: string;
  seed: number;
}

function parseArgs(argv: string[]): V8Args {
  const out: V8Args = {
    tracks: ['a0', 'a'],  // default: A0 + A (B blocked, D is external)
    limit: Number.POSITIVE_INFINITY,
    budgetA0: DEFAULT_BUDGET_A0,
    budgetA: DEFAULT_BUDGET_A,
    modelPrimary: 'qwen3.6-35b-a3b',
    runIpbStrong: true,
    seed: DEFAULT_SEED,
  };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = argv[i + 1];
    switch (flag) {
      case '--track':
        if (next === 'all') {
          out.tracks = ['a0', 'a'];  // b and d are external
        } else if (next === 'a0' || next === 'a' || next === 'b' || next === 'd') {
          out.tracks = [next];
        } else {
          console.error(`[run-v8] Unknown --track value: ${next}. Use a0|a|b|d|all`);
          process.exit(1);
        }
        i++;
        break;
      case '--limit': out.limit = Number(next); i++; break;
      case '--budget-a0': out.budgetA0 = Number(next); i++; break;
      case '--budget-a': out.budgetA = Number(next); i++; break;
      case '--model-primary': out.modelPrimary = next; i++; break;
      case '--model-strong': out.modelStrong = next; i++; break;
      case '--no-ipb-strong': out.runIpbStrong = false; break;
      case '--lme-data-path': out.lmeDataPath = next; i++; break;
      case '--beam-data-path': out.beamDataPath = next; i++; break;
      case '--dry-run': out.dryRun = true; break;
      case '--live': out.dryRun = false; break;
      case '--judge': out.judge = next; i++; break;
      case '--seed': out.seed = Number(next); i++; break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }
  return out;
}

function printHelp(): void {
  console.log(`
run-v8.ts — v8 Multi-Benchmark Runner

Usage:
  npx tsx benchmarks/harness/scripts/run-v8.ts [options]

Tracks (run in order):
  --track a0      Track A0: LongMemEval V1 (500q, $20 budget)
  --track a       Track A:  BEAM 128K      (~300q, $50 budget)
  --track all     Run A0 then A (default)

Options:
  --limit N            Instance cap per cell
  --budget-a0 USD      Track A0 hard halt (default: $20)
  --budget-a USD       Track A hard halt  (default: $50)
  --model-primary ID   Primary model (default: qwen3.6-35b-a3b)
  --model-strong ID    Strong model for ipb_strong cell (default: claude-opus-4-x)
  --no-ipb-strong      Skip hive_mind_ipb_strong cell
  --lme-data-path P    Path to longmemeval.jsonl
  --beam-data-path P   Path to beam-128K.jsonl
  --dry-run            Stub LLM calls
  --judge MODEL        Enable per-instance judge
  --seed N             PRNG seed (default: 42)
`);
}

// ── Per-instance runner (handles both canonical cells + hive_mind_ipb) ──────

async function round(n: number, decimals: number): Promise<number> {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

function computeFileHash(p: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

interface V8RunOneConfig {
  cellName: V8CellName;
  /** When cellName is 'hive_mind_ipb' and this is set, uses strongModel. */
  useStrongModel?: boolean;
  dataset: DatasetSpec;
  model: ModelSpec;
  strongModel?: ModelSpec;
  litellmUrl: string;
  litellmApiKey: string;
  dryRun: boolean;
  limit: number;
  seed: number;
  budgetUsd: number;
  outputFilePath: string;
  substrate?: Substrate;
  judgeConfig?: JudgeConfig;
  judgeCosts: JudgeClientCostEntry[];
}

async function runOneV8(config: V8RunOneConfig): Promise<void> {
  const {
    cellName, useStrongModel, dataset, model, strongModel,
    litellmUrl, litellmApiKey, dryRun, limit, seed,
    budgetUsd, outputFilePath, substrate, judgeConfig, judgeCosts,
  } = config;

  const activeModel = useStrongModel && strongModel ? strongModel : model;
  const dataRoot = path.join(harnessRoot(), '..', 'data');
  const all = loadDataset(dataset, dataRoot);
  const datasetVersion = getDatasetVersion(dataset, dataRoot);
  const sampled = sampleInstances(all, seed, limit);

  const writer = new JsonlWriter(outputFilePath);
  const llm = createLlmClient({ dryRun, litellmUrl, litellmApiKey });

  const startedAt = new Date().toISOString();
  let totalCost = 0;
  let budgetStoppedAt: number | null = null;
  const latencies: number[] = [];
  const streakTracker = new StreakTracker();
  let streakHaltAt: number | null = null;
  let streakHaltSummary: string | null = null;

  const displayCell = useStrongModel ? 'hive_mind_ipb_strong' : cellName;
  console.log(`[v8:run] cell=${displayCell} dataset=${dataset.id} model=${activeModel.id} n=${sampled.length} budget=$${budgetUsd}`);

  for (let i = 0; i < sampled.length; i++) {
    if (totalCost >= budgetUsd) {
      budgetStoppedAt = i;
      console.log(`[v8:budget] halted at instance ${i} (cost=$${totalCost.toFixed(4)} >= $${budgetUsd})`);
      break;
    }

    const instance = sampled[i];
    const turnId = generateTurnId();

    let result;
    if (cellName === 'hive_mind_ipb') {
      const cellInput: CellInput = {
        instance,
        model: activeModel,
        llm,
        turnId,
        substrate,
        retrievalTopK: 20,
      };
      result = await hiveMindIpbCell(cellInput);
    } else if (isCellName(cellName)) {
      result = await cells[cellName]({
        instance,
        model: activeModel,
        llm,
        turnId,
        substrate,
        litellm: { url: litellmUrl, apiKey: litellmApiKey },
        retrievalTopK: 20,
      });
    } else {
      throw new Error(`[run-v8] Unknown cell: ${cellName}`);
    }

    latencies.push(result.latencyMs);
    const accuracy = result.failureMode ? 0 : scoreAccuracy(result.text, instance.expected);
    totalCost += result.costUsd;

    logTurnEvent(turnId, {
      stage: 'llm.response',
      cell: displayCell,
      model: activeModel.id,
      textChars: result.text.length,
      latencyMs: result.latencyMs,
      costUsd: result.costUsd,
      failureMode: result.failureMode,
      reasoningShape: result.reasoningShape ?? 'none',
      reasoningChars: result.reasoningContent?.length ?? 0,
    });

    // Per-instance judge
    let judgePayload: JudgePayload | null = null;
    if (judgeConfig && !result.failureMode) {
      judgePayload = await runJudge(
        {
          question: instance.question,
          groundTruth: instance.expected[0] ?? '',
          contextExcerpt: instance.context,
          modelAnswer: result.text,
        },
        judgeConfig,
      );
    }

    const record: JsonlRecord = {
      turnId,
      cell: displayCell as CellName,  // cast: JSONL schema, hive_mind_ipb_strong stored as variant
      instance_id: instance.instance_id,
      model: activeModel.id,
      seed,
      accuracy,
      p50_latency_ms: percentile(latencies, 50),
      p95_latency_ms: percentile(latencies, 95),
      usd_per_query: Math.round(result.costUsd * 1_000_000) / 1_000_000,
      failure_mode: result.failureMode,
      dataset_version: datasetVersion,
      ...(judgePayload && {
        model_answer: judgePayload.model_answer,
        judge_verdict: judgePayload.judge_verdict,
        judge_failure_mode: judgePayload.judge_failure_mode,
        judge_rationale: judgePayload.judge_rationale,
        judge_model: judgePayload.judge_model,
        judge_timestamp: judgePayload.judge_timestamp,
        judge_ensemble: judgePayload.judge_ensemble,
      }),
      ...(result.reasoningContent !== undefined && {
        reasoning_content: result.reasoningContent,
        reasoning_content_chars: result.reasoningContent.length,
      }),
      ...(result.reasoningShape !== undefined && {
        reasoning_shape: result.reasoningShape,
      }),
      ...(activeModel.pinning_surface !== undefined && {
        model_pinning_surface: activeModel.pinning_surface,
        model_pinning_carve_out_reason: activeModel.pinning_surface_carve_out_reason ?? null,
      }),
      model_revision_hash: null,
    };
    writer.write(record);

    // Progress log every 10 instances
    if ((i + 1) % 10 === 0 || i === sampled.length - 1) {
      const runningAcc = writer.all().reduce((sum, r) => sum + r.accuracy, 0) / writer.all().length;
      console.log(
        `[v8:progress] cell=${displayCell} ${i + 1}/${sampled.length} ` +
        `acc=${(runningAcc * 100).toFixed(1)}% cost=$${totalCost.toFixed(4)}`,
      );
    }

    if (streakTracker.record(result.failureMode)) {
      streakHaltAt = i + 1;
      streakHaltSummary = streakTracker.summary();
      break;
    }
  }

  await writer.close();
  const finishedAt = new Date().toISOString();

  const runConfig = {
    run: { kind: 'cell' as const, name: displayCell as CellName },
    dataset,
    model: activeModel,
    limit,
    seed,
    budgetUsd,
    outputPath: outputFilePath,
    dryRun,
    litellmUrl,
    litellmApiKey,
  } as RunConfig;
  const summary = buildAggregate(runConfig, writer.all(), startedAt, finishedAt, budgetStoppedAt);
  const summaryPath = outputFilePath.replace(/\.jsonl$/, '.summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');

  console.log(
    `[v8:summary] cell=${displayCell} dataset=${dataset.id} ` +
    `n=${summary.counts.total} completed=${summary.counts.completed} ` +
    `failed=${summary.counts.failed} ` +
    `accuracy=${(summary.metrics.meanAccuracy * 100).toFixed(2)}% ` +
    `cost=$${summary.metrics.totalUsd.toFixed(4)} ` +
    `jsonl=${outputFilePath}`,
  );

  if (streakHaltAt !== null) {
    throw new Error(
      `[v8:halt] cell '${displayCell}' aborted at instance ${streakHaltAt}/${sampled.length} ` +
      `due to consecutive transport failures (${streakHaltSummary}).`,
    );
  }
}

// ── Track runner ──────────────────────────────────────────────────────────────

interface TrackConfig {
  track: 'a0' | 'a';
  datasetId: string;
  budgetUsd: number;
  ingestDataset: boolean;
  ingestFn: 'lme' | 'beam';
  dataPathOverride?: string;
}

async function runTrack(
  config: TrackConfig,
  args: V8Args,
  primaryModel: ModelSpec,
  strongModel: ModelSpec | undefined,
  allDatasets: Record<string, DatasetSpec>,
  litellmUrl: string,
  litellmApiKey: string,
  dryRun: boolean,
  judgeConfig: JudgeConfig | undefined,
  judgeCosts: JudgeClientCostEntry[],
): Promise<void> {
  const { track, datasetId, budgetUsd, ingestFn, dataPathOverride } = config;
  const dataset = allDatasets[datasetId];
  if (!dataset) {
    throw new Error(`[run-v8] Dataset not found: ${datasetId}. Check config/datasets.json.`);
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`[v8] TRACK ${track.toUpperCase()} — ${dataset.displayName}`);
  console.log(`${'='.repeat(70)}`);

  const outDir = defaultOutputDir(track);

  // ── Build substrate + ingest corpus ──────────────────────────────────────
  let substrate: Substrate | null = null;

  if (!dryRun) {
    console.log(`[v8:substrate] building ephemeral MindDB substrate for ${datasetId} …`);
    substrate = createSubstrate();
    const dataRoot = path.join(harnessRoot(), '..', 'data');
    const jsonlPath = dataPathOverride ?? path.join(dataRoot, dataset.dataPath);

    if (!fs.existsSync(jsonlPath)) {
      throw new Error(
        `[run-v8] Dataset JSONL not found at ${jsonlPath}. ` +
        (ingestFn === 'lme'
          ? 'Run: npx tsx benchmarks/harness/scripts/build-longmemeval-canonical.ts'
          : 'Run: npx tsx benchmarks/harness/scripts/build-beam-canonical.ts --beam-data-path /path/to/BEAM/data --chat-size 128K'),
      );
    }

    const ingestStart = Date.now();
    if (ingestFn === 'lme') {
      const turns = extractTurnsFromLongMemEval(jsonlPath);
      console.log(`[v8:substrate] extracted ${turns.length} LME V1 turns from ${jsonlPath}`);
      const stats = await ingestLongMemEvalCorpus(
        substrate.db, substrate.search, substrate.frames, substrate.sessions, turns,
      );
      console.log(
        `[v8:substrate] LME ingest complete: frames=${stats.count} ` +
        `ingest_ms=${stats.ingestMs} index_ms=${stats.indexMs} ` +
        `total_ms=${Date.now() - ingestStart}`,
      );
    } else {
      const turns = extractTurnsFromBeam(jsonlPath);
      console.log(`[v8:substrate] extracted ${turns.length} BEAM turns from ${jsonlPath}`);
      const stats = await ingestBeamCorpus(
        substrate.db, substrate.search, substrate.frames, substrate.sessions, turns,
      );
      console.log(
        `[v8:substrate] BEAM ingest complete: frames=${stats.count} ` +
        `ingest_ms=${stats.ingestMs} index_ms=${stats.indexMs} ` +
        `total_ms=${Date.now() - ingestStart}`,
      );
    }
  } else {
    console.log(`[v8:substrate] dry-run — skipping substrate ingest`);
  }

  // Build the per-track cell list
  const trackCells: Array<{ cellName: V8CellName; useStrong: boolean }> = [
    { cellName: 'no-context', useStrong: false },
    { cellName: 'retrieval', useStrong: false },
    { cellName: 'hive_mind_ipb', useStrong: false },
  ];
  if (args.runIpbStrong && strongModel) {
    trackCells.push({ cellName: 'hive_mind_ipb', useStrong: true });
  }

  // Budget per-cell (split total track budget evenly so any single cell can't exhaust)
  // Each cell gets the full budget; the track budget is checked across cells
  // by the caller. Individual cell budgets are capped at budgetUsd / 4 * 1.5
  // to ensure all 4 cells get a fair share with some slack.
  const cellBudget = budgetUsd;  // individual hard-halt per cell

  let trackTotalCost = 0;

  try {
    for (const { cellName, useStrong } of trackCells) {
      const displayCell = useStrong ? 'hive_mind_ipb_strong' : cellName;

      // Skip retrieval/hive_mind_ipb cells in dry-run (need live embedder)
      if (dryRun && (cellName === 'retrieval' || cellName === 'hive_mind_ipb')) {
        console.log(`[v8:skip] ${displayCell} — skipped in dry-run mode (needs substrate)`);
        continue;
      }

      const outPath = outputPath(outDir, displayCell, datasetId);
      await runOneV8({
        cellName,
        useStrongModel: useStrong,
        dataset,
        model: primaryModel,
        strongModel,
        litellmUrl,
        litellmApiKey,
        dryRun,
        limit: args.limit,
        seed: args.seed,
        budgetUsd: cellBudget,
        outputFilePath: outPath,
        substrate: substrate ?? undefined,
        judgeConfig,
        judgeCosts,
      });

      // Read cost from summary file for track total
      const summaryPath = outPath.replace(/\.jsonl$/, '.summary.json');
      if (fs.existsSync(summaryPath)) {
        const summ = JSON.parse(fs.readFileSync(summaryPath, 'utf-8')) as {
          metrics?: { totalUsd?: number };
        };
        const cellCost = summ.metrics?.totalUsd ?? 0;
        trackTotalCost += cellCost;
        console.log(
          `[v8:track-cost] ${track.toUpperCase()} track running total: $${trackTotalCost.toFixed(4)}`,
        );
        if (trackTotalCost >= budgetUsd) {
          console.warn(
            `[v8:track-budget] Track ${track.toUpperCase()} track budget ($${budgetUsd}) reached ` +
            `after cell ${displayCell}. Stopping remaining cells.`,
          );
          break;
        }
      }
    }
  } finally {
    if (substrate) {
      substrate.close();
      console.log(`[v8:substrate] closed substrate for ${datasetId}`);
    }
  }

  console.log(
    `[v8:track-done] Track ${track.toUpperCase()} complete. ` +
    `Total cost: $${trackTotalCost.toFixed(4)} ` +
    `Results in: ${outDir}`,
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const allModels = loadModels();
  const allDatasets = loadDatasets();

  const primaryModel = allModels[args.modelPrimary];
  if (!primaryModel) {
    throw new Error(
      `[run-v8] Unknown primary model: ${args.modelPrimary}. ` +
      `Valid ids: ${Object.keys(allModels).join(', ')}`,
    );
  }

  let strongModel: ModelSpec | undefined;
  if (args.modelStrong) {
    strongModel = allModels[args.modelStrong];
    if (!strongModel) {
      throw new Error(
        `[run-v8] Unknown strong model: ${args.modelStrong}. ` +
        `Valid ids: ${Object.keys(allModels).join(', ')}`,
      );
    }
  } else {
    // Try to find claude-opus-4-x automatically
    strongModel = allModels['claude-opus-4-x'] ?? allModels['claude-opus-4-8'];
    if (strongModel) {
      console.log(`[v8] strong model auto-resolved: ${strongModel.id}`);
    } else if (args.runIpbStrong) {
      console.warn('[v8] No strong model found in models.json (tried claude-opus-4-x, claude-opus-4-8). Skipping hive_mind_ipb_strong cell.');
    }
  }

  const dryRun = args.dryRun ?? !process.env.LITELLM_URL;
  const litellmUrl = process.env.LITELLM_URL ?? 'http://localhost:4000';
  const litellmApiKey = process.env.LITELLM_API_KEY ?? 'sk-waggle-dev';

  if (dryRun) {
    console.log('[v8] DRY RUN mode — LLM calls will be stubbed');
  }

  // Judge wiring
  const judgeCosts: JudgeClientCostEntry[] = [];
  let judgeConfig: JudgeConfig | undefined;
  if (!dryRun && args.judge) {
    judgeConfig = {
      kind: 'single',
      model: args.judge,
      client: createJudgeLlmClient({
        litellmUrl, litellmApiKey,
        model: args.judge,
        onCall: entry => judgeCosts.push(entry),
      }),
    };
    console.log(`[v8] judge model: ${args.judge}`);
  }

  // Health check
  if (!dryRun) {
    const judgePingModels = args.judge ? [args.judge] : [];
    const hc = await preCellHealthCheck({
      litellmUrl, litellmApiKey,
      subjectModel: primaryModel.litellmModel,
      judgeModels: judgePingModels,
    });
    if (!hc.ok) {
      const summary = hc.failures.map(f => `${f.endpoint} → ${f.error}`).join('; ');
      throw new Error(
        `[v8:health-check] FAILED: ${summary}. ` +
        `Check LiteLLM proxy + provider keys before spending budget.`,
      );
    }
    console.log(`[v8:health-check] OK in ${hc.durationMs}ms`);
  }

  // Acquire single-runner lock
  const lockSentinel = path.join(harnessRoot(), '..', 'results', '.benchmark-runner');
  const runnerLock: LockHandle = acquireRunnerLock(lockSentinel);
  console.log(`[v8:lock] acquired runner lock (pid=${process.pid})`);

  const runStart = Date.now();
  console.log(`\n[v8] Starting v8 multi-benchmark run`);
  console.log(`[v8] Primary: ${primaryModel.id}${strongModel ? `  Strong: ${strongModel.id}` : ''}`);
  console.log(`[v8] Tracks: ${args.tracks.join(', ')}`);
  console.log(`[v8] Limit per cell: ${Number.isFinite(args.limit) ? args.limit : 'full'}`);
  console.log(`[v8] Seed: ${args.seed}`);

  try {
    // ── Track A0: LongMemEval V1 ──────────────────────────────────────────
    if (args.tracks.includes('a0')) {
      const lmeJsonlPath = args.lmeDataPath ??
        path.join(harnessRoot(), '..', 'data', 'longmemeval', 'longmemeval.jsonl');

      await runTrack(
        {
          track: 'a0',
          datasetId: 'longmemeval',
          budgetUsd: args.budgetA0,
          ingestDataset: true,
          ingestFn: 'lme',
          dataPathOverride: lmeJsonlPath,
        },
        args, primaryModel, strongModel, allDatasets,
        litellmUrl, litellmApiKey, dryRun, judgeConfig, judgeCosts,
      );
    }

    // ── Track A: BEAM 128K ────────────────────────────────────────────────
    if (args.tracks.includes('a')) {
      const beamJsonlPath = args.beamDataPath ??
        path.join(harnessRoot(), '..', 'data', 'beam', 'beam-128K.jsonl');

      await runTrack(
        {
          track: 'a',
          datasetId: 'beam-128k',
          budgetUsd: args.budgetA,
          ingestDataset: true,
          ingestFn: 'beam',
          dataPathOverride: beamJsonlPath,
        },
        args, primaryModel, strongModel, allDatasets,
        litellmUrl, litellmApiKey, dryRun, judgeConfig, judgeCosts,
      );
    }

    // ── Track B: GAIA 2 ───────────────────────────────────────────────────
    if (args.tracks.includes('b')) {
      console.log('\n[v8:track-b] BLOCKED — SIGALRM issue on Windows/WSL1.');
      console.log('[v8:track-b] Fix: run under WSL2 or Docker. Gate: PM-RATIFY-V8-PHASE1.');
    }

    // ── Track D: Terminal-Bench ───────────────────────────────────────────
    if (args.tracks.includes('d')) {
      console.log('\n[v8:track-d] Terminal-Bench is external infra.');
      console.log('[v8:track-d] Submit waggle scaffold to harborframework/terminal-bench-2-leaderboard.');
      console.log('[v8:track-d] Baseline: little-coder #118/#123 = 24.6% ± 3.2% (Qwen3.6-35B, 2026-05-14).');
    }

  } finally {
    runnerLock.release();
  }

  // Judge summary
  if (judgeCosts.length > 0) {
    const judgeTotalUsd = judgeCosts.reduce((sum, e) => sum + e.usd, 0);
    const judgeOk = judgeCosts.filter(e => e.ok).length;
    console.log(
      `\n[v8:judge-total] calls=${judgeCosts.length} ok=${judgeOk} ` +
      `failed=${judgeCosts.length - judgeOk} total_usd=$${judgeTotalUsd.toFixed(6)}`,
    );
  }

  const totalMs = Date.now() - runStart;
  console.log(`\n[v8:done] Total wall time: ${(totalMs / 1000).toFixed(1)}s`);
  console.log(`[v8:done] Results in: ${path.join(benchRoot(), 'results', 'v8')}/`);
}

main().catch(err => {
  console.error('[v8:fatal]', err?.message ?? err);
  process.exit(1);
});
