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
 * preserve. The seam is the `server.agentRunner` object seam used by
 * `chat-retry-chain-characterization.test.ts`: a shaped throw drives a real
 * same-model replay without a provider, so attempt 1's usage and attempt 2's
 * usage are both genuinely produced by the route.
 *
 * These pin CURRENT behavior, not a specification.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { AgentLoopConfig, AgentResponse } from '@waggle/agent';
import { WaggleConfig } from '@waggle/core';
import { buildLocalServer } from '../../src/local/index.js';
import { injectWithAuth, resetRateLimiter, parseSSE } from '../test-utils.js';

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
  let attempts: AgentLoopConfig[];

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
    delete server.agentRunner;
  });

  afterAll(async () => {
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on Windows */ }
  });

  /** Fails attempt 1 with `error`, answers on every later attempt. */
  function failFirstAttempt(error: Error) {
    attempts = [];
    server.agentRunner = async (config: AgentLoopConfig): Promise<AgentResponse> => {
      attempts.push(config);
      if (attempts.length === 1) throw error;
      return {
        content: 'second attempt answered',
        toolsUsed: [],
        usage: { ...COMPLETED_USAGE },
      };
    };
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
    failFirstAttempt(streamInterruption({ inputTokens: 5, outputTokens: 2 }));
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
    failFirstAttempt(streamInterruption({ inputTokens: 0, outputTokens: 0 }));
    const done = await runTurnDone(`usage-unbillable-${Date.now()}`);

    expect(attempts.length).toBe(2);
    expect(done.usage).toEqual(COMPLETED_USAGE);
    expect(done.usageEstimated).toBe(false);
  });
});
