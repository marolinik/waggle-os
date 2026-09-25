/**
 * Pins for which failure text a chat turn shows the user (TD-CHAT-15): the
 * code-bearing failures whose message is written for the user, the provider
 * HTTP error, and the persisted failure turn. The throw sites marked
 * user-facing are pinned where they are thrown (session runtime, governance,
 * tool activity, model timeout); `chat-turn-failure-characterization` pins
 * the classified branches and the unmarked default.
 *
 * The real agent loop runs against the fake provider (TD-CHAT-16): the
 * pricing refusal is the loop's own. The loop never reports an "assistant
 * refusal" reason, so that failure is thrown by the pass-through spy (ruling
 * 2). The two provider-error pins are held on `server.agentRunner` for a
 * ruling: a real 502 exhausts the loop's retries and reaches the user as
 * "endpoint not responding", not as the provider-error sentence (plan §6r).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const loopSpy = vi.hoisted(() => ({ failure: undefined as unknown }));

vi.mock('@waggle/agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@waggle/agent')>();
  return {
    ...actual,
    runAgentLoop: async (config: import('@waggle/agent').AgentLoopConfig) => {
      if (loopSpy.failure !== undefined) throw loopSpy.failure;
      return actual.runAgentLoop(config);
    },
  };
});
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { AgentLoopConfig, AgentResponse } from '@waggle/agent';
import { WaggleConfig } from '@waggle/core';
import { GENERATION_FAILED_PREFIX } from '@waggle/shared';
import { buildLocalServer } from '../../src/local/index.js';
import { loadSessionMessages } from '../../src/local/routes/chat-persistence.js';
import { injectWithAuth, resetRateLimiter, parseSSE } from '../test-utils.js';
import { installFakeLlmProvider, type FakeLlmProvider } from '../helpers/fake-llm-provider.js';

const INCOMPLETE = 'LLM returned an incomplete completion (assistant refusal); partial content was not accepted.';
const PROVIDER_ERROR = 'LLM error (502): {"error":{"message":"upstream exploded at /srv/internal/router.py"}}';
const UNPRICED_MODEL = 'unpriced-test-model';
const PROVIDER_SENTENCE = 'The model provider returned an error (HTTP 502). Try again or switch model.';

describe('POST /api/chat user-facing failure text', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  let provider: FakeLlmProvider | undefined;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-chat-user-facing-'));
    server = await buildLocalServer({ dataDir: tmpDir });
    server.agentState.llmProvider = {
      provider: 'anthropic-proxy', health: 'healthy', detail: 'fake LLM provider', checkedAt: new Date().toISOString(),
    };
    server.llmRetryBackoffMs = () => 0;
  });

  beforeEach(() => resetRateLimiter(server));

  afterEach(() => {
    provider?.restore();
    provider = undefined;
    loopSpy.failure = undefined;
    server.agentRunner = undefined;
  });

  afterAll(async () => {
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch { /* EBUSY on Windows */ }
  });

  /** Held (plan §6r): an injected runner throws the wrapped provider error. */
  function providerFails() {
    server.agentRunner = async (_config: AgentLoopConfig): Promise<AgentResponse> => {
      throw new Error(PROVIDER_ERROR);
    };
  }

  async function errorEvents(session: string) {
    const res = await injectWithAuth(server, {
      method: 'POST', url: '/api/chat', payload: { message: 'Summarise the launch plan please', session },
    });
    expect(res.statusCode).toBe(200);
    return parseSSE(res.body)
      .filter(e => e.event === 'error')
      .map(e => JSON.parse(e.data) as Record<string, unknown>);
  }

  it('shows an incomplete completion its own message, with no code', async () => {
    loopSpy.failure = Object.assign(new Error(INCOMPLETE), { code: 'INCOMPLETE_COMPLETION' });
    expect(await errorEvents('incomplete')).toEqual([{ message: INCOMPLETE }]);
  });

  it('shows a daily-budget pricing refusal its own message and code', async () => {
    // A priced model the trusted catalog cannot price, under a hard daily
    // budget: the loop's own cost tracker refuses it before any model call.
    const config = new WaggleConfig(tmpDir);
    const previousModel = config.getDefaultModel();
    config.setDefaultModel(UNPRICED_MODEL);
    config.save();
    server.agentState.costTracker.setBudget(5, 'hard');
    provider = installFakeLlmProvider({ respond: { type: 'text', content: 'never sent' } });
    try {
      expect(await errorEvents('budget-pricing')).toEqual([{
        message: `Hard daily budget cannot price model "${UNPRICED_MODEL}" from the trusted catalog`,
        code: 'DAILY_MODEL_BUDGET_PRICING_UNAVAILABLE',
      }]);
      expect(provider.requests).toHaveLength(0);
    } finally {
      server.agentState.costTracker.setBudget(null, 'soft');
      config.setDefaultModel(previousModel);
      config.save();
    }
  });

  it('shows a provider HTTP error as its status only, never its body', async () => {
    providerFails();
    expect(await errorEvents('provider')).toEqual([{ message: PROVIDER_SENTENCE }]);
  });

  it('persists the text it showed as the failure turn', async () => {
    const session = 'provider-persisted';
    providerFails();
    await errorEvents(session);
    const transcript = loadSessionMessages(tmpDir, server.agentState.activeWorkspaceId!, session);
    expect(transcript.at(-1)).toEqual({ role: 'assistant', content: `${GENERATION_FAILED_PREFIX}${PROVIDER_SENTENCE}` });
  });
});
