import { createHash, randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  COLLABORATION_RUN_STATUSES,
  type CollaborationRoomRun,
  type CollaborationRun,
  type CollaborationRunCapabilities,
  type CollaborationRunControl,
  type CollaborationRunEvent,
  type CollaborationRunExecutor,
  type CollaborationRunMemoryRefs,
  type CollaborationRunMetrics,
  type CollaborationRunProgress,
  type CollaborationRunResult,
  type CollaborationRunSnapshot,
  type CollaborationRunSource,
  type CollaborationRunStatus,
  type CollaborationWorkerRun,
} from '@waggle/shared';

const ACTIVE_STATUSES = new Set<CollaborationRunStatus>([
  'queued', 'starting', 'running', 'waiting_for_approval', 'paused', 'cancelling',
]);
const TERMINAL_STATUSES = new Set<CollaborationRunStatus>([
  'completed', 'failed', 'cancelled', 'interrupted',
]);
const MAX_EVENTS = 2_000;

const ALLOWED_TRANSITIONS: Record<CollaborationRunStatus, ReadonlySet<CollaborationRunStatus>> = {
  queued: new Set(['starting', 'running', 'cancelling', 'failed', 'cancelled', 'interrupted']),
  starting: new Set(['running', 'waiting_for_approval', 'failed', 'cancelled', 'interrupted']),
  running: new Set(['waiting_for_approval', 'paused', 'cancelling', 'completed', 'failed', 'cancelled', 'interrupted']),
  waiting_for_approval: new Set(['running', 'paused', 'cancelling', 'failed', 'cancelled', 'interrupted']),
  paused: new Set(['running', 'cancelling', 'cancelled', 'interrupted']),
  cancelling: new Set(['running', 'failed', 'cancelled', 'interrupted']),
  completed: new Set(),
  failed: new Set(),
  cancelled: new Set(),
  interrupted: new Set(),
};

const DEFAULT_CAPABILITIES: CollaborationRunCapabilities = {
  cancel: false,
  pause: false,
  resume: false,
  message: false,
};

const DEFAULT_MEMORY_REFS: CollaborationRunMemoryRefs = {
  status: 'pending',
  personalFrameIds: [],
  workspaceFrameIds: {},
};

interface RegistryFile {
  version: 1;
  lastSeq: number;
  runs: CollaborationRun[];
  events: CollaborationRunEvent[];
}

export interface CreateRoomRunInput {
  workspaceIds: string[];
  source: CollaborationRunSource;
  title: string;
  task: string;
  executor?: CollaborationRunExecutor;
  status?: CollaborationRunStatus;
  capabilities?: Partial<CollaborationRunCapabilities>;
}

export interface CreateWorkerRunInput {
  parentRunId: string;
  workspaceId: string;
  source: CollaborationRunSource;
  executor: CollaborationRunExecutor;
  title: string;
  task: string;
  status?: CollaborationRunStatus;
  capabilities?: Partial<CollaborationRunCapabilities>;
  retryOfRunId?: string;
}

export interface CollaborationRunPatch {
  status?: CollaborationRunStatus;
  executor?: Partial<CollaborationRunExecutor>;
  title?: string;
  task?: string;
  progress?: CollaborationRunProgress | null;
  result?: Partial<CollaborationRunResult>;
  metrics?: Partial<CollaborationRunMetrics>;
  memoryRefs?: Partial<CollaborationRunMemoryRefs>;
  capabilities?: Partial<CollaborationRunCapabilities>;
}

export interface RunQuery {
  workspaceId?: string;
  roomId?: string;
  status?: CollaborationRunStatus;
  source?: CollaborationRunSource;
  limit?: number;
}

export interface RunEventsResult {
  lastSeq: number;
  resetRequired: boolean;
  events: CollaborationRunEvent[];
  snapshot?: CollaborationRunSnapshot;
}

