/**
 * Characterization pins for the agent-loop callbacks the chat route hands its
 * runner (TD-CHAT-3 slice 15): the two whose effects had no executing test.
 * - `onGiveUp` surfaces the loop-guard's give-up copy as a `step` event.
 * - `onToolUse` publishes a `tool:called` Waggle signal for the turn's scope.
 *
 * The real agent loop runs against the fake provider (TD-CHAT-16), so the
 * callbacks fire from the loop itself: nine failing `read_file` calls trip the
 * loop guard's give-up, and a scripted `list_skills` call starts a real tool.
 * Each turn asks for the tool it needs, because a conversational message
 * transmits no tools.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildLocalServer } from '../../src/local/index.js';
import { injectWithAuth, resetRateLimiter, parseSSE } from '../test-utils.js';
import {
  installFakeLlmProvider,
  markFakeProviderHealthy,
  type FakeLlmProvider,
  type FakeLlmReply,
} from '../helpers/fake-llm-provider.js';

describe('POST /api/chat agent-loop callbacks (characterization)', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  let provider: FakeLlmProvider | undefined;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-chat-agent-run-'));
    server = await buildLocalServer({ dataDir: tmpDir });
    markFakeProviderHealthy(server);
    server.llmRetryBackoffMs = () => 0;
  });

  beforeEach(() => resetRateLimiter(server));

  afterEach(() => {
    provider?.restore();
    provider = undefined;
  });

  afterAll(async () => {
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch { /* EBUSY on Windows */ }
  });

  /** Calls `toolCall` until a tool result comes back, then answers `content`. */
  function toolThenAnswer(toolCall: FakeLlmReply, content: string) {
    provider = installFakeLlmProvider({
      respond: (request) => (request.messages.some(m => m.role === 'tool')
        ? { type: 'text', content, usage: { inputTokens: 1, outputTokens: 1 } }
        : toolCall),
    });
  }

  async function turn(session: string, message: string) {
    const res = await injectWithAuth(server, {
      method: 'POST', url: '/api/chat', payload: { message, session },
    });
    expect(res.statusCode).toBe(200);
    return parseSSE(res.body);
  }

  it('surfaces the loop-guard give-up copy as a step', async () => {
    // Nine same-tool failures: the guard aborts before the ninth executes.
    toolThenAnswer({
      type: 'tool_calls',
      calls: Array.from({ length: 9 }, (_, i) => ({ name: 'read_file', args: { path: `../../outside-${i}.txt` } })),
    }, 'unreachable');
    const events = await turn('agent-run-give-up', 'Read the files outside-0.txt through outside-8.txt please');
    const steps = events.filter(e => e.event === 'step').map(e => (JSON.parse(e.data) as { content: string }).content);
    // The guard's own give-up copy, not the synthetic text the injected runner
    // passed (TD-CHAT-16 plan §6d).
    expect(steps).toContain(
      "I wasn't able to complete this — the read_file tool failed repeatedly. "
      + 'Try rephrasing your request, breaking it into smaller steps, or approaching it a different way.',
    );
  });

  it('publishes a tool:called signal for the turn scope when a tool starts', async () => {
    toolThenAnswer(
      { type: 'tool_calls', calls: [{ name: 'list_skills', args: { filter: 'launch' } }] },
      'No skills match.',
    );
    await turn('agent-run-tool-signal', 'Call list_skills exactly once.');
    const res = await injectWithAuth(server, { method: 'GET', url: '/api/waggle/signals?limit=200' });
    const { signals } = res.json() as { signals: Array<{ type: string; workspaceId: string; content: string }> };
    // A request naming no workspace runs in the server's active one.
    expect(signals).toContainEqual(expect.objectContaining({
      type: 'tool:called',
      workspaceId: server.agentState.activeWorkspaceId,
      content: 'list_skills({"filter":"launch"})',
    }));
  });
});
