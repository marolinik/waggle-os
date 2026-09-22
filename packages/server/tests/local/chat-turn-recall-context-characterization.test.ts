/**
 * Characterization tests for the recalled-context cluster of one chat turn in
 * `routes/chat.ts` (TD-CHAT-3 prerequisite, docs/TESTING.md Safety Net Map).
 *
 * The turn keeps four hoisted mutable variables for the context it recalled
 * (`recalledContext`, `recallTextForAssembler`, `memoryContext`,
 * `workspaceSessionContext`). They are written at two sites (automatic memory
 * recall, workspace catch-up) and read at four: the PromptAssembler input, the
 * static system-prompt tail, the grounding guard, and the `done` receipt.
 *
 * Every write sits behind `!hasCustomRunner`, so the `server.agentRunner` seam
 * cannot reach this cluster. The seam here is the one
 * `persona-acceptance-prompt-budget.test.ts` uses: `runAgentLoop` is mocked at
 * the module boundary, so the real route runs every step up to the model call
 * and the captured config is exactly what the loop would have been handed.
 *
 * Before this file nothing pinned: that the recall block reaches the prompt
 * exactly once on BOTH prompt paths (W4.5 fixed a double inject once); that
 * the assembler is handed the unprefixed recall text; or the grounding guard
 * at all — its hedge note on the reply had no route-level test.
 *
 * These pin CURRENT behavior, not a specification.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { MindDB } from '@waggle/core';
import { Orchestrator, type AgentLoopConfig, type AgentResponse } from '@waggle/agent';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildLocalServer } from '../../src/local/index.js';
import { persistMessage } from '../../src/local/routes/chat-persistence.js';
import { injectWithAuth, resetRateLimiter, parseSseJson as parseSse } from '../test-utils.js';

const testState = vi.hoisted(() => ({
  runAgentLoop: vi.fn(),
  promptAssembler: true,
  recallScanMode: 'actual' as 'actual' | 'drop',
}));

vi.mock('@waggle/agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@waggle/agent')>();
  return {
    ...actual,
    runAgentLoop: testState.runAgentLoop,
    isEnabled: (flag: Parameters<typeof actual.isEnabled>[0]) => (
      flag === 'PROMPT_ASSEMBLER' ? testState.promptAssembler : actual.isEnabled(flag)
    ),
    scanForInjection: (text: string, context: 'user_input' | 'tool_output' = 'user_input') => {
      if (context === 'tool_output' && testState.recallScanMode === 'drop') {
        return { safe: false, score: 0.5, flags: ['test_recall_injection'] };
      }
      return actual.scanForInjection(text, context);
    },
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
    expandWithChoices: async () => ({ expanded: null, clarifyingQuestions: null, intent: 'request' }),
  }),
}));

const MODEL = 'openrouter/anthropic/claude-sonnet-5';
const MEMORY_SENTINEL = 'Recall Pin Sentinel: the launch moved to the Windows Solo track';
const RECALL_MESSAGE = 'Summarize our previous decision about the launch track.';
/** A reply asserting specifics that no memory or message contains. */
const UNGROUNDED_REPLY = 'We agreed on 17 pilot customers and a $4,200 budget.';

/**
 * The recall block's own header. The saved memory's TEXT is not a usable
 * marker: the static prompt also lists workspace memory under
 * `# Context From Your Memory`, and the assembled prompt under `# State`, so
 * the same memory legitimately appears in a prompt the recall never reached.
 */
const RECALL_HEADER = '# Recalled Memories';

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/** The text `recallMemory` returned on this turn — what the route adopted. */
async function recalledTextOf(spy: { mock: { results: Array<{ value: unknown }> } }): Promise<string> {
  expect(spy.mock.results).toHaveLength(1);
  return (await (spy.mock.results[0].value as Promise<{ text: string }>)).text;
}