export type RunControlHandler = (input: {
  action: CollaborationRunControl;
  message?: string;
  run: CollaborationRun;
}) => void | Promise<void>;

type RunControls = Partial<Record<CollaborationRunControl, RunControlHandler>>;
type RunListener = (event: CollaborationRunEvent) => void;

export class AgentRunRegistry {
  private readonly persistPath: string;
  private readonly runs = new Map<string, CollaborationRun>();
  private readonly controls = new Map<string, RunControls>();
  /** Ephemeral, narrowly-scoped credentials for external run communication. */
  private readonly credentialRuns = new Map<string, string>();
  private readonly listeners = new Set<RunListener>();
  private events: CollaborationRunEvent[] = [];
  private lastSeq = 0;

  constructor(persistPath: string) {
    this.persistPath = persistPath;
    this.load();
    this.interruptInFlightInternalRuns();
  }

  createRoom(input: CreateRoomRunInput): CollaborationRoomRun {
    const workspaceIds = uniqueNonEmpty(input.workspaceIds);
    if (workspaceIds.length === 0) throw new Error('A Room must target at least one workspace');
    const id = `room_${randomUUID()}`;
    const now = new Date().toISOString();
    const run: CollaborationRoomRun = {
      schemaVersion: 1,
      kind: 'room',
      id,
      roomId: id,
      rootRunId: id,
      parentRunId: null,
      workspaceIds,
      source: input.source,
      executor: input.executor ?? { kind: 'coordinator' },
      title: input.title.trim() || 'Agent collaboration',
      task: input.task,
      status: input.status ?? 'queued',
      memoryRefs: clone(DEFAULT_MEMORY_REFS),
      capabilities: { ...DEFAULT_CAPABILITIES, ...input.capabilities },
      revision: 1,
      createdAt: now,
      updatedAt: now,
      ...(isStarted(input.status) ? { startedAt: now } : {}),
      ...(isTerminal(input.status) ? { completedAt: now } : {}),
    };
    return this.insert(run) as CollaborationRoomRun;
  }

  createWorker(input: CreateWorkerRunInput): CollaborationWorkerRun {
    const parent = this.runs.get(input.parentRunId);
    if (!parent) throw new Error(`Parent run not found: ${input.parentRunId}`);
    const root = this.runs.get(parent.rootRunId);
    if (!root || root.kind !== 'room') throw new Error(`Room root not found: ${parent.rootRunId}`);
    if (TERMINAL_STATUSES.has(parent.status) || TERMINAL_STATUSES.has(root.status)) {
      throw new Error('Cannot add a worker to a terminal run');
    }
    const workspaceId = input.workspaceId.trim();
    if (!workspaceId) throw new Error('A worker must target one workspace');
    if (!root.workspaceIds.includes(workspaceId)) {
      throw new Error(`Workspace ${workspaceId} is not part of Room ${root.id}`);
    }
    if (input.executor.kind === 'coordinator') {
      throw new Error('Executable workers require an external_tool or waggle_agent executor');
    }
    if (input.retryOfRunId && !this.runs.has(input.retryOfRunId)) {
      throw new Error(`Retry source run not found: ${input.retryOfRunId}`);
    }

    const now = new Date().toISOString();
    const run: CollaborationWorkerRun = {
      schemaVersion: 1,
      kind: 'worker',
      id: `run_${randomUUID()}`,
      roomId: root.roomId,
      rootRunId: root.id,
      parentRunId: parent.id,
      workspaceId,
      source: input.source,
      executor: input.executor,
      title: input.title.trim() || 'Agent run',
      task: input.task,
      status: input.status ?? 'queued',
      memoryRefs: clone(DEFAULT_MEMORY_REFS),
      capabilities: { ...DEFAULT_CAPABILITIES, ...input.capabilities },
      revision: 1,
      createdAt: now,
      updatedAt: now,
      ...(input.retryOfRunId ? { retryOfRunId: input.retryOfRunId } : {}),
      ...(isStarted(input.status) ? { startedAt: now } : {}),
      ...(isTerminal(input.status) ? { completedAt: now } : {}),
    };
    return this.insert(run) as CollaborationWorkerRun;
  }

