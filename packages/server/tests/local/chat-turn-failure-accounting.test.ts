/**
 * Unit pins for the spend a client-cancelled turn is charged in
 * `handleTurnFailure` (TD-CHAT-16 ruling 16). A real mid-stream abort, pinned
 * in `smart-router-chat.test.ts`, never reaches this with usage: the loop
 * throws before the stream reports any. These pins cover the usage the
 * function does receive, from the turn's ledger or from the abort error.
 */
import type { ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import type { CostTracker } from '@waggle/agent';
import { describe, expect, it, vi } from 'vitest';
import { handleTurnFailure, type TurnFailureTurn } from '../../src/local/routes/chat-turn-failure.js';
import type { TurnExecutionTrace } from '../../src/local/routes/chat-turn-execution-trace.js';
import { TurnRetention } from '../../src/local/routes/chat-turn-retention.js';
import { TurnUsageLedger } from '../../src/local/routes/chat-turn-usage-ledger.js';

const MODEL = 'ollama/primary-test-model';

function cancelledTurn(usageLedger: TurnUsageLedger) {
  const controller = new AbortController();
  controller.abort();
  const calculateUsageCost = vi.fn(() => 0.5);
  const addUsage = vi.fn();
  const sendEvent = vi.fn();
  const accountWorkspaceSessionTokens = vi.fn();
  const end = vi.fn();
  const finalized: unknown[] = [];
  const turn = {
    server: {} as FastifyInstance,
    raw: { destroyed: false, writableEnded: false, end } as unknown as ServerResponse,
    sendEvent,
    turnSignal: controller.signal,
    responseCommitted: false,
    turnId: 'turn-1',
    message: 'Analyze this report',
    usageLedger,
    costTracker: { calculateUsageCost, addUsage } as unknown as CostTracker,
    turnTrace: {
      finalizeOnce: (build: () => unknown) => { finalized.push(build()); return undefined; },
    } as unknown as TurnExecutionTrace,
    retention: new TurnRetention({
      allowMemoryPersistence: true, allowDerivedPersistence: true, allowResponseDecoration: true,
    }),
    usesNamedWorkspace: false,
    historyWorkspaceId: 'ws-1',
    activeWorkspaceId: 'ws-1',
    activeSessionId: 'session-1',
    sessionPersistenceDataDir: '/unused',
    activeHistory: undefined,
    activeSessionOrch: undefined,
    accountWorkspaceSessionTokens,
    retainedTurnText: (value: string) => value,
  } satisfies TurnFailureTurn;
  return { turn, calculateUsageCost, addUsage, sendEvent, accountWorkspaceSessionTokens, end, finalized };
}

describe('handleTurnFailure on a client-cancelled turn', () => {
  it('charges the usage of an attempt that completed before the cancel', () => {
    const ledger = new TurnUsageLedger();
    ledger.beginAttempt(MODEL, 'free');
    ledger.completeAttempt({ inputTokens: 20_000, outputTokens: 1_000 }, MODEL);
    const { turn, calculateUsageCost, addUsage, sendEvent, accountWorkspaceSessionTokens, end, finalized } = cancelledTurn(ledger);

    handleTurnFailure(turn, new DOMException('The operation was aborted.', 'AbortError'));

    expect(calculateUsageCost).toHaveBeenCalledWith({ model: MODEL, input: 20_000, output: 1_000, billingClass: 'free' });
    expect(accountWorkspaceSessionTokens).toHaveBeenCalledWith(21_000);
    expect(finalized).toEqual([{
      outcome: 'abandoned',
      output: '',
      model: MODEL,
      tokens: { input: 20_000, output: 1_000 },
      costUsd: 0.5,
    }]);
    // Spend itself is charged inside the loop, never by the route (TD-CHAT-8).
    expect(addUsage).not.toHaveBeenCalled();
    // A cancel is not a failure the user is shown.
    expect(sendEvent).not.toHaveBeenCalled();
    expect(end).toHaveBeenCalledOnce();
  });

  it('charges the usage an abort error carries when no attempt completed', () => {
    const ledger = new TurnUsageLedger();
    ledger.beginAttempt(MODEL, 'free');
    const { turn, calculateUsageCost, accountWorkspaceSessionTokens, finalized } = cancelledTurn(ledger);
    const abort = Object.assign(new Error('aborted'), { usage: { inputTokens: 300, outputTokens: 20 } });

    handleTurnFailure(turn, abort);

    expect(calculateUsageCost).toHaveBeenCalledWith({ model: MODEL, input: 300, output: 20, billingClass: 'free' });
    expect(accountWorkspaceSessionTokens).toHaveBeenCalledWith(320);
    expect(finalized).toEqual([expect.objectContaining({ outcome: 'abandoned', tokens: { input: 300, output: 20 } })]);
  });

  it('charges nothing when the cancelled attempt reported no usage', () => {
    const ledger = new TurnUsageLedger();
    ledger.beginAttempt(MODEL, 'free');
    const { turn, calculateUsageCost, accountWorkspaceSessionTokens, finalized } = cancelledTurn(ledger);

    handleTurnFailure(turn, new DOMException('The operation was aborted.', 'AbortError'));

    expect(calculateUsageCost).not.toHaveBeenCalled();
    expect(accountWorkspaceSessionTokens).not.toHaveBeenCalled();
    expect(finalized).toEqual([expect.objectContaining({ outcome: 'abandoned', tokens: undefined, costUsd: undefined })]);
  });
});
