import { describe, it, expect } from 'vitest';
import {
  EvolveSchema,
  addOutputField,
  removeField,
  editFieldDescription,
  changeFieldType,
  addConstraint,
  removeConstraint,
  reorderFields,
  replaceOutputFields,
  schemaComplexity,
  aggregateSchemaScores,
  paretoFrontSchema,
  pickSchemaWinner,
  generateStructureMutations,
  generateOrderMutations,
  generateRefinementMutations,
  pickSample,
  type Schema,
  type SchemaField,
  type SchemaCandidate,
  type SchemaCandidateScore,
  type SchemaExecuteFn,
} from '../src/evolve-schema.js';
import type { EvalExample } from '../src/eval-dataset.js';
import type { JudgeScore } from '../src/judge.js';

// ── Fixtures ───────────────────────────────────────────────────

function makeField(name: string, partial: Partial<SchemaField> = {}): SchemaField {
  return {
    name,
    type: 'string',
    description: `description for ${name}`,
    required: true,
    constraints: [],
    ...partial,
  };
}

function makeSchema(fields: string[]): Schema {
  return {
    name: 'test',
    fields: fields.map(f => makeField(f)),
    version: 1,
  };
}

function makeExamples(n: number): EvalExample[] {
  return Array.from({ length: n }, (_, i) => ({
    input: `q${i}`,
    expected_output: `a${i}`,
    metadata: { source: 'trace' as const },
  }));
}

function makeJudgeScore(overall: number, feedback = 'ok'): JudgeScore {
  return {
    overall, weighted: overall,
    correctness: overall, procedureFollowing: overall, conciseness: overall,
    lengthPenalty: 1, feedback, parsed: true,
  };
}

function makeCandidate(id: string, schema: Schema, score: SchemaCandidateScore | null): SchemaCandidate {
  return {
    id,
    schema,
    generation: 0,
    parent: null,
    mutation: 'baseline',
    mutationLabel: 'baseline',
    score,
    perExample: [],
  };
}

// Fake executor: returns a deterministic output string that scores higher
// when schema has more fields (up to a cap) and scores lower when schema
// is bloated beyond 5 fields.
function makeFakeExecutor(bias: 'prefers-more' | 'prefers-less' | 'flat' = 'prefers-more'): SchemaExecuteFn {
  return async ({ schema }) => ({
    actual: schema.fields.map(f => `${f.name}=mock`).join('; '),
    parsed: schema.fields.length > 0,
  });
}

function makeJudge(bias: 'prefers-more' | 'prefers-less' | 'flat' = 'prefers-more') {
  return {
    async score(args: { input: string; expected: string; actual: string }): Promise<JudgeScore> {
      const fieldCount = (args.actual.match(/=/g) || []).length;
      let overall: number;
      if (bias === 'prefers-more') {
        // More fields = better, up to 6 fields, then flat
        overall = Math.min(1, fieldCount / 6);
      } else if (bias === 'prefers-less') {
        overall = Math.max(0, 1 - fieldCount / 10);
      } else {
        overall = 0.5;
      }
      return makeJudgeScore(overall);
    },
  };
}

// ── Pure mutation functions ────────────────────────────────────

describe('addOutputField', () => {
  it('appends when no position given', () => {
    const s = makeSchema(['a', 'b']);
    const next = addOutputField(s, makeField('c'));
    expect(next.fields.map(f => f.name)).toEqual(['a', 'b', 'c']);
    expect(next.version).toBe(2);
  });

  it('inserts at given position', () => {
    const s = makeSchema(['a', 'c']);
    const next = addOutputField(s, makeField('b'), 1);
    expect(next.fields.map(f => f.name)).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate source', () => {
    const s = makeSchema(['a']);
    addOutputField(s, makeField('b'));
    expect(s.fields.map(f => f.name)).toEqual(['a']);
  });
});

