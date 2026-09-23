import { describe, expect, it } from 'vitest';
import type { TraceRecorder } from '@waggle/agent';
import { TurnExecutionTrace } from '../../src/local/routes/chat-turn-execution-trace.js';

/** A recorder whose finalize fails the first `failures` times. */
function flakyRecorder(failures: number) {
  let calls = 0;
  const recorder = {
    start: () => ({ id: 42 }),
    finalize: () => {
      calls += 1;
      if (calls <= failures) throw new Error('trace store unavailable');
      return { id: 42 };
    },
  } as unknown as TraceRecorder;
  return { recorder, calls: () => calls };
}

const options = () => ({ outcome: 'success' }) as never;

describe('TurnExecutionTrace', () => {
  it('reports a failed finalize and leaves the row for the next site', () => {
    const reported: Array<{ error: unknown; traceId: number | undefined }> = [];
    const trace = new TurnExecutionTrace({
      onFinalizeError: (error, traceId) => { reported.push({ error, traceId }); },
    });
    const { recorder, calls } = flakyRecorder(1);
    trace.start(recorder, {} as never);

    expect(trace.finalizeOnce(options)).toBeUndefined();
    expect(reported).toHaveLength(1);
    expect((reported[0].error as Error).message).toBe('trace store unavailable');
    expect(reported[0].traceId).toBe(42);

    // Still unfinalized, so the next site finalizes it, and only once.
    expect(trace.finalizeOnce(options)).toEqual({ id: 42 });
    expect(trace.finalizeOnce(options)).toBeUndefined();
    expect(calls()).toBe(2);
    expect(reported).toHaveLength(1);
  });

  it('retries the failed payload instead of building a new one', () => {
    const trace = new TurnExecutionTrace();
    const seen: unknown[] = [];
    let calls = 0;
    const recorder = {
      start: () => ({ id: 42 }),
      finalize: (_handle: unknown, opts: unknown) => {
        seen.push(opts);
        calls += 1;
        if (calls === 1) throw new Error('trace store unavailable');
        return { id: 42 };
      },
    } as unknown as TraceRecorder;
    trace.start(recorder, {} as never);

    const first = { outcome: 'success', output: 'answer' } as never;
    const second = { outcome: 'abandoned', output: '' } as never;
    expect(trace.finalizeOnce(() => first)).toBeUndefined();
    expect(trace.finalizeOnce(() => second)).toEqual({ id: 42 });
    expect(seen).toEqual([first, first]);
  });

  it('never throws, even when the report itself throws', () => {
    const trace = new TurnExecutionTrace({
      onFinalizeError: () => { throw new Error('logger down'); },
    });
    trace.start(flakyRecorder(1).recorder, {} as never);
    expect(() => trace.finalizeOnce(options)).not.toThrow();
  });

  it('stays silent without a reporter, as before', () => {
    const trace = new TurnExecutionTrace();
    trace.start(flakyRecorder(1).recorder, {} as never);
    expect(trace.finalizeOnce(options)).toBeUndefined();
  });
});
