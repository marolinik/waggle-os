/**
 * Run metadata capture — Phase 1.3 of agent-fix sprint
 * (per decisions/2026-04-26-agent-fix-sprint-plan.md §1.3)
 *
 * Captures everything needed to deterministically replay a benchmark or
 * production agent run with greedy decoding (temperature=0). Foundation
 * for the Phase 4 re-score validation gate (re-scoring 2026-04-26 pilot
 * JSONL must reproduce baseline scores byte-identical when the same meta
 * is replayed).
 *
 * Storage layout (two files per run):
 *   <output_dir>/run-meta.json            — lightweight metadata + per-prediction
 *                                            record WITHOUT raw API response blobs.
 *                                            Human-readable; safe to grep / diff.
 *   <output_dir>/run-meta-raw.jsonl.gz    — gzipped JSONL, one line per prediction
 *                                            with full raw API response. Loaded on
 *                                            demand; not needed for metadata analysis.
 *
 * The split keeps the readable metadata file small (KB-scale) while letting
 * raw API blobs (potentially MB-scale per run) compress to ~4-10x ratio.
 *
 * HARD RULES (from PM brief):
 *   - audit_shas is extensible: Phase 5 re-pilot can add new SHA entries
 *     without breaking the existing schema.
 *   - Deterministic replay guarantee: given run_meta + greedy decoding,
 *     replay must produce identical predictions. The verifyReplay helper
 *     enforces this at validation time.
 */

import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import * as crypto from 'node:crypto';
import { promisify } from 'node:util';

import { type NormalizationAction } from './output-normalize.js';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

// ─────────────────────────────────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────────────────────────────────

export const RUN_META_SCHEMA_VERSION = 1;

export interface AuditSha {
  /** Logical name (e.g. "amendment_v2_doc", "cc1_brief", "head"). */
  name: string;
  /** SHA-256 hex digest. */
  value: string;
  /** Optional source path or git ref the SHA was computed against. */
  source?: string;
}

export interface ModelVersion {
  /** LiteLLM alias as used by the orchestrator. */
  alias: string;
  /** Upstream provider's identifier for the model (may differ from alias). */
  provider_id: string;
  /** Model version as reported by provider, or 'unknown' if not reported. */
  version: string;
  /** Whether thinking-mode was enabled at run time (Qwen / reasoning models). */
  thinking?: boolean;
  /** max_tokens cap used at run time. */
  max_tokens?: number;
  /** Temperature used at run time. 0 = greedy, replay-deterministic. */
  temperature?: number;
}

export interface ProviderRoute {
  /** LiteLLM alias. */
  alias: string;
  /** Provider name (e.g. "anthropic", "dashscope-intl", "openrouter"). */
  upstream_provider: string;
  /** Upstream's model identifier. */
  upstream_model_id: string;
  /** Optional API base URL for routes with custom endpoints. */
  api_base?: string;
}

export interface PredictionRecord {
  /** Unique within this run. */
  prediction_id: string;
  /** Parent run_id for cross-run lookup. */
  run_id: string;
  /** ISO 8601 UTC timestamp. */
  timestamp_iso: string;
  /** Model alias used. */
  model_alias: string;
  /** Prompt shape name used (from packages/agent/src/prompt-shapes/). */
  prompt_shape: string;
  /** Full prompt text sent to model (system + user concatenated for replay). */
  prompt_text: string;
  /** Raw response content as returned by the model. */
  raw_response: string;
  /** Normalized response after output-normalize layer applied. */
  normalized_response: string;
  /** Audit trail of every normalization rule applied. */
  normalization_actions: readonly NormalizationAction[];
  /** Token counts as reported by provider. */
  tokens_in?: number;
  tokens_out?: number;
  /** Per-prediction cost. */
  cost_usd?: number;
  /** Latency for this single API call in milliseconds. */
  latency_ms?: number;
  /** Optional context tag (e.g. "task-1/cell-A", "judge-opus"). */
  context_tag?: string;
}

