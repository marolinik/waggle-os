/**
 * Judge wiring tests (Sprint 9 Task 2).
 *
 * Brief:  PM-Waggle-OS/briefs/2026-04-20-cc-sprint-9-tasks.md Task 2 §Acceptance
 * Scope: judge-client retry semantics + judge-runner payload assembly +
 *        ensemble aggregation. All mocked — zero real LLM calls.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createJudgeLlmClient, type JudgeClientCostEntry } from '../src/judge-client.js';
import { runJudge, type JudgeConfig } from '../src/judge-runner.js';
import { runOne } from '../src/runner.js';
import type { LlmClient } from '../src/judge-types.js';
import type { DatasetSpec, JsonlRecord, ModelSpec } from '../src/types.js';

// ── Fixtures ─────────────────────────────────────────────────────────────

const SYNTHETIC_DATASET: DatasetSpec = {
  id: 'synthetic',
  displayName: 'Synthetic',
  dataPath: 'synthetic/placeholder.jsonl',
  source: 'synthetic',
};

const QWEN_MODEL: ModelSpec = {
  id: 'qwen3.6-35b-a3b',
  displayName: 'Qwen3.6-35B-A3B',
  provider: 'alibaba',
  litellmModel: 'dashscope/qwen3.6-35b-a3b',
  pricePerMillionInput: 0.2,
  pricePerMillionOutput: 0.8,
  contextWindow: 262144,
};

/** Scripted LlmClient — enqueues responses or errors and returns them
 *  in order. Used for judge module unit tests. */
class ScriptedLlmClient implements LlmClient {
  readonly calls: string[] = [];
  private queue: Array<string | Error>;
  constructor(responses: Array<string | Error>) {
    this.queue = [...responses];
  }
  async complete(prompt: string): Promise<string> {
    this.calls.push(prompt);
    if (this.queue.length === 0) throw new Error('ScriptedLlmClient out of responses');
    const next = this.queue.shift()!;
    if (next instanceof Error) throw next;
    return next;
  }
}

function readJsonl(file: string): JsonlRecord[] {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf-8')
    .split('\n')
    .filter(l => l.trim().length > 0)
    .map(l => JSON.parse(l) as JsonlRecord);
}

// ── Judge client — retry semantics ───────────────────────────────────────

describe('createJudgeLlmClient — transport retry semantics (brief §Failure-handling)', () => {
  it('succeeds on first attempt without retry', async () => {
    const fetchCalls: Array<{ url: string; body: unknown }> = [];
    const fakeFetch: typeof fetch = async (url, init) => {
      fetchCalls.push({ url: String(url), body: init?.body });
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"verdict":"correct","failure_mode":null,"rationale":"ok"}' } }],
          usage: { prompt_tokens: 100, completion_tokens: 20 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };
    const costs: JudgeClientCostEntry[] = [];
    const client = createJudgeLlmClient({
      litellmUrl: 'http://test',
      litellmApiKey: 'sk-test',
      model: 'claude-sonnet-4-6',
      fetchImpl: fakeFetch,
      backoffMs: [1, 1],
      onCall: e => costs.push(e),
    });
    const text = await client.complete('hello judge');
    expect(text).toContain('verdict');
    expect(fetchCalls).toHaveLength(1);
    expect(costs).toHaveLength(1);
    expect(costs[0].ok).toBe(true);
    expect(costs[0].promptTokens).toBe(100);
    expect(costs[0].completionTokens).toBe(20);
    expect(costs[0].usd).toBeGreaterThan(0);
  });

  it('retries twice on HTTP 500 then succeeds on the third attempt', async () => {
    let calls = 0;
    const fakeFetch: typeof fetch = async () => {
      calls++;
      if (calls <= 2) {
        return new Response('upstream is down', { status: 500 });
      }
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"verdict":"incorrect","failure_mode":"F3","rationale":"wrong date"}' } }],
          usage: { prompt_tokens: 100, completion_tokens: 22 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };
    const costs: JudgeClientCostEntry[] = [];
    const client = createJudgeLlmClient({
      litellmUrl: 'http://test',
      litellmApiKey: 'sk-test',
      model: 'claude-sonnet-4-6',
      fetchImpl: fakeFetch,
      backoffMs: [1, 1], // collapse backoff for tests
      onCall: e => costs.push(e),
    });
    const text = await client.complete('hello');
    expect(text).toContain('F3');
    expect(calls).toBe(3);
    // Single success entry — failures are absorbed by the retry loop
    // and don't emit cost entries until the final outcome.
    expect(costs).toHaveLength(1);
    expect(costs[0].ok).toBe(true);
  });

  it('emits a final failed cost entry and throws when all retries are exhausted', async () => {
    let calls = 0;
    const fakeFetch: typeof fetch = async () => {
      calls++;
      return new Response('persistent 503', { status: 503 });
    };
    const costs: JudgeClientCostEntry[] = [];
    const client = createJudgeLlmClient({
      litellmUrl: 'http://test',
      litellmApiKey: 'sk-test',
      model: 'claude-sonnet-4-6',
      fetchImpl: fakeFetch,
      backoffMs: [1, 1],
      onCall: e => costs.push(e),
    });
    await expect(client.complete('hello')).rejects.toThrow(/HTTP 503/);
    // 1 initial + 2 retries = 3 attempts, all failing.
    expect(calls).toBe(3);
    expect(costs).toHaveLength(1);
    expect(costs[0].ok).toBe(false);
  });

  it('falls back to reasoning_content when content is empty (thinking-mode provider)', async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [{
            message: {
              content: '',
              reasoning_content: '{"verdict":"correct","failure_mode":null,"rationale":"parsed from reasoning"}',
            },
          }],
          usage: { prompt_tokens: 80, completion_tokens: 200 },
        }),
        { status: 200 },
      );
    const client = createJudgeLlmClient({
      litellmUrl: 'http://test',
      litellmApiKey: 'sk-test',
      model: 'qwen3.6-35b-a3b-via-openrouter',
      fetchImpl: fakeFetch,
      backoffMs: [1, 1],
    });
    const text = await client.complete('hello');
    expect(text).toContain('parsed from reasoning');
  });
});

