/**
 * WorkspaceSessionManager — manages concurrent workspace sessions.
 *
 * Replaces the single activeWorkspaceId model with a Map<workspaceId, WorkspaceSession>.
 * Each session holds its own mind (MindDB), tools, **orchestrator**, abort controller,
 * and persona. The per-session orchestrator is critical — it prevents two concurrent
 * chat calls on different workspaces from overwriting each other's workspace mind
 * state (the "Option Y" fix from docs/plans/phase-a-the-room.md §9).
 *
 * Max concurrent sessions configurable (default: 3) to prevent resource exhaustion.
 * Tier-gate via setMaxSessions() at startup once the user's subscription is known.
 */

import type { MindDB } from '@waggle/core';
import type { ToolDefinition, Orchestrator } from '@waggle/agent';

const RESIDENT_SESSION_BUDGET = 20;

export interface WorkspaceSession {
  workspaceId: string;
  mind: MindDB;
  /**
   * Session-owned orchestrator with this workspace's mind already mounted.
   * Each session has its own instance so concurrent sessions cannot corrupt
   * each other's workspace layers via orchestrator.setWorkspaceMind().
   */
  orchestrator: Orchestrator;
  tools: ToolDefinition[];
  abortController: AbortController;
  lastActivity: number;
  personaId: string | null;
  status: 'active' | 'paused' | 'error';
  /** L-17 C3: cumulative LLM tokens (prompt + completion) for this session. */
  tokensUsed: number;
  /**
   * Optional pin-release callback. When a session borrows its mind from the
   * shared MultiMindCache via `acquire()`, the cache owns the handle's lifecycle
   * and the session must NOT close it. Instead `close()` calls this to drop the
   * refcount pin. Absent for standalone/test sessions that own their own handle
   * — those fall back to `mind.close()`.
   */
  release?: () => void;
}

export interface WorkspaceSessionActivityLease {
  readonly session: WorkspaceSession;
  release(): void;
}

export class WorkspaceSessionManager {
  private sessions = new Map<string, WorkspaceSession>();
  private activeActivities = new WeakMap<WorkspaceSession, number>();
  private retiredSessions = new WeakSet<WorkspaceSession>();
  private finalizedSessions = new WeakSet<WorkspaceSession>();
  private maxSessions: number;

  constructor(maxSessions = 3) {
    this.maxSessions = maxSessions;
  }

  /**
   * Update the max concurrent session cap at runtime.
   * Called at startup once the user's tier is resolved:
   *   Solo = 3, Basic = 5, Teams = 10, Enterprise = unbounded.
   *
   * Raising the cap takes effect immediately. Lowering it does NOT close
   * existing sessions over the new cap — they're allowed to run out
   * naturally, but new creates beyond the cap are rejected.
   */
  setMaxSessions(n: number): void {
    if (!Number.isFinite(n) || n < 1) {
      throw new Error(`setMaxSessions: n must be a finite integer >= 1 (got ${n})`);
    }
    this.maxSessions = Math.floor(n);
  }

  /** Get the current max session cap. */
  getMaxSessions(): number {
    return this.maxSessions;
  }

  /** Check if a session exists for a workspace */
  has(workspaceId: string): boolean {
    return this.sessions.has(workspaceId);
  }

  /** Get a session by workspace ID */
  get(workspaceId: string): WorkspaceSession | undefined {
    return this.sessions.get(workspaceId);
  }

  /** Get all active sessions */
  getActive(): WorkspaceSession[] {
    return [...this.sessions.values()];
  }

  /** Get count of active sessions */
  get size(): number {
    return this.sessions.size;
  }

  /**
   * Create a new workspace session.
   * Throws if max concurrent sessions reached or if a session already exists.
   *
   * The caller is responsible for constructing the orchestrator with this
   * session's workspace mind already mounted via `setWorkspaceMind()`.
   */
  create(
    workspaceId: string,
    mind: MindDB,
    orchestrator: Orchestrator,
    tools: ToolDefinition[],
    personaId?: string,
    release?: () => void,
  ): WorkspaceSession {
    if (this.sessions.has(workspaceId)) {
      throw new Error(`Session already exists for workspace ${workspaceId}`);
    }
    if (this.sessions.size >= this.maxSessions) {
      throw new Error(`Max concurrent sessions reached (${this.maxSessions}). Close a workspace first.`);
    }
    if (this.sessions.size >= RESIDENT_SESSION_BUDGET) {
      this.trimResidentSessions(RESIDENT_SESSION_BUDGET - 1);
    }

    const session: WorkspaceSession = {
      workspaceId,
      mind,
      orchestrator,
      tools,
      abortController: new AbortController(),
      lastActivity: Date.now(),
      personaId: personaId ?? null,
      status: 'active',
      tokensUsed: 0,
      release,
    };
    this.sessions.set(workspaceId, session);
    return session;
  }

  /**
   * L-17 C3: accumulate tokens against a session's `tokensUsed` counter.
   * Silently no-ops if the session has been closed between the LLM call
   * and its accounting — token accounting is best-effort telemetry.
   * Negative or non-finite deltas are ignored.
   */
  addTokens(workspaceId: string, delta: number): void {
    if (!Number.isFinite(delta) || delta <= 0) return;
    const session = this.sessions.get(workspaceId);
    if (!session) return;
    session.tokensUsed += delta;
  }