export interface JudgeCallTrace {
  /** Unique within this run. */
  trace_id: string;
  /** Run this trace belongs to. */
  run_id: string;
  /** prediction_id of the candidate response being judged. */
  prediction_id: string;
  /** Judge model alias. */
  judge_model: string;
  /** Full judge prompt sent. */
  judge_prompt: string;
  /** Raw judge response. */
  judge_response: string;
  /** Parsed judge verdict (shape varies by judge rubric). */
  parsed_verdict: unknown;
  /** Number of retries before parse succeeded (0 = first try OK). */
  retry_count: number;
  /** ISO 8601 UTC timestamp. */
  timestamp_iso: string;
  /** Judge cost in USD. */
  cost_usd?: number;
  /** Judge latency in milliseconds. */
  latency_ms?: number;
}

/**
 * Top-level run metadata. Designed for deterministic replay of greedy-decoded
 * runs and forward-compatible extension of audit_shas.
 */
export interface RunMeta {
  schema_version: number;
  run_id: string;
  started_at_iso: string;
  finished_at_iso?: string;
  config_snapshot: Readonly<Record<string, unknown>>;
  dataset_sha256?: string;
  model_versions: readonly ModelVersion[];
  provider_routing: readonly ProviderRoute[];
  prompt_shape_per_model: Readonly<Record<string, string>>;
  seed: number;
  git_sha: string;
  audit_shas: readonly AuditSha[];
  predictions: readonly PredictionRecord[];
  judge_call_traces: readonly JudgeCallTrace[];
}

// ─────────────────────────────────────────────────────────────────────────
// Capture builder
// ─────────────────────────────────────────────────────────────────────────

export interface RunMetaCaptureOptions {
  /** Optional explicit run_id; otherwise generated via crypto.randomUUID. */
  run_id?: string;
  /** Greedy decoding seed; replay determinism requires this be recorded. */
  seed: number;
  /** Git HEAD SHA at run-start time. */
  git_sha: string;
}

/**
 * Builder for assembling a RunMeta during a benchmark or production run.
 * Methods are chainable but state is mutable until finish() is called.
 * After finish() the Capture rejects further mutations.
 */
export class RunMetaCapture {
  private finished = false;
  private readonly run_id: string;
  private readonly started_at_iso: string;
  private finished_at_iso?: string;
  private config_snapshot: Record<string, unknown> = {};
  private dataset_sha256?: string;
  private model_versions: ModelVersion[] = [];
  private provider_routing: ProviderRoute[] = [];
  private prompt_shape_per_model: Record<string, string> = {};
  private readonly seed: number;
  private readonly git_sha: string;
  private audit_shas: AuditSha[] = [];
  private predictions: PredictionRecord[] = [];
  private judge_call_traces: JudgeCallTrace[] = [];

  constructor(opts: RunMetaCaptureOptions) {
    this.run_id = opts.run_id ?? crypto.randomUUID();
    this.started_at_iso = new Date().toISOString();
    this.seed = opts.seed;
    this.git_sha = opts.git_sha;
  }

  private assertOpen(): void {
    if (this.finished) {
      throw new Error('RunMetaCapture: cannot mutate after finish() has been called');
    }
  }

  setConfigSnapshot(config: Record<string, unknown>): this {
    this.assertOpen();
    // Defensive deep clone via JSON round-trip — caller mutations cannot affect us later.
    this.config_snapshot = JSON.parse(JSON.stringify(config));
    return this;
  }

  setDatasetSha256(sha: string): this {
    this.assertOpen();
    this.dataset_sha256 = sha;
    return this;
  }

  addModelVersion(v: ModelVersion): this {
    this.assertOpen();
    this.model_versions.push(v);
    return this;
  }

  addProviderRoute(r: ProviderRoute): this {
    this.assertOpen();
    this.provider_routing.push(r);
    return this;
  }

  setPromptShapePerModel(map: Record<string, string>): this {
    this.assertOpen();
    this.prompt_shape_per_model = { ...map };
    return this;
  }

