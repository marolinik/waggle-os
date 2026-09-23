/**
 * Characterization tests for the chat turn's preparation phase: everything
 * between the decision to run the agent loop and the first model attempt
 * (TD-CHAT-3 slice 14). Pinned before that phase moved to
 * `routes/chat-turn-preparation.ts`.
 *
 * Each exit below sits behind `!hasCustomRunner` and had no executing route
 * test: the workspace budget warning, the GEPA expansion events, the ambiguity
 * prefix and the template welcome context in the system prompt. The injected
 * `server.agentRunner` seam skips all of them, so these pins replace
 * `runAgentLoop` through a module mock.
 *
 * These pin CURRENT behavior, not a specification.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { AgentLoopConfig, AgentResponse } from '@waggle/agent';
import { WaggleConfig } from '@waggle/core';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const loop = vi.hoisted(() => ({ runAgentLoop: vi.fn() }));
const optimizer = vi.hoisted(() => ({
  result: { isVague: false, expanded: null as string | null, clarifyingQuestions: null as string[] | null, intent: 'request' },
}));

vi.mock('@waggle/agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@waggle/agent')>();
  return { ...actual, runAgentLoop: loop.runAgentLoop };
});

vi.mock('../../src/local/services/optimizer-service.js', () => ({
  getOptimizerService: async () => ({ expandWithChoices: async () => optimizer.result }),
}));

import { CostTracker } from '@waggle/agent';
import { buildLocalServer } from '../../src/local/index.js';
import { AMBIGUITY_PROMPT, buildTemplateWelcomePrompt } from '../../src/local/routes/chat-helpers.js';
import { BUILT_IN_TEMPLATES } from '../../src/local/routes/workspace-templates.js';
import { injectWithAuth, parseSSE, resetRateLimiter } from '../test-utils.js';

const NOT_VAGUE = { isVague: false, expanded: null, clarifyingQuestions: null, intent: 'request' };

describe('POST /api/chat preparation phase (characterization)', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-turn-preparation-'));
    server = await buildLocalServer({ dataDir: tmpDir });
    server.vault.set('anthropic', 'sk-preparation-pin');
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
    optimizer.result = { ...NOT_VAGUE };
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on Windows */ }
  });

  /** Answers every attempt and records the system prompt each one received. */
  function captureSystemPrompts(): string[] {
    const prompts: string[] = [];
    loop.runAgentLoop.mockImplementation(async (config: AgentLoopConfig): Promise<AgentResponse> => {
      prompts.push(config.systemPrompt);
      return { content: 'Here you go.', toolsUsed: [], usage: { inputTokens: 1, outputTokens: 1 } };
    });
    return prompts;
  }

  async function turn(message: string, session: string, workspace?: string) {
    resetRateLimiter(server);
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message, session, model: 'claude-sonnet-4-6', ...(workspace ? { workspace } : {}) },
    });
    if (workspace) server.sessionManager.close(workspace);
    const events = parseSSE(res.body);
    expect(events.some(e => e.event === 'done'), JSON.stringify(events.filter(e => e.event === 'error'))).toBe(true);
    return events;
  }

  const steps = (events: Array<{ event: string; data: string }>) =>
    events.filter(e => e.event === 'step').map(e => (JSON.parse(e.data) as { content: string }).content);

  function createWorkspace(label: string, extra: { templateId?: string } = {}): string {
    return server.workspaceManager.create({
      name: `preparation ${label} ${Date.now()}`, group: 'test', directory: tmpDir, ...extra,
    }).id;
  }

  it('warns once a workspace has spent its budget', async () => {
    const workspace = createWorkspace('budget');
    server.workspaceManager.update(workspace, { budget: 1 });
    vi.spyOn(CostTracker.prototype, 'getWorkspaceCost').mockReturnValue(2.5);
    captureSystemPrompts();
    const events = await turn('Compile the quarterly report', 'preparation-budget', workspace);
    expect(steps(events)).toContain('⚠️ Budget limit reached ($2.50 / $1.00). Responses may be limited.');
  });

  it('announces a GEPA expansion and offers its clarifying questions on the first message', async () => {
    optimizer.result = {
      isVague: true,
      expanded: 'Compile the Q3 revenue report with a regional breakdown.',
      clarifyingQuestions: ['Which quarter?'],
      intent: 'request',
    };
    captureSystemPrompts();
    const events = await turn('Compile the report', 'preparation-gepa');
    expect(steps(events)).toContain('GEPA: Expanded prompt for better results');
    const choices = events.find(e => e.event === 'gepa_choices');
    expect(choices && JSON.parse(choices.data)).toEqual({
      original: 'Compile the report',
      expanded: 'Compile the Q3 revenue report with a regional breakdown.',
      clarifyingQuestions: ['Which quarter?'],
      intent: 'request',
    });
  });

  it('prefixes the system prompt with the ambiguity guard for a vague first message only', async () => {
    const prompts = captureSystemPrompts();
    await turn('the thing', 'preparation-vague');
    await turn('Draft the quarterly report', 'preparation-clear');
    expect(prompts).toHaveLength(2);
    expect(prompts[0].startsWith(AMBIGUITY_PROMPT)).toBe(true);
    expect(prompts[1].startsWith(AMBIGUITY_PROMPT)).toBe(false);
  });

  it('adds the template welcome context on the first message in a template workspace', async () => {
    const template = BUILT_IN_TEMPLATES.find(t => t.id === 'sales-pipeline');
    expect(template).toBeDefined();
    const workspace = createWorkspace('template', { templateId: 'sales-pipeline' });
    const prompts = captureSystemPrompts();
    await turn('Compile the quarterly report', 'preparation-template', workspace);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain(buildTemplateWelcomePrompt(template!));
  });
});
