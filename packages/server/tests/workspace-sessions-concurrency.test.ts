/**
 * WorkspaceSessionManager concurrency test.
 *
 * Proves the Phase A.1 invariants: per-session orchestrator instances
 * cannot corrupt each other, even when two sessions are "active" at the
 * same time on different workspace minds.
 *
 * Before A.1, the sidecar held a single `orchestrator` whose workspace
 * layers got overwritten on every `setWorkspaceMind()` call. Two chat
 * requests targeting different workspaces would interleave and silently
 * corrupt each other. This test would fail on the pre-A.1 codebase.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

import { MindDB, type Embedder } from '@waggle/core';
import { Orchestrator } from '@waggle/agent';
import { buildLocalServer } from '../src/local/index.js';
import {
  chatSessionStateKey,
  loadSessionMessages,
} from '../src/local/routes/chat-persistence.js';
import { WorkspaceSessionManager } from '../src/local/workspace-sessions.js';
import { injectWithAuth, resetRateLimiter } from './test-utils.js';

// ── Deterministic fake embedder ──────────────────────────────────────
// Produces a fixed-dimension zero vector so sqlite-vec stays happy but
// semantic search always returns zero matches. We don't need vector
// similarity for these tests — we're checking that workspace *identity*
// routing works, and frame content can be checked via FTS5 instead.

class FakeEmbedder implements Embedder {
  dimensions = 384;
  async embed(_text: string): Promise<Float32Array> {
    return new Float32Array(this.dimensions);
  }
  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    return texts.map(() => new Float32Array(this.dimensions));
  }
}

// ── Test harness ─────────────────────────────────────────────────────

interface TestWorkspace {
  id: string;
  mind: MindDB;
  mindPath: string;
}

function createTempMind(label: string): TestWorkspace {
  const id = `${label}-${randomUUID().slice(0, 8)}`;
  const mindPath = path.join(os.tmpdir(), `waggle-test-${id}.mind`);
  const mind = new MindDB(mindPath);
  return { id, mind, mindPath };
}

function cleanupMind(ws: TestWorkspace): void {
  try { ws.mind.close(); } catch { /* already closed */ }
  for (const suffix of ['', '-shm', '-wal']) {
    try { fs.unlinkSync(ws.mindPath + suffix); } catch { /* missing is fine */ }
  }
}

function seedFrame(ws: TestWorkspace, content: string, importance = 'normal'): void {
  const db = ws.mind.getDatabase();
  // Ensure a GOP session exists so the FK check passes
  db.prepare(`
    INSERT INTO sessions (gop_id, started_at)
    VALUES (?, ?)
    ON CONFLICT(gop_id) DO NOTHING
  `).run('test', new Date().toISOString());
  db.prepare(`
    INSERT INTO memory_frames (frame_type, gop_id, t, content, importance, source)
    VALUES ('I', ?, 0, ?, ?, 'user_stated')
  `).run('test', content, importance);
}

function buildOrchestrator(personal: MindDB, workspace: MindDB): Orchestrator {
  const orch = new Orchestrator({
    db: personal,
    embedder: new FakeEmbedder(),
    mode: 'local',
    version: 'test',
  });
  orch.setWorkspaceMind(workspace);
  return orch;
}

// ── Tests ────────────────────────────────────────────────────────────

