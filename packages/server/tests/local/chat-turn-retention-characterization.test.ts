/**
 * Characterization tests for the retention flags of one chat turn in
 * `routes/chat.ts` (TD-CHAT-3 prerequisite, docs/TESTING.md Safety Net Map).
 *
 * Four hoisted mutable variables decide what a turn may leave behind:
 * `allowMemoryPersistence`, `allowDerivedPersistence`, `allowResponseDecoration`
 * and `toolFreeAdvisory`. They start from the turn's policy, then are settled a
 * second time once the session history is loaded: a first-turn explicit
 * tool-free advisory request, an exact saved-memory lookup, a valid single-file
 * read directive and a decision-matrix sequence each switch retention off.
 * Nothing pinned that second settlement per trigger.
 *
 * Each trigger is observed through effects the flags decide:
 *  - memory: the post-response `autoSaveFromExchange` (spied, resolves `[]`);
 *  - derived: the loop config's `skillDistillationGate` and `traceRecording`;
 *  - decoration: the `/schedule` suggestion on a reply about recurring work;
 *  - recall: the automatic `auto_recall` step, which a tool-free advisory
 *    turn (and every forced read-only tool) suppresses.
 *
 * The seam is `runAgentLoop` mocked at the module boundary: every memory write
 * sits behind `!hasCustomRunner`, so the `agentRunner` seam cannot see it. The
 * mock completes whichever read-only tool the route forces, because the route
 * refuses a turn whose forced tool did not run exactly once.
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
import { SCHEDULE_SUGGESTION } from '../../src/local/routes/chat-helpers.js';
import { injectWithAuth, resetRateLimiter, parseSseJson as parseSse } from '../test-utils.js';

const testState = vi.hoisted(() => ({ runAgentLoop: vi.fn() }));

vi.mock('@waggle/agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@waggle/agent')>();
  return { ...actual, runAgentLoop: testState.runAgentLoop };
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
/** A reply about recurring work, so a permitted decoration appends `/schedule`. */
const RECURRING_REPLY = 'Hold this launch review weekly with the whole team.';
const ORDINARY = 'Draft a short agenda for the launch review with the team.';
const TOOL_FREE_ADVISORY = 'Draft a short agenda for the launch review with the team. Do not use tools.';
const EXACT_MEMORY_LOOKUP = 'Search my saved memory for our pilot launch codename decision. What exact codename did we choose? Reply with only the codename. Do not write files or execute code.';
const READ_FILE_DIRECTIVE = 'Read README.md in this workspace, then return the exact file contents.';
const DECISION_MATRIX = 'Use the decision-matrix skill to compare Option A and Option B. Criteria: cost weight 5, speed 3, privacy 5. Scores: A 4/3/5; B 2/5/4. Show checksums, totals, recommendation, weakest critical criterion, and speed sensitivity.';

const DECISION_MATRIX_SEQUENCE = ['read_skill', 'calculate_decision_matrix'];

/** How the mock loop completes each read-only tool the route can force. */
const FORCED_TOOL_CALLS: Record<string, { input: Record<string, unknown>; result: string }> = {
  search_memory: { input: {}, result: 'ORCHID-RETENTION-PIN' },
  read_file: { input: { path: 'README.md' }, result: '# Retention pin readme' },
  read_skill: { input: { name: 'decision-matrix' }, result: '# Decision Matrix\nUse verified calculator output.' },
  calculate_decision_matrix: {
    input: {
      criteria: [{ name: 'Cost', weight: 5 }, { name: 'Speed', weight: 3 }, { name: 'Privacy', weight: 5 }],
      options: [{ name: 'Option A', scores: [4, 3, 5] }, { name: 'Option B', scores: [2, 5, 4] }],
    },
    result: '{"totals":[{"name":"Option A","total":54},{"name":"Option B","total":45}]}',
  },
};

type Retention = {
  recall: boolean;
  memory: boolean;
  skillDistillationGate: boolean | undefined;
  traceRecording: boolean;
  decoration: boolean;
};

const ALL_RETAINED: Retention = {
  recall: true,
  memory: true,
  skillDistillationGate: true,
  traceRecording: true,
  decoration: true,
};

const NOTHING_RETAINED = {
  memory: false,
  skillDistillationGate: false,
  traceRecording: false,
  decoration: false,
};

