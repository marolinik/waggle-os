import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import {
  advancePhase,
  createHarnessRun,
  type HarnessPhaseCompleteEvent,
  type HarnessPhaseFailEvent,
  type PhaseOutput,
  type WorkflowHarness,
} from '../src/workflow-harness.js';
import { HarnessTraceBridge } from '../src/harness-trace-bridge.js';
import { TraceRecorder } from '../src/trace-recorder.js';
import { MindDB, ExecutionTraceStore } from '@waggle/core';

// ── Fixtures ──────────────────────────────────────────────────────

function makeRecorder(): { recorder: TraceRecorder; store: ExecutionTraceStore; db: MindDB } {
  const db = new MindDB(':memory:');
  const store = new ExecutionTraceStore(db);
  const recorder = new TraceRecorder(store);
  return { recorder, store, db };
}

function makeBasicOutput(overrides: Partial<PhaseOutput> = {}): PhaseOutput {
  return {
    phaseId: 'gather',
    content: 'Searched memory and found relevant frames about X and Y.',
    toolCalls: [
      { tool: 'search_memory', args: { query: 'X' }, result: '3 frames found' },
    ],
    artifacts: [],
    durationMs: 1_200,
    tokens: { input: 150, output: 85 },
    ...overrides,
  };
}

function makeCompleteEvent(overrides: Partial<HarnessPhaseCompleteEvent> = {}): HarnessPhaseCompleteEvent {
  return {
    harnessId: 'research-verify',
    phaseId: 'gather',
    phaseName: 'Gather',
    phaseInstruction: 'Search memory for X and Y.',
    output: makeBasicOutput(),
    gateResults: [
      { name: 'At least 2 search/recall tool calls', passed: true, reason: 'Found 2 matching tool calls' },
    ],
    ...overrides,
  };
}

function makeFailEvent(overrides: Partial<HarnessPhaseFailEvent> = {}): HarnessPhaseFailEvent {
  return {
    harnessId: 'code-review-fix',
    phaseId: 'fix',
    phaseName: 'Fix',
    phaseInstruction: 'Apply fixes for the identified issues.',
    output: makeBasicOutput({ content: 'I could not produce a fix.' }),
    gateResults: [
      { name: 'At least 1 write/edit tool call', passed: false, reason: 'No write tool calls' },
    ],
    retryCount: 3,
    aborted: true,
    ...overrides,
  };
}

// ── Core bridge behavior ──────────────────────────────────────────

