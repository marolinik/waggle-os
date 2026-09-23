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
import { injectWithAuth, resetRateLimiter, parseSSE } from '../test-utils.js';

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

  it('rejects a non-string message', async () => {
    // Row-54 Gap: every other wire field had a type pin except the one field
    // the route cannot run without.
    const { status, body } = await post({ message: 42 });
    expect(status).toBe(400);
    expect(body).toEqual({ error: 'message must be a string', code: 'INVALID_FIELD_TYPE' });
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
  /**
   * Review Critical #1: a request-supplied `workspacePath` stays anchored to
   * dataDir. The guard had no test at all before 2026-09-22 (TD-CHAT-33 pin),
   * so nothing proved a traversal attempt is refused rather than merely
   * normalised, and nothing proved a legitimate path still runs.
   */
  describe('request-supplied workspacePath (characterization)', () => {
    it('refuses a path outside the data directory before the runner', async () => {
      const outside = path.join(os.tmpdir(), 'waggle-traversal-outside');

      const { status, body } = await post({ message: 'traversal attempt', workspacePath: outside });

      expect(status).toBe(400);
      expect(body).toEqual({ error: 'Invalid workspace path', code: 'PATH_TRAVERSAL' });
    });

    it('refuses a relative escape out of the data directory', async () => {
      const escape = path.join(tmpDir, '..', 'waggle-traversal-escape');

      const { status, body } = await post({ message: 'traversal attempt', workspacePath: escape });

      expect(status).toBe(400);
      expect(body.code).toBe('PATH_TRAVERSAL');
    });

    it('runs a turn for a path inside the data directory', async () => {
      const inside = path.join(tmpDir, 'workspaces', 'anchored-files');
      fs.mkdirSync(inside, { recursive: true });
      resetRateLimiter(server);

      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: { message: 'an anchored turn', workspacePath: inside, session: 'anchored-path' },
      });

      expect(res.statusCode).toBe(200);
      expect(parseSSE(res.body).some(e => e.event === 'done')).toBe(true);
    });
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

  it('/catchup with persisted memory denied presents the disabled notice as the briefing', async () => {
    const { content } = await commandTurn('/catchup - do not use my saved memory');
    // QUIRK (docs/TECH-DEBT.md TD-CHAT-1): only the no-state sentinel is
    // recognised, so the disabled notice is introduced as workspace activity.
    expect(content).toBe(
      "## Catch-Up Briefing\n\nHere's what's been happening in this workspace:\n\nPersisted workspace state is disabled for this turn.",
    );
  });

  it('/now with persisted memory denied presents the disabled notice as current state', async () => {
    const { content } = await commandTurn('/now - do not use my saved memory');
    // QUIRK (docs/TECH-DEBT.md TD-CHAT-1), as for /catchup.
    expect(content).toBe('## Right Now\n\nPersisted workspace state is disabled for this turn.');
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

  // `activateWorkspaceMind` also sets the server's closure-held active id and
  // the orchestrator's workspace mind, which the property reset below cannot
  // reach. Close every mind a test activated, so no test depends on running
  // last (TD-TEST-6).
  const activatedWorkspaceIds: string[] = [];

  afterEach(async () => {
    for (const workspaceId of activatedWorkspaceIds.splice(0)) {
      (await server.agentState.closeWorkspaceMind(workspaceId)).release();
    }
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
    activatedWorkspaceIds.push(workspace.id);
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
 * which is the sensing point these pins use.
 *
 * This comment used to say a lookup that throws is swallowed (QUIRK TD-CHAT-23)
 * and that an unreadable payload is cached before validation (QUIRK TD-CHAT-30).
 * Both were closed in Phase 4 and the two tests directly below now assert the
 * opposite: the lookup returns a discriminated outcome rather than throwing, an
 * unreadable payload refuses the turn, and it is validated before it is cached.
 * What remains of TD-CHAT-23 is only the soft-failure branch ('unavailable'),
 * which warns and then runs the turn ungoverned — not pinned here.
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

  it('refuses the turn when the team server cannot be reached and nothing is cached', async () => {
    // TD-CHAT-23's last open half, now closed. This pin was written against the
    // OLD behavior first (the turn completed with `governancePolicies`
    // undefined) and then inverted, so the diff between the two commits is the
    // behavior change itself.
    //
    // `unavailable` is narrower than it sounds: `chat-governance.ts:119` serves
    // a stale cached policy when the call fails, so this branch is reached only
    // when no policy has ever been fetched for this workspace in this process.
    // The workspace id is unique per test, so the cache is genuinely cold.
    //
    // WHAT THIS CAN AND CANNOT SEE. The branch decides one value -
    // `governancePolicies` - with three downstream readers: the parent tool
    // filter (`chat.ts:3492-3496`), the spawn list beside it, and
    // `securityContext.blockedTools` for children (`:3639`). None is reachable
    // from here: the first two sit inside `if (!hasCustomRunner)`, which the
    // injected `agentRunner` seam skips wholesale (docs/TESTING.md "Seam
    // caveat", TD-CHAT-16), and the third is captured by the spawn closure
    // rather than exposed on `AgentLoopConfig`. `captured.tools` is empty here
    // for that reason, so an assertion about a tool being present or absent
    // would be vacuous. Refusing the turn is observable, which is precisely why
    // the fixed behavior pins more tightly than the bug did.
    const workspaceId = createTeamWorkspace('unreachable');
    const downSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => (
      String(input).endsWith(POLICY_PATH)
        ? new Response('gateway down', { status: 502 })
        : new Response('', { status: 503 })
    ));
    try {
      const res = await postTurn(workspaceId, 'unreachable governance turn', 'gov-unreachable');
      expect(res.statusCode).toBe(200);

      const events = parseSSE(res.body);
      expect(events.some(e => e.event === 'done')).toBe(false);
      const error = events.find(e => e.event === 'error');
      expect(error).toBeDefined();
      // Distinct from the unreadable-payload message above: that one is a fault
      // to report to an admin, this one is worth retrying.
      expect(JSON.parse(error!.data).message).toBe(
        'Team governance policies could not be reached for this workspace. Check your connection and try again.',
      );

      // The runner is never reached, so no ungoverned turn can have run.
      expect(captured).toHaveLength(0);

      // The lookup really was attempted - without this the assertions above
      // would also pass for a workspace with no team server at all.
      expect(policyCallCount(downSpy)).toBe(1);
    } finally {
      downSpy.mockRestore();
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
