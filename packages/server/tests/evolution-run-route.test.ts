/**
 * Integration tests for POST /api/evolution/run.
 *
 * The endpoint needs an Anthropic key and an LLM. We stub the LLM by
 * installing a global factory override (`__waggleEvolutionLlmFactory`) so
 * every call goes through an in-memory responder — no network, no @ax-llm/ax.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MindDB, VaultStore } from '@waggle/core';
import { buildLocalServer } from '../src/local/index.js';
import { injectWithAuth } from './test-utils.js';
import type { FastifyInstance } from 'fastify';
import type { EvolutionLLM } from '@waggle/agent';

// ── Global LLM override hook ─────────────────────────────────────

type LLMFactory = (apiKey: string) => EvolutionLLM | Promise<EvolutionLLM>;

function installLLMFactory(factory: LLMFactory): void {
  (globalThis as unknown as { __waggleEvolutionLlmFactory?: LLMFactory })
    .__waggleEvolutionLlmFactory = factory;
}

function clearLLMFactory(): void {
  delete (globalThis as unknown as { __waggleEvolutionLlmFactory?: LLMFactory })
    .__waggleEvolutionLlmFactory;
}

/**
 * Stub LLM that returns a canned answer based on a pattern match on the
 * prompt. Falls back to echoing the input so the judge still produces a
 * score. Every call increments a counter so tests can assert the LLM was
 * actually invoked.
 */
function makeStubLLM(responses: Array<{ match: RegExp; reply: string }>): {
  llm: EvolutionLLM;
  callCount: () => number;
  calls: string[];
} {
  const calls: string[] = [];
  return {
    callCount: () => calls.length,
    calls,
    llm: {
      async complete(prompt: string): Promise<string> {
        calls.push(prompt);
        for (const r of responses) {
          if (r.match.test(prompt)) return r.reply;
        }
        // Default response that parses as a valid judge verdict.
        return '{"correctness":8,"procedure":8,"conciseness":7,"feedback":"ok"}';
      },
    },
  };
}

// ── Test scaffolding ─────────────────────────────────────────────