  get(id: string): CollaborationRun | undefined {
    const run = this.runs.get(id);
    return run ? clone(run) : undefined;
  }

  list(query: RunQuery = {}): CollaborationRun[] {
    const limit = Math.max(1, Math.min(query.limit ?? 500, 1_000));
    return [...this.runs.values()]
      .filter((run) => !query.roomId || run.roomId === query.roomId)
      .filter((run) => !query.status || run.status === query.status)
      .filter((run) => !query.source || run.source === query.source)
      .filter((run) => {
        if (!query.workspaceId) return true;
        return run.kind === 'room'
          ? run.workspaceIds.includes(query.workspaceId)
          : run.workspaceId === query.workspaceId;
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit)
      .map(clone);
  }

  snapshot(query: RunQuery = {}): CollaborationRunSnapshot {
    return { lastSeq: this.lastSeq, runs: this.list(query) };
  }

  eventsSince(since: number, query: RunQuery = {}): RunEventsResult {
    const oldest = this.events[0]?.seq ?? this.lastSeq + 1;
    if (since < oldest - 1) {
      return {
        lastSeq: this.lastSeq,
        resetRequired: true,
        events: [],
        snapshot: this.snapshot(query),
      };
    }
    const events = this.events
      .filter((event) => event.seq > since && matchesQuery(event.run, query))
      .map(clone);
    return { lastSeq: this.lastSeq, resetRequired: false, events };
  }

  update(id: string, patch: CollaborationRunPatch): CollaborationRun {
    return this.applyPatch(id, patch, false);
  }

  registerControls(id: string, controls: RunControls): () => void {
    if (!this.runs.has(id)) throw new Error(`Run not found: ${id}`);
    this.controls.set(id, controls);
    return () => {
      if (this.controls.get(id) === controls) this.controls.delete(id);
    };
  }

  async control(
    id: string,
    action: CollaborationRunControl,
    message?: string,
  ): Promise<CollaborationRun> {
    const run = this.runs.get(id);
    if (!run) throw new Error(`Run not found: ${id}`);
    if (TERMINAL_STATUSES.has(run.status)) throw new Error(`Run is already ${run.status}`);

    if (run.kind === 'room' && action === 'cancel') {
      const roomHandler = this.controls.get(id)?.cancel;
      if (roomHandler) {
        if (!run.capabilities.cancel) throw new Error('cancel is not supported for this run');
        this.applyPatch(id, { status: 'cancelling' }, false);
        try {
          await roomHandler({ action, run: clone(run) });
        } catch (err) {
          const current = this.runs.get(id);
          if (current?.status === 'cancelling') this.applyPatch(id, { status: run.status }, true);
          throw err;
        }
        const current = this.runs.get(id);
        return current && TERMINAL_STATUSES.has(current.status)
          ? clone(current)
          : this.applyPatch(id, { status: 'cancelled' }, false);
      }
      const descendants = this.descendants(run.id).filter((child) => ACTIVE_STATUSES.has(child.status));
      if (descendants.length === 0) return this.applyPatch(run.id, { status: 'cancelled' }, true);
      const failures: string[] = [];
      for (const child of descendants.reverse()) {
        const current = this.runs.get(child.id);
        if (!current || TERMINAL_STATUSES.has(current.status)) continue;
        try { await this.control(child.id, 'cancel'); }
        catch (err) { failures.push(err instanceof Error ? err.message : String(err)); }
      }
      if (failures.length > 0) throw new Error(`Some Room participants could not be cancelled: ${failures.join('; ')}`);
      return this.get(run.id)!;
    }

    if (!run.capabilities[action]) throw new Error(`${action} is not supported for this run`);
    const handler = this.controls.get(id)?.[action];
    if (!handler) throw new Error(`${action} is unavailable after runtime restart`);
    if (action === 'message' && !message?.trim()) throw new Error('message is required');

    if (action === 'cancel') this.applyPatch(id, { status: 'cancelling' }, false);
    try {
      await handler({ action, message, run: clone(run) });
    } catch (err) {
      if (action === 'cancel') this.applyPatch(id, { status: 'running' }, false);
      throw err;
    }

    if (action === 'cancel') return this.applyPatch(id, { status: 'cancelled' }, false);
    if (action === 'pause') return this.applyPatch(id, { status: 'paused' }, false);
    if (action === 'resume') return this.applyPatch(id, { status: 'running' }, false);
    return this.get(id)!;
  }

  /**
   * Issue a process-local credential that can authenticate only the
   * collaboration endpoints for one active worker. The raw token is never
   * persisted; only its SHA-256 digest is retained in memory.
   */
  issueCredential(runId: string): string {
    const run = this.runs.get(runId);
    if (!run || run.kind !== 'worker') throw new Error(`Worker run not found: ${runId}`);
    if (!ACTIVE_STATUSES.has(run.status)) throw new Error(`Run is already ${run.status}`);
    const token = randomBytes(32).toString('base64url');
    this.credentialRuns.set(hashCredential(token), runId);
    return token;
  }

  authenticateCredential(token: string): CollaborationWorkerRun | undefined {
    if (typeof token !== 'string' || token.length < 32 || token.length > 200) return undefined;
    const digest = hashCredential(token);
    const runId = this.credentialRuns.get(digest);
    if (!runId) return undefined;
    const run = this.runs.get(runId);
    if (!run || run.kind !== 'worker' || !ACTIVE_STATUSES.has(run.status)) {
      this.credentialRuns.delete(digest);
      return undefined;
    }
    return clone(run);
  }

  revokeCredential(token: string): void {
    this.credentialRuns.delete(hashCredential(token));
  }

  reconcileExternalProcesses(alivePids: ReadonlySet<number>): number {
    let interrupted = 0;
    for (const run of [...this.runs.values()]) {
      if (run.kind !== 'worker' || run.source !== 'external_tool' || !ACTIVE_STATUSES.has(run.status)) continue;
      const pid = run.executor.pid;
      if (pid == null || !alivePids.has(pid)) {
        this.applyPatch(run.id, {
          status: 'interrupted',
          result: { error: 'External process was not running when Waggle restarted' },
        }, true);
        interrupted++;
      }
    }
    return interrupted;
  }

  subscribe(listener: RunListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    this.controls.clear();
    this.credentialRuns.clear();
    this.listeners.clear();
  }

  private insert(run: CollaborationRun): CollaborationRun {
    this.runs.set(run.id, clone(run));
    this.record(run);
    if (run.kind === 'worker') this.recomputeParent(run.parentRunId);
    return clone(run);
  }

  private applyPatch(id: string, patch: CollaborationRunPatch, derived: boolean): CollaborationRun {
    const current = this.runs.get(id);
    if (!current) throw new Error(`Run not found: ${id}`);
    if (patch.status && patch.status !== current.status && !derived) {
      if (!ALLOWED_TRANSITIONS[current.status].has(patch.status)) {
        throw new Error(`Illegal run transition: ${current.status} -> ${patch.status}`);
      }
    }

    const now = new Date().toISOString();
    const next: CollaborationRun = {
      ...current,
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.task !== undefined ? { task: patch.task } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.executor ? { executor: { ...current.executor, ...patch.executor } } : {}),
      ...(patch.progress === null ? { progress: undefined } : patch.progress ? { progress: patch.progress } : {}),
      ...(patch.result ? { result: { ...current.result, ...patch.result } } : {}),
      ...(patch.metrics ? { metrics: { ...current.metrics, ...patch.metrics } } : {}),
      ...(patch.memoryRefs ? {
        memoryRefs: {
          ...current.memoryRefs,
          ...patch.memoryRefs,
          workspaceFrameIds: patch.memoryRefs.workspaceFrameIds
            ? { ...current.memoryRefs.workspaceFrameIds, ...patch.memoryRefs.workspaceFrameIds }
            : current.memoryRefs.workspaceFrameIds,
        },
      } : {}),
      ...(patch.capabilities ? { capabilities: { ...current.capabilities, ...patch.capabilities } } : {}),
      revision: current.revision + 1,
      updatedAt: now,
      ...(!current.startedAt && isStarted(patch.status) ? { startedAt: now } : {}),
      ...(!current.completedAt && isTerminal(patch.status) ? { completedAt: now } : {}),
    };
    this.runs.set(id, next);
    if (TERMINAL_STATUSES.has(next.status)) this.revokeCredentialsForRun(id);
    this.record(next);
    if (next.kind === 'worker') this.recomputeParent(next.parentRunId);
    return clone(next);
  }

