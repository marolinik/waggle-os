/**
 * WorkspaceSessionManager — manages concurrent workspace sessions.
 *
 * Replaces the single activeWorkspaceId model with a Map<workspaceId, WorkspaceSession>.
 * Each session holds its own mind (MindDB), tools, abort controller, and persona.
 * Max concurrent sessions configurable (default: 3) to prevent resource exhaustion.
 */

import type { MindDB } from '@waggle/core';
import type { ToolDefinition } from '@waggle/agent';

export interface WorkspaceSession {
  workspaceId: string;
  mind: MindDB;
  tools: ToolDefinition[];
  abortController: AbortController;
  lastActivity: number;
  personaId: string | null;
  status: 'active' | 'paused' | 'error';
}

export class WorkspaceSessionManager {
  private sessions = new Map<string, WorkspaceSession>();
  private maxSessions: number;

  constructor(maxSessions = 3) {
    this.maxSessions = maxSessions;
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
   * Throws if max concurrent sessions reached.
   */
  create(
    workspaceId: string,
    mind: MindDB,
    tools: ToolDefinition[],
    personaId?: string,
  ): WorkspaceSession {
    if (this.sessions.has(workspaceId)) {
      throw new Error(`Session already exists for workspace ${workspaceId}`);
    }
    if (this.sessions.size >= this.maxSessions) {
      throw new Error(`Max concurrent sessions reached (${this.maxSessions}). Close a workspace first.`);
    }

    const session: WorkspaceSession = {
      workspaceId,
      mind,
      tools,
      abortController: new AbortController(),
      lastActivity: Date.now(),
      personaId: personaId ?? null,
      status: 'active',
    };
    this.sessions.set(workspaceId, session);
    return session;
  }

  /**
   * Get an existing session or create a new one.
   * Uses factories to lazily construct mind and tools only when needed.
   */
  getOrCreate(
    workspaceId: string,
    mindFactory: () => MindDB,
    toolsFactory: () => ToolDefinition[],
    personaId?: string,
  ): WorkspaceSession {
    const existing = this.sessions.get(workspaceId);
    if (existing) {
      existing.lastActivity = Date.now();
      return existing;
    }
    return this.create(workspaceId, mindFactory(), toolsFactory(), personaId);
  }

  /** Touch a session to update its activity timestamp */
  touch(workspaceId: string): void {
    const session = this.sessions.get(workspaceId);
    if (session) {
      session.lastActivity = Date.now();
    }
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
    try { session.mind.close(); } catch { /* already closed */ }
    this.sessions.delete(workspaceId);
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
      if (now - session.lastActivity > maxIdleMs) {
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
}