describe('removeField', () => {
  it('drops the named field', () => {
    const s = makeSchema(['a', 'b', 'c']);
    const next = removeField(s, 'b');
    expect(next.fields.map(f => f.name)).toEqual(['a', 'c']);
    expect(next.version).toBe(2);
  });

  it('is a no-op for unknown field', () => {
    const s = makeSchema(['a', 'b']);
    const next = removeField(s, 'z');
    expect(next.fields.map(f => f.name)).toEqual(['a', 'b']);
  });
});

describe('editFieldDescription', () => {
  it('updates the description of the named field', () => {
    const s = makeSchema(['a']);
    const next = editFieldDescription(s, 'a', 'new');
    expect(next.fields[0].description).toBe('new');
  });
});

describe('changeFieldType', () => {
  it('updates the type of the named field', () => {
    const s = makeSchema(['a']);
    const next = changeFieldType(s, 'a', 'number');
    expect(next.fields[0].type).toBe('number');
  });
});

describe('addConstraint / removeConstraint', () => {
  it('adds a constraint', () => {
    const s = makeSchema(['a']);
    const next = addConstraint(s, 'a', { kind: 'maxLength', value: 10 });
    expect(next.fields[0].constraints).toHaveLength(1);
  });

  it('removes the given constraint index', () => {
    const s = addConstraint(makeSchema(['a']), 'a', { kind: 'maxLength', value: 10 });
    const next = removeConstraint(s, 'a', 0);
    expect(next.fields[0].constraints).toHaveLength(0);
  });

  it('is a no-op for unknown field when adding', () => {
    const s = makeSchema(['a']);
    const next = addConstraint(s, 'z', { kind: 'maxLength', value: 10 });
    expect(next.fields[0].constraints).toHaveLength(0);
  });
});

describe('reorderFields', () => {
  it('reorders by name', () => {
    const s = makeSchema(['a', 'b', 'c']);
    const next = reorderFields(s, ['c', 'a', 'b']);
    expect(next.fields.map(f => f.name)).toEqual(['c', 'a', 'b']);
  });

  it('appends fields omitted from newOrder', () => {
    const s = makeSchema(['a', 'b', 'c']);
    const next = reorderFields(s, ['b']);
    // 'b' first, then the rest in original order
    expect(next.fields.map(f => f.name)).toEqual(['b', 'a', 'c']);
  });

  it('ignores unknown field names in newOrder', () => {
    const s = makeSchema(['a', 'b']);
    const next = reorderFields(s, ['unknown', 'a', 'b']);
    expect(next.fields.map(f => f.name)).toEqual(['a', 'b']);
  });
});

describe('replaceOutputFields', () => {
  it('replaces all fields', () => {
    const s = makeSchema(['a', 'b']);
    const next = replaceOutputFields(s, [makeField('x'), makeField('y')]);
    expect(next.fields.map(f => f.name)).toEqual(['x', 'y']);
  });
});

// ── Complexity + scoring ───────────────────────────────────────

describe('schemaComplexity', () => {
  it('returns 0 for empty schema', () => {
    expect(schemaComplexity(makeSchema([]))).toBe(0);
  });

  it('scales with field count, constraint count, and description length', () => {
    const simple = schemaComplexity(makeSchema(['a']));
    const twoField = schemaComplexity(makeSchema(['a', 'b']));
    expect(twoField).toBeGreaterThan(simple);

    const withConstraint = schemaComplexity(
      addConstraint(makeSchema(['a']), 'a', { kind: 'maxLength', value: 10 }),
    );
    expect(withConstraint).toBeGreaterThan(simple);
  });
});

