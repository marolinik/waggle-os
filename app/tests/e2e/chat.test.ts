/**
 * E2E Tests: Chat Streaming, Tool Events, and Approval Gate
 *
 * Scenarios covered:
 *   4. Chat message sent and response received (real agent loop, fake model)
 *   9. Tool execution — the model calls real tools, SSE includes tool events
 *  10. External mutation gate — eventBus-based approval flow
 *
 * Scenarios 4 and 9 run the real agent loop against the fake model provider
 * (TD-CHAT-16). Scenario 10 is held on `server.agentRunner` for a ruling: its
 * `gate:request` / `gate:response` flow lives only in the injected runner.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { startService } from '@waggle/server/local/service';
import type { AgentRunner } from '@waggle/server/local/routes/chat';
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

  // Scenario 10: External mutation gate — eventBus approval flow
  // The approval gate is driven by the eventBus: the agent emits a
  // 'gate:request' event and waits for 'gate:response'. This test
  // verifies the eventBus-based flow without needing an HTTP endpoint.
  it('external mutation gate: eventBus blocks and resumes on approval', async () => {
    const dataDir = makeTmpDir();
    tmpDirs.push(dataDir);
    const port = TEST_PORT;

    const { server } = await startService({ dataDir, port, skipLiteLLM: true });
    servers.push(server);

    // Simulate the approval gate pattern used by the desktop app:
    // agentRunner emits 'gate:request' on the eventBus, waits for 'gate:response'
    const gateLog: string[] = [];

    const mockRunner: AgentRunner = async (config) => {
      // Simulate a tool that triggers an approval gate
      if (config.onToolUse) {
        config.onToolUse('bash', { command: 'rm -rf /important' });
      }

      // Emit gate request and wait for response
      const approved = await new Promise<boolean>((resolve) => {
        server.eventBus.once('gate:response', (response: { approved: boolean }) => {
          gateLog.push(response.approved ? 'approved' : 'denied');
          resolve(response.approved);
        });
        server.eventBus.emit('gate:request', {
          tool: 'bash',
          input: { command: 'rm -rf /important' },
          requestId: 'gate-001',
        });
      });

      if (config.onToken) {
        config.onToken(approved ? 'Executed.' : 'Blocked.');
      }

      return {
        content: approved ? 'Executed.' : 'Blocked.',
        usage: { inputTokens: 15, outputTokens: 3 },
        toolsUsed: approved ? ['bash'] : [],
      };
    };
    server.agentRunner = mockRunner;

    // Listen for gate requests and auto-approve
    server.eventBus.on('gate:request', (req: { requestId: string }) => {
      gateLog.push('request-received');
      // Simulate user clicking "Approve" in the UI
      server.eventBus.emit('gate:response', { requestId: req.requestId, approved: true });
    });

    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'Delete the folder' },
    });

    const events = parseSSE(res.payload);
    const doneEvents = events.filter(e => e.event === 'done');
    expect(doneEvents.length).toBe(1);

    const doneData = doneEvents[0].data as { content: string; toolsUsed: string[] };
    expect(doneData.content).toBe('Executed.');
    expect(doneData.toolsUsed).toEqual(['bash']);

    // Verify gate flow happened in correct order
    expect(gateLog.length).toBe(2);
    expect(gateLog[0]).toBe('request-received');
    expect(gateLog[1]).toBe('approved');
  });

  // Scenario 10b: External mutation gate — denial path
  it('external mutation gate: eventBus blocks and returns denial', async () => {
    const dataDir = makeTmpDir();
    tmpDirs.push(dataDir);
    const port = TEST_PORT;

    const { server } = await startService({ dataDir, port, skipLiteLLM: true });
    servers.push(server);

    const gateLog: string[] = [];

    const mockRunner: AgentRunner = async (config) => {
      if (config.onToolUse) {
        config.onToolUse('bash', { command: 'rm -rf /important' });
      }

      // Emit gate request and wait for response
      const approved = await new Promise<boolean>((resolve) => {
        server.eventBus.once('gate:response', (response: { approved: boolean }) => {
          gateLog.push(response.approved ? 'approved' : 'denied');
          resolve(response.approved);
        });
        server.eventBus.emit('gate:request', {
          tool: 'bash',
          input: { command: 'rm -rf /important' },
          requestId: 'gate-002',
        });
      });

      if (config.onToken) {
        config.onToken(approved ? 'Executed.' : 'Blocked.');
      }

      return {
        content: approved ? 'Executed.' : 'Blocked.',
        usage: { inputTokens: 15, outputTokens: 3 },
        toolsUsed: approved ? ['bash'] : [],
      };
    };
    server.agentRunner = mockRunner;

    // Listen for gate requests and auto-DENY
    server.eventBus.on('gate:request', (req: { requestId: string }) => {
      gateLog.push('request-received');
      // Simulate user clicking "Deny" in the UI
      server.eventBus.emit('gate:response', { requestId: req.requestId, approved: false });
    });

    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'Delete the folder' },
    });

    const events = parseSSE(res.payload);
    const doneEvents = events.filter(e => e.event === 'done');
    expect(doneEvents.length).toBe(1);

    const doneData = doneEvents[0].data as { content: string; toolsUsed: string[] };
    expect(doneData.content).toBe('Blocked.');
    expect(doneData.toolsUsed).toEqual([]);

    // Verify gate flow happened in correct order with denial
    expect(gateLog.length).toBe(2);
    expect(gateLog[0]).toBe('request-received');
    expect(gateLog[1]).toBe('denied');
  });
});