describe('POST /api/chat recalled-context cluster (characterization)', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  let captured: AgentLoopConfig | null = null;
  let reply = 'Noted.';

  const runLoop = async (config: AgentLoopConfig): Promise<AgentResponse> => {
    captured = config;
    config.onToken?.(reply);
    return { content: reply, toolsUsed: [], usage: { inputTokens: 10, outputTokens: 10 } };
  };

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-chat-recall-'));
    new MindDB(path.join(tmpDir, 'personal.mind')).close();
    testState.runAgentLoop.mockImplementation(runLoop);
    server = await buildLocalServer({ dataDir: tmpDir });
    await server.agentState.orchestrator.executeTool('save_memory', {
      content: MEMORY_SENTINEL,
      importance: 'high',
    });
    server.agentState.llmProvider = {
      provider: 'litellm',
      health: 'healthy',
      detail: 'non-paid test double',
      checkedAt: new Date().toISOString(),
    };
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    resetRateLimiter(server);
    testState.runAgentLoop.mockReset().mockImplementation(runLoop);
    testState.promptAssembler = true;
    testState.recallScanMode = 'actual';
    captured = null;
    reply = 'Noted.';
  });

  afterAll(async () => {
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on Windows */ }
  });

  async function chat(message: string, session: string, workspace = 'default') {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message, model: MODEL, persona: 'general-purpose', session, workspace },
    });
    expect(res.statusCode).toBe(200);
    const events = parseSse(res.body);
    const recallResult = events.find(e => e.event === 'tool_result' && e.data.name === 'auto_recall');
    return {
      events,
      done: events.find(e => e.event === 'done')?.data,
      recalledCount: Number(String(recallResult?.data.result ?? '').match(/^(\d+) memories recalled:/)?.[1] ?? 0),
    };
  }

  it('static prompt path: appends the recalled text once, blank-line separated, and reports it on the done receipt', async () => {
    testState.promptAssembler = false;
    const recall = vi.spyOn(Orchestrator.prototype, 'recallMemory');

    const { done, recalledCount } = await chat(RECALL_MESSAGE, 'recall-static');

    const recalledText = await recalledTextOf(recall);
    expect(recalledText).toContain(MEMORY_SENTINEL);
    expect(recalledCount).toBeGreaterThan(0);
    expect(occurrences(captured!.systemPrompt, recalledText)).toBe(1);
    expect(captured!.systemPrompt).toContain(`\n\n${recalledText}`);
    expect(occurrences(captured!.systemPrompt, RECALL_HEADER)).toBe(1);
    expect(done?.memoryContext).toEqual({ included: true, count: recalledCount });
  });

  it('assembler path: hands the assembler the unprefixed recalled text and does not append it again', async () => {
    const recall = vi.spyOn(Orchestrator.prototype, 'recallMemory');
    const assemble = vi.spyOn(Orchestrator.prototype, 'buildAssembledPrompt');

    const { done, recalledCount } = await chat(RECALL_MESSAGE, 'recall-assembled');

    const recalledText = await recalledTextOf(recall);
    expect(recalledCount).toBeGreaterThan(0);
    expect(assemble).toHaveBeenCalledTimes(1);
    expect(assemble.mock.calls[0][2]?.recalledText).toBe(recalledText);
    expect(occurrences(captured!.systemPrompt, RECALL_HEADER)).toBe(1);
    expect(done?.memoryContext).toEqual({ included: true, count: recalledCount });
  });

  it('a dropped recall reaches neither prompt path nor the receipt, and hands the assembler empty text', async () => {
    testState.recallScanMode = 'drop';
    const assemble = vi.spyOn(Orchestrator.prototype, 'buildAssembledPrompt');

    const { done } = await chat(RECALL_MESSAGE, 'recall-dropped');

    expect(assemble.mock.calls[0][2]?.recalledText).toBe('');
    expect(captured!.systemPrompt).not.toContain(RECALL_HEADER);
    expect(done?.memoryContext).toEqual({ included: false, count: 0 });
  });

  it('grounding guard: hedges an amount absent from recalled memory', async () => {
    reply = UNGROUNDED_REPLY;

    const { done } = await chat(RECALL_MESSAGE, 'recall-grounding-hedge');

    // "17 pilot customers" is not classed as a hedge-worthy count; only the
    // amount is. Pinned as observed.
    expect(done?.content).toBe(
      `${UNGROUNDED_REPLY}\n\n---\n*Note: "$4,200" is not in your saved memory — please treat it as an assumption, not a recalled fact.*`,
    );
  });

  it('grounding guard: stays silent when no context was recalled', async () => {
    testState.recallScanMode = 'drop';
    reply = UNGROUNDED_REPLY;

    const { done } = await chat(RECALL_MESSAGE, 'recall-grounding-no-context');

    expect(done?.content).toBe(UNGROUNDED_REPLY);
  });

  it('workspace catch-up: adds recent sessions to the prompt and to the grounding evidence', async () => {
    const workspaceId = server.workspaceManager.create({ name: 'Recall pin catch-up', group: 'Test' }).id;
    persistMessage(tmpDir, workspaceId, 'recall-catch-up-prior', {
      role: 'user',
      content: 'What did the pilot cost?',
    });
    persistMessage(tmpDir, workspaceId, 'recall-catch-up-prior', {
      role: 'assistant',
      content: 'The pilot budget is $9,900 for 12 seats.',
    });
    reply = 'Last time: the pilot budget is $9,900, and we added 40 seats.';

    const { done } = await chat('Catch me up on this workspace', 'recall-catch-up-current', workspaceId);

    expect(captured!.systemPrompt).toContain('# Recent Workspace Sessions');
    expect(captured!.systemPrompt).toContain('The pilot budget is $9,900 for 12 seats.');
    expect(done?.content).toBe(
      `${reply}\n\n---\n*Note: "40 seats" is not in your saved memory — please treat it as an assumption, not a recalled fact.*`,
    );
  });
});
