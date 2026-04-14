/**
 * Evolution Orchestrator — Phase 4 of the self-evolution loop.
 *
 * Wires the primitives into a closed loop:
 *
 *   traces → eval dataset → ComposeEvolution → gates → run store
 *                                                  ↓
 *                                            user accepts/rejects
 *                                                  ↓
 *                                          deploy callback fires
 *                                                  ↓
 *                                         runStore.markDeployed()
 *
 * The orchestrator itself does NOT hot-reload personas or rewrite the
 * behavioral spec — it calls a pluggable `deploy` callback supplied by
 * the caller. This keeps the orchestrator pure (easy to unit-test) and
 * lets the server/desktop app wire up the real side-effects (file write,
 * persona reload, event emission) separately.
 *
 * Persistence is in @waggle/core's `EvolutionRunStore`. Every run — even
 * rejected or failed — is preserved for audit.
 */

import type {
  ExecutionTraceStore,
  EvolutionRun,
  EvolutionRunStore,
  EvolutionRunStatus,
  EvolutionRunTarget,
  ParsedExecutionTrace,
  TraceOutcome,
} from '@waggle/core';
import { ComposeEvolution, type ComposeEvolutionOptions, type ComposeEvolutionResult } from './compose-evolution.js';
import { runGates, type GateResult, type GateOptions } from './evolution-gates.js';
import { EvalDatasetBuilder, type EvalExample } from './eval-dataset.js';

// ── Dependency injection types ─────────────────────────────────

export interface EvolutionOrchestratorDeps {
  /** Source of traces (from @waggle/core) */
  traceStore: ExecutionTraceStore;
  /** Persistent run history (from @waggle/core) */
  runStore: EvolutionRunStore;
  /**
   * Function invoked when a run moves from accepted → (deployed | failed).
   * Returning normally marks the run deployed; throwing marks it failed
   * with the error message as reason.
   *
   * This is where the server writes to the persona file, reloads the
   * orchestrator cache, updates behavioral-spec.ts, etc.
   */
  deploy?: (run: EvolutionRun) => Promise<void>;
}

export interface EvolutionAutoTriggerConfig {
  /** Minimum traces (with the given outcome filter) before a run is triggered */
  minTraces: number;
  /** Restrict trigger to a specific persona / workspace / taskShape */
  traceFilter?: {
    personaId?: string;
    workspaceId?: string;
    taskShape?: string;
  };
}

export interface EvolutionOrchestratorOptions {
  /** What is being evolved (drives gate policy + persistence tag) */
  targetKind: EvolutionRunTarget;
  /** Stable identifier — e.g. persona id, spec-section name */
  targetName?: string;
  /** The current baseline text to evolve against */
  baseline: string;
  /** Compose options — already wired with examples, judge, execute, mutate */
  compose: Omit<ComposeEvolutionOptions, 'schema' | 'instructions'> & {
    schema: Omit<ComposeEvolutionOptions['schema'], 'baseline'>;
    instructions: Omit<ComposeEvolutionOptions['instructions'], 'baseline'>;
  };
  /** Optional gate overrides (size caps, growth ratio, etc) */
  gateOptions?: GateOptions;
  /** Improvement threshold required to create a proposal (default 0.02) */
  minDelta?: number;
  /** Auto-trigger configuration — when omitted, runOnce() is manual-only */
  autoTrigger?: EvolutionAutoTriggerConfig;
  /** Abort the run early */
  signal?: AbortSignal;
  /** Optional progress pass-through */
  onProgress?: (event: EvolutionProgress) => void;
}

export interface EvolutionProgress {
  phase: 'trigger-check' | 'dataset' | 'compose' | 'gates' | 'persist' | 'skipped' | 'done';
  message?: string;
  detail?: unknown;
}

// ── Schema baseline input ──────────────────────────────────────

/** Optional structural baseline when the target has one (e.g. persona's DSPy signature). */
export interface SchemaBaselineInput {
  baseline: ComposeEvolutionOptions['schema']['baseline'];
}

// ── Run result ─────────────────────────────────────────────────

export type OrchestratorOutcome =
  | 'proposed'      // Run created, awaiting accept/reject
  | 'skipped-trigger'
  | 'skipped-gates' // Completed but gates failed
  | 'skipped-delta' // Improvement below minDelta
  | 'aborted';