describe('aggregateSchemaScores', () => {
  it('returns zero aggregate on empty results', () => {
    const agg = aggregateSchemaScores([]);
    expect(agg.n).toBe(0);
    expect(agg.accuracy).toBe(0);
    expect(agg.parseRate).toBe(0);
  });

  it('averages accuracy + computes parse rate', () => {
    const results = [
      { input: 'a', expected: 'A', actual: 'A', score: makeJudgeScore(0.8), parsed: true },
      { input: 'b', expected: 'B', actual: 'B', score: makeJudgeScore(0.6), parsed: true },
      { input: 'c', expected: 'C', actual: 'X', score: makeJudgeScore(0.2), parsed: false },
    ];
    const agg = aggregateSchemaScores(results);
    expect(agg.n).toBe(3);
    expect(agg.accuracy).toBeCloseTo((0.8 + 0.6 + 0.2) / 3, 5);
    expect(agg.parseRate).toBeCloseTo(2 / 3, 5);
  });

  it('surfaces worst-3 example feedback', () => {
    const results = [
      { input: 'a', expected: 'A', actual: 'A', score: makeJudgeScore(0.9, 'best'), parsed: true },
      { input: 'b', expected: 'B', actual: 'B', score: makeJudgeScore(0.1, 'worst'), parsed: true },
      { input: 'c', expected: 'C', actual: 'C', score: makeJudgeScore(0.5, 'middle'), parsed: true },
    ];
    const agg = aggregateSchemaScores(results);
    expect(agg.weaknessFeedback).toContain('worst');
    expect(agg.weaknessFeedback).toContain('middle');
  });
});

// ── Pareto ─────────────────────────────────────────────────────

describe('paretoFrontSchema', () => {
  const makeScore = (accuracy: number, complexity: number): SchemaCandidateScore => ({
    accuracy, complexity, parseRate: 1, weaknessFeedback: [], n: 10,
  });

  it('removes strictly dominated candidates', () => {
    const dominated = makeCandidate('d', makeSchema(['a']), makeScore(0.5, 5));
    const better = makeCandidate('b', makeSchema(['a']), makeScore(0.8, 3));
    const front = paretoFrontSchema([dominated, better]);
    expect(front.map(c => c.id)).toEqual(['b']);
  });

  it('keeps trade-off candidates (accurate vs simple)', () => {
    const accurate = makeCandidate('acc', makeSchema(['a', 'b']), makeScore(0.9, 10));
    const simple = makeCandidate('sim', makeSchema(['a']), makeScore(0.7, 2));
    const front = paretoFrontSchema([accurate, simple]);
    expect(front).toHaveLength(2);
  });

  it('ignores unscored candidates', () => {
    const scored = makeCandidate('s', makeSchema(['a']), makeScore(0.5, 1));
    const unscored = makeCandidate('u', makeSchema(['a']), null);
    const front = paretoFrontSchema([scored, unscored]);
    expect(front).toHaveLength(1);
  });
});

describe('pickSchemaWinner', () => {
  const makeScore = (accuracy: number, complexity: number): SchemaCandidateScore => ({
    accuracy, complexity, parseRate: 1, weaknessFeedback: [], n: 10,
  });

  it('picks highest accuracy', () => {
    const lo = makeCandidate('lo', makeSchema(['a']), makeScore(0.5, 1));
    const hi = makeCandidate('hi', makeSchema(['a']), makeScore(0.9, 10));
    expect(pickSchemaWinner([lo, hi]).id).toBe('hi');
  });

  it('ties on accuracy → prefers lower complexity', () => {
    const complex = makeCandidate('cx', makeSchema(['a', 'b']), makeScore(0.8, 10));
    const simple = makeCandidate('sm', makeSchema(['a']), makeScore(0.8, 3));
    expect(pickSchemaWinner([complex, simple]).id).toBe('sm');
  });

  it('throws on empty', () => {
    expect(() => pickSchemaWinner([])).toThrow();
  });
});

// ── Mutation generators ────────────────────────────────────────