// ── runJudge — single-judge path ─────────────────────────────────────────

describe('runJudge — single judge produces a populated payload', () => {
  it('maps judgeAnswer output onto the JudgePayload shape', async () => {
    const client = new ScriptedLlmClient([
      JSON.stringify({ verdict: 'correct', failure_mode: null, rationale: 'All facts match.' }),
    ]);
    const payload = await runJudge(
      {
        question: 'Who painted the Mona Lisa?',
        groundTruth: 'Leonardo da Vinci',
        contextExcerpt: 'Leonardo da Vinci painted the Mona Lisa…',
        modelAnswer: 'Leonardo da Vinci',
      },
      { kind: 'single', model: 'claude-sonnet-4-6', client },
    );
    expect(payload.judge_verdict).toBe('correct');
    expect(payload.judge_failure_mode).toBeNull();
    expect(payload.judge_rationale).toBe('All facts match.');
    expect(payload.judge_model).toBe('claude-sonnet-4-6');
    expect(payload.judge_timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(payload.model_answer).toBe('Leonardo da Vinci');
    expect(payload.judge_error).toBeUndefined();
  });

  it('survives a JudgeParseError without aborting the batch', async () => {
    // Judge returns garbage twice → module throws JudgeParseError.
    const client = new ScriptedLlmClient(['not json', 'still not json']);
    const payload = await runJudge(
      {
        question: 'q',
        groundTruth: 'gt',
        contextExcerpt: 'ctx',
        modelAnswer: 'ma',
      },
      { kind: 'single', model: 'gpt-5', client },
    );
    expect(payload.judge_verdict).toBeUndefined();
    expect(payload.judge_failure_mode).toBeUndefined();
    expect(payload.judge_error).toMatch(/^parse:/);
    // model_answer still propagated — runner will store the raw answer
    // even when judging failed, so re-judging later is possible.
    expect(payload.model_answer).toBe('ma');
  });
});

// ── runJudge — ensemble path + majority + tie-break ──────────────────────

describe('runJudge — ensemble aggregates per-judge verdicts + majority', () => {
  const models = ['claude-sonnet-4-6', 'claude-haiku-4-5', 'gpt-5'];
  const mkClient = (verdict: 'correct' | 'incorrect', mode: 'F3' | null = null, rationale = 'r'): LlmClient =>
    new ScriptedLlmClient([JSON.stringify({ verdict, failure_mode: mode, rationale })]);

  it('3-0 unanimous majority populates ensemble entries and picks the shared verdict', async () => {
    const clients = new Map<string, LlmClient>([
      ['claude-sonnet-4-6', mkClient('correct', null, 'sonnet')],
      ['claude-haiku-4-5', mkClient('correct', null, 'haiku')],
      ['gpt-5', mkClient('correct', null, 'gpt-5')],
    ]);
    const payload = await runJudge(
      { question: 'q', groundTruth: 'gt', contextExcerpt: 'ctx', modelAnswer: 'ma' },
      { kind: 'ensemble', models, clients },
    );
    expect(payload.judge_verdict).toBe('correct');
    expect(payload.judge_ensemble).toHaveLength(3);
    // Ensemble entries carry the per-judge model id + its individual
    // verdict so the aggregator can compute inter-judge agreement
    // without re-reading per-judge calls.
    expect(payload.judge_ensemble?.map(e => e.model).sort()).toEqual([...models].sort());
  });

  it('2-1 majority takes the majority verdict; minority preserved in ensemble', async () => {
    const clients = new Map<string, LlmClient>([
      ['claude-sonnet-4-6', mkClient('incorrect', 'F3', 'wrong date')],
      ['claude-haiku-4-5', mkClient('incorrect', 'F3', 'wrong date')],
      ['gpt-5', mkClient('correct', null, 'actually looks fine')],
    ]);
    const payload = await runJudge(
      { question: 'q', groundTruth: 'gt', contextExcerpt: 'ctx', modelAnswer: 'ma' },
      { kind: 'ensemble', models, clients },
    );
    expect(payload.judge_verdict).toBe('incorrect');
    expect(payload.judge_failure_mode).toBe('F3');
    // Minority verdict surfaced in the ensemble entries.
    const gptEntry = payload.judge_ensemble?.find(e => e.model === 'gpt-5');
    expect(gptEntry?.verdict).toBe('correct');
  });
});

// ── Integration — runOne propagates judge fields into the JSONL ─────────

describe('runOne integration — judge fields land on every record when judgeConfig is set', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-judge-wire-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('single-judge mode — every row has judge_verdict + judge_failure_mode + judge_model', async () => {
    const outputPath = path.join(tmpDir, 'judge.jsonl');
    const queue = [
      JSON.stringify({ verdict: 'correct', failure_mode: null, rationale: 'match' }),
      JSON.stringify({ verdict: 'incorrect', failure_mode: 'F3', rationale: 'wrong date' }),
      JSON.stringify({ verdict: 'correct', failure_mode: null, rationale: 'match' }),
    ];
    const scripted = new ScriptedLlmClient(queue);

    await runOne({
      run: { kind: 'cell', name: 'raw' },
      dataset: SYNTHETIC_DATASET,
      model: QWEN_MODEL,
      limit: 3,
      seed: 42,
      budgetUsd: Number.POSITIVE_INFINITY,
      outputPath,
      dryRun: true,
      litellmUrl: 'http://unused',
      litellmApiKey: 'unused',
      judgeConfig: { kind: 'single', model: 'claude-sonnet-4-6', client: scripted },
    });

    const records = readJsonl(outputPath);
    expect(records).toHaveLength(3);
    for (const r of records) {
      expect(r.judge_model).toBe('claude-sonnet-4-6');
      expect(r.judge_verdict).toBeDefined();
      expect(r.judge_timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(r.model_answer).toBeDefined();
    }
    // Two correct + one incorrect, in the scripted order.
    expect(records[0].judge_verdict).toBe('correct');
    expect(records[1].judge_verdict).toBe('incorrect');
    expect(records[1].judge_failure_mode).toBe('F3');
    expect(records[2].judge_verdict).toBe('correct');
  });

  it('skips judging when judgeConfig is absent (existing behavior preserved)', async () => {
    const outputPath = path.join(tmpDir, 'no-judge.jsonl');
    await runOne({
      run: { kind: 'cell', name: 'raw' },
      dataset: SYNTHETIC_DATASET,
      model: QWEN_MODEL,
      limit: 2,
      seed: 42,
      budgetUsd: Number.POSITIVE_INFINITY,
      outputPath,
      dryRun: true,
      litellmUrl: 'http://unused',
      litellmApiKey: 'unused',
    });
    const records = readJsonl(outputPath);
    expect(records).toHaveLength(2);
    for (const r of records) {
      expect(r.judge_verdict).toBeUndefined();
      expect(r.judge_model).toBeUndefined();
      expect(r.model_answer).toBeUndefined();
    }
  });

  it('unjudgeable rows still populate model_answer + leave verdict undefined (no crash)', async () => {
    const outputPath = path.join(tmpDir, 'unjudged.jsonl');
    // Both attempts produce unparseable output → JudgeParseError → row
    // keeps model_answer, judge_verdict stays undefined.
    const scripted = new ScriptedLlmClient(['garbage', 'still garbage', 'garbage', 'still garbage']);
    await runOne({
      run: { kind: 'cell', name: 'raw' },
      dataset: SYNTHETIC_DATASET,
      model: QWEN_MODEL,
      limit: 2,
      seed: 42,
      budgetUsd: Number.POSITIVE_INFINITY,
      outputPath,
      dryRun: true,
      litellmUrl: 'http://unused',
      litellmApiKey: 'unused',
      judgeConfig: { kind: 'single', model: 'gpt-5', client: scripted },
    });
    const records = readJsonl(outputPath);
    expect(records).toHaveLength(2);
    for (const r of records) {
      expect(r.judge_verdict).toBeUndefined();
      expect(r.judge_failure_mode).toBeUndefined();
      expect(r.model_answer).toBeDefined();
    }
  });
});
