/**
 * E2E Tests: Chat Streaming, Tool Events, and Approval Gate
 *
 * Scenarios covered:
 *   4. Chat message sent and response received (real agent loop, fake model)
 *   9. Tool execution — the model calls real tools, SSE includes tool events
 *  10. External mutation gate — the pre-tool approval hook
 *
 * Every scenario runs the real agent loop against the fake model provider
 * (TD-CHAT-16).
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { startService } from '@waggle/server/local/service';
import { injectWithAuth } from './test-utils.js';
import {
  installFakeLlmProvider,
  type FakeLlmProvider,
  type FakeLlmResponder,
} from '../../../packages/server/tests/helpers/fake-llm-provider.js';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-e2e-'));
}

// Port 0 lets the OS assign a free port; inject() bypasses the network anyway
const TEST_PORT = 0;

/**
 * Parse SSE text into structured events.
 * Each event is: "event: <type>\ndata: <json>\n\n"
 */
function parseSSE(raw: string): Array<{ event: string; data: unknown }> {
  const events: Array<{ event: string; data: unknown }> = [];
  const blocks = raw.split('\n\n').filter(b => b.trim());

  for (const block of blocks) {
    const lines = block.split('\n');
    let event = '';
    let data = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        event = line.slice(7);
      } else if (line.startsWith('data: ')) {
        data = line.slice(6);
      }
    }
    if (event && data) {
      try {
        events.push({ event, data: JSON.parse(data) });
      } catch {
        events.push({ event, data });
      }
    }
  }
  return events;
}

/**
 * Starts the service with a healthy model provider answered by the fake.
 * `autoApprove` builds it with the route's test-mode approval, read once at
 * registration, for turns whose model calls a gated tool.
 */
async function startWithModel(dataDir: string, respond: FakeLlmResponder, autoApprove = false) {
  const previousAutoApprove = process.env.WAGGLE_AUTO_APPROVE;
  if (autoApprove) process.env.WAGGLE_AUTO_APPROVE = '1';
  try {
    const { server } = await startService({ dataDir, port: TEST_PORT, skipLiteLLM: true });
    server.agentState.llmProvider = {
      provider: 'anthropic-proxy', health: 'healthy', detail: 'fake LLM provider', checkedAt: new Date().toISOString(),
    };
    return { server, provider: installFakeLlmProvider({ respond }) };
  } finally {
    if (previousAutoApprove === undefined) delete process.env.WAGGLE_AUTO_APPROVE;
    else process.env.WAGGLE_AUTO_APPROVE = previousAutoApprove;
  }
}

