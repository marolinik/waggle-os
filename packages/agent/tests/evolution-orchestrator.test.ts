import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MindDB, ExecutionTraceStore, EvolutionRunStore } from '@waggle/core';
import {
  EvolutionOrchestrator,
  eligibleForEvolution,
  summarizeRuns,
} from '../src/evolution-orchestrator.js';
import type { JudgeScore } from '../src/judge.js';
import type { Schema, SchemaExecuteFn } from '../src/evolve-schema.js';
import type { MutateFn } from '../src/iterative-optimizer.js';

// ── Fixtures ───────────────────────────────────────────────────

function makeSchema(fields: string[]): Schema {
  return {
    name: 'test',
    fields: fields.map(n => ({
      name: n, type: 'string' as const,
      description: `${n} field`,
      required: true, constraints: [],
    })),
    version: 1,
  };
}

function makeJudgeScore(overall: number, feedback = 'ok'): JudgeScore {
  return {
    overall, weighted: overall,
    correctness: overall, procedureFollowing: overall, conciseness: overall,
    lengthPenalty: 1, feedback, parsed: true,
  };
}

// Executor that produces longer output for bigger schemas.
function makeExec(): SchemaExecuteFn {
  return async ({ schema }) => ({
    actual: schema.fields.map(f => f.name).join(','),
    parsed: true,
  });
}

// Judge that prefers candidates containing the "plus" token so the
// mutateAppend helper ("... plus") wins reliably. Creates a measurable
// delta between baseline and winner regardless of absolute lengths.
function makeJudge(): { score: (args: { input: string; expected: string; actual: string }) => Promise<JudgeScore> } {
  return {
    async score(args) {
      const base = Math.min(1, args.actual.length / 100) * 0.6;
      const bonus = args.actual.includes('plus') ? 0.3 : 0;
      return makeJudgeScore(Math.min(1, base + bonus), 'the response is too terse');
    },
  };
}

// Mutate appends ~10 chars so growth ratio stays below the default +20%.
const mutateAppend: MutateFn = async ({ parent }) => `${parent.prompt} plus`;

// A baseline that's long enough that +20% growth cap isn't a problem for short appends.
const BASELINE =
  'Return a concise answer that directly addresses the question. ' +
  'Provide a brief explanation and the final answer. Be clear and accurate.';

function seedSuccessfulTraces(store: ExecutionTraceStore, n: number, personaId = 'researcher') {
  for (let i = 0; i < n; i++) {
    const id = store.start({
      personaId,
      input: `test question ${i} with enough length to pass filters`,
      workspaceId: 'ws-1',
      taskShape: 'qa',
    });
    store.finalize(id, {
      outcome: 'success',
      output: `a full answer for question ${i} that is long enough for use`,
    });
  }
}

function baseComposeOptions() {
  return {
    schema: {
      examples: [] as never[],
      execute: makeExec(),
      judge: makeJudge(),
      populationSize: 2, generations: 1,
      evalSize: 3, anchorEvalSize: 3,
    },
    instructions: {
      examples: [] as never[],
      judge: makeJudge(),
      mutate: mutateAppend,
      allowBareJudge: true,
      populationSize: 2, generations: 1,
      microScreenSize: 3, miniEvalSize: 3, anchorEvalSize: 3,
    },
  };
}

// ── eligibleForEvolution ──

