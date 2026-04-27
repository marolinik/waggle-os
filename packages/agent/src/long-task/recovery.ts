/**
 * Long-task recovery — Phase 3.2 of agent-fix sprint
 * (per decisions/2026-04-26-agent-fix-sprint-plan.md §3.2)
 *
 * Wraps a single step's lifecycle (initial attempt + retries + fallback chain)
 * around a CheckpointStore so the agent loop (Phase 3.4) can be crash-resilient
 * and tool-failure-resilient. The state machine determines which step_index to
 * attempt next based on the latest checkpoint:
 *
 *   no prior checkpoint        → fresh start (step 0, prior_state=undefined)
 *   prior checkpoint with error→ retry that step_index using step N-1's state
 *   prior checkpoint clean     → advance to step_index + 1 using prior as state
 *
 * Within a single run() call:
 *   1. Run stepFn with attempt=1.
 *   2. If it throws: classify as 'retryable' or 'terminal'.
 *      - 'retryable' AND attempts left → exponential backoff + jitter, retry.
 *      - 'terminal' OR attempts exhausted → break to fallback chain.
 *   3. Walk fallback chain (one shot per fallback tool). Each gets stepFn with
 *      fallback_tool set in StepFnInput.
 *   4. On success at any stage: save success state to store, return {ok:true}.
 *   5. If all retries + fallbacks fail: save error state, return {ok:false}.
 *
 * REPLAY DETERMINISM (per PM brief acceptance gate):
 *   Recovery DECISIONS (retry / fallback / exhaust / success) are pure functions
 *   of stepFn outcomes — given identical stepFn behavior, the resulting state
 *   chain is byte-identical. BACKOFF durations are non-deterministic by default
 *   (Math.random for jitter) but can be made deterministic via opts.rng for
 *   replay verification. Tests verify decisions, not durations.
 *
 * PERSISTENCE CADENCE:
 *   Saves happen only on (a) success and (b) exhaustion. Mid-retry failures do
 *   NOT save partial states — keeps the post-crash semantics simple: a fresh
 *   process either sees a clean prior step (and advances) or an exhaustion
 *   error checkpoint (and retries with full budget).
 */

import {
  CheckpointStore,
  CHECKPOINT_SCHEMA_VERSION,
  nextStateFrom,
  type CheckpointStepState,
  type Decision,
} from './checkpoint.js';

// ─────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────

export type RecoveryEventType =
  | 'fresh_start'
  | 'resume_clean'
  | 'resume_from_error'
  | 'attempt'
  | 'retry'
  | 'fallback_attempted'
  | 'success'
  | 'exhausted';

export interface RecoveryEvent {
  type: RecoveryEventType;
  step_index: number;
  /** 1-indexed attempt number (only set for attempt / retry / fallback / success). */
  attempt?: number;
  /** Set on retry / exhausted / resume_from_error. */
  error?: string;
  /** Set on fallback_attempted / success-via-fallback. */
  fallback_tool?: string;
  /** Set on retry: the duration the runner is about to sleep. */
  backoff_ms?: number;
}

export interface StepFnInput {
  /**
   * State at the END of the previous step. Undefined for fresh start (step 0)
   * and for resume_from_error at step 0.
   */
  prior_state: CheckpointStepState | undefined;
  /** Step index this attempt is for (0 for the first action). */
  step_index: number;
  /** 1-indexed attempt count (1 = first try, 2+ = retries, fallback ≥ retries+1). */
  attempt: number;
  /** Set when called via the fallback chain — the tool to use. */
  fallback_tool?: string;
}

export interface StepFnResult {
  /** Outputs the step produced (becomes step_output in the saved state). */
  output: Record<string, unknown>;
  /** Optional cost recorded with the step. */
  cost_usd?: number;
  /** Optional latency recorded with the step. */
  latency_ms?: number;
  /** Decisions made during this step — appended to decision_history. */
  decisions?: readonly Decision[];
  /** Retrieval cache additions — merged into retrieval_cache. */
  retrieval_additions?: Record<string, unknown>;
  /** Optional appended context (concatenated to accumulated_context). */
  appended_context?: string;
}

export type StepFn = (input: StepFnInput) => Promise<StepFnResult>;

