/**
 * Characterization tests for the chat turn's completion phase: everything
 * between the model's final answer and the end of the handler (TD-CHAT-3
 * slice 13). Pinned before that phase moved to `routes/chat-turn-completion.ts`.
 *
 * Each exit below sat behind `!hasCustomRunner` and had no executing test:
 * the closed-learning-loop directive, knowledge-graph extraction, correction
 * and capability-gap signals, workflow capture, the schedule suggestion and
 * the surfaced-signal commit. The injected `server.agentRunner` seam skips all
 * of them, so these pins replace `runAgentLoop` through a module mock.
 *
 * These pin CURRENT behavior, not a specification.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { AgentLoopConfig, AgentResponse } from '@waggle/agent';
import { ImprovementSignalStore, KnowledgeGraph, WaggleConfig } from '@waggle/core';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const loop = vi.hoisted(() => ({ runAgentLoop: vi.fn() }));

vi.mock('@waggle/agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@waggle/agent')>();
  return { ...actual, runAgentLoop: loop.runAgentLoop };
});

import { Orchestrator } from '@waggle/agent';
import { buildLocalServer } from '../../src/local/index.js';
import { SCHEDULE_SUGGESTION } from '../../src/local/routes/chat-helpers.js';
import { injectWithAuth, parseSSE, resetRateLimiter } from '../test-utils.js';

describe('POST /api/chat completion phase (characterization)', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-turn-completion-'));
    server = await buildLocalServer({ dataDir: tmpDir });
    server.vault.set('anthropic', 'sk-completion-pin');
    server.agentState.llmProvider = {
      provider: 'anthropic-proxy',
      health: 'healthy',
      detail: 'test',
      checkedAt: new Date().toISOString(),
    };
    new WaggleConfig(tmpDir).save();
  });

  afterEach(() => {
    loop.runAgentLoop.mockReset();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on Windows */ }
  });

  function answer(content: string, toolsUsed: string[] = []): void {
    loop.runAgentLoop.mockImplementation(async (_config: AgentLoopConfig): Promise<AgentResponse> => ({
      content, toolsUsed, usage: { inputTokens: 1, outputTokens: 1 },
    }));
  }

  async function turn(message: string, session: string) {
    resetRateLimiter(server);
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message, session, model: 'claude-sonnet-4-6' },
    });
    const events = parseSSE(res.body);
    const done = events.find(e => e.event === 'done');
    expect(done, JSON.stringify(events.filter(e => e.event === 'error'))).toBeDefined();
    return { events, done: JSON.parse(done!.data) as { content: string } };
  }

  it('surfaces the skill-distillation directive and records a skill_promotion signal after a five-tool turn', async () => {
    const record = vi.spyOn(ImprovementSignalStore.prototype, 'record');
    answer('The report is ready.', ['search_memory', 'read_file', 'web_search', 'write_file', 'list_files']);
    const { events } = await turn('Compile the quarterly report', 'completion-distill');
    const steps = events.filter(e => e.event === 'step').map(e => (JSON.parse(e.data) as { content: string }).content);
    expect(steps.some(s => s.startsWith('You just completed a 5-tool task successfully.'))).toBe(true);
    expect(record.mock.calls.some(([category]) => category === 'skill_promotion')).toBe(true);
  });

  it('adds technology entities from a long answer to the knowledge graph', async () => {
    const createEntity = vi.spyOn(KnowledgeGraph.prototype, 'createEntity');
    answer('We compared several stacks and settled on TypeScript with React for the client, since the team already knows both and the tooling is mature.');
    await turn('Which frontend stack did we pick?', 'completion-kg');
    const names = createEntity.mock.calls.map(([type, name]) => `${type}:${name}`);
    expect(names).toEqual(expect.arrayContaining(['technology:Typescript', 'technology:React']));
  });

  it('records a correction signal for a correcting user message', async () => {
    const record = vi.spyOn(ImprovementSignalStore.prototype, 'record');
    answer('Understood, I will use TypeScript.');
    await turn("That's wrong, I said use TypeScript for the client.", 'completion-correction');
    expect(record.mock.calls.some(([category]) => category === 'correction')).toBe(true);
  });

  it('records a capability gap when the answer reports a missing tool', async () => {
    const record = vi.spyOn(ImprovementSignalStore.prototype, 'record');
    answer('I could not do that: Tool "zap_tool" not found. Here are alternatives.');
    await turn('Zap the backlog', 'completion-gap');
    expect(record).toHaveBeenCalledWith('capability_gap', 'missing:zap_tool', undefined, expect.anything());
  });

  it('suggests capturing a workflow repeated across three sessions', async () => {
    // Tool names no other test here uses: every session on this server with
    // tools counts toward the match, so a shared name would fire it early.
    const tools = ['git_status', 'git_diff', 'git_log'];
    answer('Done.', tools);
    const first = await turn('Research the vendor', 'completion-capture-1');
    const second = await turn('Research the next vendor', 'completion-capture-2');
    const third = await turn('Research one more vendor', 'completion-capture-3');
    const captured = (events: Array<{ event: string; data: string }>) => events
      .filter(e => e.event === 'notification')
      .some(e => (JSON.parse(e.data) as { type: string }).type === 'workflow_captured');
    expect(captured(first.events)).toBe(false);
    expect(captured(second.events)).toBe(false);
    expect(captured(third.events)).toBe(true);
  });

  it('appends the schedule suggestion to an answer about recurring work', async () => {
    answer('Run this check weekly to keep the numbers current.');
    const { done } = await turn('How often should I check the numbers?', 'completion-schedule');
    expect(done.content.endsWith(SCHEDULE_SUGGESTION)).toBe(true);
  });

  it('commits the surfaced signals once the model call succeeded', async () => {
    const commit = vi.spyOn(Orchestrator.prototype, 'commitSurfacedSignals');
    answer('Here is the summary.');
    await turn('Summarize our plan', 'completion-commit-signals');
    expect(commit).toHaveBeenCalledTimes(1);
  });
});