describe('eligibleForEvolution', () => {
  it('keeps finalized traces with non-empty input and output', () => {
    const eligible = eligibleForEvolution([
      {
        id: 1, session_id: 's', persona_id: null, workspace_id: null,
        model: null, task_shape: null, outcome: 'success',
        cost_usd: 0, duration_ms: 0, created_at: '', finalized_at: '',
        payload: {
          input: 'q', output: 'a', reasoning: [], toolCalls: [], artifacts: [],
          tokens: { input: 0, output: 0 }, tags: [],
        },
      } as any,
    ]);
    expect(eligible).toHaveLength(1);
  });

  it('drops pending traces', () => {
    const eligible = eligibleForEvolution([
      {
        id: 1, outcome: 'pending',
        payload: { input: 'q', output: 'a', reasoning: [], toolCalls: [], artifacts: [], tokens: { input: 0, output: 0 }, tags: [] },
      } as any,
    ]);
    expect(eligible).toHaveLength(0);
  });

  it('drops traces with empty input', () => {
    const eligible = eligibleForEvolution([
      {
        id: 1, outcome: 'success',
        payload: { input: '', output: 'a', reasoning: [], toolCalls: [], artifacts: [], tokens: { input: 0, output: 0 }, tags: [] },
      } as any,
    ]);
    expect(eligible).toHaveLength(0);
  });

  it('keeps corrected traces even with empty output as long as correctionFeedback is present', () => {
    const eligible = eligibleForEvolution([
      {
        id: 1, outcome: 'corrected',
        payload: {
          input: 'q', output: '', reasoning: [], toolCalls: [], artifacts: [],
          tokens: { input: 0, output: 0 }, tags: [],
          correctionFeedback: 'use bullets',
        },
      } as any,
    ]);
    expect(eligible).toHaveLength(1);
  });
});

// ── summarizeRuns ──

describe('summarizeRuns', () => {
  it('returns zero-aggregates on empty input', () => {
    const s = summarizeRuns([]);
    expect(s.total).toBe(0);
    expect(s.byStatus.proposed).toBe(0);
    expect(s.bestDelta).toBe(0);
  });

  it('counts by status and target kind, tracks best delta', () => {
    const runs = [
      { status: 'proposed', target_kind: 'persona-system-prompt', delta_accuracy: 0.05 },
      { status: 'accepted', target_kind: 'persona-system-prompt', delta_accuracy: 0.12 },
      { status: 'rejected', target_kind: 'tool-description', delta_accuracy: 0.02 },
      { status: 'deployed', target_kind: 'persona-system-prompt', delta_accuracy: 0.09 },
    ] as any[];
    const s = summarizeRuns(runs);
    expect(s.total).toBe(4);
    expect(s.byStatus.proposed).toBe(1);
    expect(s.byStatus.accepted).toBe(1);
    expect(s.byStatus.rejected).toBe(1);
    expect(s.byStatus.deployed).toBe(1);
    expect(s.byTargetKind['persona-system-prompt']).toBe(3);
    expect(s.byTargetKind['tool-description']).toBe(1);
    expect(s.bestDelta).toBeCloseTo(0.12, 5);
  });
});

// ── EvolutionOrchestrator end-to-end ───────────────────────────