  private recomputeParent(parentRunId: string): void {
    const parent = this.runs.get(parentRunId);
    if (!parent) return;
    const children = [...this.runs.values()].filter(
      (run): run is CollaborationWorkerRun => run.kind === 'worker' && run.parentRunId === parentRunId,
    );
    if (children.length === 0) return;
    const nextStatus = parent.status === 'cancelling' && children.some((child) => ACTIVE_STATUSES.has(child.status))
      ? 'cancelling'
      : derivedStatus(children);
    const completed = children.filter((child) => child.status === 'completed').length;
    const failed = children.filter((child) => ['failed', 'interrupted'].includes(child.status)).length;
    const summary = TERMINAL_STATUSES.has(nextStatus)
      ? `${completed}/${children.length} participants completed${failed > 0 ? `; ${failed} failed or were interrupted` : ''}`
      : undefined;
    if (parent.status !== nextStatus || (summary && parent.result?.summary !== summary)) {
      this.applyPatch(parent.id, {
        status: nextStatus,
        ...(summary ? { result: { summary } } : {}),
      }, true);
    }
  }

  private descendants(parentId: string): CollaborationWorkerRun[] {
    const direct = [...this.runs.values()].filter(
      (run): run is CollaborationWorkerRun => run.kind === 'worker' && run.parentRunId === parentId,
    );
    return direct.flatMap((run) => [run, ...this.descendants(run.id)]);
  }

