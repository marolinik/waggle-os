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
 *   - Optionally persisted. When a `persistPath` (or injected
 *     load/save deps) is supplied, the tracker writes a JSON pidfile
 *     on every mutation and **reconciles on construction**: it reloads
 *     the file, probes each pid's liveness, keeps the survivors, and
 *     prunes the dead. This is how a detached tool that outlives a
 *     sidecar restart keeps its 'Running' badge / kill affordance.
 *     With no persistence configured the tracker is pure in-memory
 *     (the original behavior — used by tests).
 *   - Liveness check via `process.kill(pid, 0)`. POSIX + Windows
 *     both raise on dead PIDs; we catch and return false.
 *   - Hermetic via injected `isAlive` / `now` / `loadPersisted` /
 *     `savePersisted` deps for testing.
 *
 * Known caveat (PID reuse):
 *   Reconciliation can only ask "is *a* process with this pid alive?"
 *   — not "is it still *our* tool?". If the OS recycled a dead agent's
 *   pid for an unrelated process before restart, that row would render
 *   as running. Acceptable for a desktop sidecar (short restart window,
 *   loopback-only, kill is gated to tracked pids); revisit with a
 *   start-time fingerprint if it ever bites.
 *
 * Out of scope (deferred):
 *   - Per-process start-time fingerprinting to defeat pid reuse.
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { resolveWindowsTaskkillPath } from './external-tool-runner.js';

const WINDOWS_TREE_KILL_TIMEOUT_MS = 5_000;

export interface TrackedProcess {
  pid: number;
  toolId: string;
  startedAt: string;
  workspaceId?: string;
  /**
   * True for OBSERVED (piped-stdio) launches. These are tethered to the
   * sidecar and cannot survive a restart, so they are tracked in memory only
   * and excluded from the persisted pidfile (see `persist()`).
   */
  observed?: boolean;
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
  /** Platform override for deterministic Windows/POSIX termination tests. */
  platform?: NodeJS.Platform;
  /**
   * Windows process-tree terminator. Production uses bounded, shell-free
   * taskkill.exe /T /F and reports false on spawn, timeout, or exit failure.
   */
  killTree?: (pid: number) => Promise<boolean>;
  /**
   * Path to the JSON pidfile used for cross-restart persistence. When
   * set (and no explicit load/save override is given), the tracker
   * reads/writes this file. Omit for pure in-memory.
   */
  persistPath?: string;
  /**
   * Override the persistence reader. Defaults to reading `persistPath`.
   * Tests inject an in-memory store. A corrupt/missing file yields [].
   */
  loadPersisted?: () => TrackedProcess[];
  /**
   * Override the persistence writer. Defaults to writing `persistPath`
   * (best-effort — never throws into the launch path).
   */
  savePersisted?: (records: readonly TrackedProcess[]) => void;
}

/** True if `x` is a structurally-valid persisted record (guards a corrupt pidfile). */
function isTrackedProcess(x: unknown): x is TrackedProcess {
  if (!x || typeof x !== 'object') return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r.pid === 'number' &&
    Number.isInteger(r.pid) &&
    r.pid > 0 &&
    typeof r.toolId === 'string' &&
    typeof r.startedAt === 'string' &&
    (r.workspaceId === undefined || typeof r.workspaceId === 'string') &&
    (r.observed === undefined || typeof r.observed === 'boolean')
  );
}

function defaultLoadPersisted(persistPath: string): TrackedProcess[] {
  try {
    const raw = fs.readFileSync(persistPath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isTrackedProcess);
  } catch {
    // Missing file / parse error → start clean. Persistence is a
    // convenience, never a hard dependency.
    return [];
  }
}

function defaultSavePersisted(persistPath: string, records: readonly TrackedProcess[]): void {
  try {
    fs.mkdirSync(path.dirname(persistPath), { recursive: true });
    fs.writeFileSync(persistPath, JSON.stringify(records, null, 2), 'utf8');
  } catch {
    // Best-effort: a failed write must not break launch/list/kill.
  }
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

function defaultKillTree(pid: number): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(
      resolveWindowsTaskkillPath(),
      ['/PID', String(pid), '/T', '/F'],
      { timeout: WINDOWS_TREE_KILL_TIMEOUT_MS, windowsHide: true },
      (error) => resolve(error === null),
    );
  });
}

export class ToolProcessTracker {
  private processes: Map<number, TrackedProcess> = new Map();
  private readonly isAlive: (pid: number) => boolean;
  private readonly now: () => Date;
  private readonly sendSignal: (pid: number, signal: NodeJS.Signals | number) => boolean;
  private readonly delay: (ms: number) => Promise<void>;
  private readonly platform: NodeJS.Platform;
  private readonly killTree: (pid: number) => Promise<boolean>;
  /** Whether persistence is configured (persistPath or injected load/save). */
  private readonly persists: boolean;
  private readonly loadPersisted: () => TrackedProcess[];
  private readonly savePersisted: (records: readonly TrackedProcess[]) => void;