export interface OrchestratorRunResult {
  outcome: OrchestratorOutcome;
  /** Populated for 'proposed' and 'skipped-gates' */
  run?: EvolutionRun;
  /** Raw ComposeEvolution result when the compose stage ran */
  compose?: ComposeEvolutionResult;
  /** Gate results for audit */
  gateResults?: GateResult[];
  /** Reason if outcome is skipped/aborted */
  reason?: string;
}

// ── Orchestrator ──────────────────────────────────────────────

export class EvolutionOrchestrator {
  private deps: EvolutionOrchestratorDeps;

  constructor(deps: EvolutionOrchestratorDeps) {
    this.deps = deps;
  }

  /**
   * Run the full orchestration pipeline once. Returns structured outcome.
   * Does NOT deploy — that happens when the caller calls `accept(uuid)`.
   */
  async runOnce(options: EvolutionOrchestratorOptions & {
    schemaBaseline: SchemaBaselineInput['baseline'];
  }): Promise<OrchestratorRunResult> {
    const emit = (phase: EvolutionProgress['phase'], message?: string, detail?: unknown) => {
      options.onProgress?.({ phase, message, detail });
    };

    if (options.signal?.aborted) {
      return { outcome: 'aborted', reason: 'aborted before start' };
    }

    // Trigger check — skip if auto-trigger thresholds aren't met.
    if (options.autoTrigger) {
      emit('trigger-check');
      const ok = this.meetsAutoTrigger(options.autoTrigger);
      if (!ok) {
        emit('skipped');
        return {
          outcome: 'skipped-trigger',
          reason: `fewer than ${options.autoTrigger.minTraces} eligible traces`,
        };
      }
    }

    // Derive the eval dataset from finalized traces of the requested target.
    emit('dataset');
    const examples = this.buildExamplesFromTraces(options);
    if (examples.length === 0) {
      emit('skipped', 'no eval examples');
      return { outcome: 'skipped-trigger', reason: 'no eligible traces to form dataset' };
    }

    // Run the compose pipeline.
    emit('compose');
    const composeResult = await new ComposeEvolution().run({
      schema: { ...options.compose.schema, baseline: options.schemaBaseline, examples },
      instructions: { ...options.compose.instructions, baseline: options.baseline, examples },
      feedbackFilter: options.compose.feedbackFilter,
      signal: options.signal,
      onProgress: (e) => emit('compose', undefined, e),
    });

    if (options.signal?.aborted) {
      return { outcome: 'aborted', reason: 'aborted during compose', compose: composeResult };
    }

    const winnerText = composeResult.instructions.winner.prompt;
    // Apples-to-apples: compare the GEPA baseline candidate (history[0])
    // to the GEPA winner. Both are scored by the same judge on the same
    // eval stage, so the delta is a clean signal.
    const baselineOverall = composeResult.instructions.history[0]?.score?.overall ?? 0;
    const winnerOverall = composeResult.instructions.winner.score?.overall ?? 0;
    const delta = winnerOverall - baselineOverall;
    const minDelta = options.minDelta ?? 0.02;

    // Gate check.
    emit('gates');
    const gateResult = runGates(
      {
        candidate: winnerText,
        baseline: options.baseline,
        scores: { baseline: baselineOverall, candidate: winnerOverall },
      },
      {
        targetKind: options.targetKind,
        ...options.gateOptions,
      },
    );

    if (delta < minDelta) {
      emit('skipped', `delta ${(delta * 100).toFixed(2)}pp below minimum ${(minDelta * 100).toFixed(2)}pp`);
      emit('done');
      return {
        outcome: 'skipped-delta',
        reason: `winner improved only ${(delta * 100).toFixed(2)}pp (min ${(minDelta * 100).toFixed(2)}pp required)`,
        compose: composeResult,
        gateResults: gateResult.results,
      };
    }

    // Persist — create the proposed run even if gates failed, so there's audit.
    emit('persist');
    const run = this.deps.runStore.create({
      targetKind: options.targetKind,
      targetName: options.targetName ?? null,
      baselineText: options.baseline,
      winnerText,
      winnerSchema: composeResult.frozenSchema,
      deltaAccuracy: delta,
      gateVerdict: gateResult.verdict,
      gateReasons: gateResult.results.map(r => ({
        gate: r.gate, verdict: r.verdict, reason: r.reason,
      })),
      artifacts: {
        runSeed: options.compose.instructions.seed ?? null,
        generations: options.compose.instructions.generations ?? null,
        paretoFrontSize: composeResult.schema.paretoFront.length,
        exampleCount: examples.length,
      },
    });

    if (gateResult.verdict === 'fail') {
      // Immediately reject runs that fail gates so the user doesn't see
      // dangerous candidates in the "review" queue. Run history is kept.
      const rejected = this.deps.runStore.reject(
        run.run_uuid,
        `gate failure: ${gateResult.firstFailure?.reason ?? 'unknown'}`,
      );
      emit('done');
      return {
        outcome: 'skipped-gates',
        reason: gateResult.firstFailure?.reason ?? 'gate failure',
        run: rejected ?? run,
        compose: composeResult,
        gateResults: gateResult.results,
      };
    }

    emit('done');
    return {
      outcome: 'proposed',
      run,
      compose: composeResult,
      gateResults: gateResult.results,
    };
  }

