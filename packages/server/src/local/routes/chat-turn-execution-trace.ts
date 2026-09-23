/**
 * Turn Execution Trace — the one execution-trace row a chat turn writes.
 *
 * The row is the self-evolution substrate: the evaluation dataset builder mines
 * finalized rows and skips any left `pending`, so a turn has to finalize its row
 * on every exit — the success path, the outer catch, and the outer finally for
 * the exits neither of those reached (H-07 G4). Before this module that took
 * three hoisted mutable variables inside the `POST /api/chat` closure and the
 * same recorder/handle/finalized guard written out at each finalize site.
 *
 * Replace Method with Method Object applied to that cluster (TD-CHAT-3): the
 * locals become fields and the guard lives in `finalizeOnce`. It imports types
 * only, so it adds no framework, persistence or I/O to anything that loads it.
 *
 * Three invariants the route relied on implicitly and this module now states:
 *  - A row is finalized at most once. A finalize that throws does not count, so
 *    a later site still gets its turn — that is how the finally block catches a
 *    failed success finalize (pinned as a QUIRK: it records `abandoned`).
 *  - Finalizing is best-effort and never fails the turn. Starting is not: a
 *    throwing `start` propagates to the route, and the turn is then untraced.
 *  - The finalize payload is built inside the guarded region, so a throw while
 *    building it (stringifying a hostile error, say) is swallowed with the rest.
 */
import type { TraceFinalizeOptions, TraceHandle, TraceRecorder } from '@waggle/agent';

export type TraceStartInput = Parameters<TraceRecorder['start']>[0];

export type FinalizedTraceRow = ReturnType<TraceRecorder['finalize']>;

export type TraceRecording = { recorder: TraceRecorder; handle: TraceHandle };

export interface TurnExecutionTraceOptions {
  /**
   * Told when a finalize throws. The trace stays best-effort and I/O-free; the
   * route decides how the failure is reported (TD-CHAT-48).
   */
  onFinalizeError?: (error: unknown, traceId: number | undefined) => void;
}

export class TurnExecutionTrace {
  private recorder: TraceRecorder | null = null;
  private handle: TraceHandle | null = null;
  private finalized = false;
  private readonly onFinalizeError: (error: unknown, traceId: number | undefined) => void;

  constructor(options: TurnExecutionTraceOptions = {}) {
    this.onFinalizeError = options.onFinalizeError ?? (() => {});
  }

  /** Start the turn's row on `recorder`; with no recorder the turn is untraced. */
  start(recorder: TraceRecorder | null, input: TraceStartInput): void {
    this.recorder = recorder;
    this.handle = recorder ? recorder.start(input) : null;
  }

  /** The row id, once a trace has started. */
  get id(): number | undefined {
    return this.handle?.id;
  }

  /** The recorder and handle the agent loop appends to; null while untraced. */
  get recording(): TraceRecording | null {
    return this.recorder && this.handle
      ? { recorder: this.recorder, handle: this.handle }
      : null;
  }

  /**
   * Finalize the row unless an earlier site already has. Returns the finalized
   * row, or undefined when the turn is untraced, the row is already final, or
   * finalizing threw.
   */
  finalizeOnce(buildOptions: () => TraceFinalizeOptions): FinalizedTraceRow {
    if (!this.recorder || !this.handle || this.finalized) return undefined;
    try {
      const row = this.recorder.finalize(this.handle, buildOptions());
      this.finalized = true;
      return row;
    } catch (error) {
      // Tracing is best-effort: what is lost is this finalize only. The row
      // stays unfinalized, so the next site (the outer finally) may still
      // record it as abandoned. The loss is reported, never thrown.
      try { this.onFinalizeError(error, this.handle.id); } catch { /* reporting is best-effort too */ }
      return undefined;
    }
  }
}