describe('POST /api/evolution/run', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-evolution-run-'));

    // Fresh mind database.
    const personalPath = path.join(tmpDir, 'personal.mind');
    const mind = new MindDB(personalPath);
    mind.close();

    // Seed the vault with an Anthropic key before the server boots — the
    // server loads the vault from disk on startup.
    const vault = new VaultStore(tmpDir);
    vault.set('anthropic', 'sk-ant-stub-for-tests', { models: ['claude-haiku-4-5-20251001'] });

    server = await buildLocalServer({ dataDir: tmpDir });
  });

  afterAll(async () => {
    await server.close();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    clearLLMFactory();
  });

  beforeEach(() => {
    server.evolutionStore.clear();
    clearLLMFactory();
  });

  afterEach(() => {
    clearLLMFactory();
  });

  /** Seed a handful of finalized traces so the orchestrator's dataset miner has material. */
  function seedTraces(count = 8): void {
    for (let i = 0; i < count; i++) {
      const id = server.traceStore.start({
        input: `What is the capital of country ${i}?`,
        personaId: 'coder',
        model: 'claude-haiku-4-5-20251001',
        taskShape: 'qa',
      });
      server.traceStore.finalize(id, {
        outcome: i % 3 === 0 ? 'verified' : 'success',
        output: `The capital is City${i}.`,
        tokens: { input: 40, output: 20 },
      });
    }
  }

  const baseBody = {
    targetKind: 'behavioral-spec-section' as const,
    targetName: 'coreLoop',
    baseline: 'You are a careful assistant. Follow instructions.',
    schemaBaseline: {
      name: 'answer',
      version: 1,
      fields: [
        { name: 'answer', type: 'string', description: 'the answer', required: true, constraints: [] },
      ],
    },
    // Keep populations tiny so the test stays fast even though we use a stub LLM.
    schema: { populationSize: 1, generations: 1, evalSize: 2, anchorEvalSize: 2, seed: 1 },
    gepa: { populationSize: 1, generations: 1, miniEvalSize: 2, anchorEvalSize: 2, seed: 1 },
  };

  // ── 422 when no API key ────────────────────────────────────────

  it('returns 422 when no Anthropic key is in the vault', async () => {
    // Temporarily hide the key for just this request.
    const saved = server.vault?.get('anthropic');
    server.vault?.delete('anthropic');
    try {
      const res = await injectWithAuth(server, {
        method: 'POST', url: '/api/evolution/run', payload: baseBody,
      });
      expect(res.statusCode).toBe(422);
      const body = JSON.parse(res.body);
      expect(body.error).toMatch(/Anthropic API key/i);
    } finally {
      if (saved) {
        server.vault?.set('anthropic', saved.value, saved.metadata);
      }
    }
  });

  // ── 400 on validation errors ───────────────────────────────────

  describe('validation', () => {
    it('rejects missing body', async () => {
      const res = await injectWithAuth(server, {
        method: 'POST', url: '/api/evolution/run',
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects invalid targetKind', async () => {
      const res = await injectWithAuth(server, {
        method: 'POST', url: '/api/evolution/run',
        payload: { ...baseBody, targetKind: 'nope' },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toMatch(/targetKind/);
    });

    it('rejects empty targetName', async () => {
      const res = await injectWithAuth(server, {
        method: 'POST', url: '/api/evolution/run',
        payload: { ...baseBody, targetName: '' },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toMatch(/targetName/);
    });

    it('rejects empty baseline', async () => {
      const res = await injectWithAuth(server, {
        method: 'POST', url: '/api/evolution/run',
        payload: { ...baseBody, baseline: '' },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toMatch(/baseline/);
    });

    it('rejects malformed schemaBaseline', async () => {
      const res = await injectWithAuth(server, {
        method: 'POST', url: '/api/evolution/run',
        payload: { ...baseBody, schemaBaseline: { name: 'x' } },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toMatch(/schemaBaseline/);
    });
  });

  // ── 503 when LLM factory fails ─────────────────────────────────

  it('returns 503 when the LLM factory returns null', async () => {
    installLLMFactory(() => null as unknown as EvolutionLLM);
    const res = await injectWithAuth(server, {
      method: 'POST', url: '/api/evolution/run', payload: baseBody,
    });
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body).error).toMatch(/ax-llm/);
  });

  // ── Skip path: no traces ───────────────────────────────────────

  it('returns outcome=skipped-trigger when the trace store has no eligible traces', async () => {
    const { llm } = makeStubLLM([]);
    installLLMFactory(() => llm);

    const res = await injectWithAuth(server, {
      method: 'POST', url: '/api/evolution/run', payload: baseBody,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.outcome).toBe('skipped-trigger');
    expect(body.reason).toMatch(/eligible traces/);
  });

  // ── Happy path: runs + persists ────────────────────────────────

  it('runs the full orchestrator when traces exist and returns a proposal summary', async () => {
    seedTraces(8);

    const stub = makeStubLLM([
      // Mutation requests get a slightly different prompt text
      { match: /reflective|evolving an AI prompt/i, reply: 'You are an extremely careful assistant. Follow all instructions step by step.' },
      // Schema fill requests get valid JSON
      { match: /schema/i, reply: '{"answer":"City-X"}' },
      // Running-judge execution requests get a short answer
      { match: /USER INPUT:/i, reply: 'The capital is City-X.' },
    ]);
    installLLMFactory(() => stub.llm);

    const res = await injectWithAuth(server, {
      method: 'POST', url: '/api/evolution/run', payload: baseBody,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // Any terminal outcome is acceptable — the point is that the orchestrator
    // ran end-to-end, talked to our stub LLM, and wrote something to the store.
    expect(['proposed', 'skipped-delta', 'skipped-gates']).toContain(body.outcome);
    expect(body.composeSummary).toBeTruthy();
    // Every run (including skipped-delta) returns a composeSummary; only
    // 'proposed' and 'skipped-gates' attach a persisted run.
    expect(stub.callCount()).toBeGreaterThan(0);

    // If a run was persisted, check it shows up in the list endpoint.
    if (body.run) {
      const listRes = await injectWithAuth(server, {
        method: 'GET', url: '/api/evolution/runs',
      });
      const listed = JSON.parse(listRes.body);
      expect(listed.count).toBeGreaterThan(0);
      const matching = listed.runs.find((r: { run_uuid: string }) => r.run_uuid === body.run.run_uuid);
      expect(matching).toBeDefined();
    }
  }, 30_000);

  // ── Orchestrator error path ────────────────────────────────────

  it('returns 500 when the orchestrator throws', async () => {
    seedTraces(4);
    installLLMFactory(() => ({
      async complete() { throw new Error('stub-llm-always-fails'); },
    }));

    // Judge swallows its own LLM errors with a zero score, so we need to
    // make the mutate + execute paths noisy enough that *something* escapes.
    // Easiest: swap out the trace store to blow up during buildExamples.
    const originalQuery = server.traceStore.queryParsed.bind(server.traceStore);
    server.traceStore.queryParsed = () => { throw new Error('stub-trace-store-explodes'); };

    try {
      const res = await injectWithAuth(server, {
        method: 'POST', url: '/api/evolution/run', payload: baseBody,
      });
      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body).error).toMatch(/stub-trace-store-explodes/);
    } finally {
      server.traceStore.queryParsed = originalQuery;
    }
  });
});