export type ErrorClass = 'retryable' | 'terminal';
export type ErrorClassifier = (err: unknown) => ErrorClass;

export interface RecoveryRunnerOptions {
  /** Per-task checkpoint store. Recovery uses store.taskId for state lifecycle. */
  store: CheckpointStore;
  /** Run-level UUID written into every saved checkpoint. */
  runId: string;

  /** Default 3 retries (1 initial + 3 retries = 4 same-tool attempts). */
  maxRetriesPerStep?: number;
  /** Default 1000ms initial backoff (retry 1). */
  baseBackoffMs?: number;
  /** Default 30000ms cap on a single backoff. */
  maxBackoffMs?: number;
  /** Default 0.25 (±25% jitter on top of exponential). 0 = no jitter (deterministic). */
  jitterFactor?: number;

  /** Optional ordered tool fallback chain. One shot per tool. */
  toolFallbackChain?: readonly string[];

  /** Optional error classifier. Default: every error is 'retryable'. */
  classifyError?: ErrorClassifier;

  /** Optional injectable RNG for jitter. Default: Math.random. */
  rng?: () => number;
  /** Optional injectable sleep for tests. Default: native setTimeout. */
  sleep?: (ms: number) => Promise<void>;

  /** Optional event sink. Receives every state-machine event in order. */
  onRecoveryEvent?: (event: RecoveryEvent) => void;
}

export interface RecoveryRunResult {
  /** Final state for this run (success state OR error-tagged exhaustion state). */
  state: CheckpointStepState;
  /** True iff the step ultimately succeeded (no error in final state). */
  ok: boolean;
}

export interface RecoveryRunOptions {
  /** Label for this step (becomes step_action in the saved state). */
  stepAction?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_BACKOFF_MS = 1000;
const DEFAULT_MAX_BACKOFF_MS = 30000;
const DEFAULT_JITTER_FACTOR = 0.25;
const ALWAYS_RETRYABLE: ErrorClassifier = () => 'retryable';

function defaultSleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    // eslint-disable-next-line no-restricted-globals
    setTimeout(resolve, ms);
  });
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/**
 * Compute exponential backoff with optional ±jitterFactor jitter.
 * retryNumber is 1-indexed (retry 1 = baseBackoffMs, retry 2 = 2*base, ...).
 */
function computeBackoff(opts: {
  retryNumber: number;
  baseMs: number;
  maxMs: number;
  jitterFactor: number;
  rng: () => number;
}): number {
  const exponential = Math.min(
    opts.baseMs * 2 ** (opts.retryNumber - 1),
    opts.maxMs,
  );
  if (opts.jitterFactor === 0) return exponential;
  // jitter range: ±jitterFactor * exponential
  const jitter = (opts.rng() * 2 - 1) * opts.jitterFactor * exponential;
  return Math.max(0, exponential + jitter);
}

// ─────────────────────────────────────────────────────────────────────────
// RecoveryRunner
// ─────────────────────────────────────────────────────────────────────────

export class RecoveryRunner {
  private readonly store: CheckpointStore;
  private readonly runId: string;
  private readonly maxRetries: number;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly jitterFactor: number;
  private readonly fallbackChain: readonly string[];
  private readonly classify: ErrorClassifier;
  private readonly rng: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly emit: (event: RecoveryEvent) => void;

