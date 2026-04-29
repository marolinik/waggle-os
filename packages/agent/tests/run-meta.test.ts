/**
 * Tests for run-meta capture (Phase 1.3 of agent-fix sprint).
 *
 * Coverage:
 *   - Capture builder: chainable setters; mutation rejection after finish
 *   - freeze() returns deeply-frozen RunMeta
 *   - serialize/load round-trip preserves all fields byte-identical
 *   - Raw responses gzipped separately; metadata file readable
 *   - Gzip compression ratio ≥ 4x on representative LLM JSON payload
 *   - Deterministic replay verifier: matches when replay is deterministic;
 *     reports mismatches accurately when not
 *   - Audit SHAs extensible (Phase 5 can add new entries)
 *   - Schema version captured
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import {
  RunMetaCapture,
  RunMetaReader,
  RUN_META_SCHEMA_VERSION,
  verifyDeterministicReplay,
  type PredictionRecord,
  type JudgeCallTrace,
  type ModelVersion,
  type ProviderRoute,
} from '../src/run-meta.js';

// ─────────────── Fixtures ───────────────

function makePrediction(idx: number, opts: { model?: string; raw?: string; norm?: string } = {}): Omit<PredictionRecord, 'run_id'> {
  return {
    prediction_id: `pred-${idx}`,
    timestamp_iso: new Date().toISOString(),
    model_alias: opts.model ?? 'claude-opus-4-7',
    prompt_shape: 'claude',
    prompt_text: `Test prompt #${idx}`,
    raw_response: opts.raw ?? `Raw response #${idx}`,
    normalized_response: opts.norm ?? `Norm response #${idx}`,
    normalization_actions: [],
    tokens_in: 100,
    tokens_out: 50,
    cost_usd: 0.001,
    latency_ms: 500,
  };
}

function makeJudgeTrace(idx: number, predId: string): Omit<JudgeCallTrace, 'run_id'> {
  return {
    trace_id: `trace-${idx}`,
    prediction_id: predId,
    judge_model: 'claude-opus-4-7',
    judge_prompt: 'Evaluate this',
    judge_response: '{"verdict": "correct"}',
    parsed_verdict: { verdict: 'correct' },
    retry_count: 0,
    timestamp_iso: new Date().toISOString(),
    cost_usd: 0.0007,
    latency_ms: 200,
  };
}

function tmpDir(label: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `run-meta-test-${label}-`));
}

let cap: RunMetaCapture;
beforeEach(() => {
  cap = new RunMetaCapture({ seed: 42, git_sha: 'abc123' });
});

// ─────────────── Builder behavior ───────────────

describe('RunMetaCapture — builder', () => {
  it('generates a run_id automatically when not provided', () => {
    const meta = cap
      .setConfigSnapshot({})
      .setPromptShapePerModel({})
      .addAuditSha('head', 'abc123');
    cap.finish();
    const frozen = cap.freeze();
    expect(frozen.run_id).toBeDefined();
    expect(frozen.run_id.length).toBeGreaterThan(0);
  });

  it('uses provided run_id when given', () => {
    const explicit = new RunMetaCapture({ run_id: 'my-run-id', seed: 42, git_sha: 'abc' });
    explicit.finish();
    expect(explicit.freeze().run_id).toBe('my-run-id');
  });

  it('records started_at_iso at construction time', () => {
    const before = Date.now();
    const c = new RunMetaCapture({ seed: 1, git_sha: 'x' });
    c.finish();
    const after = Date.now();
    const recorded = new Date(c.freeze().started_at_iso).getTime();
    expect(recorded).toBeGreaterThanOrEqual(before);
    expect(recorded).toBeLessThanOrEqual(after);
  });

  it('rejects mutations after finish()', () => {
    cap.finish();
    expect(() => cap.setConfigSnapshot({})).toThrow(/cannot mutate after finish/);
    expect(() => cap.addAuditSha('x', 'y')).toThrow(/cannot mutate after finish/);
    expect(() => cap.recordPrediction(makePrediction(0))).toThrow(/cannot mutate after finish/);
  });

  it('rejects freeze() before finish()', () => {
    expect(() => cap.freeze()).toThrow(/must call finish/);
  });

  it('rejects serialize() before finish()', async () => {
    await expect(cap.serialize(tmpDir('pre-finish'))).rejects.toThrow(/must call finish/);
  });

  it('config_snapshot is defensively cloned (caller mutations do not leak)', () => {
    const config = { foo: 'bar', nested: { x: 1 } };
    cap.setConfigSnapshot(config);
    config.foo = 'mutated';
    (config.nested as { x: number }).x = 999;
    cap.finish();
    expect(cap.freeze().config_snapshot.foo).toBe('bar');
    expect((cap.freeze().config_snapshot.nested as { x: number }).x).toBe(1);
  });
});

// ─────────────── Freeze + immutability ───────────────

describe('RunMetaCapture — freeze immutability', () => {
  it('freeze() returns a deeply frozen object', () => {
    cap.recordPrediction(makePrediction(0));
    cap.finish();
    const meta = cap.freeze();
    expect(Object.isFrozen(meta)).toBe(true);
    expect(Object.isFrozen(meta.predictions)).toBe(true);
    expect(Object.isFrozen(meta.predictions[0])).toBe(true);
    expect(Object.isFrozen(meta.audit_shas)).toBe(true);
    expect(Object.isFrozen(meta.model_versions)).toBe(true);
  });

  it('schema_version is captured as the module constant', () => {
    cap.finish();
    expect(cap.freeze().schema_version).toBe(RUN_META_SCHEMA_VERSION);
  });
});

// ─────────────── Audit SHAs extensibility ───────────────

describe('RunMetaCapture — audit_shas extensibility', () => {
  it('accepts arbitrary number of audit SHAs (HARD RULE: extensible)', () => {
    cap.addAuditSha('amendment_v2_doc', 'aaa');
    cap.addAuditSha('amendment_v1_doc', 'bbb');
    cap.addAuditSha('cc1_brief', 'ccc');
    cap.addAuditSha('judge_rubric', 'ddd');
    cap.addAuditSha('head', 'eee');
    // Phase 5 re-pilot adds more without breaking schema:
    cap.addAuditSha('phase_5_amendment', 'fff');
    cap.addAuditSha('repilot_dataset', 'ggg');
    cap.finish();
    expect(cap.freeze().audit_shas).toHaveLength(7);
  });

  it('preserves order', () => {
    cap.addAuditSha('first', '1');
    cap.addAuditSha('second', '2');
    cap.addAuditSha('third', '3');
    cap.finish();
    const names = cap.freeze().audit_shas.map(s => s.name);
    expect(names).toEqual(['first', 'second', 'third']);
  });

  it('records optional source field', () => {
    cap.addAuditSha('cc1_brief', 'abc', 'briefs/2026-04-26/cc1-brief.md');
    cap.finish();
    expect(cap.freeze().audit_shas[0].source).toBe('briefs/2026-04-26/cc1-brief.md');
  });
});

// ─────────────── Predictions + judge traces ───────────────

describe('RunMetaCapture — record predictions + judge traces', () => {
  it('recordPrediction returns the prediction_id', () => {
    const id = cap.recordPrediction(makePrediction(0));
    expect(id).toBe('pred-0');
    cap.finish();
    expect(cap.freeze().predictions).toHaveLength(1);
  });

  it('recordJudgeCall returns the trace_id', () => {
    const id = cap.recordJudgeCall(makeJudgeTrace(0, 'pred-0'));
    expect(id).toBe('trace-0');
    cap.finish();
    expect(cap.freeze().judge_call_traces).toHaveLength(1);
  });

  it('attaches run_id to predictions and traces automatically', () => {
    const explicit = new RunMetaCapture({ run_id: 'run-X', seed: 1, git_sha: 'a' });
    explicit.recordPrediction(makePrediction(0));
    explicit.recordJudgeCall(makeJudgeTrace(0, 'pred-0'));
    explicit.finish();
    const meta = explicit.freeze();
    expect(meta.predictions[0].run_id).toBe('run-X');
    expect(meta.judge_call_traces[0].run_id).toBe('run-X');
  });
});

// ─────────────── Serialize / load round-trip ───────────────

describe('RunMetaCapture — serialize + RunMetaReader.load round-trip', () => {
  it('preserves all fields byte-identical across round-trip', async () => {
    const dir = tmpDir('roundtrip');

    cap.setConfigSnapshot({ alias: 'test', max_tokens: 4096 });
    cap.setDatasetSha256('deadbeef');
    cap.addModelVersion({ alias: 'opus', provider_id: 'claude-opus-4-7', version: '2026-03-15', thinking: true, max_tokens: 4096, temperature: 0 });
    cap.addProviderRoute({ alias: 'opus', upstream_provider: 'anthropic', upstream_model_id: 'claude-opus-4-7' });
    cap.setPromptShapePerModel({ opus: 'claude' });
    cap.addAuditSha('head', 'abc');
    cap.recordPrediction(makePrediction(0));
    cap.recordPrediction(makePrediction(1));
    cap.recordJudgeCall(makeJudgeTrace(0, 'pred-0'));
    cap.finish();

    const original = cap.freeze();
    await cap.serialize(dir);

    const reader = await RunMetaReader.load(dir);
    const reloaded = reader.meta;

    expect(reloaded.run_id).toBe(original.run_id);
    expect(reloaded.schema_version).toBe(original.schema_version);
    expect(reloaded.seed).toBe(original.seed);
    expect(reloaded.git_sha).toBe(original.git_sha);
    expect(reloaded.dataset_sha256).toBe(original.dataset_sha256);
    expect(reloaded.config_snapshot).toEqual(original.config_snapshot);
    expect(reloaded.model_versions).toEqual(original.model_versions);
    expect(reloaded.provider_routing).toEqual(original.provider_routing);
    expect(reloaded.audit_shas).toEqual(original.audit_shas);
    expect(reloaded.predictions).toHaveLength(original.predictions.length);
    expect(reloaded.predictions[0].raw_response).toBe(original.predictions[0].raw_response);
    expect(reloaded.predictions[0].normalized_response).toBe(original.predictions[0].normalized_response);
    expect(reloaded.judge_call_traces).toEqual(original.judge_call_traces);
  });

  it('writes two files: run-meta.json and run-meta-raw.jsonl.gz', async () => {
    const dir = tmpDir('two-files');
    cap.recordPrediction(makePrediction(0));
    cap.finish();
    await cap.serialize(dir);

    expect(fs.existsSync(path.join(dir, 'run-meta.json'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'run-meta-raw.jsonl.gz'))).toBe(true);
  });

  it('metadata file does NOT contain raw_response (only the .gz does)', async () => {
    const dir = tmpDir('no-raw-in-meta');
    cap.recordPrediction(makePrediction(0, { raw: 'SECRET-RAW-RESPONSE-ABC123' }));
    cap.finish();
    await cap.serialize(dir);

    const metaJson = await fsp.readFile(path.join(dir, 'run-meta.json'), 'utf-8');
    expect(metaJson).not.toContain('SECRET-RAW-RESPONSE-ABC123');
    // But it IS in the gzipped raw file (loaded via reader).
    const reader = await RunMetaReader.load(dir);
    expect(reader.loadRawResponse('pred-0')).toBe('SECRET-RAW-RESPONSE-ABC123');
  });

  it('includeRaw=false skips the gz load (faster metadata-only inspection)', async () => {
    const dir = tmpDir('no-raw-load');
    cap.recordPrediction(makePrediction(0, { raw: 'big payload' }));
    cap.finish();
    await cap.serialize(dir);

    const reader = await RunMetaReader.load(dir, { includeRaw: false });
    expect(reader.meta.predictions[0].raw_response).toBe('');
    expect(reader.loadRawResponse('pred-0')).toBeUndefined();
  });
});

// ─────────────── Gzip compression ratio ───────────────

describe('gzip compression — HARD GATE: ratio ≥ 4× on representative payload', () => {
  it('gzips a synthetic ~10KB LLM JSON response with ratio ≥ 4×', async () => {
    const dir = tmpDir('gzip-ratio');
    // Build a realistic LLM completion-style response: lots of repeated
    // structure, JSON keys, plausible English text. Real LLM JSON responses
    // compress 4-10× in practice because of structural repetition.
    const fakeJsonResponse = JSON.stringify({
      id: 'chatcmpl-' + 'x'.repeat(20),
      object: 'chat.completion',
      created: 1700000000,
      model: 'claude-opus-4-7',
      choices: Array.from({ length: 8 }, (_, i) => ({
        index: i,
        message: {
          role: 'assistant',
          content: 'The quick brown fox jumps over the lazy dog. '.repeat(20),
          reasoning_content: 'Step 1: analyze. Step 2: synthesize. Step 3: conclude. '.repeat(15),
        },
        finish_reason: 'stop',
      })),
      usage: { prompt_tokens: 1500, completion_tokens: 800, total_tokens: 2300 },
    });

    cap.recordPrediction(makePrediction(0, { raw: fakeJsonResponse }));
    cap.finish();
    const result = await cap.serialize(dir);

    expect(result.gzipRatio).toBeGreaterThanOrEqual(4);
  });

  it('handles empty predictions list gracefully (ratio = 1)', async () => {
    const dir = tmpDir('empty');
    cap.finish();
    const result = await cap.serialize(dir);
    expect(result.gzipRatio).toBe(1);
  });
});

// ─────────────── Deterministic replay verifier ───────────────

describe('verifyDeterministicReplay — HARD GATE: deterministic guarantee', () => {
  it('reports deterministic=true when replay produces identical raw + normalized', async () => {
    const explicit = new RunMetaCapture({ run_id: 'r1', seed: 0, git_sha: 'a' });
    explicit.recordPrediction(makePrediction(0, { raw: 'A', norm: 'a' }));
    explicit.recordPrediction(makePrediction(1, { raw: 'B', norm: 'b' }));
    explicit.finish();
    const meta = explicit.freeze();

    // Replay function that returns the same response for the same (model, prompt).
    const oracle = new Map<string, { raw_response: string; normalized_response: string }>();
    oracle.set('claude-opus-4-7|Test prompt #0', { raw_response: 'A', normalized_response: 'a' });
    oracle.set('claude-opus-4-7|Test prompt #1', { raw_response: 'B', normalized_response: 'b' });

    const result = await verifyDeterministicReplay(meta, async ({ model_alias, prompt_text }) => {
      const out = oracle.get(`${model_alias}|${prompt_text}`);
      if (!out) throw new Error(`no oracle for ${model_alias} / ${prompt_text}`);
      return out;
    });

    expect(result.total).toBe(2);
    expect(result.matched).toBe(2);
    expect(result.mismatches).toEqual([]);
    expect(result.deterministic).toBe(true);
  });

  it('reports deterministic=false + mismatch detail when replay drifts', async () => {
    const explicit = new RunMetaCapture({ run_id: 'r2', seed: 0, git_sha: 'a' });
    explicit.recordPrediction(makePrediction(0, { raw: 'expected', norm: 'expected-norm' }));
    explicit.finish();
    const meta = explicit.freeze();

    const result = await verifyDeterministicReplay(meta, async () => ({
      raw_response: 'DIFFERENT',
      normalized_response: 'DIFFERENT-NORM',
    }));

    expect(result.deterministic).toBe(false);
    expect(result.mismatches).toHaveLength(1);
    expect(result.mismatches[0].prediction_id).toBe('pred-0');
    expect(result.mismatches[0].expected_raw).toBe('expected');
    expect(result.mismatches[0].observed_raw).toBe('DIFFERENT');
    expect(result.mismatches[0].expected_normalized).toBe('expected-norm');
    expect(result.mismatches[0].observed_normalized).toBe('DIFFERENT-NORM');
  });

  it('reports partial matches (some predictions stable, others drifted)', async () => {
    const explicit = new RunMetaCapture({ run_id: 'r3', seed: 0, git_sha: 'a' });
    explicit.recordPrediction(makePrediction(0, { raw: 'stable', norm: 'stable' }));
    explicit.recordPrediction(makePrediction(1, { raw: 'drifted', norm: 'drifted' }));
    explicit.finish();
    const meta = explicit.freeze();

    const result = await verifyDeterministicReplay(meta, async ({ prompt_text }) => {
      if (prompt_text === 'Test prompt #0') {
        return { raw_response: 'stable', normalized_response: 'stable' };
      }
      return { raw_response: 'WRONG', normalized_response: 'WRONG' };
    });

    expect(result.total).toBe(2);
    expect(result.matched).toBe(1);
    expect(result.mismatches).toHaveLength(1);
    expect(result.deterministic).toBe(false);
  });

  it('handles empty meta gracefully (deterministic=true vacuously)', async () => {
    cap.finish();
    const meta = cap.freeze();
    const result = await verifyDeterministicReplay(meta, async () => {
      throw new Error('should not be called');
    });
    expect(result.total).toBe(0);
    expect(result.matched).toBe(0);
    expect(result.deterministic).toBe(true);
  });
});

// ─────────────── End-to-end smoke ───────────────

describe('end-to-end smoke — capture → serialize → load → replay', () => {
  it('round-trips and replays cleanly for a multi-prediction multi-judge run', async () => {
    const dir = tmpDir('e2e');
    const c = new RunMetaCapture({ run_id: 'e2e-run', seed: 42, git_sha: 'deadbeef' });
    c.setConfigSnapshot({
      cost_cap_usd: 7,
      max_steps: 5,
      max_retrievals_per_step: 8,
    });
    c.setDatasetSha256('79fa87e90f04081343b8c8debecb80a9a6842b76a7aa537dc9fdf651ea698ff4');
    c.addModelVersion({ alias: 'claude', provider_id: 'claude-opus-4-7', version: '2026-03-15', max_tokens: 4096, temperature: 0 });
    c.addModelVersion({ alias: 'qwen', provider_id: 'qwen3.6-35b-a3b', version: 'unknown', thinking: true, max_tokens: 16000, temperature: 0 });
    c.addProviderRoute({ alias: 'claude', upstream_provider: 'anthropic', upstream_model_id: 'claude-opus-4-7' });
    c.addProviderRoute({ alias: 'qwen', upstream_provider: 'dashscope-intl', upstream_model_id: 'openai/qwen3.6-35b-a3b', api_base: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1' });
    c.setPromptShapePerModel({ claude: 'claude', qwen: 'qwen-thinking' });
    c.addAuditSha('amendment_v2_doc', '1ab5082f', 'briefs/2026-04-26/cc1-brief-amendment-v2-2026-04-26.md');
    c.addAuditSha('amendment_v1_doc', '3946d3e0', 'briefs/2026-04-26/cc1-brief-amendment-2026-04-26.md');
    c.addAuditSha('head', 'b7e19c5', 'git rev-parse HEAD');
    for (let i = 0; i < 3; i++) {
      const predId = c.recordPrediction(makePrediction(i, { model: i < 2 ? 'claude' : 'qwen' }));
      c.recordJudgeCall(makeJudgeTrace(i, predId));
    }
    c.finish();
    const original = c.freeze();
    const serResult = await c.serialize(dir);

    expect(serResult.gzipRatio).toBeGreaterThan(0);
    expect(fs.existsSync(serResult.metaPath)).toBe(true);
    expect(fs.existsSync(serResult.rawPath)).toBe(true);

    const reloaded = (await RunMetaReader.load(dir)).meta;
    expect(reloaded.audit_shas.map(s => s.name).sort()).toEqual(['amendment_v1_doc', 'amendment_v2_doc', 'head']);
    expect(reloaded.predictions).toHaveLength(3);
    expect(reloaded.judge_call_traces).toHaveLength(3);

    const replay = await verifyDeterministicReplay(reloaded, async ({ prompt_text }) => {
      const p = reloaded.predictions.find(x => x.prompt_text === prompt_text);
      return { raw_response: p?.raw_response ?? '', normalized_response: p?.normalized_response ?? '' };
    });
    expect(replay.deterministic).toBe(true);
    expect(replay.matched).toBe(3);
  });
});
