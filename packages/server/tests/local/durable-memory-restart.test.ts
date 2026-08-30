import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { AgentLoopConfig, AgentResponse } from '@waggle/agent';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { buildLocalServer } from '../../src/local/index.js';
import { closeAuditDb } from '../../src/local/routes/events.js';
import { injectWithAuth, resetRateLimiter } from '../test-utils.js';

const testState = vi.hoisted(() => {
  const previousPromptAssembler = process.env.WAGGLE_PROMPT_ASSEMBLER;
  process.env.WAGGLE_PROMPT_ASSEMBLER = '1';
  return {
    previousPromptAssembler,
    runAgentLoop: vi.fn(),
  };
});

vi.mock('@waggle/agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@waggle/agent')>();
  return {
    ...actual,
    runAgentLoop: testState.runAgentLoop,
  };
});

vi.mock('../../src/local/model-availability.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/local/model-availability.js')>();
  return {
    ...actual,
    resolveUsableModel: async (_server: FastifyInstance, requestedModel: string) => requestedModel,
  };
});

vi.mock('../../src/local/services/optimizer-service.js', () => ({
  getOptimizerService: async () => ({
    expandWithChoices: async () => ({
      expanded: null,
      clarifyingQuestions: null,
      intent: 'request',
      isVague: false,
    }),
  }),
}));

const SENTINEL = 'DURABLE-ORCHID-20260830';
const DECISION_MESSAGE = `Let's go with ${SENTINEL} as the Windows Solo launch codename. We will use it for the internal pilot.`;
const RECALL_MESSAGE = 'Search my saved memory for our Windows Solo launch codename decision. Do not write files or execute code.';
const MODEL = 'openai-compatible/durable-memory-test';

function parseSse(raw: string): Array<{ event: string; data: Record<string, unknown> }> {
  return raw.split(/\n\n/)
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n');
      const event = lines.find(line => line.startsWith('event: '))?.slice(7) ?? '';
      const data = lines.find(line => line.startsWith('data: '))?.slice(6) ?? '{}';
      return { event, data: JSON.parse(data) as Record<string, unknown> };
    });
}

function markModelHealthy(server: FastifyInstance): void {
  server.agentState.llmProvider = {
    provider: 'litellm',
    health: 'healthy',
    detail: 'deterministic durable-memory test double',
    checkedAt: new Date().toISOString(),
  };
}

async function createWorkspace(server: FastifyInstance, name: string): Promise<string> {
  const response = await injectWithAuth(server, {
    method: 'POST',
    url: '/api/workspaces',
    payload: { name, group: 'Test' },
  });
  expect(response.statusCode).toBe(201);
  return response.json().id as string;
}

async function createSession(server: FastifyInstance, workspaceId: string, title: string): Promise<string> {
  const response = await injectWithAuth(server, {
    method: 'POST',
    url: `/api/workspaces/${workspaceId}/sessions`,
    payload: { title },
  });
  expect(response.statusCode).toBe(201);
  return response.json().id as string;
}

async function chat(server: FastifyInstance, workspace: string, session: string, message: string) {
  return injectWithAuth(server, {
    method: 'POST',
    url: '/api/chat',
    payload: {
      workspace,
      session,
      message,
      model: MODEL,
      persona: 'general-purpose',
    },
  });
}

afterAll(() => {
  if (testState.previousPromptAssembler === undefined) {
    delete process.env.WAGGLE_PROMPT_ASSEMBLER;
  } else {
    process.env.WAGGLE_PROMPT_ASSEMBLER = testState.previousPromptAssembler;
  }
});

