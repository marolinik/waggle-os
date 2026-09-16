/**
 * Characterization tests for POST /api/chat request validation.
 *
 * These pin CURRENT behavior of branches the existing chat suites did not
 * reach (coverage run 2026-09-14, docs/TESTING.md Safety Net Map). They are
 * not a spec: if one fails after a refactor, the refactor changed behavior.
 * Bugs found while pinning are recorded in docs/TECH-DEBT.md, never fixed here.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { AgentLoopConfig, AgentResponse } from '@waggle/agent';
import { WaggleConfig } from '@waggle/core';
import { GENERATION_FAILED_PREFIX } from '@waggle/shared';
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

describe('POST /api/chat request validation (characterization)', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  let runnerCalls = 0;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-chat-char-'));
    server = await buildLocalServer({ dataDir: tmpDir });
    // Object seam: the route reads server.agentRunner; a rejected request must
    // never reach it, so the counter doubles as a sensing point.
    server.agentRunner = async (_config: AgentLoopConfig): Promise<AgentResponse> => {
      runnerCalls += 1;
      return { content: 'unreachable', toolsUsed: [], usage: { inputTokens: 1, outputTokens: 1 } };
    };
  });

  afterAll(async () => {
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on Windows */ }
  });

  /** Posts a request that must be rejected before the agent runner seam. */
  async function post(payload: Record<string, unknown>) {
    const runnerCallsBefore = runnerCalls;
    const res = await injectWithAuth(server, { method: 'POST', url: '/api/chat', payload });
    expect(runnerCalls).toBe(runnerCallsBefore);
    return { status: res.statusCode, body: res.json() as { error?: string; code?: string } };
  }

  it('rejects a non-boolean retry flag', async () => {
    const { status, body } = await post({ message: 'hi', retry: 'yes' });
    expect(status).toBe(400);
    expect(body).toEqual({ error: 'retry must be a boolean', code: 'INVALID_FIELD_TYPE' });
  });

  it.each([
    ['string', 'tail'],
    ['array', [1]],
    ['missing expectedMessageCount', { kind: 'lone-user' }],
    ['zero expectedMessageCount', { kind: 'lone-user', expectedMessageCount: 0 }],
    ['non-integer expectedMessageCount', { kind: 'lone-user', expectedMessageCount: 1.5 }],
    ['unknown kind', { kind: 'other', expectedMessageCount: 1 }],
    ['lone-user with extra key', { kind: 'lone-user', expectedMessageCount: 1, extra: true }],
    ['assistant-pair without content', { kind: 'assistant-pair', expectedMessageCount: 2 }],
    ['assistant-pair with non-string content', { kind: 'assistant-pair', expectedMessageCount: 2, expectedAssistantContent: 5 }],
  ])('rejects a malformed retryTarget (%s)', async (_label, retryTarget) => {
    const { status, body } = await post({ message: 'hi', retry: true, retryTarget });
    expect(status).toBe(400);
    expect(body).toEqual({ error: 'retryTarget is invalid', code: 'INVALID_RETRY_TARGET' });
  });

  it.each([
    ['lone-user', { kind: 'lone-user', expectedMessageCount: 1 }],
    ['assistant-pair', { kind: 'assistant-pair', expectedMessageCount: 2, expectedAssistantContent: 'prior' }],
  ])('rejects a well-formed %s retryTarget when retry is not true', async (_label, retryTarget) => {
    const { status, body } = await post({ message: 'hi', retryTarget });
    expect(status).toBe(400);
    expect(body).toEqual({ error: 'retryTarget requires retry: true', code: 'INVALID_RETRY_TARGET' });
  });

  it.each([
    ['workspace', { workspace: 123 }],
    ['workspaceId', { workspaceId: { id: 'x' } }],
    ['session', { session: false }],
    ['sessionId', { sessionId: ['a'] }],
  ])('rejects a non-string %s segment', async (field, extra) => {
    const { status, body } = await post({ message: 'hi', ...extra });
    expect(status).toBe(400);
    expect(body).toEqual({ error: `${field} must be a string`, code: 'INVALID_FIELD_TYPE' });
  });

  it.each(['workspace', 'workspaceId', 'session', 'sessionId'])(
    'rejects a %s segment longer than 200 chars',
    async (field) => {
      const { status, body } = await post({ message: 'hi', [field]: 'a'.repeat(201) });
      expect(status).toBe(400);
      expect(body).toEqual({ error: `${field} is too long (max 200 chars)`, code: 'INVALID_FIELD_LENGTH' });
    },
  );

  it('accepts a 200-char segment (boundary) and proceeds to the SSE turn', async () => {
    // 200 'a's is a safe segment: the length gate passes and the turn streams
    // through the agent runner seam exactly once.
    const runnerCallsBefore = runnerCalls;
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'hi', session: 'a'.repeat(200) },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(runnerCalls).toBe(runnerCallsBefore + 1);
  });
});

