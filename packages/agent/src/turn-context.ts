/**
 * H-AUDIT-1 contract — per-turn trace ID (turnId, UUID v4).
 *
 * turnId is generated ONCE at turn entry (chat.ts) and propagated EXPLICITLY
 * as a parameter through every downstream stage: agent-loop → orchestrator
 * recall → combined-retrieval search → prompt-assembler assemble →
 * cognify (if triggered mid-turn) → tool calls → LLM request.
 *
 * No AsyncLocalStorage, no module-level context, no globals — propagation
 * must be tsc-verifiable so a cold reader of any stage's signature can see
 * whether trace is plumbed through it.
 *
 * Logging uses a shared pino logger tagged with `turnId`, so a single
 * turnId in the log reconstructs the full turn graph (stage-by-stage with
 * timestamps, input summary, output summary). This also doubles as the
 * correlation key for the four-cell ablation harness JSONL output.
 *
 * Adoption rule: every stage entry function accepts `turnId?: string` as
 * an optional parameter. Omitted = logging is silent (preserves existing
 * callers that don't thread trace). When present, logs fire.
 */

import { randomUUID } from 'node:crypto';
import { createCoreLogger } from '@waggle/core';

const log = createCoreLogger('turn');

/** Generate a fresh per-turn trace ID. */
export function generateTurnId(): string {
  return randomUUID();
}

export interface TurnLogPayload {
  /** Stage label, e.g. 'orchestrator.recallMemory', 'retrieval.search'. */
  stage: string;
  [key: string]: unknown;
}

/**
 * Emit a structured turn event. Silent when turnId is undefined
 * (existing callers that haven't adopted trace propagation yet).
 *
 * Tests can opt into event capture via `startCapture()` below.
 */
export function logTurnEvent(turnId: string | undefined, payload: TurnLogPayload): void {
  if (!turnId) return;
  log.info(`turn.${payload.stage}`, { turnId, ...payload });
  if (captureBuffer) {
    captureBuffer.push({ turnId, ...payload });
  }
}

// ── Test-only capture ────────────────────────────────────────────────────

export interface TurnEventRecord {
  turnId: string;
  stage: string;
  [key: string]: unknown;
}

let captureBuffer: TurnEventRecord[] | null = null;

/**
 * Start capturing turn events. Returns the buffer test code can assert on.
 * Reset the buffer to capture fresh events — subsequent `startCapture`
 * calls replace (not append to) the existing buffer.
 */
export function startTurnCapture(): TurnEventRecord[] {
  captureBuffer = [];
  return captureBuffer;
}

/** Stop capturing turn events. Events after this point go to the logger only. */
export function stopTurnCapture(): void {
  captureBuffer = null;
}