  /** Accept a proposed run and invoke the deploy callback. */
  async accept(runUuid: string, userNote?: string): Promise<EvolutionRun | undefined> {
    const accepted = this.deps.runStore.accept(runUuid, userNote);
    if (!accepted || accepted.status !== 'accepted') return accepted;

    if (!this.deps.deploy) {
      // No deploy hook configured — leave as 'accepted' and let the caller
      // mark deployed manually.
      return accepted;
    }

    try {
      await this.deps.deploy(accepted);
      return this.deps.runStore.markDeployed(runUuid);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return this.deps.runStore.markFailed(runUuid, reason);
    }
  }

  /** Reject a proposed run with optional reason. */
  reject(runUuid: string, reason?: string): EvolutionRun | undefined {
    return this.deps.runStore.reject(runUuid, reason);
  }

  /** List runs (thin pass-through, handy for the UI). */
  list(filter?: Parameters<EvolutionRunStore['list']>[0]): EvolutionRun[] {
    return this.deps.runStore.list(filter);
  }

  /** Get a single run by uuid. */
  get(runUuid: string): EvolutionRun | undefined {
    return this.deps.runStore.getByUuid(runUuid);
  }

  // ── Internals ───────────────────────────────────────────────

  private meetsAutoTrigger(trigger: EvolutionAutoTriggerConfig): boolean {
    const outcomes: TraceOutcome[] = ['success', 'verified', 'corrected'];
    const traces = this.deps.traceStore.query({
      ...(trigger.traceFilter ?? {}),
      outcome: outcomes,
      limit: Math.max(trigger.minTraces * 2, 50),
    });
    return traces.length >= trigger.minTraces;
  }

  private buildExamplesFromTraces(
    options: EvolutionOrchestratorOptions,
  ): EvalExample[] {
    // If the caller already supplied examples via compose.schema/instructions,
    // we respect that. Otherwise we mine them from the trace store.
    const existing = options.compose.schema.examples ?? options.compose.instructions.examples;
    if (existing && existing.length > 0) return existing;

    const builder = new EvalDatasetBuilder(this.deps.traceStore);
    const traceFilter = options.autoTrigger?.traceFilter ?? {};
    const traces = builder.sourceFromTraces(['success', 'verified'], true, {
      ...traceFilter,
      limit: 500,
    });
    return traces;
  }
}

// ── Convenience helpers ────────────────────────────────────────

/**
 * Filter a list of parsed traces down to those likely useful for evolution.
 * Keeps finalized (non-pending) traces with non-empty I/O. Used by callers
 * that want to manually pre-filter before handing to the orchestrator.
 */
export function eligibleForEvolution(traces: ParsedExecutionTrace[]): ParsedExecutionTrace[] {
  return traces.filter(t =>
    t.outcome !== 'pending' &&
    t.payload.input.trim().length > 0 &&
    (t.payload.output.trim().length > 0 || t.payload.correctionFeedback),
  );
}

/**
 * Helper that summarizes runs by status/target for dashboard display.
 */
export function summarizeRuns(runs: EvolutionRun[]): {
  total: number;
  byStatus: Record<EvolutionRunStatus, number>;
  byTargetKind: Record<string, number>;
  bestDelta: number;
} {
  const byStatus: Record<EvolutionRunStatus, number> = {
    proposed: 0, accepted: 0, rejected: 0, deployed: 0, failed: 0,
  };
  const byTargetKind: Record<string, number> = {};
  let bestDelta = 0;

  for (const r of runs) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    byTargetKind[r.target_kind] = (byTargetKind[r.target_kind] ?? 0) + 1;
    if (r.delta_accuracy > bestDelta) bestDelta = r.delta_accuracy;
  }

  return {
    total: runs.length,
    byStatus,
    byTargetKind,
    bestDelta,
  };
}