describe('POST /api/chat slash-command turns (characterization)', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-chat-char-cmd-'));
    server = await buildLocalServer({ dataDir: tmpDir });
    server.agentRunner = async (_config: AgentLoopConfig): Promise<AgentResponse> => {
      throw new Error('slash commands must not reach the agent runner');
    };
  });

  afterAll(async () => {
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on Windows */ }
  });

  /**
   * Returns the `done` event payload of a command turn. Every command turn
   * terminates before the agent loop, so it always reports empty tools and
   * zero usage.
   */
  async function commandTurn(message: string): Promise<{ content: string }> {
    const res = await injectWithAuth(server, { method: 'POST', url: '/api/chat', payload: { message } });
    expect(res.statusCode).toBe(200);
    const done = res.body
      .split(/\n\n/)
      .filter(block => block.startsWith('event: done'))
      .map(block => JSON.parse(block.split('\n').find(l => l.startsWith('data: '))!.slice(6)));
    expect(done).toHaveLength(1);
    expect(done[0]).toMatchObject({
      toolsUsed: [],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    });
    return done[0];
  }

  it('/skills renders every loaded skill as a bullet when persisted memory reads are allowed', async () => {
    // buildLocalServer seeds the starter skills into <dataDir>/skills, so the
    // list is never empty in this harness; pin the rendered list verbatim.
    const names = server.agentState.skills.map(skill => skill.name);
    expect(names.length).toBeGreaterThan(0);
    const { content } = await commandTurn('/skills');
    expect(content).toBe(
      `## Active Skills\n\n${names.map(name => `- \`${name}\``).join('\n')}\n\n_${names.length} skill(s) loaded._`,
    );
  });

  it('/skills reports no skills when the turn denies persisted memory reads', async () => {
    const { content } = await commandTurn('/skills - do not use my saved memory');
    expect(content).toBe('## Active Skills\n\nNo skills are currently active in this workspace.');
  });

  it('/memory <query> against an empty personal mind reports no matches', async () => {
    const { content } = await commandTurn('/memory architecture decisions');
    expect(content).toBe('## Memory Search: "architecture decisions"\n\nNo relevant memories found.');
  });

  it('/memory <query> is refused when the turn denies persisted memory reads', async () => {
    const { content } = await commandTurn('/memory architecture - do not use my saved memory');
    // QUIRK (docs/TECH-DEBT.md TD-CHAT-2): the deny suffix is part of the query
    // text echoed back in the heading.
    expect(content).toBe(
      '## Memory Search: "architecture - do not use my saved memory"\n\nPersisted memory access is disabled for this turn.',
    );
  });

  it('/status on a fresh personal chat reports only the skills count', async () => {
    const { content } = await commandTurn('/status');
    expect(content).toBe(`## Status Report\n\n**Skills loaded:** ${server.agentState.skills.length}`);
  });

  it('/status with persisted memory denied leaks the disabled sentinel as a report section', async () => {
    const { content } = await commandTurn('/status - do not use my saved memory');
    // QUIRK (docs/TECH-DEBT.md TD-CHAT-1): getWorkspaceState() returns the
    // "disabled" sentinel, and statusCommand only filters the
    // 'No workspace state available.' sentinel, so the disabled notice is
    // rendered as if it were workspace state. Pinned, not fixed.
    expect(content).toBe(
      '## Status Report\n\nPersisted workspace state is disabled for this turn.\n\n**Skills loaded:** 0',
    );
  });
});