  constructor(opts: RecoveryRunnerOptions) {
    if (!opts.store) throw new Error('RecoveryRunner: store is required');
    if (!opts.runId) throw new Error('RecoveryRunner: runId is required');
    const maxRetries = opts.maxRetriesPerStep ?? DEFAULT_MAX_RETRIES;
    if (!Number.isInteger(maxRetries) || maxRetries < 0) {
      throw new Error(`RecoveryRunner: maxRetriesPerStep must be a non-negative integer (got ${String(maxRetries)})`);
    }
    const baseMs = opts.baseBackoffMs ?? DEFAULT_BASE_BACKOFF_MS;
    const maxMs = opts.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
    if (baseMs < 0 || maxMs < 0 || maxMs < baseMs) {
      throw new Error(`RecoveryRunner: invalid backoff bounds (base=${baseMs}, max=${maxMs})`);
    }
    const jitter = opts.jitterFactor ?? DEFAULT_JITTER_FACTOR;
    if (jitter < 0 || jitter > 1) {
      throw new Error(`RecoveryRunner: jitterFactor must be in [0, 1] (got ${jitter})`);
    }

    this.store = opts.store;
    this.runId = opts.runId;
    this.maxRetries = maxRetries;
    this.baseBackoffMs = baseMs;
    this.maxBackoffMs = maxMs;
    this.jitterFactor = jitter;
    this.fallbackChain = opts.toolFallbackChain ?? [];
    this.classify = opts.classifyError ?? ALWAYS_RETRYABLE;
    this.rng = opts.rng ?? Math.random;
    this.sleep = opts.sleep ?? defaultSleep;
    this.emit = opts.onRecoveryEvent ?? (() => {});
  }

  /**
   * Runs ONE step's lifecycle (initial attempt → retries → fallback chain →
   * success-or-exhaustion-save). The state machine inspects the store's
   * latest checkpoint to decide which step to attempt and what prior state
   * to feed into stepFn.
   */
  async run(stepFn: StepFn, opts: RecoveryRunOptions = {}): Promise<RecoveryRunResult> {
    const stepAction = opts.stepAction ?? 'step';
    const { priorState, stepIndexToAttempt } = await this._resolveStartingPoint();

    // Phase 1: same-tool attempts (1 initial + maxRetries retries).
    let lastError: string | undefined;
    for (let attempt = 1; attempt <= this.maxRetries + 1; attempt += 1) {
      if (attempt > 1) {
        const backoffMs = computeBackoff({
          retryNumber: attempt - 1,
          baseMs: this.baseBackoffMs,
          maxMs: this.maxBackoffMs,
          jitterFactor: this.jitterFactor,
          rng: this.rng,
        });
        this.emit({ type: 'retry', step_index: stepIndexToAttempt, attempt, backoff_ms: backoffMs, error: lastError });
        await this.sleep(backoffMs);
      }
      this.emit({ type: 'attempt', step_index: stepIndexToAttempt, attempt });
      try {
        const result = await stepFn({
          prior_state: priorState,
          step_index: stepIndexToAttempt,
          attempt,
        });
        const successState = this._buildSuccessState({
          priorState,
          stepIndex: stepIndexToAttempt,
          stepAction,
          attempt,
          fallbackTool: undefined,
          result,
        });
        await this.store.save(successState);
        this.emit({ type: 'success', step_index: stepIndexToAttempt, attempt });
        return { state: successState, ok: true };
      } catch (err) {
        lastError = errMessage(err);
        const cls = this.classify(err);
        if (cls === 'terminal') break; // skip remaining same-tool retries
      }
    }

    // Phase 2: fallback chain (one shot per fallback tool).
    let nextAttemptCounter = this.maxRetries + 2;
    for (const fallbackTool of this.fallbackChain) {
      const attempt = nextAttemptCounter;
      nextAttemptCounter += 1;
      this.emit({
        type: 'fallback_attempted',
        step_index: stepIndexToAttempt,
        attempt,
        fallback_tool: fallbackTool,
        error: lastError,
      });
      try {
        const result = await stepFn({
          prior_state: priorState,
          step_index: stepIndexToAttempt,
          attempt,
          fallback_tool: fallbackTool,
        });
        const successState = this._buildSuccessState({
          priorState,
          stepIndex: stepIndexToAttempt,
          stepAction,
          attempt,
          fallbackTool,
          result,
        });
        await this.store.save(successState);
        this.emit({
          type: 'success',
          step_index: stepIndexToAttempt,
          attempt,
          fallback_tool: fallbackTool,
        });
        return { state: successState, ok: true };
      } catch (err) {
        lastError = errMessage(err);
        // continue to next fallback
      }
    }

    // Phase 3: exhausted. Persist final error state.
    this.emit({ type: 'exhausted', step_index: stepIndexToAttempt, error: lastError });
    const errorState = this._buildErrorState({
      priorState,
      stepIndex: stepIndexToAttempt,
      stepAction,
      error: lastError ?? 'unknown error',
    });
    await this.store.save(errorState);
    return { state: errorState, ok: false };
  }