  constructor(deps: ToolProcessTrackerDeps = {}) {
    this.isAlive = deps.isAlive ?? defaultIsAlive;
    this.now = deps.now ?? (() => new Date());
    this.sendSignal = deps.sendSignal ?? defaultSendSignal;
    this.delay = deps.delay ?? defaultDelay;
    this.platform = deps.platform ?? process.platform;
    this.killTree = deps.killTree ?? defaultKillTree;

    this.persists = Boolean(deps.persistPath || deps.loadPersisted || deps.savePersisted);
    const persistPath = deps.persistPath;
    this.loadPersisted =
      deps.loadPersisted ?? (persistPath ? () => defaultLoadPersisted(persistPath) : () => []);
    this.savePersisted =
      deps.savePersisted ?? (persistPath ? (r) => defaultSavePersisted(persistPath, r) : () => {});

    if (this.persists) this.reconcile();
  }

  /**
   * Boot reconciliation: reload persisted pids, keep the ones still
   * alive, drop the dead, and rewrite the file iff we actually pruned
   * (so a fresh/empty store never triggers an eager write).
   */
  private reconcile(): void {
    const persisted = this.loadPersisted();
    for (const rec of persisted) {
      if (this.isAlive(rec.pid)) this.processes.set(rec.pid, rec);
    }
    if (persisted.length !== this.processes.size) this.persist();
  }

  /**
   * Write the current snapshot to the store when persistence is on. Observed
   * (tethered) processes are excluded — they cannot survive a restart, so
   * persisting them would risk a stale 'Running' badge / pid-reuse false
   * positive on the next boot reconcile.
   */
  private persist(): void {
    if (this.persists) {
      this.savePersisted(
        Array.from(this.processes.values()).filter((p) => !p.observed),
      );
    }
  }

  /**
   * Register a freshly-spawned process. Returns the tracked record
   * (useful for chaining or echoing back in the route response).
   * Idempotent on pid — re-registering replaces the prior entry.
   */
  register(
    pid: number,
    toolId: string,
    workspaceId?: string,
    opts?: { observed?: boolean },
  ): TrackedProcess {
    const record: TrackedProcess = {
      pid,
      toolId,
      startedAt: this.now().toISOString(),
      ...(workspaceId !== undefined ? { workspaceId } : {}),
      ...(opts?.observed ? { observed: true } : {}),
    };
    this.processes.set(pid, record);
    this.persist();
    return record;
  }

  /**
   * Return the list of currently-tracked-and-alive processes.
   * Garbage-collects dead pids as a side effect so subsequent
   * calls don't re-probe them.
   */
  list(): TrackedProcess[] {
    let pruned = false;
    for (const pid of Array.from(this.processes.keys())) {
      if (!this.isAlive(pid)) {
        this.processes.delete(pid);
        pruned = true;
      }
    }
    if (pruned) this.persist();
    return Array.from(this.processes.values());
  }

  /** Drop a pid (e.g. after a successful explicit stop). */
  forget(pid: number): boolean {
    const deleted = this.processes.delete(pid);
    if (deleted) this.persist();
    return deleted;
  }

  /**
   * Attempt to stop a tracked process. Windows uses bounded taskkill /T /F
   * so success covers the full descendant tree; POSIX uses SIGTERM and then
   * escalates to SIGKILL after `gracefulTimeoutMs`. Returns a structured
   * result so the route layer can surface honest UX.
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
      | 'tree-cleanup-unverified'
      | 'tree-kill-ok'
      | 'tree-kill-failed'
      | 'sigterm-ok'
      | 'sigkill-ok'
      | 'sigterm-failed-sigkill-failed';
  }> {
    if (!this.processes.has(pid)) {
      return { ok: false, pid, reason: 'not-tracked' };
    }
    if (!this.isAlive(pid)) {
      if (this.platform === 'win32') {
        return { ok: false, pid, reason: 'tree-cleanup-unverified' };
      }
      // Already gone — GC the entry and report success.
      this.processes.delete(pid);
      this.persist();
      return { ok: true, pid, reason: 'already-dead' };
    }
    if (this.platform === 'win32') {
      let treeKilled = false;
      try {
        treeKilled = await this.killTree(pid);
      } catch {
        treeKilled = false;
      }
      if (treeKilled) {
        await this.delay(50);
        if (!this.isAlive(pid)) {
          this.processes.delete(pid);
          this.persist();
          return { ok: true, pid, reason: 'tree-kill-ok' };
        }
      }
      return { ok: false, pid, reason: 'tree-kill-failed' };
    }
    // Best effort: SIGTERM first so the child can clean up.
    const termSent = this.sendSignal(pid, 'SIGTERM');
    if (termSent) {
      await this.delay(gracefulTimeoutMs);
      if (!this.isAlive(pid)) {
        this.processes.delete(pid);
        this.persist();
        return { ok: true, pid, reason: 'sigterm-ok' };
      }
    }
    // Escalate to SIGKILL.
    const killSent = this.sendSignal(pid, 'SIGKILL');
    if (killSent && !this.isAlive(pid)) {
      this.processes.delete(pid);
      this.persist();
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
    this.persist();
  }
}