describe('durable memory return journey', () => {
  it('restores the exact transcript and recalls a decision only inside its workspace after restart', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-durable-memory-'));
    const capturedConfigs: AgentLoopConfig[] = [];
    let server: FastifyInstance | undefined;

    testState.runAgentLoop.mockImplementation(async (config: AgentLoopConfig): Promise<AgentResponse> => {
      capturedConfigs.push(config);
      const isRecallTurn = config.messages.at(-1)?.content === RECALL_MESSAGE;
      const recalled = config.systemPrompt.includes(SENTINEL);
      const content = isRecallTurn
        ? recalled
          ? `I remember the launch codename: ${SENTINEL}.`
          : 'I do not have a saved launch codename in this workspace.'
        : `Confirmed the launch codename: ${SENTINEL}.`;
      config.onToken?.(content);
      return {
        content,
        toolsUsed: [],
        usage: { inputTokens: 20, outputTokens: 10 },
      };
    });

    try {
      server = await buildLocalServer({ dataDir });
      markModelHealthy(server);
      resetRateLimiter(server);

      const workspaceA = await createWorkspace(server, 'Durable memory workspace A');
      const workspaceB = await createWorkspace(server, 'Durable memory workspace B');
      const sessionA1 = await createSession(server, workspaceA, 'Decision session');

      const first = await chat(server, workspaceA, sessionA1, DECISION_MESSAGE);
      expect(first.statusCode).toBe(200);
      const firstEvents = parseSse(first.body);
      expect(firstEvents.filter(event => event.event === 'token').map(event => event.data.content).join(''))
        .toBe(`Confirmed the launch codename: ${SENTINEL}.`);
      expect(firstEvents.some(
        event => event.event === 'step' && /Auto-saved \d+ memor/i.test(String(event.data.content)),
      )).toBe(true);

      const beforeRestart = await injectWithAuth(server, {
        method: 'GET',
        url: `/api/history?workspace=${workspaceA}&session=${sessionA1}`,
      });
      expect(beforeRestart.statusCode).toBe(200);
      const exactTranscript = beforeRestart.json().messages.map(
        (message: { role: string; content: string }) => ({ role: message.role, content: message.content }),
      );
      expect(exactTranscript).toEqual([
        { role: 'user', content: DECISION_MESSAGE },
        { role: 'assistant', content: `Confirmed the launch codename: ${SENTINEL}.` },
      ]);

      const savedMemory = await injectWithAuth(server, {
        method: 'GET',
        url: `/api/memory?mind=workspace&workspace=${workspaceA}`,
      });
      expect(savedMemory.statusCode).toBe(200);
      expect(savedMemory.json().results.some(
        (memory: { content?: string }) => memory.content?.includes(SENTINEL),
      )).toBe(true);

      await server.close();
      server = undefined;
      await new Promise(resolve => setTimeout(resolve, 100));

      server = await buildLocalServer({ dataDir });
      markModelHealthy(server);
      resetRateLimiter(server);

      const afterRestart = await injectWithAuth(server, {
        method: 'GET',
        url: `/api/history?workspace=${workspaceA}&session=${sessionA1}`,
      });
      expect(afterRestart.statusCode).toBe(200);
      expect(afterRestart.json().messages.map(
        (message: { role: string; content: string }) => ({ role: message.role, content: message.content }),
      )).toEqual(exactTranscript);
      const foreignHistory = await injectWithAuth(server, {
        method: 'GET',
        url: `/api/history?workspace=${workspaceB}&session=${sessionA1}`,
      });
      expect(foreignHistory.statusCode).toBe(200);
      expect(foreignHistory.json().messages).toEqual([]);

      const sessionA2 = await createSession(server, workspaceA, 'Return session');
      const sessionB1 = await createSession(server, workspaceB, 'Isolation session');
      capturedConfigs.length = 0;

      const recalledInA = await chat(server, workspaceA, sessionA2, RECALL_MESSAGE);
      expect(recalledInA.statusCode).toBe(200);
      const eventsA = parseSse(recalledInA.body);
      const recallReceiptA = eventsA.find(
        event => event.event === 'tool_result' && event.data.name === 'auto_recall',
      );
      expect(String(recallReceiptA?.data.result)).toContain(SENTINEL);
      expect(capturedConfigs[0]?.messages.some(message => message.content.includes(SENTINEL))).toBe(false);
      expect(capturedConfigs[0]?.systemPrompt).toContain(SENTINEL);
      expect(eventsA.filter(event => event.event === 'token').map(event => event.data.content).join(''))
        .toBe(`I remember the launch codename: ${SENTINEL}.`);

      const isolatedInB = await chat(server, workspaceB, sessionB1, RECALL_MESSAGE);
      expect(isolatedInB.statusCode).toBe(200);
      const eventsB = parseSse(isolatedInB.body);
      const recallReceiptB = eventsB.find(
        event => event.event === 'tool_result' && event.data.name === 'auto_recall',
      );
      expect(recallReceiptB).toBeDefined();
      expect(recallReceiptB?.data.result).toBe('No relevant memories found');
      expect(eventsB.find(event => event.event === 'done')?.data.memoryContext)
        .toEqual({ included: false, count: 0 });
      expect(capturedConfigs).toHaveLength(2);
      const configB = capturedConfigs[1];
      if (!configB) throw new Error('Expected the workspace-B turn to reach the model');
      expect(configB.systemPrompt).not.toContain(SENTINEL);
      expect(eventsB.filter(event => event.event === 'token').map(event => event.data.content).join(''))
        .toBe('I do not have a saved launch codename in this workspace.');
    } finally {
      if (server) await server.close();
      closeAuditDb();
      await new Promise(resolve => setTimeout(resolve, 100));
      fs.rmSync(dataDir, { recursive: true, force: true });
      testState.runAgentLoop.mockReset();
    }
  }, 60_000);
});
