#!/usr/bin/env tsx
/**
 * Four-cell ablation harness — CLI entry.
 *
 * Usage (via `npm run bench -- ...` from repo root, or direct `tsx`):
 *
 *   --cell raw                  Single cell
 *   --cell memory-only
 *   --cell evolve-only
 *   --cell full-stack
 *   --all-cells                 Run all four sequentially (same dataset/seed)
 *   --control verbose-fixed     Diagnostic control (not a cell)
 *
 *   --dataset locomo            locomo | longmemeval | synthetic
 *   --limit N                   N instances. --full sets Infinity.
 *   --full                      Alias for --limit Infinity.
 *   --model qwen3.6-35b-a3b     Must match an id in config/models.json
 *   --seed N                    Default: 42 (reproducibility artifact req).
 *   --budget USD                Hard USD cap. Default: Infinity.
 *   --output path.jsonl         Default: ../results/<cell>-<dataset>-<ts>.jsonl
 *   --dry-run                   Stub LLM calls. Default: true when
 *                               LITELLM_URL is not set.
 *
 * Env:
 *   LITELLM_URL       default http://localhost:4000
 *   LITELLM_API_KEY   default sk-waggle-dev
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { generateTurnId, logTurnEvent } from '@waggle/agent';
import type {
  CellName, ControlName, DatasetSpec, JsonlRecord, ModelSpec, RunConfig, RunKind,
} from './types.js';
import { loadDataset, loadPreflightSampleLock, sampleInstances } from './datasets.js';
import { createLlmClient } from './llm.js';
import { JsonlWriter, buildAggregate, scoreAccuracy, percentile } from './metrics.js';
import { cells, isCellName, isControlName } from './cells.js';
import { controls } from './controls.js';
import { createJudgeLlmClient, type JudgeClientCostEntry } from './judge-client.js';
import { runJudge, type JudgeConfig } from './judge-runner.js';

// ── Arg parsing ────────────────────────────────────────────────────────────

interface ParsedArgs {
  cell?: string;
  allCells: boolean;
  control?: string;
  dataset: string;
  limit: number;
  model: string;
  seed: number;
  budget: number;
  output?: string;
  dryRun?: boolean;
  sampleLock?: string;
  /** When set, each cell/control call also triggers a judge call after
   *  the model answer returns. Value is the single-judge model id
   *  (e.g. `claude-sonnet-4-6`). Default: undefined → judging skipped. */
  judge?: string;
  /** Comma-separated list of judge model ids for ensemble mode. First
   *  id is the tie-breaker (Sonnet by taxonomy §6 convention). Takes
   *  precedence over `--judge` when both are set. */
  judgeEnsemble?: string[];
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    allCells: false,
    dataset: 'synthetic',
    limit: 10,
    model: 'qwen3.6-35b-a3b',
    seed: 42,
    budget: Number.POSITIVE_INFINITY,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = argv[i + 1];
    switch (flag) {
      case '--cell': out.cell = next; i++; break;
      case '--all-cells': out.allCells = true; break;
      case '--control': out.control = next; i++; break;
      case '--dataset': out.dataset = next; i++; break;
      case '--limit': out.limit = Number(next); i++; break;
      case '--full': out.limit = Number.POSITIVE_INFINITY; break;
      case '--model': out.model = next; i++; break;
      case '--seed': out.seed = Number(next); i++; break;
      case '--budget': out.budget = Number(next); i++; break;
      case '--output': out.output = next; i++; break;
      case '--dry-run': out.dryRun = true; break;
      case '--live': out.dryRun = false; break;
      case '--sample-lock': out.sampleLock = next; i++; break;
      case '--judge': out.judge = next; i++; break;
      case '--judge-ensemble':
        out.judgeEnsemble = (next ?? '').split(',').map(s => s.trim()).filter(Boolean);
        i++;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }
  return out;
}