  /**
   * Extensible audit-chain entry. Phase 5 re-pilot can call this with
   * additional SHA names without breaking the existing schema.
   */
  addAuditSha(name: string, value: string, source?: string): this {
    this.assertOpen();
    this.audit_shas.push({ name, value, source });
    return this;
  }

  recordPrediction(record: Omit<PredictionRecord, 'run_id'>): string {
    this.assertOpen();
    const full: PredictionRecord = { ...record, run_id: this.run_id };
    this.predictions.push(full);
    return full.prediction_id;
  }

  recordJudgeCall(trace: Omit<JudgeCallTrace, 'run_id'>): string {
    this.assertOpen();
    const full: JudgeCallTrace = { ...trace, run_id: this.run_id };
    this.judge_call_traces.push(full);
    return full.trace_id;
  }

  finish(): void {
    this.assertOpen();
    this.finished_at_iso = new Date().toISOString();
    this.finished = true;
  }

  /**
   * Returns a deeply-frozen RunMeta snapshot. Safe to expose to consumers
   * that must not mutate the record.
   */
  freeze(): RunMeta {
    if (!this.finished) {
      throw new Error('RunMetaCapture: must call finish() before freeze()');
    }
    const meta: RunMeta = {
      schema_version: RUN_META_SCHEMA_VERSION,
      run_id: this.run_id,
      started_at_iso: this.started_at_iso,
      finished_at_iso: this.finished_at_iso,
      config_snapshot: Object.freeze({ ...this.config_snapshot }),
      dataset_sha256: this.dataset_sha256,
      model_versions: Object.freeze(this.model_versions.map(v => Object.freeze({ ...v }))),
      provider_routing: Object.freeze(this.provider_routing.map(r => Object.freeze({ ...r }))),
      prompt_shape_per_model: Object.freeze({ ...this.prompt_shape_per_model }),
      seed: this.seed,
      git_sha: this.git_sha,
      audit_shas: Object.freeze(this.audit_shas.map(s => Object.freeze({ ...s }))),
      predictions: Object.freeze(this.predictions.map(p =>
        Object.freeze({ ...p, normalization_actions: Object.freeze([...p.normalization_actions]) }),
      )),
      judge_call_traces: Object.freeze(this.judge_call_traces.map(t => Object.freeze({ ...t }))),
    };
    return Object.freeze(meta);
  }