describe('Chat E2E', () => {
  const servers: FastifyInstance[] = [];
  const tmpDirs: string[] = [];
  let provider: FakeLlmProvider | undefined;

  afterEach(async () => {
    provider?.restore();
    provider = undefined;
    for (const s of servers) {
      try { await s.close(); } catch { /* ignore */ }
    }
    servers.length = 0;
    for (const d of tmpDirs) {
      try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
    }
    tmpDirs.length = 0;
  });

  // Scenario 4: Chat message sent and response received via SSE
  it('sends chat message and receives SSE token + done events', async () => {
    const dataDir = makeTmpDir();
    tmpDirs.push(dataDir);

    const started = await startWithModel(dataDir, {
      type: 'text', content: 'Hello world', chunks: ['Hello ', 'world'], usage: { inputTokens: 10, outputTokens: 5 },
    });
    const server = started.server;
    provider = started.provider;
    servers.push(server);

    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'Hi there' },
    });

    // SSE hijacks the response — status comes from raw writeHead
    // inject() returns the raw body as payload
    const events = parseSSE(res.payload);

    // Should have token events
    const tokenEvents = events.filter(e => e.event === 'token');
    expect(tokenEvents.length).toBe(2);
    expect((tokenEvents[0].data as { content: string }).content).toBe('Hello ');
    expect((tokenEvents[1].data as { content: string }).content).toBe('world');

    // Should have done event
    const doneEvents = events.filter(e => e.event === 'done');
    expect(doneEvents.length).toBe(1);
    const doneData = doneEvents[0].data as { content: string; usage: unknown; toolsUsed: string[] };
    expect(doneData.content).toBe('Hello world');
    expect(doneData.toolsUsed).toEqual([]);
    expect(provider.requests).toHaveLength(1);
  });

  // Scenario 9: Tool execution events in SSE stream
  it('includes tool events in SSE when the model calls tools', async () => {
    const dataDir = makeTmpDir();
    tmpDirs.push(dataDir);

    // The model really calls read_file, then write_file, then answers. The
    // message asks for both, because a read request transmits no write tool.
    const started = await startWithModel(dataDir, [
      { type: 'tool_calls', calls: [{ name: 'read_file', args: { path: '/src/index.ts' } }], usage: { inputTokens: 20, outputTokens: 10 } },
      {
        type: 'tool_calls',
        calls: [{ name: 'write_file', args: { path: '/src/output.ts', content: 'export {}' } }],
        usage: { inputTokens: 20, outputTokens: 10 },
      },
      { type: 'text', content: 'Reading file... Done.', usage: { inputTokens: 20, outputTokens: 10 } },
    ], true);
    const server = started.server;
    provider = started.provider;
    servers.push(server);

    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'Read the index file, then write /src/output.ts.' },
    });

    // The route's own auto_recall tool event is left out: the pin is about
    // the model's tools (TD-CHAT-16, the ruling-4 pattern).
    const events = parseSSE(res.payload).filter(e => (
      e.event !== 'tool' || (e.data as { name?: string }).name !== 'auto_recall'
    ));

    // Should have tool events
    const toolEvents = events.filter(e => e.event === 'tool');
    expect(toolEvents.length).toBe(2);

    const tool1 = toolEvents[0].data as { name: string; input: Record<string, unknown> };
    expect(tool1.name).toBe('read_file');
    expect(tool1.input.path).toBe('/src/index.ts');

    const tool2 = toolEvents[1].data as { name: string; input: Record<string, unknown> };
    expect(tool2.name).toBe('write_file');

    // Done event should list tools used
    const doneEvents = events.filter(e => e.event === 'done');
    expect(doneEvents.length).toBe(1);
    const doneData = doneEvents[0].data as { toolsUsed: string[] };
    expect(doneData.toolsUsed).toEqual(['read_file', 'write_file']);
  });

  /**
   * Scenarios 10 and 10b drive the real pre-tool approval hook (TD-CHAT-16
   * ruling 19). The model calls `write_file`; the hook sends `approval_required`
   * and holds the call until `POST /api/approval/:id` answers it, as the
   * desktop app's approval card does. The model then answers from the tool
   * result it received.
   */
  async function runGatedTurn(approved: boolean) {
    const dataDir = makeTmpDir();
    tmpDirs.push(dataDir);
    const started = await startWithModel(dataDir, (request) => {
      const toolResult = request.messages.find(message => message.role === 'tool');
      if (!toolResult) {
        return {
          type: 'tool_calls',
          calls: [{ name: 'write_file', args: { path: '/src/gate.ts', content: 'export {}' } }],
          usage: { inputTokens: 15, outputTokens: 3 },
        };
      }
      return {
        type: 'text',
        content: /denied/i.test(toolResult.content) ? 'Blocked.' : 'Executed.',
        usage: { inputTokens: 15, outputTokens: 3 },
      };
    });
    const server = started.server;
    provider = started.provider;
    servers.push(server);

    const gateLog: string[] = [];
    let stop = false;
    const answer = (async () => {
      while (!stop) {
        const [requestId] = server.agentState.pendingApprovals.keys();
        if (requestId) {
          gateLog.push('request-received');
          const res = await injectWithAuth(server, {
            method: 'POST',
            url: `/api/approval/${requestId}`,
            payload: { approved },
          });
          gateLog.push(res.statusCode === 200 ? (approved ? 'approved' : 'denied') : `status ${res.statusCode}`);
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    })();
    try {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: { message: 'Create the file /src/gate.ts with an empty export.' },
      });
      return { events: parseSSE(res.payload), gateLog };
    } finally {
      stop = true;
      await answer;
    }
  }

  // Scenario 10: External mutation gate — approval resumes the tool
  it('external mutation gate: the approval hook blocks and resumes on approval', async () => {
    const { events, gateLog } = await runGatedTurn(true);

    const approval = events.find(e => e.event === 'approval_required');
    expect((approval?.data as { toolName?: string } | undefined)?.toolName).toBe('write_file');

    const doneEvents = events.filter(e => e.event === 'done');
    expect(doneEvents.length).toBe(1);
    const doneData = doneEvents[0].data as { content: string; toolsUsed: string[] };
    expect(doneData.content).toBe('Executed.');
    expect(doneData.toolsUsed).toEqual(['write_file']);

    expect(gateLog).toEqual(['request-received', 'approved']);
  });

  // Scenario 10b: External mutation gate — denial path
  it('external mutation gate: the approval hook blocks and returns denial', async () => {
    const { events, gateLog } = await runGatedTurn(false);

    expect(events.some(e => e.event === 'approval_required')).toBe(true);

    const doneEvents = events.filter(e => e.event === 'done');
    expect(doneEvents.length).toBe(1);
    const doneData = doneEvents[0].data as { content: string; toolsUsed: string[] };
    expect(doneData.content).toBe('Blocked.');
    expect(doneData.toolsUsed).toEqual([]);

    expect(gateLog).toEqual(['request-received', 'denied']);
  });
});
