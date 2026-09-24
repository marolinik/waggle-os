/**
 * Pins for which failure text a chat turn shows the user (TD-CHAT-15): the
 * code-bearing failures whose message is written for the user, the provider
 * HTTP error, and the persisted failure turn. The throw sites marked
 * user-facing are pinned where they are thrown (session runtime, governance,
 * tool activity, model timeout); `chat-turn-failure-characterization` pins
 * the classified branches and the unmarked default.
 *
 * The seam is `server.agentRunner`, which throws the failure under test.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { AgentLoopConfig, AgentResponse } from '@waggle/agent';
import { GENERATION_FAILED_PREFIX } from '@waggle/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildLocalServer } from '../../src/local/index.js';
import { loadSessionMessages } from '../../src/local/routes/chat-persistence.js';
import { injectWithAuth, resetRateLimiter, parseSSE } from '../test-utils.js';

const INCOMPLETE = 'LLM returned an incomplete completion (assistant refusal); partial content was not accepted.';
const PROVIDER_ERROR = 'LLM error (502): {"error":{"message":"upstream exploded at /srv/internal/router.py"}}';

describe('POST /api/chat user-facing failure text', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  let failure: unknown;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-chat-user-facing-'));
    server = await buildLocalServer({ dataDir: tmpDir });
    server.agentRunner = async (_config: AgentLoopConfig): Promise<AgentResponse> => {
      throw failure;
    };
  });

  beforeEach(() => resetRateLimiter(server));

  afterAll(async () => {
    server.agentRunner = undefined;
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch { /* EBUSY on Windows */ }
  });

  async function errorEvents(thrown: unknown, session: string) {
    failure = thrown;
    const res = await injectWithAuth(server, {
      method: 'POST', url: '/api/chat', payload: { message: 'Summarise the launch plan please', session },
    });
    expect(res.statusCode).toBe(200);
    return parseSSE(res.body)
      .filter(e => e.event === 'error')
      .map(e => JSON.parse(e.data) as Record<string, unknown>);
  }

  it('shows an incomplete completion its own message, with no code', async () => {
    const incomplete = Object.assign(new Error(INCOMPLETE), { code: 'INCOMPLETE_COMPLETION' });
    expect(await errorEvents(incomplete, 'incomplete')).toEqual([{ message: INCOMPLETE }]);
  });

  it('shows a daily-budget pricing refusal its own message and code', async () => {
    const refusal = Object.assign(new Error('Hard daily budget cannot price model "x" from the trusted catalog'), {
      code: 'DAILY_MODEL_BUDGET_PRICING_UNAVAILABLE',
    });
    expect(await errorEvents(refusal, 'budget-pricing')).toEqual([{
      message: 'Hard daily budget cannot price model "x" from the trusted catalog',
      code: 'DAILY_MODEL_BUDGET_PRICING_UNAVAILABLE',
    }]);
  });

  it('forwards a provider HTTP error with its body', async () => {
    expect(await errorEvents(new Error(PROVIDER_ERROR), 'provider')).toEqual([{ message: PROVIDER_ERROR }]);
  });

  it('persists the text it showed as the failure turn', async () => {
    const session = 'provider-persisted';
    await errorEvents(new Error(PROVIDER_ERROR), session);
    const transcript = loadSessionMessages(tmpDir, server.agentState.activeWorkspaceId!, session);
    expect(transcript.at(-1)).toEqual({ role: 'assistant', content: `${GENERATION_FAILED_PREFIX}${PROVIDER_ERROR}` });
  });
});