  // ──────────────────────────────────────────────────────────────────────
  // Private: state machine + state builders
  // ──────────────────────────────────────────────────────────────────────

  private async _resolveStartingPoint(): Promise<{
    priorState: CheckpointStepState | undefined;
    stepIndexToAttempt: number;
  }> {
    const latest = await this.store.loadLatest();

    if (!latest) {
      this.emit({ type: 'fresh_start', step_index: 0 });
      return { priorState: undefined, stepIndexToAttempt: 0 };
    }

    if (latest.error) {
      this.emit({
        type: 'resume_from_error',
        step_index: latest.step_index,
        error: latest.error,
      });
      if (latest.step_index === 0) {
        return { priorState: undefined, stepIndexToAttempt: 0 };
      }
      const prior = await this.store.load(latest.step_index - 1);
      if (!prior) {
        throw new Error(
          `RecoveryRunner: step ${latest.step_index} has error but step ${latest.step_index - 1} is missing — checkpoint chain corrupt`,
        );
      }
      if (prior.error) {
        throw new Error(
          `RecoveryRunner: prior step ${prior.step_index} also has error — checkpoint chain not clean`,
        );
      }
      return { priorState: prior, stepIndexToAttempt: latest.step_index };
    }

    this.emit({ type: 'resume_clean', step_index: latest.step_index + 1 });
    return { priorState: latest, stepIndexToAttempt: latest.step_index + 1 };
  }

  private _buildSuccessState(args: {
    priorState: CheckpointStepState | undefined;
    stepIndex: number;
    stepAction: string;
    attempt: number;
    fallbackTool: string | undefined;
    result: StepFnResult;
  }): CheckpointStepState {
    const stepInput: Record<string, unknown> = { attempt: args.attempt };
    if (args.fallbackTool !== undefined) stepInput.fallback_tool = args.fallbackTool;

    if (args.priorState) {
      // Resume path: nextStateFrom advances by 1, but we want to OVERWRITE
      // args.stepIndex (which equals priorState.step_index + 1 for clean
      // resume, or priorState.step_index + 1 for error-resume after a
      // rewind to step N-1). nextStateFrom does exactly this.
      return nextStateFrom(args.priorState, {
        step_action: args.stepAction,
        step_input: stepInput,
        step_output: args.result.output,
        decisions: args.result.decisions,
        retrieval_additions: args.result.retrieval_additions,
        appended_context: args.result.appended_context,
        cost_usd: args.result.cost_usd,
        latency_ms: args.result.latency_ms,
      });
    }

    // Fresh path (step 0 with no prior). Build directly — nextStateFrom
    // would assume a prior at step -1 which doesn't exist.
    return {
      schema_version: CHECKPOINT_SCHEMA_VERSION,
      task_id: this.store.taskId,
      run_id: this.runId,
      step_index: args.stepIndex,
      timestamp_iso: new Date().toISOString(),
      step_action: args.stepAction,
      step_input: { ...stepInput },
      step_output: { ...args.result.output },
      accumulated_context: args.result.appended_context ?? '',
      retrieval_cache: { ...(args.result.retrieval_additions ?? {}) },
      decision_history: [...(args.result.decisions ?? [])],
      cost_usd: args.result.cost_usd,
      latency_ms: args.result.latency_ms,
    };
  }

  private _buildErrorState(args: {
    priorState: CheckpointStepState | undefined;
    stepIndex: number;
    stepAction: string;
    error: string;
  }): CheckpointStepState {
    if (args.priorState) {
      return nextStateFrom(args.priorState, {
        step_action: args.stepAction,
        step_input: { exhausted: true },
        step_output: {},
        error: args.error,
      });
    }
    return {
      schema_version: CHECKPOINT_SCHEMA_VERSION,
      task_id: this.store.taskId,
      run_id: this.runId,
      step_index: args.stepIndex,
      timestamp_iso: new Date().toISOString(),
      step_action: args.stepAction,
      step_input: { exhausted: true },
      step_output: {},
      accumulated_context: '',
      retrieval_cache: {},
      decision_history: [],
      error: args.error,
    };
  }
}
