/**
 * Characterization tests for the per-request `pre:tool` approval hook in
 * `routes/chat.ts`.
 *
 * This boundary has no executing test: the hook is registered on the request
 * hook registry, which only exists when no runner is injected, so the
 * `server.agentRunner` object seam used by the other characterization files
 * skips it entirely. These pins drive the real agent loop and replace the
 * provider at the `globalThis.fetch` link seam instead, which is the only
 * harness that reaches the hook (docs/TESTING.md "Seam caveat").
 *
 * They pin CURRENT behavior, not a specification. A bug found while pinning is
 * marked `QUIRK` and ledgered in docs/TECH-DEBT.md, never fixed here.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { WaggleConfig } from '@waggle/core';
import { buildLocalServer } from '../../src/local/index.js';
import { injectWithAuth, resetRateLimiter } from '../test-utils.js';

/** Splits an SSE body into its `event:`/`data:` pairs. */
function parseSSE(raw: string): Array<{ event: string; data: string }> {
  const events: Array<{ event: string; data: string }> = [];
  for (const block of raw.split(/\n\n/).filter(Boolean)) {
    let event = '';
    let data = '';
    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) event = line.slice(7);
      else if (line.startsWith('data: ')) data = line.slice(6);
    }
    if (event || data) events.push({ event, data });
  }
  return events;
}

/** The turn asks the provider to stream, so every stub answers as an SSE body. */
function sseBody(...frames: unknown[]): Response {
  const payload = frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join('') + 'data: [DONE]\n\n';
  return new Response(payload, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

/** One OpenAI-compatible tool call. */
function toolCallResponse(name: string, args: Record<string, unknown>): Response {
  return sseBody(
    {
      choices: [{
        delta: {
          tool_calls: [{
            index: 0,
            id: `call-${name}`,
            type: 'function',
            function: { name, arguments: JSON.stringify(args) },
          }],
        },
        finish_reason: null,
      }],
    },
    {
      choices: [{ delta: {}, finish_reason: 'tool_calls' }],
      usage: { prompt_tokens: 10, completion_tokens: 2 },
    },
  );
}

/** A plain assistant answer. */
function textResponse(content: string): Response {
  return sseBody(
    { choices: [{ delta: { content }, finish_reason: null }] },
    {
      choices: [{ delta: {}, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 3 },
    },
  );
}

describe('POST /api/chat pre-tool approval hook (characterization)', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  let originalFetch: typeof globalThis.fetch;
  const originalTimeout = process.env.WAGGLE_APPROVAL_TIMEOUT_MS;
  const originalTimeoutAction = process.env.WAGGLE_APPROVAL_TIMEOUT_ACTION;

  beforeAll(async () => {
    // The timeout policy is resolved once when the chat plugin registers, so it
    // has to be in the environment before the server is built. A short deny
    // keeps every pin terminating without a client on the other end.
    process.env.WAGGLE_APPROVAL_TIMEOUT_MS = '750';
    process.env.WAGGLE_APPROVAL_TIMEOUT_ACTION = 'deny';

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-approval-hook-'));
    server = await buildLocalServer({ dataDir: tmpDir });
    // No `server.agentRunner`: the request hook registry, and therefore the
    // approval hook, only exists on the real agent-loop path.
    server.vault.set('anthropic', 'sk-approval-hook-pin');
    server.agentState.llmProvider = {
      provider: 'anthropic-proxy',
      health: 'healthy',
      detail: 'test',
      checkedAt: new Date().toISOString(),
    };
    const config = new WaggleConfig(tmpDir);
    config.save();
    originalFetch = globalThis.fetch;
  });

  afterAll(async () => {
    globalThis.fetch = originalFetch;
    if (originalTimeout === undefined) delete process.env.WAGGLE_APPROVAL_TIMEOUT_MS;
    else process.env.WAGGLE_APPROVAL_TIMEOUT_MS = originalTimeout;
    if (originalTimeoutAction === undefined) delete process.env.WAGGLE_APPROVAL_TIMEOUT_ACTION;
    else process.env.WAGGLE_APPROVAL_TIMEOUT_ACTION = originalTimeoutAction;
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on Windows */ }
  });

  /**
   * Asks for `toolName` until that tool's result comes back, then answers with
   * text, so the loop makes exactly one gated tool call and finishes.
   */
  function stubProvider(toolName: string, args: Record<string, unknown>) {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/tags')) {
        return new Response(JSON.stringify({ models: [] }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        messages?: Array<{ role?: string }>;
      };
      // Ask for the tool until its result comes back: keying on the outcome
      // rather than a call counter keeps the stub correct however many
      // availability probes the route makes first.
      const toolAnswered = (body.messages ?? []).some(m => m.role === 'tool');
      return toolAnswered ? textResponse('done') : toolCallResponse(toolName, args);
    }) as typeof globalThis.fetch;
  }

  /**
   * One workspace per pin. A chat runtime and its tool pool are cached per
   * workspace session, and a second turn on a reused workspace was observed
   * reaching the model with an empty tool catalog, which would make these pins
   * order-dependent. Recorded as TD-CHAT-32.
   */
  function createWorkspace(label: string): string {
    return server.workspaceManager.create({
      name: `approval hook ${label} ${Date.now()}`,
      group: 'test',
      directory: tmpDir,
    }).id;
  }

  async function runTurn(workspaceId: string, message: string, session: string) {
    resetRateLimiter(server);
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message, workspace: workspaceId, session, model: 'claude-sonnet-4-6' },
    });
    return { status: res.statusCode, events: parseSSE(res.body) };
  }

  it('enriches a gated tool approval, then denies it when no client answers', async () => {
    stubProvider('write_file', { path: 'notes.txt', content: 'hello' });
    const { status, events } = await runTurn(
      createWorkspace('enrichment'),
      'Write hello into notes.txt',
      'approval-enrichment',
    );
    expect(status).toBe(200);
    const approval = events.find(e => e.event === 'approval_required');
    expect(approval).toBeDefined();
    const payload = JSON.parse(approval!.data) as Record<string, unknown>;
    expect(payload.toolName).toBe('write_file');
    expect(payload.input).toEqual({ path: 'notes.txt', content: 'hello' });
    // The heuristic mapping, not the richer content-based assessment: that one
    // is reserved for install_capability.
    expect(payload.assessmentMode).toBe('heuristic');
    expect(payload.riskLevel).toBe('medium');
    expect(payload.approvalClass).toBe('elevated');
    expect(typeof payload.description).toBe('string');

    // No client answers, so the configured timeout denies the call. The turn
    // still completes: the denial reaches the model as a tool result and the
    // loop answers without the tool, which never ran.
    expect(events.some(e => e.event === 'step' && JSON.parse(e.data).content === '✖ write_file denied by user')).toBe(true);
    expect(events.some(e => e.event === 'done')).toBe(true);
    expect(JSON.parse(events.find(e => e.event === 'done')!.data).toolsUsed).toEqual([]);
    expect(fs.existsSync(path.join(tmpDir, 'notes.txt'))).toBe(false);
    // Deliberately absent: there is no provenance signal for a plain file
    // write, and stamping one would be a false claim on the trust surface.
    expect(payload.trustSource).toBeUndefined();
  });

});
