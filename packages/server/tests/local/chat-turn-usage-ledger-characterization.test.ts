/**
 * Characterization tests for whole-turn usage accounting in `routes/chat.ts`
 * (TD-CHAT-3 prerequisite, docs/TESTING.md Safety Net Map).
 *
 * The turn keeps six hoisted mutable variables for accounting
 * (`activeAttemptModel`, `activeAttemptBillingClass`, `abortedAttemptUsage`,
 * `completedAttemptUsageReceipt`, `totalTurnUsage`, `usageAccounted`) plus two
 * collections (`failedAttemptUsageReceipts`, `attemptedBillingClasses`), and the
 * reduce that folds them into `totalTurnUsage` is written out VERBATIM TWICE
 * (the aborted-after-attempt path and the normal completion path). Nothing
 * asserts the fold today: `chat-api.test.ts` pins `billingClass` and `cost` for
 * SINGLE-attempt turns only, so a multi-attempt turn could total wrongly and
 * every existing test would stay green.
 *
 * This pins the fold itself, which is what any extraction of the cluster has to
 * preserve. The real agent loop runs against the fake provider (TD-CHAT-16): a
 * stream cut before `[DONE]` drives a real same-model replay, so attempt 1's
 * usage and attempt 2's usage are both genuinely produced. The loop never marks
 * an interruption's usage as estimated, so that one pin throws the shaped error
 * through the pass-through loop spy (ruling 2).
 *
 * These pin CURRENT behavior, not a specification.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { AgentLoopConfig } from '@waggle/agent';
import { WaggleConfig } from '@waggle/core';

/**
 * Pass-through spy on the real agent loop (TD-CHAT-16 ruling 2). It records
 * each attempt's `AgentLoopConfig`, and throws `failures[n]` on attempt n only
 * where that failure cannot come from a provider reply. Everything else runs
 * the real loop against the fake provider.
 */
const loopSpy = vi.hoisted(() => ({
  configs: [] as AgentLoopConfig[],
  failures: [] as unknown[],
}));

vi.mock('@waggle/agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@waggle/agent')>();
  return {
    ...actual,
    runAgentLoop: async (config: AgentLoopConfig) => {
      const index = loopSpy.configs.push(config) - 1;
      const failure = loopSpy.failures[index];
      if (failure !== undefined) throw failure;
      return actual.runAgentLoop(config);
    },
  };
});

import { buildLocalServer } from '../../src/local/index.js';
import { injectWithAuth, resetRateLimiter, parseSSE } from '../test-utils.js';
import { installFakeLlmProvider, type FakeLlmProvider } from '../helpers/fake-llm-provider.js';

/**
 * The one error shape the safe-replay predicate accepts: code
 * `INCOMPLETE_COMPLETION` AND the parenthesised stream-ended sentence. Both
 * halves matter — a plainer message takes the terminal throw path instead and
 * there is no second attempt to total.
 */
function streamInterruption(
  usage: { inputTokens: number; outputTokens: number } | undefined,
  options: { estimated?: boolean } = {},
): Error {
  const error = new Error(
    'Model stream ended early (stream ended before data: [DONE]); partial content was not accepted.',
  ) as Error & {
    code: string;
    usage?: { inputTokens: number; outputTokens: number };
    usageEstimated?: boolean;
  };
  error.code = 'INCOMPLETE_COMPLETION';
  if (usage) error.usage = usage;
  if (options.estimated) error.usageEstimated = true;
  return error;
}

type DoneEvent = {
  usage: { inputTokens: number; outputTokens: number };
  usageEstimated: boolean;
};