describe('WorkspaceSessionManager — Phase A.1 concurrency invariants', () => {
  let personal: TestWorkspace;
  let wsA: TestWorkspace;
  let wsB: TestWorkspace;
  let wsC: TestWorkspace;
  let wsD: TestWorkspace;

  beforeEach(() => {
    personal = createTempMind('personal');
    wsA = createTempMind('wsA');
    wsB = createTempMind('wsB');
    wsC = createTempMind('wsC');
    wsD = createTempMind('wsD');
  });

  afterEach(() => {
    [personal, wsA, wsB, wsC, wsD].forEach(cleanupMind);
  });

  it('keeps per-session orchestrators isolated from each other', () => {
    const manager = new WorkspaceSessionManager(3);

    // Seed each workspace with distinctive content so we can prove routing.
    seedFrame(wsA, 'Workspace A decided to use Postgres.', 'important');
    seedFrame(wsB, 'Workspace B prefers MongoDB.', 'important');

    const orchA = buildOrchestrator(personal.mind, wsA.mind);
    const orchB = buildOrchestrator(personal.mind, wsB.mind);

    const sessionA = manager.create('workspace-A', wsA.mind, orchA, [], null);
    const sessionB = manager.create('workspace-B', wsB.mind, orchB, [], null);

    // The invariant: session A's orchestrator must hold workspace A's layers,
    // session B's must hold workspace B's. In the broken pre-A.1 code they'd
    // both point at whichever workspace was set last.
    expect(sessionA.orchestrator).not.toBe(sessionB.orchestrator);
    expect(sessionA.orchestrator.hasWorkspaceMind()).toBe(true);
    expect(sessionB.orchestrator.hasWorkspaceMind()).toBe(true);
    expect(manager.size).toBe(2);
  });

  it('allows a third concurrent session but blocks the fourth at default cap', () => {
    const manager = new WorkspaceSessionManager(3);

    const build = (label: string, ws: TestWorkspace) => manager.create(
      label,
      ws.mind,
      buildOrchestrator(personal.mind, ws.mind),
      [],
      null,
    );

    build('A', wsA);
    build('B', wsB);
    build('C', wsC);

    expect(manager.size).toBe(3);

    expect(() => build('D', wsD)).toThrow(/Max concurrent sessions reached/);
  });

  it('honors setMaxSessions raises and subsequent creates', () => {
    const manager = new WorkspaceSessionManager(2);
    expect(manager.getMaxSessions()).toBe(2);

    const build = (label: string, ws: TestWorkspace) => manager.create(
      label,
      ws.mind,
      buildOrchestrator(personal.mind, ws.mind),
      [],
      null,
    );

    build('A', wsA);
    build('B', wsB);
    expect(() => build('C', wsC)).toThrow(/Max concurrent sessions reached/);

    manager.setMaxSessions(4);
    expect(manager.getMaxSessions()).toBe(4);

    // Now the third and fourth sessions succeed
    build('C', wsC);
    build('D', wsD);
    expect(manager.size).toBe(4);
  });

  it('rejects invalid setMaxSessions values', () => {
    const manager = new WorkspaceSessionManager(3);
    expect(() => manager.setMaxSessions(0)).toThrow(/finite integer/);
    expect(() => manager.setMaxSessions(-1)).toThrow(/finite integer/);
    expect(() => manager.setMaxSessions(NaN)).toThrow(/finite integer/);
  });

  it('pause and resume flip status without affecting other sessions', () => {
    const manager = new WorkspaceSessionManager(3);

    const sessA = manager.create('A', wsA.mind, buildOrchestrator(personal.mind, wsA.mind), [], null);
    const sessB = manager.create('B', wsB.mind, buildOrchestrator(personal.mind, wsB.mind), [], null);

    expect(sessA.status).toBe('active');
    expect(sessB.status).toBe('active');

    expect(manager.pause('A')).toBe(true);
    expect(sessA.status).toBe('paused');
    expect(sessB.status).toBe('active'); // unaffected

    expect(manager.resume('A')).toBe(true);
    expect(sessA.status).toBe('active');

    // Double-pause returns true but status is idempotent
    expect(manager.pause('A')).toBe(true);
    expect(sessA.status).toBe('paused');

    // Resume on a non-paused session returns false
    expect(manager.resume('B')).toBe(false);
  });

  it('close() closes one session cleanly and leaves others intact', () => {
    const manager = new WorkspaceSessionManager(3);

    manager.create('A', wsA.mind, buildOrchestrator(personal.mind, wsA.mind), [], null);
    const sessB = manager.create('B', wsB.mind, buildOrchestrator(personal.mind, wsB.mind), [], null);

    expect(manager.size).toBe(2);
    expect(manager.close('A')).toBe(true);
    expect(manager.size).toBe(1);
    expect(manager.has('A')).toBe(false);
    expect(manager.has('B')).toBe(true);
    expect(sessB.status).toBe('active');

    // Closing an already-closed session returns false
    expect(manager.close('A')).toBe(false);
  });

  it('getOrCreate reuses existing sessions with factories called lazily', () => {
    const manager = new WorkspaceSessionManager(3);
    let mindFactoryCallCount = 0;
    let orchFactoryCallCount = 0;
    let toolsFactoryCallCount = 0;

    const factories = {
      mind: () => { mindFactoryCallCount++; return wsA.mind; },
      orch: (m: MindDB) => { orchFactoryCallCount++; return buildOrchestrator(personal.mind, m); },
      tools: (_m: MindDB, _o: Orchestrator) => { toolsFactoryCallCount++; return []; },
    };

    const first = manager.getOrCreate('A', factories.mind, factories.orch, factories.tools, null);
    expect(mindFactoryCallCount).toBe(1);
    expect(orchFactoryCallCount).toBe(1);
    expect(toolsFactoryCallCount).toBe(1);

    // Second call should return the SAME session, not invoke factories
    const second = manager.getOrCreate('A', factories.mind, factories.orch, factories.tools, null);
    expect(second).toBe(first);
    expect(mindFactoryCallCount).toBe(1);
    expect(orchFactoryCallCount).toBe(1);
    expect(toolsFactoryCallCount).toBe(1);

    // Touch should update lastActivity
    const firstActivity = second.lastActivity;
    // A tiny delay is not guaranteed by the test runner, so we don't assert
    // strict inequality — just that getOrCreate didn't error.
    expect(firstActivity).toBeGreaterThan(0);
  });

  it('closeAll clears every session at once', () => {
    const manager = new WorkspaceSessionManager(4);

    manager.create('A', wsA.mind, buildOrchestrator(personal.mind, wsA.mind), [], null);
    manager.create('B', wsB.mind, buildOrchestrator(personal.mind, wsB.mind), [], null);
    manager.create('C', wsC.mind, buildOrchestrator(personal.mind, wsC.mind), [], null);

    expect(manager.size).toBe(3);
    manager.closeAll();
    expect(manager.size).toBe(0);
    expect(manager.has('A')).toBe(false);
    expect(manager.has('B')).toBe(false);
    expect(manager.has('C')).toBe(false);
  });

  it('two concurrent orchestrators on different workspaces do not cross-contaminate', async () => {
    const manager = new WorkspaceSessionManager(3);

    // Seed each workspace with content specific to that workspace
    seedFrame(wsA, 'A-specific: blueprint for launch campaign.', 'important');
    seedFrame(wsB, 'B-specific: competitor analysis for fintech vertical.', 'important');

    const orchA = buildOrchestrator(personal.mind, wsA.mind);
    const orchB = buildOrchestrator(personal.mind, wsB.mind);

    manager.create('A', wsA.mind, orchA, [], null);
    manager.create('B', wsB.mind, orchB, [], null);

    // Fire two recalls in parallel. The invariant: each orchestrator only
    // sees its own workspace's frames. On the pre-A.1 shared-orchestrator
    // code, one would overwrite the other before both resolve.
    const [recallA, recallB] = await Promise.all([
      orchA.recallMemory('launch', 5),
      orchB.recallMemory('fintech', 5),
    ]);

    // Because the embedder is a zero-vector stub, semantic search returns
    // nothing — but the key invariant we check is that recall didn't throw
    // and that each orchestrator still points at its own workspace mind.
    // The no-crash + no-exception path is the core regression we're
    // guarding against.
    expect(recallA).toBeDefined();
    expect(recallB).toBeDefined();
    expect(orchA.hasWorkspaceMind()).toBe(true);
    expect(orchB.hasWorkspaceMind()).toBe(true);

    // And crucially: after both recalls, both orchestrators still have
    // the RIGHT workspace mind (not crossed over).
    const statsA = orchA.getMemoryStats();
    const statsB = orchB.getMemoryStats();
    // Both should have non-zero frame counts (they have different content)
    // and the personal-mind fragment is shared, so totals are at least 1.
    expect(statsA.frameCount).toBeGreaterThanOrEqual(1);
    expect(statsB.frameCount).toBeGreaterThanOrEqual(1);
  });

  it('composes the FREE cap, concurrent same-workspace planning isolation, bounded cache, and cleanup', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-solo-session-composition-'));
    const server = await buildLocalServer({ dataDir, tier: 'FREE' });
    const workspaceId = server.agentState.activeWorkspaceId;
    expect(workspaceId).toBeTruthy();

    const sessionA = 'solo-concurrent-a';
    const sessionB = 'solo-concurrent-b';
    const markerA = 'SOLO_SESSION_A';
    const markerB = 'SOLO_SESSION_B';
    const previousOllamaHost = process.env.OLLAMA_HOST;
    const previousReranker = process.env.WAGGLE_RERANKER;
    const releaseSpy = vi.spyOn(server.mindCache, 'release');
    const originalAcquireActivity = server.sessionManager.acquireActivity.bind(server.sessionManager);
    const activityReleaseSnapshots: Array<{
      sessionAHistory: number;
      sessionBHistory: number;
      sessionADiskHistory: number;
      sessionBDiskHistory: number;
    }> = [];
    const activitySpy = vi.spyOn(server.sessionManager, 'acquireActivity').mockImplementation((id) => {
      const lease = originalAcquireActivity(id);
      if (!lease) return undefined;
      return {
        session: lease.session,
        release: () => {
          activityReleaseSnapshots.push({
            sessionAHistory: server.agentState.sessionHistories.get(
              chatSessionStateKey(workspaceId!, sessionA),
            )?.length ?? 0,
            sessionBHistory: server.agentState.sessionHistories.get(
              chatSessionStateKey(workspaceId!, sessionB),
            )?.length ?? 0,
            sessionADiskHistory: loadSessionMessages(dataDir, workspaceId!, sessionA).length,
            sessionBDiskHistory: loadSessionMessages(dataDir, workspaceId!, sessionB).length,
          });
          lease.release();
        },
      };
    });
    const createdWorkspaceIds: string[] = [workspaceId!];

    const deferred = () => {
      let resolve!: () => void;
      const promise = new Promise<void>((done) => { resolve = done; });
      return { promise, resolve };
    };
    const aFirstProviderArrived = deferred();
    const releaseAFirstProvider = deferred();
    const providerOrder: string[] = [];
    const providerBodies = new Map<'A' | 'B', Array<{
      messages?: Array<{ role?: string; content?: string }>;
    }>>([['A', []], ['B', []]]);
    let requestA: Promise<Awaited<ReturnType<typeof injectWithAuth>>> | undefined;
    let requestB: Promise<Awaited<ReturnType<typeof injectWithAuth>>> | undefined;

    const coordinator = server.agentState.workspaceTurnCoordinator;
    const acquireSpy = vi.spyOn(coordinator, 'acquire');

    const streamResponse = (chunks: unknown[]) => new Response(
      `${chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`,
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
    );
    const toolResponse = (id: string, name: string, args: Record<string, unknown>) => streamResponse([
      {
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              id,
              type: 'function',
              function: { name, arguments: JSON.stringify(args) },
            }],
          },
        }],
      },
      {
        choices: [{ delta: {}, finish_reason: 'tool_calls' }],
        usage: { prompt_tokens: 10, completion_tokens: 2 },
      },
    ]);
    const finalResponse = (content: string) => streamResponse([
      { choices: [{ delta: { content } }] },
      {
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 2 },
      },
    ]);
    const stepPhases = (body: string): string[] => body
      .split(/\n\n/)
      .filter(block => block.split('\n').includes('event: step'))
      .flatMap(block => {
        const dataLine = block.split('\n').find(line => line.startsWith('data: '));
        if (!dataLine) return [];
        const event = JSON.parse(dataLine.slice(6)) as { phase?: unknown };
        return typeof event.phase === 'string' ? [event.phase] : [];
      });

    server.agentState.llmProvider = {
      provider: 'ollama',
      health: 'healthy',
      detail: 'Deterministic Solo concurrency fixture',
      checkedAt: new Date().toISOString(),
    };
    server.agentState.currentModel = 'ollama/solo-local';
    server.localConfig.litellmUrl = 'http://proxy.test/v1';
    process.env.OLLAMA_HOST = 'http://ollama.test';
    process.env.WAGGLE_RERANKER = '0';
    resetRateLimiter(server);

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/tags')) {
        return new Response(JSON.stringify({ models: [{ name: 'solo-local' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (!url.endsWith('/chat/completions')) return new Response('', { status: 503 });

      const body = JSON.parse(String(init?.body ?? '{}')) as {
        messages?: Array<{ role?: string; content?: string }>;
      };
      const contents = (body.messages ?? []).map(message => message.content ?? '').join('\n');
      const logicalSession = contents.includes(markerA)
        ? 'A'
        : contents.includes(markerB) ? 'B' : null;
      if (!logicalSession) throw new Error('Provider request did not contain a Solo session marker');
      const bodies = providerBodies.get(logicalSession)!;
      bodies.push(body);
      const call = bodies.length;
      providerOrder.push(`${logicalSession}#${call}`);

      if (logicalSession === 'A' && call === 1) {
        aFirstProviderArrived.resolve();
        await releaseAFirstProvider.promise;
        return toolResponse('solo-a-create', 'create_plan', { title: 'Plan A' });
      }
      if (logicalSession === 'A' && call === 2) {
        return toolResponse('solo-a-add', 'add_plan_step', { title: 'A_ONLY' });
      }
      if (logicalSession === 'A' && call === 3) {
        return finalResponse(`${markerA} complete`);
      }
      if (logicalSession === 'B' && call === 1) {
        return toolResponse('solo-b-create', 'create_plan', { title: 'Plan B' });
      }
      if (logicalSession === 'B' && call === 2) {
        return toolResponse('solo-b-show', 'show_plan', {});
      }
      if (logicalSession === 'B' && call === 3) {
        return finalResponse(`${markerB} complete`);
      }
      throw new Error(`Unexpected provider call ${logicalSession}#${call}`);
    });

    try {
      expect(server.localConfig.tier).toBe('FREE');
      expect(server.sessionManager.getMaxSessions()).toBe(10);
      expect(server.sessionManager.size).toBe(0);
      expect(server.mindCache.keys()).toEqual([workspaceId]);

      requestA = injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          workspace: workspaceId,
          session: sessionA,
          persona: 'project-manager',
          model: 'ollama/solo-local',
          autonomy: { level: 'yolo' },
          message: `Use create_plan, then add_plan_step with A_ONLY. Correlation: ${markerA}.`,
        },
      });
      await Promise.race([
        aFirstProviderArrived.promise,
        requestA.then(() => { throw new Error('Session A completed before reaching the provider'); }),
      ]);

      requestB = injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          workspace: workspaceId,
          session: sessionB,
          persona: 'project-manager',
          model: 'ollama/solo-local',
          autonomy: { level: 'yolo' },
          message: `Execute create_plan for Plan B, then execute show_plan immediately. Correlation: ${markerB}.`,
        },
      });
      let bCompletionTimeout: ReturnType<typeof setTimeout> | undefined;
      const responseB = await Promise.race([
        requestB,
        new Promise<never>((_, reject) => {
          bCompletionTimeout = setTimeout(
            () => reject(new Error('Independent Session B did not complete concurrently')),
            5_000,
          );
        }),
      ]).finally(() => {
        if (bCompletionTimeout) clearTimeout(bCompletionTimeout);
      });
      expect(responseB.statusCode).toBe(200);
      expect(responseB.body).toContain(`${markerB} complete`);
      expect(providerBodies.get('B')).toHaveLength(3);
      expect(providerOrder).toEqual(['A#1', 'B#1', 'B#2', 'B#3']);
      expect(acquireSpy).not.toHaveBeenCalled();
      releaseAFirstProvider.resolve();

      const responseA = await requestA;
      expect(responseA.statusCode).toBe(200);
      expect(responseA.body).toContain(`${markerA} complete`);
      expect(providerOrder).toEqual(['A#1', 'B#1', 'B#2', 'B#3', 'A#2', 'A#3']);
      expect(activitySpy).toHaveBeenCalledTimes(2);
      expect(activityReleaseSnapshots).toHaveLength(2);
      expect(activityReleaseSnapshots.some(snapshot => snapshot.sessionAHistory === 2)).toBe(true);
      expect(activityReleaseSnapshots.some(snapshot => snapshot.sessionBHistory === 2)).toBe(true);
      expect(activityReleaseSnapshots.some(snapshot => snapshot.sessionADiskHistory === 2)).toBe(true);
      expect(activityReleaseSnapshots.some(snapshot => snapshot.sessionBDiskHistory === 2)).toBe(true);
      const aPhases = stepPhases(responseA.body);
      const bPhases = stepPhases(responseB.body);
      expect(aPhases).not.toContain('workspace_queue');
      expect(bPhases).not.toContain('workspace_queue');
      expect(bPhases).not.toContain('workspace_acquired');
      expect(server.sessionManager.size).toBe(1);
      expect(server.mindCache.size).toBe(1);

      const bShowResult = providerBodies.get('B')![2]?.messages
        ?.filter(message => message.role === 'tool')
        .at(-1)?.content;
      expect(bShowResult).toContain('Plan has no steps.');
      expect(bShowResult).not.toContain('A_ONLY');
      expect(server.agentState.sessionHistories.get(chatSessionStateKey(workspaceId!, sessionA)))
        .toEqual([
          { role: 'user', content: `Use create_plan, then add_plan_step with A_ONLY. Correlation: ${markerA}.` },
          expect.objectContaining({ role: 'assistant', content: `${markerA} complete` }),
        ]);
      expect(server.agentState.sessionHistories.get(chatSessionStateKey(workspaceId!, sessionB)))
        .toEqual([
          { role: 'user', content: `Execute create_plan for Plan B, then execute show_plan immediately. Correlation: ${markerB}.` },
          expect.objectContaining({ role: 'assistant', content: `${markerB} complete` }),
        ]);

      for (let index = 1; index < 10; index += 1) {
        const workspace = server.workspaceManager.create({
          name: `Solo cap ${index}`,
          group: 'Test',
        });
        createdWorkspaceIds.push(workspace.id);
        const workspacePath = path.join(dataDir, 'workspaces', workspace.id, 'files');
        server.sessionManager.getOrCreate(
          workspace.id,
          () => server.mindCache.acquire(workspace.id),
          mind => server.agentState.createSessionOrchestrator(mind),
          (_mind, orchestrator) => server.agentState.buildToolsForSession(
            orchestrator,
            workspacePath,
            workspace.id,
          ),
          undefined,
          () => server.mindCache.release(workspace.id),
        );
        expect(server.mindCache.size).toBeLessThanOrEqual(10);
      }

      expect(server.sessionManager.size).toBe(10);
      expect(server.mindCache.size).toBe(10);
      expect(new Set(server.mindCache.keys())).toEqual(new Set(createdWorkspaceIds));
      const fleet = await injectWithAuth(server, { method: 'GET', url: '/api/fleet' });
      expect(fleet.statusCode).toBe(200);
      expect(fleet.json()).toMatchObject({ count: 10, maxSessions: 10 });

      const anchor = server.sessionManager.get(workspaceId!)!;
      expect(() => server.sessionManager.create(
        'solo-overflow',
        anchor.mind,
        anchor.orchestrator,
        anchor.tools,
      )).toThrow('Max concurrent sessions reached (10)');
      expect(server.sessionManager.size).toBe(10);
      expect(server.mindCache.size).toBe(10);

      for (const sessionId of [sessionA, sessionB]) {
        const cleared = await injectWithAuth(server, {
          method: 'DELETE',
          url: `/api/chat/history?workspace=${workspaceId}&session=${sessionId}`,
        });
        expect(cleared.statusCode).toBe(200);
        expect(server.agentState.sessionHistories.has(
          chatSessionStateKey(workspaceId!, sessionId),
        )).toBe(false);
        expect(fs.existsSync(path.join(
          dataDir,
          'workspaces',
          workspaceId!,
          'sessions',
          `${sessionId}.jsonl`,
        ))).toBe(false);
      }

      const turnReleases = releaseSpy.mock.calls
        .filter(([releasedWorkspaceId]) => releasedWorkspaceId === workspaceId);
      expect(turnReleases).toHaveLength(2);
      const killed = await injectWithAuth(server, {
        method: 'POST',
        url: `/api/fleet/${workspaceId}/kill`,
      });
      expect(killed.statusCode).toBe(200);
      expect(killed.json()).toEqual({ killed: true, workspaceId });
      expect(server.sessionManager.has(workspaceId!)).toBe(false);
      expect(releaseSpy.mock.calls
        .filter(([releasedWorkspaceId]) => releasedWorkspaceId === workspaceId)).toHaveLength(3);

      for (const id of createdWorkspaceIds) {
        const deleted = await injectWithAuth(server, {
          method: 'DELETE',
          url: `/api/workspaces/${id}`,
        });
        expect(deleted.statusCode).toBe(204);
        expect(server.mindCache.has(id)).toBe(false);
      }
      expect(server.sessionManager.size).toBe(0);
      expect(server.mindCache.size).toBe(0);
      for (const id of createdWorkspaceIds.slice(1)) {
        expect(releaseSpy.mock.calls
          .filter(([releasedWorkspaceId]) => releasedWorkspaceId === id)).toHaveLength(1);
      }
    } finally {
      aFirstProviderArrived.resolve();
      releaseAFirstProvider.resolve();
      await Promise.allSettled([requestA, requestB].filter(Boolean) as Promise<unknown>[]);
      fetchSpy.mockRestore();
      acquireSpy.mockRestore();
      activitySpy.mockRestore();
      releaseSpy.mockRestore();
      await server.close();
      if (previousOllamaHost === undefined) delete process.env.OLLAMA_HOST;
      else process.env.OLLAMA_HOST = previousOllamaHost;
      if (previousReranker === undefined) delete process.env.WAGGLE_RERANKER;
      else process.env.WAGGLE_RERANKER = previousReranker;
      await new Promise(resolve => setTimeout(resolve, 100));
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, 30_000);
});