describe('generateStructureMutations', () => {
  const rng = () => 0.5;

  it('suggests adding reasoning if absent', () => {
    const s = makeSchema(['answer']);
    const muts = generateStructureMutations(s, 5, rng);
    expect(muts.some(m => m.description.includes('reasoning'))).toBe(true);
  });

  it('does not re-suggest reasoning if already present', () => {
    const s = makeSchema(['reasoning', 'answer']);
    const muts = generateStructureMutations(s, 5, rng);
    const hasReasoning = muts.some(m => m.description.includes('reasoning field'));
    expect(hasReasoning).toBe(false);
  });

  it('suggests drop when schema is large', () => {
    const s = makeSchema(['a', 'b', 'c', 'd', 'e']);
    const muts = generateStructureMutations(s, 5, rng);
    expect(muts.some(m => m.kind === 'remove_field')).toBe(true);
  });

  it('returns at most n mutations', () => {
    const s = makeSchema(['answer']);
    const muts = generateStructureMutations(s, 1, rng);
    expect(muts.length).toBeLessThanOrEqual(1);
  });
});

describe('generateOrderMutations', () => {
  const rng = () => 0.5;

  it('returns empty for 1-field schemas', () => {
    expect(generateOrderMutations(makeSchema(['a']), 3, rng)).toEqual([]);
  });

  it('moves a reasoning field to the front', () => {
    const s: Schema = {
      name: 't', version: 1,
      fields: [makeField('answer'), makeField('reasoning'), makeField('confidence')],
    };
    const muts = generateOrderMutations(s, 3, rng);
    const applied = muts[0].apply(s);
    expect(applied.fields[0].name).toBe('reasoning');
  });

  it('moves a confidence field to the end', () => {
    const s: Schema = {
      name: 't', version: 1,
      fields: [makeField('confidence'), makeField('reasoning'), makeField('answer')],
    };
    const muts = generateOrderMutations(s, 3, rng);
    const last = muts[0].apply(s);
    // One of the generated mutations should put 'confidence' at the end
    const someMovesConfidenceToEnd = muts.some(m => {
      const applied = m.apply(s);
      return applied.fields[applied.fields.length - 1].name === 'confidence';
    });
    expect(someMovesConfidenceToEnd).toBe(true);
  });
});

describe('generateRefinementMutations', () => {
  it('adds maxLength when feedback mentions verbosity', async () => {
    const s = makeSchema(['reasoning', 'answer']);
    const muts = await generateRefinementMutations(
      s, ['too verbose, output wordy'], 5,
    );
    expect(muts.some(m => m.kind === 'add_constraint')).toBe(true);
  });

  it('adds minLength when feedback mentions incompleteness', async () => {
    const s = makeSchema(['answer']);
    const muts = await generateRefinementMutations(
      s, ['response is too brief, missing detail'], 5,
    );
    expect(muts.some(m =>
      m.description.includes('minLength'),
    )).toBe(true);
  });

  it('edits field descriptions when feedback mentions format issues', async () => {
    const s = makeSchema(['answer']);
    const muts = await generateRefinementMutations(
      s, ['wrong format, could not parse'], 5,
    );
    expect(muts.some(m => m.kind === 'edit_field_desc')).toBe(true);
  });

  it('falls back to a single description rewrite when no heuristic matches', async () => {
    const s = makeSchema(['answer']);
    const muts = await generateRefinementMutations(s, ['something unrelated'], 5);
    expect(muts.length).toBeGreaterThan(0);
    expect(muts[0].kind).toBe('edit_field_desc');
  });

  it('uses LLM-provided editor when supplied', async () => {
    const s = makeSchema(['answer']);
    const muts = await generateRefinementMutations(
      s, ['wrong format'], 5,
      async ({ field }) => `LLM-REWRITE of ${field.name}`,
    );
    const edit = muts.find(m => m.kind === 'edit_field_desc');
    const applied = edit!.apply(s);
    expect(applied.fields[0].description).toBe('LLM-REWRITE of answer');
  });
});

// ── pickSample ─────────────────────────────────────────────────