  private revokeCredentialsForRun(runId: string): void {
    for (const [digest, ownerRunId] of this.credentialRuns) {
      if (ownerRunId === runId) this.credentialRuns.delete(digest);
    }
  }

  private record(run: CollaborationRun): void {
    const event: CollaborationRunEvent = {
      seq: ++this.lastSeq,
      type: 'upsert',
      run: clone(run),
      timestamp: new Date().toISOString(),
    };
    this.events.push(event);
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
    this.persist();
    for (const listener of this.listeners) listener(clone(event));
  }

  private interruptInFlightInternalRuns(): void {
    const active = [...this.runs.values()].filter(
      (run) => run.source !== 'external_tool' && ACTIVE_STATUSES.has(run.status),
    );
    for (const run of active) {
      this.applyPatch(run.id, {
        status: 'interrupted',
        result: { error: 'Waggle restarted before this run finished' },
      }, true);
    }
  }

  private load(): void {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.persistPath, 'utf8')) as Partial<RegistryFile>;
      if (parsed.version !== 1 || !Array.isArray(parsed.runs)) return;
      for (const run of parsed.runs) {
        if (isCollaborationRun(run)) this.runs.set(run.id, run);
      }
      this.lastSeq = Number.isInteger(parsed.lastSeq) ? parsed.lastSeq! : 0;
      this.events = Array.isArray(parsed.events)
        ? parsed.events.filter(isCollaborationRunEvent).slice(-MAX_EVENTS)
        : [];
    } catch {
      // Missing/corrupt registry degrades to a clean store. Existing minds and
      // chat transcripts remain the durable result sources.
    }
  }

  private persist(): void {
    const data: RegistryFile = {
      version: 1,
      lastSeq: this.lastSeq,
      runs: [...this.runs.values()],
      events: this.events,
    };
    const dir = path.dirname(this.persistPath);
    fs.mkdirSync(dir, { recursive: true });
    const temp = `${this.persistPath}.${process.pid}.${randomUUID()}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(data, null, 2), 'utf8');
    try {
      fs.renameSync(temp, this.persistPath);
    } catch (firstError) {
      // Windows does not reliably replace an existing destination with
      // renameSync. Move the old snapshot aside, install the complete temp
      // file, then remove the backup. If AV/file locking blocks the swap,
      // restore the prior snapshot and surface the error.
      const backup = `${this.persistPath}.${process.pid}.${randomUUID()}.bak`;
      let backedUp = false;
      try {
        if (fs.existsSync(this.persistPath)) {
          fs.renameSync(this.persistPath, backup);
          backedUp = true;
        }
        fs.renameSync(temp, this.persistPath);
        if (backedUp) fs.unlinkSync(backup);
      } catch (replacementError) {
        try {
          if (backedUp && !fs.existsSync(this.persistPath)) fs.renameSync(backup, this.persistPath);
        } catch { /* preserve the replacement error */ }
        try { fs.unlinkSync(temp); } catch { /* already removed */ }
        throw replacementError instanceof Error ? replacementError : firstError;
      }
    }
  }
}

function isStarted(status: CollaborationRunStatus | undefined): boolean {
  return status !== undefined && !['queued'].includes(status);
}

function isTerminal(status: CollaborationRunStatus | undefined): boolean {
  return status !== undefined && TERMINAL_STATUSES.has(status);
}

function uniqueNonEmpty(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function hashCredential(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function matchesQuery(run: CollaborationRun, query: RunQuery): boolean {
  if (query.roomId && run.roomId !== query.roomId) return false;
  if (query.status && run.status !== query.status) return false;
  if (query.source && run.source !== query.source) return false;
  if (query.workspaceId) {
    return run.kind === 'room'
      ? run.workspaceIds.includes(query.workspaceId)
      : run.workspaceId === query.workspaceId;
  }
  return true;
}

function derivedStatus(children: CollaborationWorkerRun[]): CollaborationRunStatus {
  if (children.some((child) => child.status === 'cancelling')) return 'cancelling';
  if (children.some((child) => child.status === 'running' || child.status === 'starting')) return 'running';
  if (children.some((child) => child.status === 'waiting_for_approval')) return 'waiting_for_approval';
  if (children.some((child) => child.status === 'paused')) return 'paused';
  if (children.some((child) => child.status === 'queued')) return 'queued';
  if (children.some((child) => child.status === 'completed')) return 'completed';
  if (children.every((child) => child.status === 'cancelled')) return 'cancelled';
  return 'failed';
}

function isCollaborationRun(value: unknown): value is CollaborationRun {
  if (!value || typeof value !== 'object') return false;
  const run = value as Partial<CollaborationRun>;
  return run.schemaVersion === 1
    && (run.kind === 'room' || run.kind === 'worker')
    && typeof run.id === 'string'
    && typeof run.roomId === 'string'
    && typeof run.rootRunId === 'string'
    && typeof run.source === 'string'
    && typeof run.status === 'string'
    && (COLLABORATION_RUN_STATUSES as readonly string[]).includes(run.status)
    && typeof run.revision === 'number';
}

function isCollaborationRunEvent(value: unknown): value is CollaborationRunEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<CollaborationRunEvent>;
  return Number.isInteger(event.seq) && event.type === 'upsert' && isCollaborationRun(event.run);
}

declare module 'fastify' {
  interface FastifyInstance {
    agentRunRegistry: AgentRunRegistry;
  }
}