  /**
   * Serialize to disk under outputDir. Writes:
   *   <outputDir>/run-meta.json           — metadata + predictions sans raw blobs
   *   <outputDir>/run-meta-raw.jsonl.gz   — gzipped raw API response blobs
   * Returns paths written + gzip ratio for the raw file.
   */
  async serialize(outputDir: string): Promise<{
    metaPath: string;
    rawPath: string;
    gzipRatio: number;
  }> {
    if (!this.finished) {
      throw new Error('RunMetaCapture: must call finish() before serialize()');
    }
    await fsp.mkdir(outputDir, { recursive: true });
    const meta = this.freeze();

    // Strip raw_response from predictions in the metadata file (it lives in the .gz).
    const lightPredictions = meta.predictions.map(p => {
      const { raw_response: _omit, ...rest } = p;
      return rest;
    });
    const metaJson = JSON.stringify({
      ...meta,
      predictions: lightPredictions,
    }, null, 2);

    const metaPath = path.join(outputDir, 'run-meta.json');
    await fsp.writeFile(metaPath, metaJson, 'utf-8');

    // Gzipped JSONL of raw responses, one line per prediction.
    const rawJsonlLines = meta.predictions
      .map(p => JSON.stringify({ prediction_id: p.prediction_id, raw_response: p.raw_response }))
      .join('\n');
    const rawBytes = Buffer.from(rawJsonlLines, 'utf-8');
    const gzipped = await gzip(rawBytes);
    const gzipRatio = rawBytes.length === 0 ? 1 : rawBytes.length / gzipped.length;

    const rawPath = path.join(outputDir, 'run-meta-raw.jsonl.gz');
    await fsp.writeFile(rawPath, gzipped);

    return { metaPath, rawPath, gzipRatio };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Reader
// ─────────────────────────────────────────────────────────────────────────

/**
 * Loads a serialized RunMeta. Raw responses are loaded on demand via
 * loadRawResponse() to keep memory usage low for metadata-only inspection.
 */
export class RunMetaReader {
  private constructor(
    public readonly meta: RunMeta,
    private readonly rawByPredictionId: Map<string, string>,
  ) {}

  static async load(outputDir: string, opts: { includeRaw?: boolean } = {}): Promise<RunMetaReader> {
    const { includeRaw = true } = opts;
    const metaPath = path.join(outputDir, 'run-meta.json');
    const rawPath = path.join(outputDir, 'run-meta-raw.jsonl.gz');

    const metaJson = await fsp.readFile(metaPath, 'utf-8');
    const lightMeta = JSON.parse(metaJson) as Omit<RunMeta, 'predictions'> & {
      predictions: Array<Omit<PredictionRecord, 'raw_response'>>;
    };

    const rawByPredictionId = new Map<string, string>();
    let predictions: PredictionRecord[];
    if (includeRaw && fs.existsSync(rawPath)) {
      const gzippedBytes = await fsp.readFile(rawPath);
      const rawJsonl = (await gunzip(gzippedBytes)).toString('utf-8');
      for (const line of rawJsonl.split('\n')) {
        if (!line.trim()) continue;
        const { prediction_id, raw_response } = JSON.parse(line) as {
          prediction_id: string;
          raw_response: string;
        };
        rawByPredictionId.set(prediction_id, raw_response);
      }
      predictions = lightMeta.predictions.map(p => ({
        ...p,
        raw_response: rawByPredictionId.get(p.prediction_id) ?? '',
      }));
    } else {
      predictions = lightMeta.predictions.map(p => ({ ...p, raw_response: '' }));
    }

    const meta: RunMeta = { ...lightMeta, predictions };
    return new RunMetaReader(meta, rawByPredictionId);
  }

  loadRawResponse(prediction_id: string): string | undefined {
    return this.rawByPredictionId.get(prediction_id);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Deterministic replay verification
// ─────────────────────────────────────────────────────────────────────────

export interface ReplayMismatch {
  prediction_id: string;
  expected_raw: string;
  observed_raw: string;
  expected_normalized: string;
  observed_normalized: string;
}

export interface ReplayResult {
  total: number;
  matched: number;
  mismatches: ReplayMismatch[];
  deterministic: boolean;
}

/**
 * Replay a captured run by re-issuing each prediction's prompt against a
 * caller-supplied function and comparing raw + normalized outputs.
 *
 * The contract: greedy decoding (temperature=0) is required for replay
 * determinism. The replayFn is the orchestrator's adapter for re-issuing
 * the prompt to the same model_alias used originally.
 *
 * Returns the count of matched + mismatched predictions and a `deterministic`
 * boolean (true only if ALL predictions matched byte-identical).
 */
export async function verifyDeterministicReplay(
  meta: RunMeta,
  replayFn: (input: { model_alias: string; prompt_text: string }) => Promise<{ raw_response: string; normalized_response: string }>,
): Promise<ReplayResult> {
  const mismatches: ReplayMismatch[] = [];
  let matched = 0;
  for (const p of meta.predictions) {
    const observed = await replayFn({ model_alias: p.model_alias, prompt_text: p.prompt_text });
    const rawMatches = observed.raw_response === p.raw_response;
    const normMatches = observed.normalized_response === p.normalized_response;
    if (rawMatches && normMatches) {
      matched += 1;
    } else {
      mismatches.push({
        prediction_id: p.prediction_id,
        expected_raw: p.raw_response,
        observed_raw: observed.raw_response,
        expected_normalized: p.normalized_response,
        observed_normalized: observed.normalized_response,
      });
    }
  }
  return {
    total: meta.predictions.length,
    matched,
    mismatches,
    deterministic: mismatches.length === 0,
  };
}