describe('pickSample', () => {
  it('returns up to k items', () => {
    expect(pickSample(makeExamples(5), 3, () => 0.5)).toHaveLength(3);
  });

  it('returns empty on k=0', () => {
    expect(pickSample(makeExamples(5), 0, () => 0.5)).toEqual([]);
  });
});

// ── EvolveSchema.run end-to-end ───────────────────────────────

describe('EvolveSchema.run', () => {
  it('runs through all phases and returns a winner', async () => {
    const baseline = makeSchema(['answer']);
    const result = await new EvolveSchema().run({
      baseline,
      examples: makeExamples(10),
      execute: makeFakeExecutor(),
      judge: makeJudge('prefers-more'),
      populationSize: 3,
      generations: 1,
      evalSize: 5,
      anchorEvalSize: 10,
    });
    expect(result.winner).toBeDefined();
    expect(result.winner.score).not.toBeNull();
    expect(result.history.length).toBeGreaterThan(1);
  });

  it('winner accuracy >= baseline accuracy when judge prefers richer schemas', async () => {
    const baseline = makeSchema(['answer']);
    const result = await new EvolveSchema().run({
      baseline,
      examples: makeExamples(10),
      execute: makeFakeExecutor(),
      judge: makeJudge('prefers-more'),
      populationSize: 3,
      generations: 2,
      evalSize: 5,
      anchorEvalSize: 10,
    });
    expect(result.winner.score!.accuracy).toBeGreaterThanOrEqual(
      result.history[0].score!.accuracy,
    );
  });

  it('emits progress events for each phase', async () => {
    const phases: string[] = [];
    await new EvolveSchema().run({
      baseline: makeSchema(['answer']),
      examples: makeExamples(5),
      execute: makeFakeExecutor(),
      judge: makeJudge(),
      populationSize: 2,
      generations: 1,
      evalSize: 3,
      anchorEvalSize: 3,
      onProgress: (e) => phases.push(e.phase),
    });
    expect(phases).toContain('start');
    expect(phases).toContain('structure');
    expect(phases).toContain('order');
    expect(phases).toContain('refinement');
    expect(phases).toContain('anchor');
    expect(phases).toContain('done');
  });

  it('is deterministic with same seed', async () => {
    const cfg = () => ({
      baseline: makeSchema(['answer']),
      examples: makeExamples(10),
      execute: makeFakeExecutor(),
      judge: makeJudge('prefers-more'),
      populationSize: 3,
      generations: 1,
      evalSize: 5,
      anchorEvalSize: 8,
      seed: 7,
    });
    const a = await new EvolveSchema().run(cfg());
    const b = await new EvolveSchema().run(cfg());
    expect(a.winner.schema.fields.map(f => f.name)).toEqual(
      b.winner.schema.fields.map(f => f.name),
    );
  });

  it('respects abort signal', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const result = await new EvolveSchema().run({
      baseline: makeSchema(['answer']),
      examples: makeExamples(10),
      execute: makeFakeExecutor(),
      judge: makeJudge(),
      populationSize: 2,
      generations: 2,
      evalSize: 3,
      anchorEvalSize: 3,
      signal: ctrl.signal,
    });
    expect(result.winner).toBeDefined();
  });

  it('records all candidates in history with generation numbers', async () => {
    const result = await new EvolveSchema().run({
      baseline: makeSchema(['answer']),
      examples: makeExamples(5),
      execute: makeFakeExecutor(),
      judge: makeJudge(),
      populationSize: 2,
      generations: 2,
      mutationMix: { structure: 2, order: 0, refinement: 0 },
      evalSize: 3,
      anchorEvalSize: 3,
    });
    const gen0 = result.history.filter(c => c.generation === 0);
    const gen1 = result.history.filter(c => c.generation === 1);
    expect(gen0.length).toBe(1);
    expect(gen1.length).toBeGreaterThan(0);
  });
});