describe('POST /api/chat workspace resolution rejections (characterization)', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-chat-char-ws-'));
    server = await buildLocalServer({ dataDir: tmpDir });
    server.agentRunner = async (_config: AgentLoopConfig): Promise<AgentResponse> => {
      throw new Error('a rejected workspace resolution must not reach the agent runner');
    };
  });

  afterEach(() => {
    server.agentState.activeWorkspaceId = null;
  });

  afterAll(async () => {
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on Windows */ }
  });

  it('returns 409 WORKSPACE_ROOT_UNAVAILABLE when the supplied workspace directory is missing', async () => {
    const workspace = server.workspaceManager.create({
      name: 'missing-root',
      group: 'test',
      directory: path.join(tmpDir, 'no-such-dir'),
    });
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'hi', workspace: workspace.id },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({
      error: 'Configured workspace directory is unavailable',
      code: 'WORKSPACE_ROOT_UNAVAILABLE',
    });
  });

  it('returns 409 WORKSPACE_NOT_READY when the active workspace is the literal default with no config', async () => {
    // 'default' skips the unknown-workspace 404 (legacy default history), and
    // workspace minds open lazily, so the only reachable NOT_READY trigger is an
    // authorized 'default' id that has no workspace config behind it.
    expect(server.workspaceManager.get('default')).toBeFalsy();
    server.agentState.activeWorkspaceId = 'default';
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'hi' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'Active workspace is unavailable', code: 'WORKSPACE_NOT_READY' });
  });

  it('returns 409 WORKSPACE_ROOT_UNAVAILABLE when the active workspace directory is missing', async () => {
    const workspace = server.workspaceManager.create({
      name: 'active-missing-root',
      group: 'test',
      directory: path.join(tmpDir, 'no-such-active-dir'),
    });
    expect(server.agentState.activateWorkspaceMind(workspace.id)).toBe(true);
    server.agentState.activeWorkspaceId = workspace.id;
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'hi' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'Active workspace directory unavailable', code: 'WORKSPACE_ROOT_UNAVAILABLE' });
  });
});

/**
 * The governance lookup for a team workspace and the swallow that follows it.
 *
 * The lookup is not gated by the injected-runner flag, so the object seam still
 * runs it and the resolved policies arrive on the config the runner receives —
 * which is the sensing point these pins use. A lookup that throws is swallowed
 * and the turn runs with no policy at all (QUIRK TD-CHAT-23); a payload that
 * cannot be read is cached before it is validated (QUIRK TD-CHAT-30).
 */