function printHelp(): void {
  console.log(`Four-cell ablation harness.

Usage:
  waggle-bench --cell <raw|memory-only|evolve-only|full-stack> --dataset <id> --limit N --model <id>
  waggle-bench --all-cells --dataset <id> --limit N --model <id> [--budget USD]
  waggle-bench --control verbose-fixed --dataset <id> --limit N --model <id>

Flags:
  --cell            Single cell name
  --all-cells       Run all four cells sequentially
  --control         Diagnostic control (e.g. verbose-fixed)
  --dataset         locomo | longmemeval | synthetic   (default synthetic)
  --limit N         Instance count cap                 (default 10)
  --full            --limit Infinity
  --model id        Model id from config/models.json   (default qwen3.6-35b-a3b)
  --seed N          PRNG seed                          (default 42)
  --budget USD      Hard USD cap                       (default Infinity)
  --output path     JSONL output path                  (default auto)
  --dry-run         Stub LLM calls                     (default if LITELLM_URL unset)
  --live            Force real LLM calls even if LITELLM_URL unset
  --sample-lock P   Path to a committed sample-lock JSON. Bypasses the dataset
                    adapter and loads instances directly from the lock. Runtime
                    asserts category distribution matches 13/13/12/12 for the
                    Stage 2 preflight gate; fails fast otherwise.
  --judge MODEL     Enable single-judge mode. After each cell call, invokes
                    failure-mode-judge with the given model (e.g.
                    claude-sonnet-4-6) and populates the judge fields on the
                    JSONL record. Skip the flag to run without judging.
  --judge-ensemble M1,M2,...
                    Enable 3+-judge ensemble mode. First model is the tie-
                    breaker. Takes precedence over --judge. Real API spend —
                    keep within the brief's $5 alarm per run.
  --help, -h        This text
`);
}

// ── Config loaders ─────────────────────────────────────────────────────────

function harnessRoot(): string {
  // __filename equivalent for ESM. When compiled to dist/runner.js this
  // resolves to the dist dir; when run via tsx it resolves to src/runner.ts.
  const here = url.fileURLToPath(import.meta.url);
  // `harness/dist/runner.js` → harness dir; `harness/src/runner.ts` → harness dir.
  return path.resolve(path.dirname(here), '..');
}

function loadModels(): Record<string, ModelSpec> {
  const cfg = path.join(harnessRoot(), 'config', 'models.json');
  return JSON.parse(fs.readFileSync(cfg, 'utf-8')) as Record<string, ModelSpec>;
}

function loadDatasets(): Record<string, DatasetSpec> {
  const cfg = path.join(harnessRoot(), 'config', 'datasets.json');
  return JSON.parse(fs.readFileSync(cfg, 'utf-8')) as Record<string, DatasetSpec>;
}

// ── Run driver ─────────────────────────────────────────────────────────────