describe('EvolutionOrchestrator', () => {
  let db: MindDB;
  let traceStore: ExecutionTraceStore;
  let runStore: EvolutionRunStore;
  let orchestrator: EvolutionOrchestrator;

  beforeEach(() => {
    db = new MindDB(':memory:');
    traceStore = new ExecutionTraceStore(db);
    runStore = new EvolutionRunStore(db);
    orchestrator = new EvolutionOrchestrator({ traceStore, runStore });
  });

  afterEach(() => {
    db.close();
  });

  // ── runOnce ──

  describe('runOnce', () => {
    it('produces a proposed run when gates pass and delta exceeds minimum', async () => {
      seedSuccessfulTraces(traceStore, 10);
      const result = await orchestrator.runOnce({
        targetKind: 'persona-system-prompt',
        targetName: 'researcher',
        baseline: BASELINE,
        schemaBaseline: makeSchema(['answer']),
        compose: baseComposeOptions(),
      });

      expect(result.outcome).toBe('proposed');
      expect(result.run?.status).toBe('proposed');
      expect(result.run?.delta_accuracy).toBeGreaterThan(0);
      expect(result.compose).toBeDefined();
      expect(result.gateResults).toBeDefined();
    });

    it('persists compose artifacts (schema JSON, gates, delta)', async () => {
      seedSuccessfulTraces(traceStore, 8);
      const result = await orchestrator.runOnce({
        targetKind: 'persona-system-prompt',
        targetName: 'researcher',
        baseline: BASELINE,
        schemaBaseline: makeSchema(['answer']),
        compose: baseComposeOptions(),
      });

      const run = result.run!;
      expect(run.winner_schema_json).toBeTruthy();
      const schema = JSON.parse(run.winner_schema_json!);
      expect(schema.name).toBe('test');
      expect(JSON.parse(run.gate_reasons_json).length).toBeGreaterThan(0);
    });

    it('skips with skipped-delta when improvement is below threshold', async () => {
      seedSuccessfulTraces(traceStore, 8);
      const result = await orchestrator.runOnce({
        targetKind: 'persona-system-prompt',
        baseline: 'a reasonably detailed baseline prompt that already scores well',
        schemaBaseline: makeSchema(['answer']),
        compose: {
          ...baseComposeOptions(),
          instructions: {
            ...baseComposeOptions().instructions,
            // Mutate returns the same text → zero delta
            mutate: async ({ parent }) => parent.prompt,
          },
        },
        minDelta: 0.5, // artificially high
      });

      expect(result.outcome).toBe('skipped-delta');
      expect(result.run).toBeUndefined();
    });

    it('auto-trigger: skips when too few traces', async () => {
      seedSuccessfulTraces(traceStore, 2);
      const result = await orchestrator.runOnce({
        targetKind: 'persona-system-prompt',
        baseline: 'baseline',
        schemaBaseline: makeSchema(['answer']),
        compose: baseComposeOptions(),
        autoTrigger: { minTraces: 50 },
      });

      expect(result.outcome).toBe('skipped-trigger');
      expect(result.run).toBeUndefined();
    });

    it('auto-trigger: proceeds when threshold is met', async () => {
      seedSuccessfulTraces(traceStore, 10);
      const result = await orchestrator.runOnce({
        targetKind: 'persona-system-prompt',
        baseline: BASELINE,
        schemaBaseline: makeSchema(['answer']),
        compose: baseComposeOptions(),
        autoTrigger: { minTraces: 5 },
      });

      expect(result.outcome).toBe('proposed');
    });

    it('immediately rejects gate-failing runs (still persisted for audit)', async () => {
      seedSuccessfulTraces(traceStore, 8);
      // Judge that prefers the mutated "y" text — ensures the GEPA winner
      // is the oversized candidate, not the baseline.
      const yPreferringJudge = {
        async score(args: { input: string; expected: string; actual: string }): Promise<JudgeScore> {
          return makeJudgeScore(args.actual.includes('y') ? 0.9 : 0.3, 'ok');
        },
      };
      const result = await orchestrator.runOnce({
        targetKind: 'tool-description',
        baseline: 'x'.repeat(30),
        schemaBaseline: makeSchema(['answer']),
        compose: {
          ...baseComposeOptions(),
          instructions: {
            ...baseComposeOptions().instructions,
            judge: yPreferringJudge,
            // Mutate produces candidate that blows past tool-description cap (500)
            mutate: async () => 'y'.repeat(2000),
          },
        },
        minDelta: 0, // allow any delta so we reach the gate stage
      });

      expect(result.outcome).toBe('skipped-gates');
      expect(result.run?.status).toBe('rejected');
      expect(result.run?.gate_verdict).toBe('fail');
      expect(result.run?.user_note).toMatch(/gate failure/);
    });

    it('aborts cleanly when signal fires before start', async () => {
      seedSuccessfulTraces(traceStore, 5);
      const ctrl = new AbortController();
      ctrl.abort();
      const result = await orchestrator.runOnce({
        targetKind: 'generic',
        baseline: 'baseline',
        schemaBaseline: makeSchema(['answer']),
        compose: baseComposeOptions(),
        signal: ctrl.signal,
      });
      expect(result.outcome).toBe('aborted');
    });

    it('emits progress events', async () => {
      seedSuccessfulTraces(traceStore, 5);
      const phases: string[] = [];
      await orchestrator.runOnce({
        targetKind: 'generic',
        baseline: BASELINE,
        schemaBaseline: makeSchema(['answer']),
        compose: baseComposeOptions(),
        onProgress: (e) => phases.push(e.phase),
      });
      expect(phases).toContain('compose');
      expect(phases).toContain('done');
    });
  });

  // ── accept ──

  describe('accept', () => {
    it('invokes deploy callback and marks run deployed on success', async () => {
      const deploy = vi.fn(async () => { /* success */ });
      const deployedOrch = new EvolutionOrchestrator({ traceStore, runStore, deploy });
      seedSuccessfulTraces(traceStore, 8);

      const run = await deployedOrch.runOnce({
        targetKind: 'persona-system-prompt',
        baseline: BASELINE,
        schemaBaseline: makeSchema(['answer']),
        compose: baseComposeOptions(),
      });
      expect(run.outcome).toBe('proposed');

      const accepted = await deployedOrch.accept(run.run!.run_uuid, 'good mutation');
      expect(accepted?.status).toBe('deployed');
      expect(deploy).toHaveBeenCalledTimes(1);
    });

    it('marks run failed when deploy callback throws', async () => {
      const deploy = vi.fn(async () => { throw new Error('persona write failed'); });
      const orch = new EvolutionOrchestrator({ traceStore, runStore, deploy });
      seedSuccessfulTraces(traceStore, 8);

      const run = await orch.runOnce({
        targetKind: 'persona-system-prompt',
        baseline: BASELINE,
        schemaBaseline: makeSchema(['answer']),
        compose: baseComposeOptions(),
      });

      const result = await orch.accept(run.run!.run_uuid);
      expect(result?.status).toBe('failed');
      expect(result?.failure_reason).toContain('persona write failed');
    });

    it('leaves run as accepted when no deploy hook configured', async () => {
      seedSuccessfulTraces(traceStore, 8);
      const run = await orchestrator.runOnce({
        targetKind: 'generic',
        baseline: BASELINE,
        schemaBaseline: makeSchema(['answer']),
        compose: baseComposeOptions(),
      });
      const accepted = await orchestrator.accept(run.run!.run_uuid);
      expect(accepted?.status).toBe('accepted');
    });

    it('returns undefined for unknown uuid', async () => {
      expect(await orchestrator.accept('does-not-exist')).toBeUndefined();
    });
  });

  // ── reject ──

  describe('reject', () => {
    it('marks proposed run as rejected', async () => {
      seedSuccessfulTraces(traceStore, 8);
      const run = await orchestrator.runOnce({
        targetKind: 'generic',
        baseline: BASELINE,
        schemaBaseline: makeSchema(['answer']),
        compose: baseComposeOptions(),
      });
      const rejected = orchestrator.reject(run.run!.run_uuid, 'regressed on custom cases');
      expect(rejected?.status).toBe('rejected');
      expect(rejected?.user_note).toBe('regressed on custom cases');
    });
  });

  // ── list / get ──

  describe('list / get', () => {
    it('returns runs in reverse-chronological order', async () => {
      seedSuccessfulTraces(traceStore, 8);
      await orchestrator.runOnce({
        targetKind: 'generic', baseline: 'a',
        schemaBaseline: makeSchema(['answer']),
        compose: baseComposeOptions(),
      });
      await orchestrator.runOnce({
        targetKind: 'generic', baseline: 'b',
        schemaBaseline: makeSchema(['answer']),
        compose: baseComposeOptions(),
      });
      const list = orchestrator.list();
      expect(list.length).toBeGreaterThanOrEqual(2);
    });

    it('get returns a specific run by uuid', async () => {
      seedSuccessfulTraces(traceStore, 8);
      const created = await orchestrator.runOnce({
        targetKind: 'generic', baseline: 'short',
        schemaBaseline: makeSchema(['answer']),
        compose: baseComposeOptions(),
      });
      const fetched = orchestrator.get(created.run!.run_uuid);
      expect(fetched?.id).toBe(created.run!.id);
    });
  });
});