  /**
   * Get an existing session or create a new one.
   * Uses factories to lazily construct mind, orchestrator, and tools only when needed.
   *
   * The orchestrator factory receives the freshly-opened mind so it can
   * call `orchestrator.setWorkspaceMind(mind)` before returning.
   */
  getOrCreate(
    workspaceId: string,
    mindFactory: () => MindDB,
    orchestratorFactory: (mind: MindDB) => Orchestrator,
    toolsFactory: (mind: MindDB, orchestrator: Orchestrator) => ToolDefinition[],
    personaId?: string,
    release?: () => void,
  ): WorkspaceSession {
    const existing = this.sessions.get(workspaceId);
    if (existing) {
      existing.lastActivity = Date.now();
      return existing;
    }
    // `mindFactory` may pin the shared cache handle (session-lifetime refcount).
    // If anything downstream throws before the session is registered (e.g. the
    // max-sessions cap in create()), roll the pin back via `release` so a failed
    // create never leaks a pin and blocks eviction forever.
    const mind = mindFactory();
    try {
      const orchestrator = orchestratorFactory(mind);
      const tools = toolsFactory(mind, orchestrator);
      return this.create(workspaceId, mind, orchestrator, tools, personaId, release);
    } catch (err) {
      if (release) {
        try { release(); } catch { /* pin already released */ }
      }
      throw err;
    }
  }

  /** Touch a session to update its activity timestamp */
  touch(workspaceId: string): void {
    const session = this.sessions.get(workspaceId);
    if (session) {
      session.lastActivity = Date.now();
    }
  }

  /**
   * Borrow the current session generation for an asynchronous operation.
   * The returned release is idempotent and remains bound to that exact object,
   * so releasing an old request can never decrement or tear down a replacement
   * session that reused the same workspace ID.
   */
  acquireActivity(workspaceId: string): WorkspaceSessionActivityLease | undefined {
    const session = this.sessions.get(workspaceId);
    if (!session || session.status !== 'active') return undefined;

    this.activeActivities.set(session, this.activityCount(session) + 1);
    session.lastActivity = Date.now();
    let released = false;

    return {
      session,
      release: () => {
        if (released) return;
        released = true;

        const remaining = Math.max(0, this.activityCount(session) - 1);
        this.activeActivities.set(session, remaining);
        session.lastActivity = Date.now();
        if (remaining === 0 && this.retiredSessions.has(session)) {
          this.finalizeSession(session);
        }
        this.trimResidentSessions(RESIDENT_SESSION_BUDGET);
      },
    };
  }

  /** Pause a session (abort current agent loop, keep session open) */
  pause(workspaceId: string): boolean {
    const session = this.sessions.get(workspaceId);
    if (!session) return false;
    session.abortController.abort();
    session.status = 'paused';
    // Create a new AbortController for future resume
    session.abortController = new AbortController();
    return true;
  }

  /** Resume a paused session */
  resume(workspaceId: string): boolean {
    const session = this.sessions.get(workspaceId);
    if (!session || session.status !== 'paused') return false;
    session.status = 'active';
    session.lastActivity = Date.now();
    return true;
  }

  /**
   * Close and clean up a session.
   * Aborts the agent loop and closes the mind DB.
   */
  close(workspaceId: string): boolean {
    const session = this.sessions.get(workspaceId);
    if (!session) return false;

    session.abortController.abort();
    this.sessions.delete(workspaceId);
    this.retiredSessions.add(session);
    if (this.activityCount(session) === 0) {
      this.finalizeSession(session);
    }
    return true;
  }

  /**
   * Close sessions that have been idle for longer than maxIdleMs.
   * Returns count of sessions closed.
   */
  closeIdleSessions(maxIdleMs: number): number {
    const now = Date.now();
    let closed = 0;

    for (const [id, session] of [...this.sessions]) { // snapshot to avoid mutation during iteration
      if (this.activityCount(session) === 0 && now - session.lastActivity > maxIdleMs) {
        this.close(id);
        closed++;
      }
    }

    return closed;
  }

  /** Close all sessions. Called on server shutdown. */
  closeAll(): void {
    for (const id of [...this.sessions.keys()]) {
      this.close(id);
    }
  }

  private activityCount(session: WorkspaceSession): number {
    return this.activeActivities.get(session) ?? 0;
  }

  private finalizeSession(session: WorkspaceSession): void {
    if (this.finalizedSessions.has(session)) return;
    this.finalizedSessions.add(session);

    // The MultiMindCache owns borrowed handles; standalone/test sessions own
    // their MindDB directly. Finalization runs once, after all activity drains.
    if (session.release) {
      try { session.release(); } catch { /* pin already released */ }
    } else {
      try { session.mind.close(); } catch { /* already closed */ }
    }
  }

  private trimResidentSessions(targetSize: number): void {
    while (this.sessions.size > targetSize) {
      const candidate = [...this.sessions.values()]
        .filter(session => session.status === 'active' && this.activityCount(session) === 0)
        .sort((left, right) => left.lastActivity - right.lastActivity)[0];
      if (!candidate) return;
      this.close(candidate.workspaceId);
    }
  }
}
