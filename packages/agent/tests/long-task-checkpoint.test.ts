/**
 * Tests for long-task/checkpoint.ts (Phase 3.1 of agent-fix sprint).
 *
 * Coverage:
 *   - Constructor validation (rootDir, taskId, path-traversal guards)
 *   - init() idempotency
 *   - save() round-trip preserves shape (incl. Readonly fields)
 *   - save() validation: task_id mismatch, negative step_index, bad schema_version
 *   - save() atomicity: writes go via tmp+rename, no partial files visible
 *   - load() returns undefined for missing step
 *   - loadLatest() picks highest step_index, undefined when empty
 *   - listSteps() ignores *.tmp residue + non-matching filenames + sorts ascending
 *   - listSteps() returns [] if per-task dir doesn't exist
 *   - verifyIntegrity() detects gaps, filename/index mismatch, bad schema_version
 *   - verifyIntegrity() ok=true on monotonic 0,1,2,...
 *   - dispose() removes per-task directory + idempotent
 *   - Per-task isolation: two stores w/ same rootDir + different taskIds independent
 *   - Helpers: makeInitialState, nextStateFrom carry-forward semantics
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fsp from 'node:fs/promises';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';

import {
  CheckpointStore,
  CHECKPOINT_SCHEMA_VERSION,
  makeInitialState,
  nextStateFrom,
  type CheckpointStepState,
  type Decision,
} from '../src/long-task/checkpoint.js';

// ─────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'waggle-checkpoint-'));
});

afterEach(async () => {
  await fsp.rm(tmpRoot, { recursive: true, force: true });
});

function buildState(overrides: Partial<CheckpointStepState> = {}): CheckpointStepState {
  return {
    schema_version: CHECKPOINT_SCHEMA_VERSION,
    task_id: 'task-1',
    run_id: 'run-abc',
    step_index: 0,
    timestamp_iso: '2026-04-27T00:00:00.000Z',
    step_action: 'plan',
    step_input: { question: 'q' },
    step_output: { plan: 'p' },
    accumulated_context: '',
    retrieval_cache: {},
    decision_history: [],
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Constructor
// ─────────────────────────────────────────────────────────────────────────

describe('CheckpointStore — constructor', () => {
  it('accepts a valid rootDir + taskId', () => {
    const store = new CheckpointStore({ rootDir: tmpRoot, taskId: 'task-1' });
    expect(store.taskId).toBe('task-1');
    expect(store.directory).toBe(path.join(tmpRoot, 'task-1'));
  });

  it('does not touch the filesystem in the constructor', () => {
    new CheckpointStore({ rootDir: tmpRoot, taskId: 'unborn' });
    expect(fs.existsSync(path.join(tmpRoot, 'unborn'))).toBe(false);
  });

  it('rejects an empty rootDir', () => {
    expect(() => new CheckpointStore({ rootDir: '', taskId: 'task-1' }))
      .toThrow(/rootDir is required/);
  });

  it('rejects an empty taskId', () => {
    expect(() => new CheckpointStore({ rootDir: tmpRoot, taskId: '' }))
      .toThrow(/taskId is required/);
  });

  it('rejects a taskId containing path separators', () => {
    expect(() => new CheckpointStore({ rootDir: tmpRoot, taskId: 'a/b' }))
      .toThrow(/path separators/);
    expect(() => new CheckpointStore({ rootDir: tmpRoot, taskId: 'a\\b' }))
      .toThrow(/path separators/);
  });

  it('rejects "." and ".." as taskId', () => {
    expect(() => new CheckpointStore({ rootDir: tmpRoot, taskId: '.' })).toThrow();
    expect(() => new CheckpointStore({ rootDir: tmpRoot, taskId: '..' })).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// init() / save() / load() round-trip
// ─────────────────────────────────────────────────────────────────────────

describe('CheckpointStore — init/save/load', () => {
  it('init() is idempotent', async () => {
    const store = new CheckpointStore({ rootDir: tmpRoot, taskId: 'task-init' });
    await store.init();
    await store.init(); // should not throw
    expect(fs.existsSync(store.directory)).toBe(true);
  });

  it('save() writes a step file and load() returns the same state', async () => {
    const store = new CheckpointStore({ rootDir: tmpRoot, taskId: 'task-rt' });
    const state = buildState({
      task_id: 'task-rt',
      step_action: 'retrieve',
      step_output: { docs: ['doc1', 'doc2'] },
      accumulated_context: 'so far so good',
      retrieval_cache: { 'q:hello': ['doc1'] },
      decision_history: [{ step_index: 0, decision: 'use top-3', rationale: 'recall>precision' }],
    });
    const writtenPath = await store.save(state);
    expect(writtenPath).toBe(path.join(store.directory, 'step-000000.json'));

    const loaded = await store.load(0);
    expect(loaded).toEqual(state);
  });

  it('save() mkdirs the per-task dir when init() was not called first', async () => {
    const store = new CheckpointStore({ rootDir: tmpRoot, taskId: 'task-lazy' });
    expect(fs.existsSync(store.directory)).toBe(false);
    await store.save(buildState({ task_id: 'task-lazy' }));
    expect(fs.existsSync(store.directory)).toBe(true);
  });

  it('save() uses zero-padded step filenames', async () => {
    const store = new CheckpointStore({ rootDir: tmpRoot, taskId: 'task-pad' });
    await store.save(buildState({ task_id: 'task-pad', step_index: 0 }));
    await store.save(buildState({ task_id: 'task-pad', step_index: 7 }));
    await store.save(buildState({ task_id: 'task-pad', step_index: 42 }));
    const entries = (await fsp.readdir(store.directory)).sort();
    expect(entries).toEqual(['step-000000.json', 'step-000007.json', 'step-000042.json']);
  });

  it('load() returns undefined for a step that does not exist', async () => {
    const store = new CheckpointStore({ rootDir: tmpRoot, taskId: 'task-miss' });
    await store.init();
    const loaded = await store.load(999);
    expect(loaded).toBeUndefined();
  });

  it('save() preserves nested objects byte-identical via JSON round-trip', async () => {
    const store = new CheckpointStore({ rootDir: tmpRoot, taskId: 'task-nested' });
    const state = buildState({
      task_id: 'task-nested',
      step_input: { nested: { deeply: { value: [1, 2, 3] } } },
      step_output: { result: { ok: true, items: [{ name: 'a' }, { name: 'b' }] } },
      retrieval_cache: { 'q:x': { results: [{ id: '1', score: 0.9 }] } },
    });
    await store.save(state);
    const loaded = await store.load(0);
    expect(loaded).toEqual(state);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// save() validation
// ─────────────────────────────────────────────────────────────────────────

describe('CheckpointStore — save validation', () => {
  it('rejects a state whose task_id does not match the store', async () => {
    const store = new CheckpointStore({ rootDir: tmpRoot, taskId: 'task-x' });
    const state = buildState({ task_id: 'task-WRONG' });
    await expect(store.save(state)).rejects.toThrow(/does not match store.taskId/);
  });

  it('rejects a negative step_index', async () => {
    const store = new CheckpointStore({ rootDir: tmpRoot, taskId: 'task-neg' });
    const state = buildState({ task_id: 'task-neg', step_index: -1 });
    await expect(store.save(state)).rejects.toThrow(/non-negative integer/);
  });

  it('rejects a non-integer step_index', async () => {
    const store = new CheckpointStore({ rootDir: tmpRoot, taskId: 'task-frac' });
    const state = buildState({ task_id: 'task-frac', step_index: 1.5 });
    await expect(store.save(state)).rejects.toThrow(/non-negative integer/);
  });

  it('rejects an unknown schema_version', async () => {
    const store = new CheckpointStore({ rootDir: tmpRoot, taskId: 'task-sv' });
    const state = buildState({ task_id: 'task-sv', schema_version: 99 });
    await expect(store.save(state)).rejects.toThrow(/schema_version mismatch/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// listSteps / loadLatest
// ─────────────────────────────────────────────────────────────────────────

describe('CheckpointStore — listSteps / loadLatest', () => {
  it('listSteps() returns sorted ascending indices', async () => {
    const store = new CheckpointStore({ rootDir: tmpRoot, taskId: 'task-list' });
    await store.save(buildState({ task_id: 'task-list', step_index: 2 }));
    await store.save(buildState({ task_id: 'task-list', step_index: 0 }));
    await store.save(buildState({ task_id: 'task-list', step_index: 1 }));
    expect(await store.listSteps()).toEqual([0, 1, 2]);
  });

  it('listSteps() returns [] for a never-initialized store', async () => {
    const store = new CheckpointStore({ rootDir: tmpRoot, taskId: 'task-empty' });
    expect(await store.listSteps()).toEqual([]);
  });

  it('listSteps() returns [] for an init()ed but empty store', async () => {
    const store = new CheckpointStore({ rootDir: tmpRoot, taskId: 'task-init-empty' });
    await store.init();
    expect(await store.listSteps()).toEqual([]);
  });

  it('listSteps() ignores *.tmp residue', async () => {
    const store = new CheckpointStore({ rootDir: tmpRoot, taskId: 'task-tmp' });
    await store.init();
    // Drop a finalized step + a leftover tmp from a hypothetical crash.
    await fsp.writeFile(path.join(store.directory, 'step-000000.json'), JSON.stringify(buildState({ task_id: 'task-tmp', step_index: 0 })));
    await fsp.writeFile(path.join(store.directory, 'step-000001.json.aabbccdd.tmp'), 'partial-write');
    await fsp.writeFile(path.join(store.directory, 'README.md'), 'unrelated file');
    expect(await store.listSteps()).toEqual([0]);
  });

  it('loadLatest() returns the highest-indexed step', async () => {
    const store = new CheckpointStore({ rootDir: tmpRoot, taskId: 'task-latest' });
    await store.save(buildState({ task_id: 'task-latest', step_index: 0, step_action: 'init' }));
    await store.save(buildState({ task_id: 'task-latest', step_index: 1, step_action: 'middle' }));
    await store.save(buildState({ task_id: 'task-latest', step_index: 2, step_action: 'last' }));
    const latest = await store.loadLatest();
    expect(latest?.step_index).toBe(2);
    expect(latest?.step_action).toBe('last');
  });

  it('loadLatest() returns undefined when no steps have been saved', async () => {
    const store = new CheckpointStore({ rootDir: tmpRoot, taskId: 'task-no-latest' });
    expect(await store.loadLatest()).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// verifyIntegrity
// ─────────────────────────────────────────────────────────────────────────

describe('CheckpointStore — verifyIntegrity', () => {
  it('reports ok=true for a clean monotonic sequence', async () => {
    const store = new CheckpointStore({ rootDir: tmpRoot, taskId: 'task-clean' });
    for (let i = 0; i < 4; i += 1) {
      await store.save(buildState({ task_id: 'task-clean', step_index: i }));
    }
    const report = await store.verifyIntegrity();
    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it('reports ok=true for an empty store', async () => {
    const store = new CheckpointStore({ rootDir: tmpRoot, taskId: 'task-empty-int' });
    const report = await store.verifyIntegrity();
    expect(report.ok).toBe(true);
  });

  it('flags a gap in the step sequence', async () => {
    const store = new CheckpointStore({ rootDir: tmpRoot, taskId: 'task-gap' });
    await store.save(buildState({ task_id: 'task-gap', step_index: 0 }));
    await store.save(buildState({ task_id: 'task-gap', step_index: 2 })); // skipped 1
    const report = await store.verifyIntegrity();
    expect(report.ok).toBe(false);
    expect(report.issues.some(i => i.includes('expected step_index=1'))).toBe(true);
  });

  it('flags a file whose internal step_index does not match the filename', async () => {
    const store = new CheckpointStore({ rootDir: tmpRoot, taskId: 'task-mis' });
    await store.init();
    // Write a step-000000.json file whose body claims step_index=5.
    const lying = buildState({ task_id: 'task-mis', step_index: 5 });
    await fsp.writeFile(
      path.join(store.directory, 'step-000000.json'),
      JSON.stringify(lying),
    );
    const report = await store.verifyIntegrity();
    expect(report.ok).toBe(false);
    expect(report.issues.some(i => i.includes('does not match filename'))).toBe(true);
  });

  it('flags a file with the wrong schema_version', async () => {
    const store = new CheckpointStore({ rootDir: tmpRoot, taskId: 'task-sv-int' });
    await store.init();
    const bad = { ...buildState({ task_id: 'task-sv-int', step_index: 0 }), schema_version: 99 };
    await fsp.writeFile(
      path.join(store.directory, 'step-000000.json'),
      JSON.stringify(bad),
    );
    const report = await store.verifyIntegrity();
    expect(report.ok).toBe(false);
    expect(report.issues.some(i => i.includes('schema_version=99'))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// dispose / per-task isolation
// ─────────────────────────────────────────────────────────────────────────

describe('CheckpointStore — dispose + isolation', () => {
  it('dispose() removes the per-task directory', async () => {
    const store = new CheckpointStore({ rootDir: tmpRoot, taskId: 'task-dispose' });
    await store.save(buildState({ task_id: 'task-dispose' }));
    expect(fs.existsSync(store.directory)).toBe(true);
    await store.dispose();
    expect(fs.existsSync(store.directory)).toBe(false);
  });

  it('dispose() is idempotent when nothing was written', async () => {
    const store = new CheckpointStore({ rootDir: tmpRoot, taskId: 'task-dispose-empty' });
    await expect(store.dispose()).resolves.toBeUndefined();
    await expect(store.dispose()).resolves.toBeUndefined();
  });

  it('two stores in the same rootDir but different taskIds are isolated', async () => {
    const a = new CheckpointStore({ rootDir: tmpRoot, taskId: 'task-A' });
    const b = new CheckpointStore({ rootDir: tmpRoot, taskId: 'task-B' });
    await a.save(buildState({ task_id: 'task-A', step_index: 0, step_action: 'A0' }));
    await b.save(buildState({ task_id: 'task-B', step_index: 0, step_action: 'B0' }));
    await b.save(buildState({ task_id: 'task-B', step_index: 1, step_action: 'B1' }));

    expect(await a.listSteps()).toEqual([0]);
    expect(await b.listSteps()).toEqual([0, 1]);

    // Dispose A leaves B intact.
    await a.dispose();
    expect(fs.existsSync(a.directory)).toBe(false);
    expect(fs.existsSync(b.directory)).toBe(true);
    expect(await b.listSteps()).toEqual([0, 1]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Concurrent writes (no corruption at distinct step indices)
// ─────────────────────────────────────────────────────────────────────────

describe('CheckpointStore — concurrent saves', () => {
  it('Promise.all of distinct-step saves yields all files intact', async () => {
    const store = new CheckpointStore({ rootDir: tmpRoot, taskId: 'task-conc' });
    const N = 10;
    const writes: Array<Promise<string>> = [];
    for (let i = 0; i < N; i += 1) {
      writes.push(store.save(buildState({ task_id: 'task-conc', step_index: i, step_action: `step-${i}` })));
    }
    await Promise.all(writes);
    const indices = await store.listSteps();
    expect(indices).toEqual(Array.from({ length: N }, (_, i) => i));

    // Each loaded file matches the expected step index.
    for (let i = 0; i < N; i += 1) {
      const s = await store.load(i);
      expect(s?.step_index).toBe(i);
      expect(s?.step_action).toBe(`step-${i}`);
    }

    // No tmp residue.
    const entries = await fsp.readdir(store.directory);
    expect(entries.every(e => !e.endsWith('.tmp'))).toBe(true);
  });

  it('two concurrent saves at the SAME step_index produce one valid file', async () => {
    const store = new CheckpointStore({ rootDir: tmpRoot, taskId: 'task-race' });
    const a = buildState({ task_id: 'task-race', step_index: 0, step_action: 'A' });
    const b = buildState({ task_id: 'task-race', step_index: 0, step_action: 'B' });
    await Promise.all([store.save(a), store.save(b)]);
    const loaded = await store.load(0);
    // The winner is non-deterministic but the file must be one of the two valid states,
    // not a corrupted half-write.
    expect(['A', 'B']).toContain(loaded?.step_action);
    expect(loaded?.step_index).toBe(0);

    // No tmp residue left behind (rename completed for both writers).
    const entries = await fsp.readdir(store.directory);
    expect(entries.every(e => !e.endsWith('.tmp'))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Helpers: makeInitialState / nextStateFrom
// ─────────────────────────────────────────────────────────────────────────

describe('makeInitialState', () => {
  it('returns a step_index=0 shell with empty persistent fields', () => {
    const s = makeInitialState({ task_id: 'task-h', run_id: 'r' });
    expect(s.step_index).toBe(0);
    expect(s.task_id).toBe('task-h');
    expect(s.run_id).toBe('r');
    expect(s.accumulated_context).toBe('');
    expect(s.retrieval_cache).toEqual({});
    expect(s.decision_history).toEqual([]);
    expect(s.schema_version).toBe(CHECKPOINT_SCHEMA_VERSION);
    expect(s.step_action).toBe('init');
  });

  it('respects a custom step_action', () => {
    const s = makeInitialState({ task_id: 't', run_id: 'r', step_action: 'kickoff' });
    expect(s.step_action).toBe('kickoff');
  });

  it('produces ISO 8601 UTC timestamps', () => {
    const s = makeInitialState({ task_id: 't', run_id: 'r' });
    expect(s.timestamp_iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

describe('nextStateFrom', () => {
  it('increments step_index by 1', () => {
    const prior = makeInitialState({ task_id: 't', run_id: 'r' });
    const next = nextStateFrom(prior, { step_action: 'work' });
    expect(next.step_index).toBe(1);
  });

  it('carries forward accumulated_context, retrieval_cache, decision_history', () => {
    const prior: CheckpointStepState = {
      ...makeInitialState({ task_id: 't', run_id: 'r' }),
      accumulated_context: 'abc',
      retrieval_cache: { 'q:1': ['a'] },
      decision_history: [{ step_index: 0, decision: 'D1' }],
    };
    const next = nextStateFrom(prior, { step_action: 'work' });
    expect(next.accumulated_context).toBe('abc');
    expect(next.retrieval_cache).toEqual({ 'q:1': ['a'] });
    expect(next.decision_history).toEqual([{ step_index: 0, decision: 'D1' }]);
  });

  it('appends to accumulated_context when appended_context is provided', () => {
    const prior = { ...makeInitialState({ task_id: 't', run_id: 'r' }), accumulated_context: 'abc' };
    const next = nextStateFrom(prior, { step_action: 'work', appended_context: 'def' });
    expect(next.accumulated_context).toBe('abcdef');
  });

  it('merges retrieval_additions into retrieval_cache', () => {
    const prior = {
      ...makeInitialState({ task_id: 't', run_id: 'r' }),
      retrieval_cache: { old: 1 },
    };
    const next = nextStateFrom(prior, {
      step_action: 'work',
      retrieval_additions: { fresh: 2 },
    });
    expect(next.retrieval_cache).toEqual({ old: 1, fresh: 2 });
  });

  it('appends decisions to decision_history', () => {
    const prior = {
      ...makeInitialState({ task_id: 't', run_id: 'r' }),
      decision_history: [{ step_index: 0, decision: 'first' }] as readonly Decision[],
    };
    const next = nextStateFrom(prior, {
      step_action: 'work',
      decisions: [{ step_index: 1, decision: 'second' }],
    });
    expect(next.decision_history).toEqual([
      { step_index: 0, decision: 'first' },
      { step_index: 1, decision: 'second' },
    ]);
  });

  it('does NOT carry per-step fields forward (step_action / cost_usd / latency_ms / error)', () => {
    const prior: CheckpointStepState = {
      ...makeInitialState({ task_id: 't', run_id: 'r' }),
      step_action: 'old',
      cost_usd: 0.01,
      latency_ms: 100,
      error: 'old error',
    };
    const next = nextStateFrom(prior, { step_action: 'new' });
    expect(next.step_action).toBe('new');
    expect(next.cost_usd).toBeUndefined();
    expect(next.latency_ms).toBeUndefined();
    expect(next.error).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// End-to-end: save many steps, restart store, verify replay
// ─────────────────────────────────────────────────────────────────────────

describe('CheckpointStore — restart-and-resume scenario', () => {
  it('a fresh store sees prior steps written by an earlier process', async () => {
    const taskId = 'task-' + crypto.randomBytes(4).toString('hex');

    // Process A: write 3 steps.
    {
      const a = new CheckpointStore({ rootDir: tmpRoot, taskId });
      let s = makeInitialState({ task_id: taskId, run_id: 'r' });
      await a.save(s);
      s = nextStateFrom(s, { step_action: 'mid', appended_context: '|mid' });
      await a.save(s);
      s = nextStateFrom(s, { step_action: 'last', appended_context: '|last' });
      await a.save(s);
    }

    // Process B (simulated): brand-new store on the same rootDir + taskId.
    const b = new CheckpointStore({ rootDir: tmpRoot, taskId });
    expect(await b.listSteps()).toEqual([0, 1, 2]);

    const latest = await b.loadLatest();
    expect(latest?.step_index).toBe(2);
    expect(latest?.step_action).toBe('last');
    expect(latest?.accumulated_context).toBe('|mid|last');

    const integrity = await b.verifyIntegrity();
    expect(integrity.ok).toBe(true);
  });
});
