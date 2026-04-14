/**
 * HarnessTraceBridge — translates workflow-harness phase events into
 * execution traces so harnessed agent runs feed the self-evolution loop.
 *
 * Without this bridge the workflow harness is an island: phases run,
 * gates pass or fail, but nothing flows into the `execution_traces`
 * table that the evaluation dataset builder mines. This module closes
 * that loop by subscribing to the shared `harnessEvents` emitter and
 * writing one trace per phase outcome:
 *
 *   harness:phase:complete                → trace outcome 'verified'
 *   harness:phase:fail (aborted === true) → trace outcome 'abandoned'
 *   harness:phase:fail (will retry)       → skipped — only final
 *                                           outcomes become training
 *                                           signal, mid-retry noise
 *                                           stays out of the dataset
 *
 * Each trace records:
 *   - input:    the phase's instruction text
 *   - output:   the phase's agent response (PhaseOutput.content)
 *   - toolCalls + artifacts + tokens from PhaseOutput
 *   - harness:  { harnessId, phaseId, phaseName, gateResults }
 *   - tags:     ['harness', <harnessId>, <phaseId>, 'phase:<name>']
 *   - taskShape: 'harness:<harnessId>'
 *
 * Start the bridge once at server boot; it listens for the lifetime of
 * the process. Tests can pass a scoped `events` EventEmitter to avoid
 * touching the shared singleton.
 */

import type { EventEmitter } from 'node:events';
import {
  harnessEvents,
  type HarnessPhaseCompleteEvent,
  type HarnessPhaseFailEvent,
} from './workflow-harness.js';
import type { TraceRecorder } from './trace-recorder.js';

// ── Context + options ───────────────────────────────────────────

/** Session metadata attached to each harness trace. Optional. */
export interface HarnessTraceContext {
  sessionId?: string | null;
  personaId?: string | null;
  workspaceId?: string | null;
  model?: string | null;
}

/**
 * Context resolver — invoked per event so callers can adapt to the
 * active session / workspace / persona at emit time rather than freezing
 * the context at bridge-start.
 */
export type HarnessTraceContextResolver = (
  event: HarnessPhaseCompleteEvent | HarnessPhaseFailEvent,
) => HarnessTraceContext | undefined;

export interface HarnessTraceBridgeOptions {
  /** The TraceRecorder to write into. */
  recorder: TraceRecorder;
  /**
   * Either a static context applied to every harness trace, or a
   * resolver called per event. Omit when no session context is known.
   */
  context?: HarnessTraceContext | HarnessTraceContextResolver;
  /** Event source — defaults to the shared `harnessEvents` emitter. */
  events?: EventEmitter;
}

// ── Bridge implementation ───────────────────────────────────────

export class HarnessTraceBridge {
  private readonly recorder: TraceRecorder;
  private readonly emitter: EventEmitter;
  private readonly resolveContext: HarnessTraceContextResolver;

  private completeListener: ((ev: HarnessPhaseCompleteEvent) => void) | null = null;
  private failListener: ((ev: HarnessPhaseFailEvent) => void) | null = null;

  constructor(options: HarnessTraceBridgeOptions) {
    this.recorder = options.recorder;
    this.emitter = options.events ?? harnessEvents;
    this.resolveContext = typeof options.context === 'function'
      ? options.context
      : (): HarnessTraceContext | undefined => options.context as HarnessTraceContext | undefined;
  }

  /** Idempotent. Subscribes to complete/fail events. */
  start(): void {
    if (this.completeListener) return;
    this.completeListener = (ev) => this.writeTrace(ev, 'verified');
    this.failListener = (ev) => {
      // Only finalize aborted failures — mid-retry fails are intermediate
      // state and would pollute the eval dataset with noisy negatives.
      if (!ev.aborted) return;
      this.writeTrace(ev, 'abandoned');
    };
    this.emitter.on('harness:phase:complete', this.completeListener);
    this.emitter.on('harness:phase:fail', this.failListener);
  }

  /** Remove listeners. Safe to call multiple times. */
  stop(): void {
    if (this.completeListener) {
      this.emitter.off('harness:phase:complete', this.completeListener);
      this.completeListener = null;
    }
    if (this.failListener) {
      this.emitter.off('harness:phase:fail', this.failListener);
      this.failListener = null;
    }
  }

  /** True if start() has been called and stop() has not. */
  get isRunning(): boolean {
    return this.completeListener !== null;
  }

  // ── Internal ──────────────────────────────────────────────────

  private writeTrace(
    ev: HarnessPhaseCompleteEvent | HarnessPhaseFailEvent,
    outcome: 'verified' | 'abandoned',
  ): void {
    const ctx = this.resolveContext(ev) ?? {};
    const handle = this.recorder.start({
      sessionId: ctx.sessionId ?? null,
      personaId: ctx.personaId ?? null,
      workspaceId: ctx.workspaceId ?? null,
      model: ctx.model ?? null,
      taskShape: `harness:${ev.harnessId}`,
      input: ev.phaseInstruction,
      tags: ['harness', ev.harnessId, ev.phaseId, `phase:${ev.phaseName}`],
    });

    // Tool calls happen at the agent-loop layer, not the harness layer —
    // but the PhaseOutput does carry them forward. Re-record so the trace
    // has end-to-end signal.
    for (const tc of ev.output.toolCalls ?? []) {
      this.recorder.recordToolCall(handle, {
        tool: tc.tool,
        args: normalizeArgs(tc.args),
        result: typeof tc.result === 'string' ? tc.result : String(tc.result ?? ''),
        ok: true,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      });
    }

    for (const artifact of ev.output.artifacts ?? []) {
      this.recorder.recordArtifact(handle, artifact);
    }

    this.recorder.finalize(handle, {
      outcome,
      output: ev.output.content,
      tokens: ev.output.tokens,
      harness: {
        harnessId: ev.harnessId,
        phaseId: ev.phaseId,
        phaseName: ev.phaseName,
        gateResults: ev.gateResults.map(g => ({
          name: g.name,
          passed: g.passed,
          reason: g.reason,
        })),
      },
    });
  }
}

function normalizeArgs(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}
