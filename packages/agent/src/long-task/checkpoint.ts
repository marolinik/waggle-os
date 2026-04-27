/**
 * Long-task checkpointing — Phase 3.1 of agent-fix sprint
 * (per decisions/2026-04-26-agent-fix-sprint-plan.md §3.1)
 *
 * Per-step state serialization for long-task agent runs. Lets the recovery
 * layer (Phase 3.2) resume from the last successful step after a crash, a
 * mid-run kill, or a transient tool failure.
 *
 * Storage layout (filesystem JSON, atomic writes):
 *   <rootDir>/<task-id>/step-000000.json
 *   <rootDir>/<task-id>/step-000001.json
 *   ...
 *
 * Each step file is written via tmp+rename so concurrent reads NEVER observe
 * a partial file. Per-task isolation via the directory prefix matches the
 * pilot 2026-04-26 amendment v1 §4 "per-task SessionStore" pattern (one
 * corpus per task, deleted after results are persisted).
 *
 * HARD RULES (from PM brief §3.1):
 *   - schema_version is REQUIRED and validated on save (forward-compat)
 *   - step_index is monotonic 0,1,2,... (verifyIntegrity flags gaps)
 *   - dispose() recursively deletes the per-task directory
 *   - Reads ignore *.tmp files (crash residue from a partial write)
 *   - Per-task isolation: state.task_id MUST match the store's taskId
 */

import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

export const CHECKPOINT_SCHEMA_VERSION = 1;

// ─────────────────────────────────────────────────────────────────────────
// State shape
// ─────────────────────────────────────────────────────────────────────────

/**
 * A single decision recorded in the agent's history. Used by the recovery
 * layer to inform retry strategy and by audit / replay tooling.
 */
export interface Decision {
  /** step_index where the decision was made. */
  step_index: number;
  /** What was decided (one short sentence). */
  decision: string;
  /** Optional rationale captured at decision time. */
  rationale?: string;
  /** Optional list of alternatives the agent considered. */
  alternatives_considered?: readonly string[];
}

/**
 * Per-step agent state. JSON-serializable. One file per step on disk.
 *
 * Persistent fields (carried forward across steps by `nextStateFrom`):
 *   accumulated_context · retrieval_cache · decision_history
 *
 * Per-step fields (overwritten each step):
 *   step_action · step_input · step_output · cost_usd · latency_ms · error
 */