describe('POST /api/chat retention flags (characterization)', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  let workspaceId: string;
  let captured: AgentLoopConfig | null = null;

  const runLoop = async (config: AgentLoopConfig): Promise<AgentResponse> => {
    captured = config;
    const toolNames = config.tools.map(tool => tool.name);
    const forced = DECISION_MATRIX_SEQUENCE.every(name => toolNames.includes(name))
      ? DECISION_MATRIX_SEQUENCE
      : typeof config.toolChoice === 'string' ? [config.toolChoice] : [];
    for (const name of forced) {
      const call = FORCED_TOOL_CALLS[name];
      config.onToolUse?.(name, call.input);
      // A forced `read_file` only counts if the route's own wrapper executed
      // it, so that one runs the real tool against the seeded file.
      const result = name === 'read_file'
        ? await config.tools.find(tool => tool.name === name)!.execute(call.input)
        : call.result;
      config.onToolResult?.(name, call.input, result);
    }
    config.onToken?.(RECURRING_REPLY);
    return {
      content: RECURRING_REPLY,
      toolsUsed: [...forced],
      usage: { inputTokens: 10, outputTokens: 10 },
    };
  };

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-chat-retention-'));
    new MindDB(path.join(tmpDir, 'personal.mind')).close();
    testState.runAgentLoop.mockImplementation(runLoop);
    server = await buildLocalServer({ dataDir: tmpDir });
    workspaceId = server.workspaceManager.create({ name: 'Retention pins', group: 'Test' }).id;
    const filesDir = path.join(tmpDir, 'workspaces', workspaceId, 'files');
    fs.mkdirSync(filesDir, { recursive: true });
    fs.writeFileSync(path.join(filesDir, 'README.md'), '# Retention pin readme\n');
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
    captured = null;
  });

  afterAll(async () => {
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on Windows */ }
  });

  async function observe(message: string, session: string, workspace = 'default'): Promise<Retention> {
    resetRateLimiter(server);
    captured = null;
    const autoSave = vi.spyOn(Orchestrator.prototype, 'autoSaveFromExchange').mockResolvedValue([]);
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message, model: MODEL, persona: 'general-purpose', session, workspace },
    });
    expect(res.statusCode).toBe(200);
    const events = parseSse(res.body);
    const done = events.find(e => e.event === 'done')?.data;
    expect(done, JSON.stringify(events.find(e => e.event === 'error')?.data)).toBeDefined();
    expect(captured).not.toBeNull();
    const observed: Retention = {
      recall: events.some(e => e.event === 'tool' && e.data.name === 'auto_recall'),
      memory: autoSave.mock.calls.length > 0,
      skillDistillationGate: captured!.skillDistillationGate,
      traceRecording: captured!.traceRecording !== undefined,
      decoration: String(done!.content).endsWith(SCHEDULE_SUGGESTION),
    };
    autoSave.mockRestore();
    return observed;
  }

  it('an ordinary turn retains everything', async () => {
    expect(await observe(ORDINARY, 'retention-ordinary')).toEqual(ALL_RETAINED);
  });

  it('a first-turn tool-free advisory request retains nothing and skips recall', async () => {
    expect(await observe(TOOL_FREE_ADVISORY, 'retention-tool-free-first')).toEqual({
      recall: false,
      ...NOTHING_RETAINED,
    });
  });

  it('the same tool-free request later in a conversation is an ordinary turn', async () => {
    const session = 'retention-tool-free-later';
    await observe(ORDINARY, session);

    expect(await observe(TOOL_FREE_ADVISORY, session)).toEqual(ALL_RETAINED);
  });

  it.each([
    ['an exact saved-memory lookup', EXACT_MEMORY_LOOKUP, false],
    ['a valid single-file read directive', READ_FILE_DIRECTIVE, true],
    ['a decision-matrix sequence', DECISION_MATRIX, false],
  ])('%s retains nothing and skips recall', async (label, message, inWorkspace) => {
    const observed = await observe(
      message,
      `retention-${label.replace(/\W+/g, '-')}`,
      inWorkspace ? workspaceId : 'default',
    );

    expect(observed).toEqual({ recall: false, ...NOTHING_RETAINED });
  });
});
