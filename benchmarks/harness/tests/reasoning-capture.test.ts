/**
 * Sprint 11 Task A2 — reasoning_content capture tests.
 *
 * Authority:
 *   - docs/plans/H-AUDIT-1-DESIGN-DOC-2026-04-22.md §3 (test scenarios) + §6 (implementation plan)
 *   - PM-Waggle-OS/decisions/2026-04-22-h-audit-1-design-ratified.md (PM ratification — all 5 open questions answered)
 *
 * Two canonical acceptance tests + ratification-specific coverage:
 *
 *   1. reasoning_content round-trip at the transport layer — parser extracts
 *      the three supported shapes in the ratified precedence order
 *      (`message.reasoning_content` > `message.reasoning` > `body.reasoning_content`).
 *   2. Full turn-graph reconstruction from a single turnId — after a harness
 *      turn runs, filtering JSONL by turnId yields one row carrying answer,
 *      reasoning, cost, latency, and (when judged) judge payload.
 *
 * Plus:
 *   3. `reasoningShape='unknown'` signal when thinking=on but no reasoning field.
 *   4. `readJsonl(path, { includeReasoning: false })` strips content but keeps
 *      `reasoning_content_chars` + `reasoning_shape` observability fields.
 *   5. Exclusion verification: `judge-runner.ts` does NOT pass reasoning to judges.
 *   6. metrics.ts aggregates reasoning_content chars + shape distribution when
 *      any record has reasoning data.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createLlmClient } from '../src/llm.js';
import { JsonlWriter, readJsonl, buildAggregate } from '../src/metrics.js';
import type { JsonlRecord, ModelSpec, DatasetSpec, RunConfig } from '../src/types.js';

// ── Shared fixtures ────────────────────────────────────────────────────────

const stage2Model: ModelSpec = {
  id: 'qwen3.6-35b-a3b-stage2',
  displayName: 'Stage 2 LOCKED',
  provider: 'alibaba',
  litellmModel: 'qwen3.6-35b-a3b-via-openrouter',
  pricePerMillionInput: 0.2,
  pricePerMillionOutput: 0.8,
  contextWindow: 262144,
  stage2Config: {
    thinking: true,
    maxTokens: 64000,
    reasoningShape: 'openrouter-unified',
  },
};

const syntheticDataset: DatasetSpec = {
  id: 'synthetic',
  displayName: 'Synthetic',
  dataPath: 'synthetic/placeholder.jsonl',
  source: 'synthetic',
};

function respondWith(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Test 1: parser precedence + round-trip ────────────────────────────────

describe('Sprint 11 A2 — reasoning_content parser precedence (ratification §Q3)', () => {
  let originalFetch: typeof global.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalFetch = global.fetch;
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('primary: DashScope native `message.reasoning_content` is preferred over `message.reasoning` when both are present', async () => {
    fetchMock.mockResolvedValueOnce(respondWith({
      choices: [{ message: {
        content: 'Paris',
        reasoning: 'OR-unified chain',              // secondary shape
        reasoning_content: 'DashScope native chain', // primary shape
      } }],
      usage: { prompt_tokens: 10, completion_tokens: 1 },
    }));

    const llm = createLlmClient({ dryRun: false, litellmUrl: 'http://unused', litellmApiKey: 'sk-t' });
    const result = await llm.call({ model: stage2Model, systemPrompt: 'sys', userPrompt: 'q' });

    expect(result.text).toBe('Paris');
    expect(result.reasoningContent).toBe('DashScope native chain');
    expect(result.reasoningShape).toBe('message.reasoning_content');
  });

  it('secondary: OpenRouter unified `message.reasoning` when primary is absent', async () => {
    fetchMock.mockResolvedValueOnce(respondWith({
      choices: [{ message: { content: 'Paris', reasoning: 'OR-unified chain' } }],
      usage: { prompt_tokens: 10, completion_tokens: 1 },
    }));

    const llm = createLlmClient({ dryRun: false, litellmUrl: 'http://unused', litellmApiKey: 'sk-t' });
    const result = await llm.call({ model: stage2Model, systemPrompt: 'sys', userPrompt: 'q' });

    expect(result.reasoningContent).toBe('OR-unified chain');
    expect(result.reasoningShape).toBe('message.reasoning');
  });

  it('tertiary: legacy top-level `body.reasoning_content` when both primary and secondary absent', async () => {
    fetchMock.mockResolvedValueOnce(respondWith({
      choices: [{ message: { content: 'Paris' } }],
      reasoning_content: 'legacy top-level chain',
      usage: { prompt_tokens: 10, completion_tokens: 1 },
    }));

    const llm = createLlmClient({ dryRun: false, litellmUrl: 'http://unused', litellmApiKey: 'sk-t' });
    const result = await llm.call({ model: stage2Model, systemPrompt: 'sys', userPrompt: 'q' });

    expect(result.reasoningContent).toBe('legacy top-level chain');
    expect(result.reasoningShape).toBe('body.reasoning_content');
  });

  it('unknown: thinking=on requested but no reasoning field present — signal drift without throwing', async () => {
    fetchMock.mockResolvedValueOnce(respondWith({
      choices: [{ message: { content: 'Paris' } }],
      usage: { prompt_tokens: 10, completion_tokens: 1 },
    }));

    const llm = createLlmClient({ dryRun: false, litellmUrl: 'http://unused', litellmApiKey: 'sk-t' });
    const result = await llm.call({ model: stage2Model, systemPrompt: 'sys', userPrompt: 'q' });

    expect(result.text).toBe('Paris');
    expect(result.reasoningContent).toBeUndefined();
    expect(result.reasoningShape).toBe('unknown');
  });

  it('thinking=off: reasoningShape stays undefined (no drift signal for legitimate no-reasoning routes)', async () => {
    fetchMock.mockResolvedValueOnce(respondWith({
      choices: [{ message: { content: 'Paris' } }],
      usage: { prompt_tokens: 10, completion_tokens: 1 },
    }));

    const baseline: ModelSpec = { ...stage2Model, stage2Config: undefined };
    const llm = createLlmClient({ dryRun: false, litellmUrl: 'http://unused', litellmApiKey: 'sk-t' });
    const result = await llm.call({ model: baseline, systemPrompt: 'sys', userPrompt: 'q' });

    expect(result.reasoningContent).toBeUndefined();
    expect(result.reasoningShape).toBeUndefined();
  });
});

// ── Test 2: full turn-graph reconstruction + JSONL round-trip ─────────────

describe('Sprint 11 A2 — JSONL persistence + turn-graph reconstruction (design doc §3 test 2)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-reasoning-capture-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reconstructs full turn graph from single turnId (answer + reasoning + cost + latency)', async () => {
    // Write one record with the full reasoning payload — models what runner.ts
    // persists after a live call.
    const outputPath = path.join(tmpDir, 'reconstruct.jsonl');
    const writer = new JsonlWriter(outputPath);
    const turnId = '11111111-2222-3333-4444-555555555555';
    const record: JsonlRecord = {
      turnId,
      cell: 'raw',
      instance_id: 'synth_001',
      model: 'qwen3.6-35b-a3b-stage2',
      seed: 42,
      accuracy: 1,
      p50_latency_ms: 3040,
      p95_latency_ms: 3040,
      usd_per_query: 0.000122,
      failure_mode: null,
      reasoning_content: 'Thinking Process: 2+2=4. Answer: 4.',
      reasoning_content_chars: 35,
      reasoning_shape: 'message.reasoning',
    };
    writer.write(record);
    await writer.close();

    // Read-path: opt in to reasoning for the reconstruct consumer.
    const rows = readJsonl(outputPath, { includeReasoning: true });
    const filtered = rows.filter(r => r.turnId === turnId);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].reasoning_content).toBe('Thinking Process: 2+2=4. Answer: 4.');
    expect(filtered[0].reasoning_content_chars).toBe(35);
    expect(filtered[0].reasoning_shape).toBe('message.reasoning');
    expect(filtered[0].p50_latency_ms).toBe(3040);
    expect(filtered[0].usd_per_query).toBeCloseTo(0.000122, 6);
  });

  it('readJsonl default strips reasoning_content but keeps chars + shape (ratification §Q4 read-path pruning)', async () => {
    const outputPath = path.join(tmpDir, 'pruned.jsonl');
    const writer = new JsonlWriter(outputPath);
    writer.write({
      turnId: 'abc',
      cell: 'raw',
      instance_id: 'synth_001',
      model: 'qwen3.6-35b-a3b-stage2',
      seed: 42,
      accuracy: 1,
      p50_latency_ms: 100,
      p95_latency_ms: 100,
      usd_per_query: 0.001,
      failure_mode: null,
      reasoning_content: 'secret chain-of-thought',
      reasoning_content_chars: 24,
      reasoning_shape: 'message.reasoning',
    });
    await writer.close();

    const pruned = readJsonl(outputPath); // default: includeReasoning: false
    expect(pruned).toHaveLength(1);
    expect(pruned[0].reasoning_content).toBeUndefined();       // stripped
    expect(pruned[0].reasoning_content_chars).toBe(24);         // kept
    expect(pruned[0].reasoning_shape).toBe('message.reasoning'); // kept
  });

  it('readJsonl { includeReasoning: true } preserves everything (archive + audit path)', async () => {
    const outputPath = path.join(tmpDir, 'full.jsonl');
    const writer = new JsonlWriter(outputPath);
    writer.write({
      turnId: 'xyz',
      cell: 'raw',
      instance_id: 's',
      model: 'm',
      seed: 42,
      accuracy: 1,
      p50_latency_ms: 1,
      p95_latency_ms: 1,
      usd_per_query: 0,
      failure_mode: null,
      reasoning_content: 'full chain here',
      reasoning_content_chars: 15,
      reasoning_shape: 'message.reasoning_content',
    });
    await writer.close();

    const full = readJsonl(outputPath, { includeReasoning: true });
    expect(full[0].reasoning_content).toBe('full chain here');
    expect(full[0].reasoning_content_chars).toBe(15);
    expect(full[0].reasoning_shape).toBe('message.reasoning_content');
  });
});

// ── Test 3: aggregate surface ─────────────────────────────────────────────

describe('Sprint 11 A2 — metrics aggregate (design doc §6.3)', () => {
  it('computes reasoning_content sum/p50/p95 + shape distribution when any record carries reasoning', () => {
    const records: JsonlRecord[] = [
      { turnId: 'a', cell: 'raw', instance_id: 's', model: 'm', seed: 42, accuracy: 1, p50_latency_ms: 10, p95_latency_ms: 10, usd_per_query: 0.001, failure_mode: null,
        reasoning_content_chars: 100, reasoning_shape: 'message.reasoning_content' },
      { turnId: 'b', cell: 'raw', instance_id: 's', model: 'm', seed: 42, accuracy: 1, p50_latency_ms: 10, p95_latency_ms: 10, usd_per_query: 0.001, failure_mode: null,
        reasoning_content_chars: 200, reasoning_shape: 'message.reasoning' },
      { turnId: 'c', cell: 'raw', instance_id: 's', model: 'm', seed: 42, accuracy: 1, p50_latency_ms: 10, p95_latency_ms: 10, usd_per_query: 0.001, failure_mode: null,
        reasoning_content_chars: 500, reasoning_shape: 'message.reasoning' },
    ];
    const config: RunConfig = {
      run: { kind: 'cell', name: 'raw' },
      dataset: syntheticDataset,
      model: stage2Model,
      limit: 3,
      seed: 42,
      budgetUsd: Number.POSITIVE_INFINITY,
      outputPath: 'unused',
      dryRun: true,
      litellmUrl: 'unused',
      litellmApiKey: 'unused',
    };
    const summary = buildAggregate(config, records, '2026-04-22T00:00:00Z', '2026-04-22T00:00:01Z', null);

    expect(summary.reasoningContent).toBeDefined();
    expect(summary.reasoningContent!.count).toBe(3);
    expect(summary.reasoningContent!.sumChars).toBe(800);
    expect(summary.reasoningContent!.shapeDistribution).toEqual({
      'message.reasoning_content': 1,
      'message.reasoning': 2,
    });
  });

  it('omits reasoningContent aggregate when NO records carry reasoning (thinking=off runs stay compact)', () => {
    const records: JsonlRecord[] = [
      { turnId: 'a', cell: 'raw', instance_id: 's', model: 'm', seed: 42, accuracy: 1, p50_latency_ms: 10, p95_latency_ms: 10, usd_per_query: 0.001, failure_mode: null },
    ];
    const config: RunConfig = {
      run: { kind: 'cell', name: 'raw' },
      dataset: syntheticDataset,
      model: { ...stage2Model, stage2Config: undefined },
      limit: 1,
      seed: 42,
      budgetUsd: Number.POSITIVE_INFINITY,
      outputPath: 'unused',
      dryRun: true,
      litellmUrl: 'unused',
      litellmApiKey: 'unused',
    };
    const summary = buildAggregate(config, records, '2026-04-22T00:00:00Z', '2026-04-22T00:00:01Z', null);
    expect(summary.reasoningContent).toBeUndefined();
  });

  it('counts shape=unknown in the shape distribution (observable drift signal reaches aggregates)', () => {
    const records: JsonlRecord[] = [
      { turnId: 'a', cell: 'raw', instance_id: 's', model: 'm', seed: 42, accuracy: 1, p50_latency_ms: 10, p95_latency_ms: 10, usd_per_query: 0.001, failure_mode: null,
        reasoning_shape: 'unknown' },
    ];
    const config: RunConfig = {
      run: { kind: 'cell', name: 'raw' },
      dataset: syntheticDataset,
      model: stage2Model,
      limit: 1,
      seed: 42,
      budgetUsd: Number.POSITIVE_INFINITY,
      outputPath: 'unused',
      dryRun: true,
      litellmUrl: 'unused',
      litellmApiKey: 'unused',
    };
    const summary = buildAggregate(config, records, '2026-04-22T00:00:00Z', '2026-04-22T00:00:01Z', null);
    expect(summary.reasoningContent).toBeDefined();
    expect(summary.reasoningContent!.shapeDistribution.unknown).toBe(1);
  });
});

// ── Test 4: exclusion-rule verification (§2.4 rule 2) ─────────────────────

describe('Sprint 11 A2 — exclusion contract (design doc §2.4)', () => {
  it('judge-runner.ts does NOT reference reasoning_content anywhere (static guard against future regressions)', () => {
    const judgeRunnerPath = path.resolve(__dirname, '../src/judge-runner.ts');
    const source = fs.readFileSync(judgeRunnerPath, 'utf-8');
    // The judge input surface is `{ question, groundTruth, contextExcerpt, modelAnswer }` —
    // any occurrence of `reasoning_content` or `.reasoning` inside judge-runner would
    // mean a regression opening the exclusion loophole.
    expect(source.includes('reasoning_content')).toBe(false);
    // `.reasoning` naked match is too broad (e.g. variable names), so guard
    // on the specific key access patterns instead:
    expect(source.match(/\.reasoning(?![_\w])/g)).toBeNull();
  });
});
