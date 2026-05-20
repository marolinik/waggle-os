/**
 * AI-OS Phase 4 polish — in-memory tracker for processes spawned via
 * `launchTool()`.
 *
 * The Launcher Phase 2A/2B path spawns external AI tools detached
 * and returns a PID. Without tracking we have no way to tell whether
 * the process is still running, so the UI cannot render a 'Running'
 * badge or offer a "stop" affordance.
 *
 * Scope:
 *   - In-memory only. PID state does NOT survive a sidecar restart.
 *     That's intentional: the spawned tool runs detached and outlives
 *     the sidecar, but on restart we lose attribution. Surfacing
 *     accurate liveness state for processes whose attribution we
 *     lost is worse than reporting them as "unknown" — so we drop
 *     them.
 *   - Liveness check via `process.kill(pid, 0)`. POSIX + Windows
 *     both raise on dead PIDs; we catch and return false.
 *   - Hermetic via injected `isAlive` + `now` deps for testing.
 *
 * Out of scope (deferred):
 *   - Cross-restart attribution (would require a sidecar-managed
 *     pidfile-per-tool + reconciliation on boot).
 *   - "Stop" affordance (would need POST /api/tools/kill — Phase 5
 *     candidate when the user actually needs it).
 */

import type { ToolId } from '@waggle/shared';

export interface TrackedProcess {
  pid: number;
  toolId: ToolId;
  startedAt: string;
  workspaceId?: string;
}

export interface ToolProcessTrackerDeps {
  /** Liveness probe; returns true if pid is alive. Production = process.kill(pid, 0). */
  isAlive?: (pid: number) => boolean;
  /** Clock override for deterministic startedAt in tests. */
  now?: () => Date;
  /**
   * Signal sender. Production sends real OS signals via process.kill.
   * Returns true if the signal was delivered, false on ESRCH/EPERM.
   * Tests inject a mock to assert signal payloads without killing the
   * test runner.
   */
  sendSignal?: (pid: number, signal: NodeJS.Signals | number) => boolean;
  /**
   * Bounded wait helper for the kill flow's SIGTERM-then-SIGKILL
   * escalation. Production = setTimeout-backed Promise.
   */
  delay?: (ms: number) => Promise<void>;
}

function defaultIsAlive(pid: number): boolean {
  // signal 0 = "check existence without sending a signal". POSIX +
  // Windows both throw ESRCH/EPERM/EINVAL on dead/inaccessible pids;
  // we treat ANY throw as "not alive" rather than parse error codes
  // (a foreign-owned pid is also not "ours" to render as running).
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function defaultSendSignal(pid: number, signal: NodeJS.Signals | number): boolean {
  try {
    process.kill(pid, signal);
    return true;
  } catch {
    return false;
  }
}

function defaultDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ToolProcessTracker {
  private processes: Map<number, TrackedProcess> = new Map();
  private readonly isAlive: (pid: number) => boolean;
  private readonly now: () => Date;
  private readonly sendSignal: (pid: number, signal: NodeJS.Signals | number) => boolean;
  private readonly delay: (ms: number) => Promise<void>;

  constructor(deps: ToolProcessTrackerDeps = {}) {
    this.isAlive = deps.isAlive ?? defaultIsAlive;
    this.now = deps.now ?? (() => new Date());
    this.sendSignal = deps.sendSignal ?? defaultSendSignal;
    this.delay = deps.delay ?? defaultDelay;
  }

  /**
   * Register a freshly-spawned process. Returns the tracked record
   * (useful for chaining or echoing back in the route response).
   * Idempotent on pid — re-registering replaces the prior entry.
   */
  register(
    pid: number,
    toolId: ToolId,
    workspaceId?: string,
  ): TrackedProcess {
    const record: TrackedProcess = {
      pid,
      toolId,
      startedAt: this.now().toISOString(),
      ...(workspaceId !== undefined ? { workspaceId } : {}),
    };
    this.processes.set(pid, record);
    return record;
  }

  /**
   * Return the list of currently-tracked-and-alive processes.
   * Garbage-collects dead pids as a side effect so subsequent
   * calls don't re-probe them.
   */
  list(): TrackedProcess[] {
    for (const pid of Array.from(this.processes.keys())) {
      if (!this.isAlive(pid)) this.processes.delete(pid);
    }
    return Array.from(this.processes.values());
  }

  /** Drop a pid (e.g. after a successful explicit stop). */
  forget(pid: number): boolean {
    return this.processes.delete(pid);
  }

  /**
   * Attempt to stop a tracked process gracefully (SIGTERM), escalating
   * to SIGKILL after `gracefulTimeoutMs` if it's still alive. Returns
   * a structured result documenting which signal succeeded so the
   * route layer can surface honest UX.
   *
   * Refuses to kill a pid we don't track — this guards against the
   * UI accidentally sending an arbitrary OS pid (e.g. from URL
   * tampering) and nuking the user's editor.
   */
  async kill(
    pid: number,
    gracefulTimeoutMs: number = 3000,
  ): Promise<{
    ok: boolean;
    pid: number;
    reason:
      | 'not-tracked'
      | 'already-dead'
      | 'sigterm-ok'
      | 'sigkill-ok'
      | 'sigterm-failed-sigkill-failed';
  }> {
    if (!this.processes.has(pid)) {
      return { ok: false, pid, reason: 'not-tracked' };
    }
    if (!this.isAlive(pid)) {
      // Already gone — GC the entry and report success.
      this.processes.delete(pid);
      return { ok: true, pid, reason: 'already-dead' };
    }
    // Best effort: SIGTERM first so the child can clean up.
    const termSent = this.sendSignal(pid, 'SIGTERM');
    if (termSent) {
      await this.delay(gracefulTimeoutMs);
      if (!this.isAlive(pid)) {
        this.processes.delete(pid);
        return { ok: true, pid, reason: 'sigterm-ok' };
      }
    }
    // Escalate to SIGKILL.
    const killSent = this.sendSignal(pid, 'SIGKILL');
    if (killSent && !this.isAlive(pid)) {
      this.processes.delete(pid);
      return { ok: true, pid, reason: 'sigkill-ok' };
    }
    return {
      ok: false,
      pid,
      reason: 'sigterm-failed-sigkill-failed',
    };
  }

  /** Total processes currently tracked (alive or not — call list() to GC). */
  get size(): number {
    return this.processes.size;
  }

  /** Clear all tracked processes. Used in tests. */
  clear(): void {
    this.processes.clear();
  }
}