describe('HarnessTraceBridge', () => {
  let emitter: EventEmitter;
  let recorder: TraceRecorder;
  let store: ExecutionTraceStore;

  beforeEach(() => {
    emitter = new EventEmitter();
    const built = makeRecorder();
    recorder = built.recorder;
    store = built.store;
  });

  it('creates a "verified" trace on harness:phase:complete', () => {
    const bridge = new HarnessTraceBridge({ recorder, events: emitter });
    bridge.start();

    emitter.emit('harness:phase:complete', makeCompleteEvent());

    const traces = store.queryParsed({});
    expect(traces).toHaveLength(1);
    expect(traces[0].outcome).toBe('verified');
    expect(traces[0].task_shape).toBe('harness:research-verify');
  });

  it('populates the harness metadata on the trace payload', () => {
    const bridge = new HarnessTraceBridge({ recorder, events: emitter });
    bridge.start();

    emitter.emit('harness:phase:complete', makeCompleteEvent());

    const trace = store.queryParsed({})[0];
    expect(trace.payload.harness).toEqual({
      harnessId: 'research-verify',
      phaseId: 'gather',
      phaseName: 'Gather',
      gateResults: [
        { name: 'At least 2 search/recall tool calls', passed: true, reason: 'Found 2 matching tool calls' },
      ],
    });
  });

  it('records the phase instruction as input and PhaseOutput.content as output', () => {
    const bridge = new HarnessTraceBridge({ recorder, events: emitter });
    bridge.start();

    emitter.emit('harness:phase:complete', makeCompleteEvent({
      phaseInstruction: 'Search memory for widgets.',
      output: makeBasicOutput({ content: 'Found 5 widget frames.' }),
    }));

    const trace = store.queryParsed({})[0];
    expect(trace.payload.input).toBe('Search memory for widgets.');
    expect(trace.payload.output).toBe('Found 5 widget frames.');
  });

  it('records tool calls and artifacts from the phase output', () => {
    const bridge = new HarnessTraceBridge({ recorder, events: emitter });
    bridge.start();

    emitter.emit('harness:phase:complete', makeCompleteEvent({
      output: makeBasicOutput({
        toolCalls: [
          { tool: 'search_memory', args: { q: 'x' }, result: 'result a' },
          { tool: 'web_search', args: { q: 'y' }, result: 'result b' },
        ],
        artifacts: ['docs/report.md', 'docs/summary.md'],
      }),
    }));

    const trace = store.queryParsed({})[0];
    expect(trace.payload.toolCalls).toHaveLength(2);
    expect(trace.payload.toolCalls[0].tool).toBe('search_memory');
    expect(trace.payload.toolCalls[1].tool).toBe('web_search');
    expect(trace.payload.artifacts).toEqual(['docs/report.md', 'docs/summary.md']);
  });

  it('tags traces with harness id + phase id + phase name', () => {
    const bridge = new HarnessTraceBridge({ recorder, events: emitter });
    bridge.start();

    emitter.emit('harness:phase:complete', makeCompleteEvent());

    const trace = store.queryParsed({})[0];
    expect(trace.payload.tags).toContain('harness');
    expect(trace.payload.tags).toContain('research-verify');
    expect(trace.payload.tags).toContain('gather');
    expect(trace.payload.tags).toContain('phase:Gather');
  });

  it('captures the phase tokens in the trace payload', () => {
    const bridge = new HarnessTraceBridge({ recorder, events: emitter });
    bridge.start();

    emitter.emit('harness:phase:complete', makeCompleteEvent({
      output: makeBasicOutput({ tokens: { input: 500, output: 321 } }),
    }));

    const trace = store.queryParsed({})[0];
    expect(trace.payload.tokens).toEqual({ input: 500, output: 321 });
  });

  // ── fail events ─────────────────────────────────────────────────

  it('creates an "abandoned" trace on harness:phase:fail when aborted=true', () => {
    const bridge = new HarnessTraceBridge({ recorder, events: emitter });
    bridge.start();

    emitter.emit('harness:phase:fail', makeFailEvent({ aborted: true }));

    const traces = store.queryParsed({});
    expect(traces).toHaveLength(1);
    expect(traces[0].outcome).toBe('abandoned');
    expect(traces[0].payload.harness?.gateResults?.[0].passed).toBe(false);
  });

  it('does NOT create a trace on mid-retry fail (aborted is falsy)', () => {
    const bridge = new HarnessTraceBridge({ recorder, events: emitter });
    bridge.start();

    emitter.emit('harness:phase:fail', makeFailEvent({ aborted: false, retryCount: 1 }));
    emitter.emit('harness:phase:fail', makeFailEvent({ aborted: undefined, retryCount: 2 }));

    expect(store.queryParsed({})).toHaveLength(0);
  });

  // ── context resolution ─────────────────────────────────────────

  it('applies a static context object to every trace', () => {
    const bridge = new HarnessTraceBridge({
      recorder,
      events: emitter,
      context: {
        sessionId: 'sess-1',
        personaId: 'researcher',
        workspaceId: 'ws-1',
        model: 'gpt-5.4',
      },
    });
    bridge.start();

    emitter.emit('harness:phase:complete', makeCompleteEvent());

    const trace = store.queryParsed({})[0];
    expect(trace.session_id).toBe('sess-1');
    expect(trace.persona_id).toBe('researcher');
    expect(trace.workspace_id).toBe('ws-1');
    expect(trace.model).toBe('gpt-5.4');
  });

  it('applies per-event context via resolver function', () => {
    const bridge = new HarnessTraceBridge({
      recorder,
      events: emitter,
      context: (ev) => ({
        sessionId: `sess-${ev.harnessId}`,
        personaId: 'coder',
      }),
    });
    bridge.start();

    emitter.emit('harness:phase:complete', makeCompleteEvent({ harnessId: 'h1' }));
    emitter.emit('harness:phase:complete', makeCompleteEvent({ harnessId: 'h2', phaseId: 'p2' }));

    const traces = store.queryParsed({}).sort((a, b) => a.id - b.id);
    expect(traces[0].session_id).toBe('sess-h1');
    expect(traces[1].session_id).toBe('sess-h2');
    expect(traces[0].persona_id).toBe('coder');
  });

  // ── lifecycle ──────────────────────────────────────────────────

  it('stop() removes listeners so subsequent events do nothing', () => {
    const bridge = new HarnessTraceBridge({ recorder, events: emitter });
    bridge.start();

    emitter.emit('harness:phase:complete', makeCompleteEvent());
    expect(store.queryParsed({})).toHaveLength(1);

    bridge.stop();
    emitter.emit('harness:phase:complete', makeCompleteEvent());
    expect(store.queryParsed({})).toHaveLength(1);
  });

  it('start() is idempotent — calling twice does not double-record', () => {
    const bridge = new HarnessTraceBridge({ recorder, events: emitter });
    bridge.start();
    bridge.start();

    emitter.emit('harness:phase:complete', makeCompleteEvent());

    expect(store.queryParsed({})).toHaveLength(1);
  });

  it('stop() is idempotent — calling twice is safe', () => {
    const bridge = new HarnessTraceBridge({ recorder, events: emitter });
    bridge.start();
    bridge.stop();
    expect(() => bridge.stop()).not.toThrow();
  });

  it('isRunning reflects start/stop state', () => {
    const bridge = new HarnessTraceBridge({ recorder, events: emitter });
    expect(bridge.isRunning).toBe(false);
    bridge.start();
    expect(bridge.isRunning).toBe(true);
    bridge.stop();
    expect(bridge.isRunning).toBe(false);
  });
});