async function runOne(config: RunConfig): Promise<void> {
  const startedAt = new Date().toISOString();
  const dataRoot = path.join(harnessRoot(), '..', 'data');
  // Sample-lock path, when provided, takes precedence over the dataset adapter
  // and enforces the Stage 2 13/13/12/12 distribution inside
  // loadPreflightSampleLock. Failure to match → throw before any LLM call,
  // which is the Task-1 acceptance requirement.
  const all = config.sampleLockPath
    ? loadPreflightSampleLock(
        path.isAbsolute(config.sampleLockPath)
          ? config.sampleLockPath
          : path.resolve(process.cwd(), config.sampleLockPath),
      )
    : loadDataset(config.dataset, dataRoot);
  // When a sample lock drives the run, honor instance order verbatim — the
  // lock file IS the deterministic sample. Cell comparisons require identical
  // order across cells, and `sampleInstances` would re-shuffle the lock.
  const sampled = config.sampleLockPath
    ? (Number.isFinite(config.limit) && config.limit < all.length ? all.slice(0, config.limit) : all.slice())
    : sampleInstances(all, config.seed, config.limit);

  const writer = new JsonlWriter(config.outputPath);
  const llm = createLlmClient({
    dryRun: config.dryRun,
    litellmUrl: config.litellmUrl,
    litellmApiKey: config.litellmApiKey,
  });

  let totalCost = 0;
  let budgetStoppedAt: number | null = null;
  const latenciesByInstance: number[] = [];

  for (let i = 0; i < sampled.length; i++) {
    if (totalCost >= config.budgetUsd) {
      budgetStoppedAt = i;
      break;
    }
    const instance = sampled[i];
    const turnId = generateTurnId();
    const cellOrControlFn = config.run.kind === 'cell'
      ? cells[config.run.name as CellName]
      : controls[config.run.name as ControlName];

    const result = await cellOrControlFn({ instance, model: config.model, llm, turnId });
    latenciesByInstance.push(result.latencyMs);

    const accuracy = result.failureMode ? 0 : scoreAccuracy(result.text, instance.expected);
    totalCost += result.costUsd;

    // Sprint 11 A2: emit structured llm.response event tagged with turnId.
    // `reasoningShape` + char count become the canonical observability
    // surface; reasoning content itself goes to JSONL only, never to logs,
    // per design doc §2.3/§2.4 exclusion rules.
    logTurnEvent(turnId, {
      stage: 'llm.response',
      cell: config.run.name,
      model: config.model.id,
      textChars: result.text.length,
      latencyMs: result.latencyMs,
      costUsd: result.costUsd,
      failureMode: result.failureMode,
      reasoningShape: result.reasoningShape ?? 'none',
      reasoningChars: result.reasoningContent?.length ?? 0,
    });
    // Drift alarm per ratification §Q3: thinking=on was requested but no
    // reasoning field present — observable without failing the run.
    if (result.reasoningShape === 'unknown') {
      logTurnEvent(turnId, {
        stage: 'llm.response.reasoning_content_shape_unknown',
        cell: config.run.name,
        model: config.model.id,
        litellmModel: config.model.litellmModel,
      });
    }

    // Sprint 9 Task 2: when a judge is configured, grade the answer
    // in-line. The judge runs even when the cell call itself failed
    // (failureMode !== null) because the transcript still has value
    // for calibration; the aggregator can filter if needed. A judge
    // error never aborts the batch — runJudge swallows and annotates.
    let judgePayload: import('./judge-runner.js').JudgePayload | null = null;
    if (config.judgeConfig && !result.failureMode) {
      judgePayload = await runJudge(
        {
          question: instance.question,
          // scoreAccuracy picks the first expected answer; keep parity
          // so the judge sees the same ground truth. Remaining entries
          // in `expected` are alternate phrasings, not independent
          // facts, and are irrelevant to the §4 judge prompt.
          groundTruth: instance.expected[0] ?? '',
          contextExcerpt: instance.context,
          modelAnswer: result.text,
        },
        config.judgeConfig,
      );
    }

    // p50 / p95 are computed over the running window of observed latencies
    // so the JSONL record carries real-time percentiles (not flat per-row).
    // Aggregate metrics.ts recomputes globals for the summary.
    const record: JsonlRecord = {
      turnId,
      cell: config.run.name,
      instance_id: instance.instance_id,
      model: config.model.id,
      seed: config.seed,
      accuracy,
      p50_latency_ms: percentile(latenciesByInstance, 50),
      p95_latency_ms: percentile(latenciesByInstance, 95),
      usd_per_query: round(result.costUsd, 6),
      failure_mode: result.failureMode,
      ...(judgePayload && {
        model_answer: judgePayload.model_answer,
        judge_verdict: judgePayload.judge_verdict,
        judge_failure_mode: judgePayload.judge_failure_mode,
        judge_rationale: judgePayload.judge_rationale,
        judge_model: judgePayload.judge_model,
        judge_timestamp: judgePayload.judge_timestamp,
        judge_ensemble: judgePayload.judge_ensemble,
      }),
      // Sprint 11 A2: reasoning_content fields — same-row persistence
      // keyed by `turnId` per ratification §Q4. Chars stay separate for
      // aggregation even when content is stripped on the read path.
      ...(result.reasoningContent !== undefined && {
        reasoning_content: result.reasoningContent,
        reasoning_content_chars: result.reasoningContent.length,
      }),
      ...(result.reasoningShape !== undefined && {
        reasoning_shape: result.reasoningShape,
      }),
    };
    writer.write(record);
  }

  await writer.close();
  const finishedAt = new Date().toISOString();
  const summary = buildAggregate(config, writer.all(), startedAt, finishedAt, budgetStoppedAt);
  const summaryPath = config.outputPath.replace(/\.jsonl$/, '.summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');

  // Compact stdout summary — machine-parseable prefix makes CI grep easy.
  console.log(
    `[bench:summary] kind=${summary.run.kind} name=${summary.run.name} ` +
    `model=${summary.run.model} seed=${summary.run.seed} ` +
    `n=${summary.counts.total} completed=${summary.counts.completed} ` +
    `failed=${summary.counts.failed} ` +
    `accuracy=${summary.metrics.meanAccuracy} ` +
    `p50=${summary.metrics.p50LatencyMs}ms p95=${summary.metrics.p95LatencyMs}ms ` +
    `cost=$${summary.metrics.totalUsd} ` +
    `jsonl=${config.outputPath}`,
  );
}