describe('POST /api/chat whole-turn usage accounting (characterization)', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  const attempts = loopSpy.configs;
  let provider: FakeLlmProvider | undefined;

  /** What attempt 2 answers with, so the expected totals are arithmetic. */
  const COMPLETED_USAGE = { inputTokens: 3, outputTokens: 4 };

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-chat-usage-'));
    server = await buildLocalServer({ dataDir: tmpDir });
    server.vault.set('anthropic', 'sk-usage-pin');
    server.agentState.llmProvider = {
      provider: 'anthropic-proxy',
      health: 'healthy',
      detail: 'test',
      checkedAt: new Date().toISOString(),
    };
    new WaggleConfig(tmpDir).save();
  });

  afterEach(() => {
    provider?.restore();
    provider = undefined;
    loopSpy.failures.length = 0;
  });

  afterAll(async () => {
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on Windows */ }
  });

  /** Cuts attempt 1's stream after it reported `usage`; attempt 2 answers. */
  function interruptFirstAttempt(usage: { inputTokens: number; outputTokens: number }) {
    attempts.length = 0;
    provider = installFakeLlmProvider({
      respond: [
        { type: 'truncated_stream', content: 'partial', usage },
        { type: 'text', content: 'second attempt answered', usage: { ...COMPLETED_USAGE } },
      ],
    });
  }

  /** Fails attempt 1 with `error` through the loop spy; attempt 2 answers. */
  function failFirstAttempt(error: Error) {
    attempts.length = 0;
    loopSpy.failures[0] = error;
    provider = installFakeLlmProvider({
      respond: { type: 'text', content: 'second attempt answered', usage: { ...COMPLETED_USAGE } },
    });
  }

  async function runTurnDone(session: string): Promise<DoneEvent> {
    resetRateLimiter(server);
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: {
        message: 'In one sentence, what is a monorepo?',
        session,
        model: 'claude-sonnet-4-6',
      },
    });
    expect(res.statusCode).toBe(200);
    const done = parseSSE(res.body).find(e => e.event === 'done');
    expect(done).toBeDefined();
    return JSON.parse(done!.data) as DoneEvent;
  }

  it('totals a replayed turn as the failed attempt plus the completed attempt', async () => {
    interruptFirstAttempt({ inputTokens: 5, outputTokens: 2 });
    const done = await runTurnDone(`usage-total-${Date.now()}`);

    // Two attempts really ran, so the total below is a fold and not a passthrough.
    expect(attempts.length).toBe(2);
    expect(done.usage).toEqual({
      inputTokens: 5 + COMPLETED_USAGE.inputTokens,
      outputTokens: 2 + COMPLETED_USAGE.outputTokens,
    });
    // The completed attempt alone would be the wrong answer, and is what a
    // dropped `failedAttemptUsageReceipts` fold would report.
    expect(done.usage).not.toEqual(COMPLETED_USAGE);
  });

  it('carries the estimated flag from a failed attempt onto the whole turn', async () => {
    failFirstAttempt(
      streamInterruption({ inputTokens: 5, outputTokens: 2 }, { estimated: true }),
    );
    const done = await runTurnDone(`usage-estimated-${Date.now()}`);

    expect(attempts.length).toBe(2);
    expect(done.usageEstimated).toBe(true);
    expect(done.usage).toEqual({
      inputTokens: 5 + COMPLETED_USAGE.inputTokens,
      outputTokens: 2 + COMPLETED_USAGE.outputTokens,
    });
  });

  it('does not total a failed attempt that reported no billable usage', async () => {
    // Zero-token usage is not billable (`getBillableUsage` rejects a zero sum),
    // so no receipt is written and the total is the completed attempt alone.
    // Same replay path as the first case — only the usage differs, which is what
    // makes the first case's assertion non-vacuous.
    // A provider cannot produce this: when a cut stream reports 0/0 the loop
    // substitutes an estimate (TD-CHAT-16 plan §6b), so the zero-usage
    // interruption is thrown through the loop spy (ruling 2).
    failFirstAttempt(streamInterruption({ inputTokens: 0, outputTokens: 0 }));
    const done = await runTurnDone(`usage-unbillable-${Date.now()}`);

    expect(attempts.length).toBe(2);
    expect(done.usage).toEqual(COMPLETED_USAGE);
    expect(done.usageEstimated).toBe(false);
  });
});