// ── End-to-end via advancePhase ───────────────────────────────────

describe('HarnessTraceBridge + advancePhase integration', () => {
  it('writes a trace when advancePhase completes a phase on the real emitter', async () => {
    const emitter = new EventEmitter();
    const { recorder, store } = makeRecorder();
    const bridge = new HarnessTraceBridge({ recorder, events: emitter });
    bridge.start();

    const harness: WorkflowHarness = {
      id: 'test-hn',
      name: 'Test Harness',
      triggerPatterns: [],
      phases: [
        {
          id: 'only',
          name: 'Only',
          instruction: 'Do the thing.',
          gates: [
            { name: 'content has "ok"', validate: async (o) => ({ passed: o.content.includes('ok'), reason: 'checked' }) },
          ],
        },
      ],
      aggregation: 'last',
    };

    // advancePhase uses the shared harnessEvents by default — re-emit via
    // our scoped emitter instead. Temporarily swap listener source.
    const { harnessEvents } = await import('../src/workflow-harness.js');
    const bridgeOnShared = new HarnessTraceBridge({ recorder, events: harnessEvents });
    bridgeOnShared.start();
    bridge.stop();

    try {
      const run = createHarnessRun(harness);
      const output: PhaseOutput = {
        phaseId: 'only',
        content: 'result is ok',
        toolCalls: [],
        artifacts: [],
        durationMs: 50,
        tokens: { input: 10, output: 5 },
      };
      await advancePhase(run, harness, output);

      const traces = store.queryParsed({});
      expect(traces).toHaveLength(1);
      expect(traces[0].outcome).toBe('verified');
      expect(traces[0].payload.harness?.harnessId).toBe('test-hn');
      expect(traces[0].payload.harness?.phaseId).toBe('only');
      expect(traces[0].payload.input).toBe('Do the thing.');
      expect(traces[0].payload.output).toBe('result is ok');
    } finally {
      bridgeOnShared.stop();
    }
  });
});