describe('POST /api/chat team governance lookup (characterization)', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  let captured: AgentLoopConfig[];
  let runnerBehavior: 'ok' | 'throw';

  const POLICY_PATH = '/api/teams/default/capability-policies';
  const TEAM_SERVER_URL = 'https://93.184.216.34';
  const TEAM_SERVER_TOKEN = 'gov-char-token';

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-chat-char-gov-'));
    server = await buildLocalServer({ dataDir: tmpDir });
    captured = [];
    runnerBehavior = 'ok';
    server.agentRunner = async (config: AgentLoopConfig): Promise<AgentResponse> => {
      captured.push(config);
      if (runnerBehavior === 'throw') throw new Error('governance characterization runner failure');
      return { content: 'ok', toolsUsed: [], usage: { inputTokens: 1, outputTokens: 1 } };
    };
    // The helper builds a fresh WaggleConfig per call and reads it from disk,
    // so the team server only becomes visible once it is saved.
    const config = new WaggleConfig(tmpDir);
    config.setTeamServer({ url: TEAM_SERVER_URL, token: TEAM_SERVER_TOKEN });
    config.save();
  });

  beforeEach(() => {
    resetRateLimiter(server);
    captured.length = 0;
    runnerBehavior = 'ok';
  });

  afterAll(async () => {
    const config = new WaggleConfig(tmpDir);
    config.clearTeamServer();
    config.save();
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on Windows */ }
  });

  /**
   * A team workspace with a unique id per test. The governance policy cache is
   * module-level, keyed by workspace id, with a five-minute TTL and no reset
   * export, so a shared id would leak one test's payload into the next.
   */
  function createTeamWorkspace(label: string): string {
    const nonce = `${label}-${Date.now()}-${Math.round(performance.now() * 1000)}`;
    const workspace = server.workspaceManager.create({ name: `gov char ${nonce}`, group: 'test' });
    server.workspaceManager.update(workspace.id, {
      teamId: `gov-char-team-${nonce}`,
      teamServerUrl: TEAM_SERVER_URL,
      teamRole: 'member',
    });
    return workspace.id;
  }

  /** Answers the capability-policies call with `payload`; every other host fails. */
  function stubPolicyFetch(payload: unknown) {
    return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => (
      String(input).endsWith(POLICY_PATH)
        ? new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } })
        : new Response('', { status: 503 })
    ));
  }

  /** Counts only the governance calls — the guard layer may reach other hosts. */
  function policyCallCount(spy: ReturnType<typeof stubPolicyFetch>): number {
    return spy.mock.calls.filter(call => String(call[0]).endsWith(POLICY_PATH)).length;
  }

  async function postTurn(workspaceId: string, message: string, session: string) {
    return injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message, workspace: workspaceId, session },
    });
  }

  it('hands the role-matched blockedTools to the runner for a team workspace', async () => {
    const workspaceId = createTeamWorkspace('resolved');
    const fetchSpy = stubPolicyFetch([
      { role: 'admin', blockedTools: ['delete_workspace'] },
      { role: 'member', blockedTools: ['bash', 'write_file'] },
    ]);
    try {
      const res = await postTurn(workspaceId, 'governance resolved turn', 'gov-resolved');
      expect(res.statusCode).toBe(200);
      expect(parseSSE(res.body).some(e => e.event === 'done')).toBe(true);
      expect(captured.at(-1)!.governancePolicies).toEqual({ blockedTools: ['bash', 'write_file'] });
      expect(policyCallCount(fetchSpy)).toBe(1);
      // Locate the governance call by URL: the egress guard may reach other
      // hosts first, so a positional lookup reads the wrong request.
      const policyCall = fetchSpy.mock.calls.find(call => String(call[0]).endsWith(POLICY_PATH));
      expect(new Headers(policyCall![1]?.headers).get('authorization'))
        .toBe(`Bearer ${TEAM_SERVER_TOKEN}`);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('refuses the turn when the governance payload cannot be read', async () => {
    const workspaceId = createTeamWorkspace('unreadable');
    // A policies array holding a non-object element: the role lookup reads a
    // field on every element, so this payload cannot be read at all.
    const fetchSpy = stubPolicyFetch([null, { role: 'member', blockedTools: ['bash'] }]);
    try {
      // An unreadable answer is a fault, not an absent policy: the turn is
      // refused rather than run with the team's restrictions dropped. The runner
      // is never reached and the stream carries an error instead of a
      // completion.
      for (const session of ['gov-unreadable-1', 'gov-unreadable-2']) {
        const res = await postTurn(workspaceId, `governance unreadable ${session}`, session);
        expect(res.statusCode).toBe(200);
        const events = parseSSE(res.body);
        expect(events.some(e => e.event === 'done')).toBe(false);
        const error = events.find(e => e.event === 'error');
        expect(error).toBeDefined();
        expect(JSON.parse(error!.data).message).toBe(
          'Team governance policies could not be verified for this workspace. Try again or contact your team admin.',
        );
      }
      expect(captured).toHaveLength(0);

      // One call per turn: an unreadable payload is never cached, so a single
      // bad response cannot decide the whole five-minute window.
      expect(policyCallCount(fetchSpy)).toBe(2);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('persists a failed assistant turn when a team turn errors before commit', async () => {
    // The territory a failing governance lookup reaches once it stops being
    // swallowed: the pre-commit error path. Triggered here through the runner so
    // it pins current behavior independently of the governance catch.
    const workspaceId = createTeamWorkspace('error-path');
    const session = 'gov-error-path';
    const fetchSpy = stubPolicyFetch([{ role: 'member', blockedTools: [] }]);
    try {
      runnerBehavior = 'throw';
      const res = await postTurn(workspaceId, 'a team turn that fails before commit', session);
      expect(res.statusCode).toBe(200);
      const events = parseSSE(res.body);
      expect(events.some(e => e.event === 'done')).toBe(false);
      const error = events.find(e => e.event === 'error');
      expect(error).toBeDefined();
      // The outer catch forwards an unclassified message verbatim (TD-CHAT-15).
      expect(JSON.parse(error!.data).message).toBe('governance characterization runner failure');
    } finally {
      fetchSpy.mockRestore();
    }

    const history = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/history?workspace=${encodeURIComponent(workspaceId)}&session=${encodeURIComponent(session)}`,
    });
    expect(history.statusCode).toBe(200);
    const messages = history.json() as { messages?: Array<{ role: string; content: string }> };
    const assistant = (messages.messages ?? []).filter(m => m.role === 'assistant');
    expect(assistant.at(-1)!.content).toBe(
      `${GENERATION_FAILED_PREFIX}governance characterization runner failure`,
    );
  });
});