function round(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

// ── Main ───────────────────────────────────────────────────────────────────

function buildRuns(args: ParsedArgs): RunKind[] {
  const runs: RunKind[] = [];
  if (args.allCells) {
    (['raw', 'memory-only', 'evolve-only', 'full-stack'] as CellName[]).forEach(n => {
      runs.push({ kind: 'cell', name: n });
    });
  } else if (args.control) {
    if (!isControlName(args.control)) {
      throw new Error(`Unknown control: ${args.control}. Valid: verbose-fixed`);
    }
    runs.push({ kind: 'control', name: args.control });
  } else if (args.cell) {
    if (!isCellName(args.cell)) {
      throw new Error(`Unknown cell: ${args.cell}. Valid: raw | memory-only | evolve-only | full-stack`);
    }
    runs.push({ kind: 'cell', name: args.cell });
  } else {
    throw new Error('Must specify one of --cell <name>, --all-cells, or --control <name>. Try --help.');
  }
  return runs;
}

function defaultOutputPath(kind: RunKind, dataset: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const resultsDir = path.join(harnessRoot(), '..', 'results');
  return path.join(resultsDir, `${kind.name}-${dataset}-${ts}.jsonl`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const models = loadModels();
  const datasets = loadDatasets();

  const model = models[args.model];
  if (!model) {
    throw new Error(`Unknown model: ${args.model}. Valid ids: ${Object.keys(models).join(', ')}`);
  }
  const dataset = datasets[args.dataset];
  if (!dataset) {
    throw new Error(`Unknown dataset: ${args.dataset}. Valid ids: ${Object.keys(datasets).join(', ')}`);
  }

  const dryRun = args.dryRun ?? !process.env.LITELLM_URL;
  const litellmUrl = process.env.LITELLM_URL ?? 'http://localhost:4000';
  const litellmApiKey = process.env.LITELLM_API_KEY ?? 'sk-waggle-dev';

  // Build judge config (Sprint 9 Task 2). `--judge-ensemble` wins when
  // both flags are present. In dry-run mode judge is force-skipped —
  // calling a real LiteLLM judge while the cell path is stubbed would
  // produce mixed-signal JSONL that's hard to interpret.
  const judgeCosts: JudgeClientCostEntry[] = [];
  let judgeConfig: JudgeConfig | undefined;
  if (!dryRun) {
    if (args.judgeEnsemble && args.judgeEnsemble.length > 0) {
      const clients = new Map<string, import('./judge-client.js').LlmClient>();
      for (const m of args.judgeEnsemble) {
        clients.set(
          m,
          createJudgeLlmClient({
            litellmUrl,
            litellmApiKey,
            model: m,
            onCall: entry => judgeCosts.push(entry),
          }),
        );
      }
      judgeConfig = { kind: 'ensemble', models: args.judgeEnsemble, clients };
    } else if (args.judge) {
      judgeConfig = {
        kind: 'single',
        model: args.judge,
        client: createJudgeLlmClient({
          litellmUrl,
          litellmApiKey,
          model: args.judge,
          onCall: entry => judgeCosts.push(entry),
        }),
      };
    }
  }

  const runs = buildRuns(args);
  for (const run of runs) {
    const outputPath = args.output ?? defaultOutputPath(run, args.dataset);
    await runOne({
      run,
      dataset,
      model,
      limit: args.limit,
      seed: args.seed,
      budgetUsd: args.budget,
      outputPath,
      dryRun,
      litellmUrl,
      litellmApiKey,
      sampleLockPath: args.sampleLock,
      judgeConfig,
      onJudgeCall: entry => judgeCosts.push(entry),
    });
  }

  // Surface judge spend separately from cell spend so the brief's "$5
  // alarm per run" guardrail applies cleanly to the judge-layer budget.
  if (judgeCosts.length > 0) {
    const judgeTotalUsd = judgeCosts.reduce((sum, e) => sum + e.usd, 0);
    const judgeOk = judgeCosts.filter(e => e.ok).length;
    console.log(
      `[bench:judge-summary] calls=${judgeCosts.length} ok=${judgeOk} ` +
      `failed=${judgeCosts.length - judgeOk} total_usd=$${judgeTotalUsd.toFixed(6)}`,
    );
  }
}

// Only run main() when invoked directly (not when imported by tests).
const isMain =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  url.fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  main().catch(err => {
    console.error('[bench:error]', err?.message ?? err);
    process.exit(1);
  });
}

// Exported for the smoke tests.
export { main, parseArgs, buildRuns, runOne, defaultOutputPath };
