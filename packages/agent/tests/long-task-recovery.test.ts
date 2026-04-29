/**
 * Tests for long-task/recovery.ts (Phase 3.2 of agent-fix sprint).
 *
 * Coverage targets the PM brief acceptance gates:
 *   - State machine: fresh_start / resume_clean / resume_from_error transitions
 *   - Retry logic: maxRetriesPerStep semantics, classifyError, success-on-retry
 *   - Backoff: exponential schedule, max-cap, jitter range, jitterFactor=0
 *   - Fallback chain: walks in order, one shot each, success builds correct state
 *   - Persistence: saves only on success/exhaustion, not between retries
 *   - Events: ordering + payload contents per type
 *   - Replay determinism: same stepFn outcomes → identical state chain
 *   - Crash-resilience: kill mid-step → fresh runner → resume → identical final
 *   - Edge cases: maxRetries=0, empty fallback, terminal-error skip, chain corrupt
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';

import {
  CheckpointStore,
  CHECKPOINT_SCHEMA_VERSION,
  type CheckpointStepState,
  type Decision,
} from '../src/long-task/checkpoint.js';
import {
  RecoveryRunner,
  type RecoveryEvent,
  type StepFn,
  type StepFnResult,
  type RecoveryRunnerOptions,
} from '../src/long-task/recovery.js';

// ─────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'waggle-recovery-'));
});

afterEach(async () => {
  await fsp.rm(tmpRoot, { recursive: true, force: true });
});

function makeStore(taskId = 'task-x'): CheckpointStore {
  return new CheckpointStore({ rootDir: tmpRoot, taskId });
}

interface RunnerHandle {
  store: CheckpointStore;
  runner: RecoveryRunner;
  events: RecoveryEvent[];
  sleeps: number[];
}

function makeRunner(overrides: Partial<RecoveryRunnerOptions> = {}): RunnerHandle {
  const events: RecoveryEvent[] = [];
  const sleeps: number[] = [];
  const store = overrides.store ?? makeStore();
  const runner = new RecoveryRunner({
    store,
    runId: 'run-test',
    onRecoveryEvent: (e) => events.push(e),
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    jitterFactor: 0, // deterministic by default in tests
    ...overrides,
  });
  return { store, runner, events, sleeps };
}

function makeStepFn(impl: StepFn): { fn: StepFn; calls: number; inputs: Parameters<StepFn>[0][] } {
  const inputs: Parameters<StepFn>[0][] = [];
  let calls = 0;
  const fn: StepFn = async (input) => {
    calls += 1;
    inputs.push(input);
    return impl(input);
  };
  return {
    get fn() { return fn; },
    get calls() { return calls; },
    get inputs() { return inputs; },
  } as { fn: StepFn; calls: number; inputs: Parameters<StepFn>[0][] };
}

const okResult = (output: Record<string, unknown> = { ok: true }, extras: Partial<StepFnResult> = {}): StepFnResult => ({
  output,
  ...extras,
});

// ─────────────────────────────────────────────────────────────────────────
// Constructor validation
// ─────────────────────────────────────────────────────────────────────────

describe('RecoveryRunner — constructor', () => {
  it('rejects missing store', () => {
    expect(() => new RecoveryRunner({ store: undefined as unknown as CheckpointStore, runId: 'r' }))
      .toThrow(/store is required/);
  });

  it('rejects missing runId', () => {
    expect(() => new RecoveryRunner({ store: makeStore(), runId: '' }))
      .toThrow(/runId is required/);
  });

  it('rejects negative maxRetriesPerStep', () => {
    expect(() => new RecoveryRunner({ store: makeStore(), runId: 'r', maxRetriesPerStep: -1 }))
      .toThrow(/non-negative integer/);
  });

  it('rejects non-integer maxRetriesPerStep', () => {
    expect(() => new RecoveryRunner({ store: makeStore(), runId: 'r', maxRetriesPerStep: 1.5 }))
      .toThrow(/non-negative integer/);
  });

  it('rejects jitterFactor outside [0, 1]', () => {
    expect(() => new RecoveryRunner({ store: makeStore(), runId: 'r', jitterFactor: -0.1 })).toThrow();
    expect(() => new RecoveryRunner({ store: makeStore(), runId: 'r', jitterFactor: 1.5 })).toThrow();
  });

  it('rejects maxBackoffMs < baseBackoffMs', () => {
    expect(() => new RecoveryRunner({ store: makeStore(), runId: 'r', baseBackoffMs: 5000, maxBackoffMs: 1000 }))
      .toThrow(/invalid backoff bounds/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// State machine — fresh_start
// ─────────────────────────────────────────────────────────────────────────

describe('RecoveryRunner — state machine: fresh_start', () => {
  it('emits fresh_start when no prior checkpoint exists', async () => {
    const { runner, events } = makeRunner();
    const step = makeStepFn(async () => okResult({ x: 1 }));
    await runner.run(step.fn, { stepAction: 'first' });
    expect(events[0]).toEqual({ type: 'fresh_start', step_index: 0 });
  });

  it('passes prior_state=undefined to stepFn on fresh start', async () => {
    const { runner } = makeRunner();
    const step = makeStepFn(async () => okResult({ x: 1 }));
    await runner.run(step.fn);
    expect(step.inputs[0]?.prior_state).toBeUndefined();
    expect(step.inputs[0]?.step_index).toBe(0);
    expect(step.inputs[0]?.attempt).toBe(1);
  });

  it('saves step 0 with empty persistent fields on fresh start success', async () => {
    const { runner, store } = makeRunner();
    const step = makeStepFn(async () => okResult({ done: true }));
    const result = await runner.run(step.fn, { stepAction: 'first' });
    expect(result.ok).toBe(true);
    expect(result.state.step_index).toBe(0);
    expect(result.state.step_action).toBe('first');
    expect(result.state.accumulated_context).toBe('');
    expect(result.state.retrieval_cache).toEqual({});
    expect(result.state.decision_history).toEqual([]);
    expect(result.state.task_id).toBe('task-x');
    expect(result.state.run_id).toBe('run-test');
    const loaded = await store.load(0);
    expect(loaded).toEqual(result.state);
  });

  it('captures appended_context / retrieval_additions / decisions on fresh start', async () => {
    const { runner } = makeRunner();
    const decisions: readonly Decision[] = [{ step_index: 0, decision: 'go top-3' }];
    const step = makeStepFn(async () =>
      okResult({ docs: ['a', 'b'] }, {
        appended_context: 'context-piece',
        retrieval_additions: { 'q:hello': ['a'] },
        decisions,
      }),
    );
    const result = await runner.run(step.fn);
    expect(result.state.accumulated_context).toBe('context-piece');
    expect(result.state.retrieval_cache).toEqual({ 'q:hello': ['a'] });
    expect(result.state.decision_history).toEqual(decisions);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// State machine — resume_clean
// ─────────────────────────────────────────────────────────────────────────

describe('RecoveryRunner — state machine: resume_clean', () => {
  it('emits resume_clean when latest is clean', async () => {
    const { runner, events } = makeRunner();
    // Run step 0 first.
    await runner.run(makeStepFn(async () => okResult({ a: 1 })).fn);
    events.length = 0;
    // Run again — should resume cleanly to step 1.
    await runner.run(makeStepFn(async () => okResult({ b: 2 })).fn);
    expect(events[0]).toEqual({ type: 'resume_clean', step_index: 1 });
  });

  it('passes the previous state as prior_state', async () => {
    const { runner } = makeRunner();
    await runner.run(makeStepFn(async () => okResult({ first: true })).fn);
    const step2 = makeStepFn(async () => okResult({ second: true }));
    await runner.run(step2.fn);
    expect(step2.inputs[0]?.prior_state?.step_index).toBe(0);
    expect(step2.inputs[0]?.prior_state?.step_output).toEqual({ first: true });
    expect(step2.inputs[0]?.step_index).toBe(1);
  });

  it('carries forward accumulated_context across resume_clean', async () => {
    const { runner } = makeRunner();
    await runner.run(makeStepFn(async () => okResult({}, { appended_context: 'A' })).fn);
    const result = await runner.run(makeStepFn(async () => okResult({}, { appended_context: 'B' })).fn);
    expect(result.state.accumulated_context).toBe('AB');
  });

  it('merges retrieval_additions across resume_clean', async () => {
    const { runner } = makeRunner();
    await runner.run(makeStepFn(async () => okResult({}, { retrieval_additions: { x: 1 } })).fn);
    const result = await runner.run(makeStepFn(async () => okResult({}, { retrieval_additions: { y: 2 } })).fn);
    expect(result.state.retrieval_cache).toEqual({ x: 1, y: 2 });
  });

  it('appends decisions across resume_clean', async () => {
    const { runner } = makeRunner();
    await runner.run(makeStepFn(async () => okResult({}, { decisions: [{ step_index: 0, decision: 'first' }] })).fn);
    const result = await runner.run(makeStepFn(async () => okResult({}, { decisions: [{ step_index: 1, decision: 'second' }] })).fn);
    expect(result.state.decision_history.map(d => d.decision)).toEqual(['first', 'second']);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// State machine — resume_from_error
// ─────────────────────────────────────────────────────────────────────────

describe('RecoveryRunner — state machine: resume_from_error', () => {
  it('emits resume_from_error when latest has error', async () => {
    const { runner, events, store } = makeRunner({ maxRetriesPerStep: 0 });
    // Step 0: clean.
    await runner.run(makeStepFn(async () => okResult({ s: 0 })).fn);
    // Step 1: exhaust.
    await runner.run(makeStepFn(async () => { throw new Error('boom'); }).fn);
    expect((await store.load(1))?.error).toBe('boom');

    // Resume should see error and retry step 1.
    events.length = 0;
    await runner.run(makeStepFn(async () => okResult({ s: 1 })).fn);
    expect(events[0]).toMatchObject({ type: 'resume_from_error', step_index: 1, error: 'boom' });
  });

  it('rewinds to step N-1 as prior when latest has error at step N>0', async () => {
    const { runner, store } = makeRunner({ maxRetriesPerStep: 0 });
    await runner.run(makeStepFn(async () => okResult({ s: 0 })).fn);
    await runner.run(makeStepFn(async () => { throw new Error('boom'); }).fn);

    const retryStep = makeStepFn(async () => okResult({ retried: true }));
    await runner.run(retryStep.fn);
    expect(retryStep.inputs[0]?.prior_state?.step_index).toBe(0);
    expect(retryStep.inputs[0]?.prior_state?.step_output).toEqual({ s: 0 });
    expect(retryStep.inputs[0]?.step_index).toBe(1);
  });

  it('uses prior_state=undefined when error is at step 0', async () => {
    const { runner } = makeRunner({ maxRetriesPerStep: 0 });
    await runner.run(makeStepFn(async () => { throw new Error('first'); }).fn);

    const retryStep = makeStepFn(async () => okResult({ ok: true }));
    await runner.run(retryStep.fn);
    expect(retryStep.inputs[0]?.prior_state).toBeUndefined();
    expect(retryStep.inputs[0]?.step_index).toBe(0);
  });

  it('overwrites the error checkpoint with the success state', async () => {
    const { runner, store } = makeRunner({ maxRetriesPerStep: 0 });
    await runner.run(makeStepFn(async () => { throw new Error('first'); }).fn);
    expect((await store.load(0))?.error).toBe('first');

    const result = await runner.run(makeStepFn(async () => okResult({ recovered: true })).fn);
    expect(result.ok).toBe(true);
    expect((await store.load(0))?.error).toBeUndefined();
    expect((await store.load(0))?.step_output).toEqual({ recovered: true });
  });

  it('throws when checkpoint chain is corrupt (step N-1 missing)', async () => {
    const { runner, store } = makeRunner({ maxRetriesPerStep: 0 });
    // Manually plant a step-3 error file with no step 0/1/2.
    await store.init();
    const errFile: CheckpointStepState = {
      schema_version: CHECKPOINT_SCHEMA_VERSION,
      task_id: 'task-x',
      run_id: 'run-test',
      step_index: 3,
      timestamp_iso: new Date().toISOString(),
      step_action: 'planted',
      step_input: {},
      step_output: {},
      accumulated_context: '',
      retrieval_cache: {},
      decision_history: [],
      error: 'planted error',
    };
    await fsp.writeFile(path.join(store.directory, 'step-000003.json'), JSON.stringify(errFile));

    await expect(runner.run(makeStepFn(async () => okResult({})).fn))
      .rejects.toThrow(/checkpoint chain corrupt/);
  });

  it('throws when prior step also has error (chain not clean)', async () => {
    const { runner, store } = makeRunner({ maxRetriesPerStep: 0 });
    await store.init();
    // Plant step 0 error + step 1 error.
    const mkErr = (step_index: number, err: string): CheckpointStepState => ({
      schema_version: CHECKPOINT_SCHEMA_VERSION,
      task_id: 'task-x',
      run_id: 'run-test',
      step_index,
      timestamp_iso: new Date().toISOString(),
      step_action: 'planted',
      step_input: {}, step_output: {},
      accumulated_context: '', retrieval_cache: {}, decision_history: [],
      error: err,
    });
    await fsp.writeFile(path.join(store.directory, 'step-000000.json'), JSON.stringify(mkErr(0, 'first')));
    await fsp.writeFile(path.join(store.directory, 'step-000001.json'), JSON.stringify(mkErr(1, 'second')));

    await expect(runner.run(makeStepFn(async () => okResult({})).fn))
      .rejects.toThrow(/chain not clean/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Retry logic
// ─────────────────────────────────────────────────────────────────────────

describe('RecoveryRunner — retry logic', () => {
  it('first attempt success → no retry events', async () => {
    const { runner, events } = makeRunner();
    await runner.run(makeStepFn(async () => okResult({})).fn);
    const types = events.map(e => e.type);
    expect(types).toContain('fresh_start');
    expect(types).toContain('attempt');
    expect(types).toContain('success');
    expect(types).not.toContain('retry');
  });

  it('first fail then success → emits retry then success', async () => {
    let n = 0;
    const { runner, events } = makeRunner();
    await runner.run(async () => {
      n += 1;
      if (n === 1) throw new Error('flaky');
      return okResult({ ok: true });
    });
    const types = events.map(e => e.type);
    expect(types).toEqual(['fresh_start', 'attempt', 'retry', 'attempt', 'success']);
    expect(events.find(e => e.type === 'retry')?.error).toBe('flaky');
  });

  it('all retries fail (no fallback) → exhausted', async () => {
    const { runner, events } = makeRunner({ maxRetriesPerStep: 2 });
    const result = await runner.run(async () => { throw new Error('always-fails'); });
    expect(result.ok).toBe(false);
    expect(result.state.error).toBe('always-fails');
    const types = events.map(e => e.type);
    expect(types).toEqual([
      'fresh_start', 'attempt', 'retry', 'attempt', 'retry', 'attempt', 'exhausted',
    ]);
  });

  it('default classifyError treats every error as retryable', async () => {
    const { runner } = makeRunner({ maxRetriesPerStep: 2 });
    const step = makeStepFn(async () => { throw new Error('weird type'); });
    await runner.run(step.fn);
    expect(step.calls).toBe(3); // 1 initial + 2 retries
  });

  it('classifyError=terminal skips remaining same-tool retries', async () => {
    const step = makeStepFn(async () => { throw new Error('auth-401'); });
    const { runner, events } = makeRunner({
      maxRetriesPerStep: 5,
      classifyError: (err) => (errMessage(err).includes('auth-401') ? 'terminal' : 'retryable'),
    });
    await runner.run(step.fn);
    expect(step.calls).toBe(1); // immediate stop
    expect(events.some(e => e.type === 'retry')).toBe(false);
    expect(events.some(e => e.type === 'exhausted')).toBe(true);
  });

  it('maxRetriesPerStep=0 → exactly one same-tool attempt', async () => {
    const step = makeStepFn(async () => { throw new Error('x'); });
    const { runner } = makeRunner({ maxRetriesPerStep: 0 });
    await runner.run(step.fn);
    expect(step.calls).toBe(1);
  });

  it('maxRetriesPerStep=3 → 4 same-tool attempts', async () => {
    const step = makeStepFn(async () => { throw new Error('x'); });
    const { runner } = makeRunner({ maxRetriesPerStep: 3 });
    await runner.run(step.fn);
    expect(step.calls).toBe(4); // 1 initial + 3 retries
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Backoff schedule
// ─────────────────────────────────────────────────────────────────────────

describe('RecoveryRunner — backoff schedule', () => {
  it('jitterFactor=0 → exact exponential schedule (1×, 2×, 4×)', async () => {
    const { runner, sleeps } = makeRunner({
      maxRetriesPerStep: 3,
      baseBackoffMs: 1000,
      maxBackoffMs: 60000,
      jitterFactor: 0,
    });
    await runner.run(async () => { throw new Error('x'); });
    expect(sleeps).toEqual([1000, 2000, 4000]);
  });

  it('caps backoff at maxBackoffMs', async () => {
    const { runner, sleeps } = makeRunner({
      maxRetriesPerStep: 5,
      baseBackoffMs: 1000,
      maxBackoffMs: 3000,
      jitterFactor: 0,
    });
    await runner.run(async () => { throw new Error('x'); });
    expect(sleeps).toEqual([1000, 2000, 3000, 3000, 3000]);
  });

  it('with jitter, all sleeps fall within ±jitterFactor of base exponential', async () => {
    const { runner, sleeps } = makeRunner({
      maxRetriesPerStep: 3,
      baseBackoffMs: 1000,
      maxBackoffMs: 60000,
      jitterFactor: 0.25,
      rng: () => 0.5, // jitter weight 0 (exact midpoint of [-0.25, +0.25])
    });
    await runner.run(async () => { throw new Error('x'); });
    expect(sleeps).toEqual([1000, 2000, 4000]); // rng=0.5 → jitter delta 0
  });

  it('with rng=1 (max positive jitter), each sleep = 1.25× exponential', async () => {
    const { runner, sleeps } = makeRunner({
      maxRetriesPerStep: 3,
      baseBackoffMs: 1000,
      maxBackoffMs: 60000,
      jitterFactor: 0.25,
      rng: () => 1, // (1*2-1)*0.25 = +0.25
    });
    await runner.run(async () => { throw new Error('x'); });
    expect(sleeps).toEqual([1250, 2500, 5000]);
  });

  it('with rng=0 (max negative jitter), each sleep = 0.75× exponential', async () => {
    const { runner, sleeps } = makeRunner({
      maxRetriesPerStep: 3,
      baseBackoffMs: 1000,
      maxBackoffMs: 60000,
      jitterFactor: 0.25,
      rng: () => 0, // (0*2-1)*0.25 = -0.25
    });
    await runner.run(async () => { throw new Error('x'); });
    expect(sleeps).toEqual([750, 1500, 3000]);
  });

  it('clamps negative jitter to 0', async () => {
    // If jitterFactor is huge AND rng=0, exponential + jitter could go negative.
    const { runner, sleeps } = makeRunner({
      maxRetriesPerStep: 1,
      baseBackoffMs: 1000,
      maxBackoffMs: 60000,
      jitterFactor: 1.0,
      rng: () => 0, // jitter delta = -1000
    });
    await runner.run(async () => { throw new Error('x'); });
    expect(sleeps[0]).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Fallback chain
// ─────────────────────────────────────────────────────────────────────────

describe('RecoveryRunner — fallback chain', () => {
  it('walks fallback chain in order after retries exhaust', async () => {
    const seen: Array<{ attempt: number; fallback?: string }> = [];
    const step: StepFn = async (input) => {
      seen.push({ attempt: input.attempt, fallback: input.fallback_tool });
      throw new Error('always');
    };
    const { runner } = makeRunner({
      maxRetriesPerStep: 1,
      toolFallbackChain: ['toolA', 'toolB', 'toolC'],
    });
    await runner.run(step);
    // 1 initial + 1 retry = 2 same-tool calls, then 3 fallbacks
    expect(seen.length).toBe(5);
    expect(seen[0]?.fallback).toBeUndefined();
    expect(seen[1]?.fallback).toBeUndefined();
    expect(seen[2]?.fallback).toBe('toolA');
    expect(seen[3]?.fallback).toBe('toolB');
    expect(seen[4]?.fallback).toBe('toolC');
  });

  it('first fallback success → state has fallback_tool in step_input', async () => {
    let n = 0;
    const { runner } = makeRunner({
      maxRetriesPerStep: 1,
      toolFallbackChain: ['toolA', 'toolB'],
    });
    const result = await runner.run(async (input) => {
      n += 1;
      if (n <= 2) throw new Error('same-tool fails');
      return okResult({ via_fallback: input.fallback_tool });
    });
    expect(result.ok).toBe(true);
    expect(result.state.step_input).toMatchObject({ fallback_tool: 'toolA' });
    expect(result.state.step_output).toEqual({ via_fallback: 'toolA' });
  });

  it('all fallbacks fail → exhausts and returns ok=false', async () => {
    const { runner } = makeRunner({
      maxRetriesPerStep: 0,
      toolFallbackChain: ['a', 'b'],
    });
    const result = await runner.run(async () => { throw new Error('all-fail'); });
    expect(result.ok).toBe(false);
    expect(result.state.error).toBe('all-fail');
  });

  it('emits fallback_attempted event for each fallback tried', async () => {
    const { runner, events } = makeRunner({
      maxRetriesPerStep: 0,
      toolFallbackChain: ['a', 'b'],
    });
    await runner.run(async () => { throw new Error('x'); });
    const fallbackEvents = events.filter(e => e.type === 'fallback_attempted');
    expect(fallbackEvents.map(e => e.fallback_tool)).toEqual(['a', 'b']);
  });

  it('terminal error skips retries but still walks fallback chain', async () => {
    let n = 0;
    const { runner } = makeRunner({
      maxRetriesPerStep: 5,
      toolFallbackChain: ['rescue'],
      classifyError: () => 'terminal',
    });
    const result = await runner.run(async (input) => {
      n += 1;
      if (input.fallback_tool) return okResult({ via: input.fallback_tool });
      throw new Error('terminal');
    });
    expect(result.ok).toBe(true);
    expect(n).toBe(2); // 1 initial + 1 fallback (no retries)
    expect(result.state.step_output).toEqual({ via: 'rescue' });
  });

  it('empty fallback chain behaves like no chain', async () => {
    const { runner, events } = makeRunner({
      maxRetriesPerStep: 0,
      toolFallbackChain: [],
    });
    const result = await runner.run(async () => { throw new Error('x'); });
    expect(result.ok).toBe(false);
    expect(events.some(e => e.type === 'fallback_attempted')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Persistence cadence
// ─────────────────────────────────────────────────────────────────────────

describe('RecoveryRunner — persistence cadence', () => {
  it('does NOT save between retries (in-memory only)', async () => {
    const { runner, store } = makeRunner({ maxRetriesPerStep: 2 });
    let n = 0;
    await runner.run(async () => {
      n += 1;
      if (n < 3) throw new Error('flaky');
      return okResult({ s: 'done' });
    });
    // Only the final success should be persisted, no intermediate error files.
    const indices = await store.listSteps();
    expect(indices).toEqual([0]);
    const loaded = await store.load(0);
    expect(loaded?.error).toBeUndefined();
    expect(loaded?.step_output).toEqual({ s: 'done' });
  });

  it('saves error state on exhaustion with error field set', async () => {
    const { runner, store } = makeRunner({ maxRetriesPerStep: 1 });
    await runner.run(async () => { throw new Error('hard-fail'); });
    const loaded = await store.load(0);
    expect(loaded?.error).toBe('hard-fail');
    expect(loaded?.step_output).toEqual({});
    expect(loaded?.step_input).toEqual({ exhausted: true });
  });

  it('saves success state with attempt count in step_input', async () => {
    const { runner, store } = makeRunner({ maxRetriesPerStep: 5 });
    let n = 0;
    await runner.run(async () => {
      n += 1;
      if (n < 3) throw new Error('flaky');
      return okResult({ ok: true });
    });
    const loaded = await store.load(0);
    expect(loaded?.step_input).toEqual({ attempt: 3 });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Replay determinism
// ─────────────────────────────────────────────────────────────────────────

describe('RecoveryRunner — replay determinism', () => {
  it('two runs with identical stepFn outcomes produce identical state chains', async () => {
    // Build a deterministic stepFn: succeed always with predictable output.
    const deterministicStep: StepFn = async (input) => okResult({
      step: input.step_index,
      attempt: input.attempt,
    });

    // Run A
    const a = makeRunner({ store: makeStore('task-a'), jitterFactor: 0 });
    for (let i = 0; i < 4; i += 1) {
      await a.runner.run(deterministicStep, { stepAction: `s${i}` });
    }
    const aStates = await Promise.all((await a.store.listSteps()).map(i => a.store.load(i)));

    // Run B with a separate store but identical stepFn behavior.
    const b = makeRunner({ store: makeStore('task-b'), jitterFactor: 0 });
    for (let i = 0; i < 4; i += 1) {
      await b.runner.run(deterministicStep, { stepAction: `s${i}` });
    }
    const bStates = await Promise.all((await b.store.listSteps()).map(i => b.store.load(i)));

    // Compare modulo task_id + timestamp_iso (always different).
    const strip = (s: CheckpointStepState | undefined) => {
      if (!s) return s;
      const { task_id: _t, timestamp_iso: _ts, ...rest } = s;
      return rest;
    };
    expect(aStates.map(strip)).toEqual(bStates.map(strip));
  });

  it('flaky stepFn with deterministic failures yields identical decision events', async () => {
    // Same flaky pattern: fail attempt 1 of step 0, fail attempts 1+2 of step 1, success otherwise.
    const buildFlakyStep = (): StepFn => {
      const counts = new Map<number, number>();
      return async (input) => {
        const c = (counts.get(input.step_index) ?? 0) + 1;
        counts.set(input.step_index, c);
        if (input.step_index === 0 && c === 1) throw new Error('s0-flaky');
        if (input.step_index === 1 && c <= 2) throw new Error('s1-flaky');
        return okResult({ step: input.step_index, attempt: c });
      };
    };

    const a = makeRunner({ store: makeStore('det-a'), jitterFactor: 0 });
    const stepA = buildFlakyStep();
    await a.runner.run(stepA);
    await a.runner.run(stepA);

    const b = makeRunner({ store: makeStore('det-b'), jitterFactor: 0 });
    const stepB = buildFlakyStep();
    await b.runner.run(stepB);
    await b.runner.run(stepB);

    const stripBackoff = (e: RecoveryEvent) => ({ ...e, backoff_ms: undefined });
    expect(a.events.map(e => ({ type: e.type, step_index: e.step_index, attempt: e.attempt })))
      .toEqual(b.events.map(e => ({ type: e.type, step_index: e.step_index, attempt: e.attempt })));
    // backoff_ms identical too because jitterFactor=0
    expect(a.events.map(stripBackoff)).toEqual(b.events.map(stripBackoff));
  });

  it('seeded rng yields identical jitter sequences across runs', async () => {
    // Mulberry32-style seeded PRNG (small inline implementation for the test).
    const seed = (s: number) => () => {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const runOnce = async () => {
      const { runner, sleeps } = makeRunner({
        maxRetriesPerStep: 3,
        baseBackoffMs: 1000,
        maxBackoffMs: 60000,
        jitterFactor: 0.25,
        rng: seed(42),
      });
      await runner.run(async () => { throw new Error('x'); });
      return sleeps;
    };
    const a = await runOnce();
    const b = await runOnce();
    expect(a).toEqual(b);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Crash-resilience scenario
// ─────────────────────────────────────────────────────────────────────────

describe('RecoveryRunner — crash resilience', () => {
  it('exhausted error state can be resumed by a fresh runner', async () => {
    const taskId = `task-${crypto.randomBytes(4).toString('hex')}`;

    // Process A: run step 0 success, step 1 exhausts.
    {
      const a = makeRunner({ store: makeStore(taskId), maxRetriesPerStep: 0 });
      await a.runner.run(makeStepFn(async () => okResult({ done: 0 })).fn);
      const result = await a.runner.run(makeStepFn(async () => { throw new Error('boom'); }).fn);
      expect(result.ok).toBe(false);
    }

    // Process B (simulated): brand-new runner on the same store.
    const b = makeRunner({ store: makeStore(taskId), maxRetriesPerStep: 0 });
    const retryStep = makeStepFn(async () => okResult({ done: 1, recovered: true }));
    const result = await b.runner.run(retryStep.fn);

    // Should have resumed the failed step, not advanced to step 2.
    expect(result.ok).toBe(true);
    expect(result.state.step_index).toBe(1);
    expect(result.state.step_output).toEqual({ done: 1, recovered: true });
    expect(b.events[0]).toMatchObject({ type: 'resume_from_error', step_index: 1 });
  });

  it('clean checkpoint chain is fully resumable', async () => {
    const taskId = `task-${crypto.randomBytes(4).toString('hex')}`;

    // Process A: 3 clean steps.
    {
      const a = makeRunner({ store: makeStore(taskId) });
      await a.runner.run(makeStepFn(async () => okResult({ s: 0 }, { appended_context: 'A' })).fn);
      await a.runner.run(makeStepFn(async () => okResult({ s: 1 }, { appended_context: 'B' })).fn);
      await a.runner.run(makeStepFn(async () => okResult({ s: 2 }, { appended_context: 'C' })).fn);
    }

    // Process B: should resume to step 3.
    const b = makeRunner({ store: makeStore(taskId) });
    const step3 = makeStepFn(async () => okResult({ s: 3 }, { appended_context: 'D' }));
    const result = await b.runner.run(step3.fn);
    expect(result.state.step_index).toBe(3);
    expect(result.state.accumulated_context).toBe('ABCD');
    expect(step3.inputs[0]?.prior_state?.step_index).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Event ordering
// ─────────────────────────────────────────────────────────────────────────

describe('RecoveryRunner — event ordering', () => {
  it('orders events: state-machine → attempt → (retry → attempt)* → success', async () => {
    let n = 0;
    const { runner, events } = makeRunner({ maxRetriesPerStep: 2 });
    await runner.run(async () => {
      n += 1;
      if (n < 3) throw new Error('flaky');
      return okResult({});
    });
    expect(events.map(e => e.type)).toEqual([
      'fresh_start', 'attempt', 'retry', 'attempt', 'retry', 'attempt', 'success',
    ]);
  });

  it('orders events on fallback success: ... → fallback_attempted → success', async () => {
    let n = 0;
    const { runner, events } = makeRunner({
      maxRetriesPerStep: 1,
      toolFallbackChain: ['rescue'],
    });
    await runner.run(async (input) => {
      n += 1;
      if (input.fallback_tool) return okResult({});
      throw new Error('x');
    });
    expect(events.map(e => e.type)).toEqual([
      'fresh_start', 'attempt', 'retry', 'attempt', 'fallback_attempted', 'success',
    ]);
  });

  it('attempt event payload: step_index + attempt set, no fallback_tool', async () => {
    const { runner, events } = makeRunner();
    await runner.run(async () => okResult({}));
    const attemptEvent = events.find(e => e.type === 'attempt');
    expect(attemptEvent).toEqual({ type: 'attempt', step_index: 0, attempt: 1 });
  });

  it('retry event payload: backoff_ms + error + attempt set', async () => {
    let n = 0;
    const { runner, events } = makeRunner({ maxRetriesPerStep: 1, jitterFactor: 0, baseBackoffMs: 500 });
    await runner.run(async () => {
      n += 1;
      if (n === 1) throw new Error('flaky');
      return okResult({});
    });
    const retry = events.find(e => e.type === 'retry');
    expect(retry?.backoff_ms).toBe(500);
    expect(retry?.error).toBe('flaky');
    expect(retry?.attempt).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Helper for tests
// ─────────────────────────────────────────────────────────────────────────

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