export interface CheckpointStepState {
  /** Forward-compat schema version. */
  schema_version: number;
  /** Logical task identifier (matches per-task directory name). */
  task_id: string;
  /** Run-level UUID grouping multiple tasks in the same run. */
  run_id: string;
  /** Monotonic 0-indexed step number. */
  step_index: number;
  /** ISO 8601 UTC timestamp at the moment this checkpoint was captured. */
  timestamp_iso: string;
  /** Action / tool / cell label that produced this step. */
  step_action: string;
  /** Inputs the step received. */
  step_input: Readonly<Record<string, unknown>>;
  /** Outputs the step produced. */
  step_output: Readonly<Record<string, unknown>>;
  /** Running scratchpad / synthesis built up across all steps. */
  accumulated_context: string;
  /** Cache of retrieval / search query → results, keyed by canonical query string. */
  retrieval_cache: Readonly<Record<string, unknown>>;
  /** History of decisions made up to and including this step. */
  decision_history: readonly Decision[];
  /** Optional per-step cost (USD). */
  cost_usd?: number;
  /** Optional per-step latency (ms). */
  latency_ms?: number;
  /** Optional error string if this step failed. Recovery layer reads this. */
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────

const STEP_FILE_RE = /^step-(\d{6})\.json$/;
const PADDING_WIDTH = 6;

function stepFilename(stepIndex: number): string {
  return `step-${String(stepIndex).padStart(PADDING_WIDTH, '0')}.json`;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export interface CheckpointStoreOptions {
  /** Parent directory under which the per-task subfolder lives. */
  rootDir: string;
  /** Logical task ID — used as the per-task subfolder name. */
  taskId: string;
}

export interface IntegrityReport {
  ok: boolean;
  issues: readonly string[];
}

/**
 * Per-task checkpoint store. One instance corresponds to exactly one task —
 * mirrors the per-task SessionStore isolation pattern from the pilot
 * 2026-04-26 amendment v1 §4.
 */
export class CheckpointStore {
  private readonly taskIdInternal: string;
  private readonly taskDir: string;

  constructor(opts: CheckpointStoreOptions) {
    if (!opts.rootDir) throw new Error('CheckpointStore: rootDir is required');
    if (!opts.taskId) throw new Error('CheckpointStore: taskId is required');
    if (opts.taskId.includes(path.sep) || opts.taskId.includes('/') || opts.taskId.includes('\\')) {
      throw new Error(`CheckpointStore: taskId must not contain path separators (got "${opts.taskId}")`);
    }
    if (opts.taskId === '.' || opts.taskId === '..') {
      throw new Error(`CheckpointStore: taskId must not be "." or ".."`);
    }
    this.taskIdInternal = opts.taskId;
    this.taskDir = path.join(opts.rootDir, opts.taskId);
  }

  /** Per-task directory path (read-only accessor). */
  get directory(): string {
    return this.taskDir;
  }

  /** Logical task ID (read-only accessor). */
  get taskId(): string {
    return this.taskIdInternal;
  }

  /** Idempotent: ensures per-task directory exists. Safe to call repeatedly. */
  async init(): Promise<void> {
    await fsp.mkdir(this.taskDir, { recursive: true });
  }

  /**
   * Atomically writes a step's state. Implementation: write to <file>.<rand>.tmp,
   * then rename to the final filename. Reads never observe partial files.
   *
   * Per-task directory is mkdir'd on every save, so callers don't strictly
   * need to call init() first.
   *
   * Returns the absolute path of the finalized step file.
   */
  async save(state: CheckpointStepState): Promise<string> {
    if (state.task_id !== this.taskIdInternal) {
      throw new Error(
        `CheckpointStore: state.task_id="${state.task_id}" does not match store.taskId="${this.taskIdInternal}"`,
      );
    }
    if (!Number.isInteger(state.step_index) || state.step_index < 0) {
      throw new Error(
        `CheckpointStore: step_index must be a non-negative integer (got ${String(state.step_index)})`,
      );
    }
    if (state.schema_version !== CHECKPOINT_SCHEMA_VERSION) {
      throw new Error(
        `CheckpointStore: schema_version mismatch — store expects ${CHECKPOINT_SCHEMA_VERSION}, state has ${String(state.schema_version)}`,
      );
    }

    await fsp.mkdir(this.taskDir, { recursive: true });
    const finalPath = path.join(this.taskDir, stepFilename(state.step_index));
    // Randomized .tmp suffix so two concurrent writers at the same step_index
    // (e.g. retry races) don't collide on a shared tmp filename.
    const tmpPath = `${finalPath}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    const json = JSON.stringify(state, null, 2);
    await fsp.writeFile(tmpPath, json, { encoding: 'utf-8' });
    try {
      await fsp.rename(tmpPath, finalPath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      // Windows quirk: fs.rename refuses to overwrite an existing destination
      // (POSIX silently overwrites). When two writers race the same step_index
      // (e.g. a retry that overlapped its predecessor), the loser yields:
      // there is already a valid state at finalPath from the winner. Drop our
      // tmp file and report the destination path. Any other error is fatal.
      if ((code === 'EPERM' || code === 'EEXIST') && (await fileExists(finalPath))) {
        await fsp.rm(tmpPath, { force: true });
        return finalPath;
      }
      await fsp.rm(tmpPath, { force: true });
      throw err;
    }
    return finalPath;
  }

  /** Loads a specific step. Returns undefined if no file exists at that index. */
  async load(stepIndex: number): Promise<CheckpointStepState | undefined> {
    const filePath = path.join(this.taskDir, stepFilename(stepIndex));
    let json: string;
    try {
      json = await fsp.readFile(filePath, 'utf-8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw err;
    }
    return JSON.parse(json) as CheckpointStepState;
  }

  /** Loads the highest-indexed step. Returns undefined if no steps. */
  async loadLatest(): Promise<CheckpointStepState | undefined> {
    const indices = await this.listSteps();
    if (indices.length === 0) return undefined;
    return this.load(indices[indices.length - 1]!);
  }

  /**
   * Returns sorted-ascending step indices that have finalized files in the
   * per-task directory. Ignores *.tmp residue (crash artifact from a
   * partial save) and any non-matching filenames.
   *
   * Returns [] if the per-task directory does not exist (treated as
   * "no steps yet" rather than an error).
   */
  async listSteps(): Promise<number[]> {
    let entries: string[];
    try {
      entries = await fsp.readdir(this.taskDir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
    const indices: number[] = [];
    for (const name of entries) {
      const m = name.match(STEP_FILE_RE);
      if (!m) continue;
      indices.push(Number.parseInt(m[1]!, 10));
    }
    indices.sort((a, b) => a - b);
    return indices;
  }

  /**
   * Walks every step file and verifies:
   *   1. step_index sequence is monotonic 0,1,2,... with no gaps
   *   2. file's step_index matches its filename's step_index
   *   3. schema_version matches CHECKPOINT_SCHEMA_VERSION
   *
   * Returns ok=true iff all checks pass; otherwise returns the issues list.
   */
  async verifyIntegrity(): Promise<IntegrityReport> {
    const indices = await this.listSteps();
    const issues: string[] = [];
    for (let expected = 0; expected < indices.length; expected += 1) {
      const observed = indices[expected]!;
      if (observed !== expected) {
        issues.push(`gap or out-of-order: expected step_index=${expected}, found ${observed}`);
        // Stop on first gap — the rest of the report would be noise.
        break;
      }
      const state = await this.load(observed);
      if (!state) {
        issues.push(`step ${observed}: file disappeared mid-verify`);
        continue;
      }
      if (state.step_index !== observed) {
        issues.push(`step ${observed}: file.step_index=${state.step_index} does not match filename`);
      }
      if (state.schema_version !== CHECKPOINT_SCHEMA_VERSION) {
        issues.push(`step ${observed}: schema_version=${state.schema_version} (expected ${CHECKPOINT_SCHEMA_VERSION})`);
      }
    }
    return { ok: issues.length === 0, issues };
  }

  /**
   * Recursively deletes the per-task directory. Per amendment v2 §4 pattern:
   * "deleted after each task once results are persisted". Idempotent —
   * no-ops if the directory does not exist.
   */
  async dispose(): Promise<void> {
    await fsp.rm(this.taskDir, { recursive: true, force: true });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers (used by Phase 3.2 recovery + Phase 3.4 agent-loop integration)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Builds an empty CheckpointStepState shell. Useful when no prior checkpoint
 * exists — Phase 3.2 recovery uses this to construct a fresh state.
 */
export function makeInitialState(opts: {
  task_id: string;
  run_id: string;
  step_action?: string;
}): CheckpointStepState {
  return {
    schema_version: CHECKPOINT_SCHEMA_VERSION,
    task_id: opts.task_id,
    run_id: opts.run_id,
    step_index: 0,
    timestamp_iso: new Date().toISOString(),
    step_action: opts.step_action ?? 'init',
    step_input: {},
    step_output: {},
    accumulated_context: '',
    retrieval_cache: {},
    decision_history: [],
  };
}

/**
 * Builds the next step state from the prior step's state. Increments
 * step_index, copies forward the persistent fields (accumulated_context,
 * retrieval_cache, decision_history) and merges in caller-supplied additions.
 *
 * Per-step fields (step_action / step_input / step_output / cost_usd /
 * latency_ms / error) are taken from `opts`, not carried forward.
 */
export function nextStateFrom(prior: CheckpointStepState, opts: {
  step_action: string;
  step_input?: Record<string, unknown>;
  step_output?: Record<string, unknown>;
  decisions?: readonly Decision[];
  retrieval_additions?: Record<string, unknown>;
  appended_context?: string;
  cost_usd?: number;
  latency_ms?: number;
  error?: string;
}): CheckpointStepState {
  return {
    schema_version: CHECKPOINT_SCHEMA_VERSION,
    task_id: prior.task_id,
    run_id: prior.run_id,
    step_index: prior.step_index + 1,
    timestamp_iso: new Date().toISOString(),
    step_action: opts.step_action,
    step_input: { ...(opts.step_input ?? {}) },
    step_output: { ...(opts.step_output ?? {}) },
    accumulated_context: opts.appended_context !== undefined
      ? prior.accumulated_context + opts.appended_context
      : prior.accumulated_context,
    retrieval_cache: { ...prior.retrieval_cache, ...(opts.retrieval_additions ?? {}) },
    decision_history: [...prior.decision_history, ...(opts.decisions ?? [])],
    cost_usd: opts.cost_usd,
    latency_ms: opts.latency_ms,
    error: opts.error,
  };
}
