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

export class ToolProcessTracker {
  private processes: Map<number, TrackedProcess> = new Map();
  private readonly isAlive: (pid: number) => boolean;
  private readonly now: () => Date;

  constructor(deps: ToolProcessTrackerDeps = {}) {
    this.isAlive = deps.isAlive ?? defaultIsAlive;
    this.now = deps.now ?? (() => new Date());
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

  /** Total processes currently tracked (alive or not — call list() to GC). */
  get size(): number {
    return this.processes.size;
  }

  /** Clear all tracked processes. Used in tests. */
  clear(): void {
    this.processes.clear();
  }
}
