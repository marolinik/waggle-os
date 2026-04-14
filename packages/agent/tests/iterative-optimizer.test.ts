import { describe, it, expect, vi } from 'vitest';
import {
  IterativeGEPA,
  paretoFront,
  scoreCandidate,
  aggregateScores,
  pickWinner,
  pickSample,
  type Candidate,
  type CandidateScore,
  type MutateFn,
} from '../src/iterative-optimizer.js';
import type { EvalExample } from '../src/eval-dataset.js';
import type { JudgeScore } from '../src/judge.js';

// ── Fixtures ───────────────────────────────────────────────────

function makeExamples(n: number): EvalExample[] {
  return Array.from({ length: n }, (_, i) => ({
    input: `question ${i}`,
    expected_output: `answer ${i}`,
    metadata: { source: 'trace' as const },
  }));
}

function makeScore(overall: number, extra: Partial<JudgeScore> = {}): JudgeScore {
  return {
    overall,
    weighted: overall,
    correctness: extra.correctness ?? overall,
    procedureFollowing: extra.procedureFollowing ?? overall,
    conciseness: extra.conciseness ?? overall,
    lengthPenalty: extra.lengthPenalty ?? 1,
    feedback: extra.feedback ?? `feedback for score ${overall}`,
    parsed: true,
  };
}

function makeCandidate(id: string, score: CandidateScore | null): Candidate {
  return {
    id,
    prompt: `prompt-${id}`,
    generation: 0,
    parent: null,
    strategy: 'baseline',
    score,
    perExample: [],
  };
}

function makeCandidateScore(
  overall: number,
  dims: Partial<{ correctness: number; procedureFollowing: number; conciseness: number; lengthPenalty: number; n: number; weaknessFeedback: string[] }> = {},
): CandidateScore {
  return {
    overall,
    correctness: dims.correctness ?? overall,
    procedureFollowing: dims.procedureFollowing ?? overall,
    conciseness: dims.conciseness ?? overall,
    lengthPenalty: dims.lengthPenalty ?? 1,
    n: dims.n ?? 10,
    weaknessFeedback: dims.weaknessFeedback ?? [],
  };
}

// Fake judge that computes a deterministic score based on candidate text length.
// Longer prompts → higher correctness, shorter → higher conciseness.
function makeFakeJudge(bias: 'long' | 'short' | 'uniform' = 'uniform') {
  return {
    async score(args: { input: string; expected: string; actual: string }): Promise<JudgeScore> {
      const len = args.actual.length;
      const corr = bias === 'long' ? Math.min(1, len / 50) : bias === 'short' ? Math.max(0, 1 - len / 100) : 0.5;
      const proc = 0.6;
      const conc = bias === 'short' ? 0.9 : 0.5;
      const overall = 0.5 * corr + 0.3 * proc + 0.2 * conc;
      return {
        overall, weighted: overall,
        correctness: corr,
        procedureFollowing: proc,
        conciseness: conc,
        lengthPenalty: 1,
        feedback: `len=${len}`,
        parsed: true,
      };
    },
  };
}

// ── Pure helpers ───────────────────────────────────────────────

describe('aggregateScores', () => {
  it('handles empty input', () => {
    const agg = aggregateScores([]);
    expect(agg.n).toBe(0);
    expect(agg.overall).toBe(0);
    expect(agg.weaknessFeedback).toEqual([]);
  });

  it('averages component dimensions', () => {
    const agg = aggregateScores([
      makeScore(0.8, { correctness: 0.9, procedureFollowing: 0.7, conciseness: 0.8 }),
      makeScore(0.6, { correctness: 0.7, procedureFollowing: 0.5, conciseness: 0.6 }),
    ]);
    expect(agg.n).toBe(2);
    expect(agg.correctness).toBeCloseTo(0.8, 5);
    expect(agg.procedureFollowing).toBeCloseTo(0.6, 5);
    expect(agg.conciseness).toBeCloseTo(0.7, 5);
    expect(agg.overall).toBeCloseTo(0.7, 5);
  });

  it('surfaces worst-3 feedback lines in weaknessFeedback', () => {
    const agg = aggregateScores([
      makeScore(0.9, { feedback: 'best' }),
      makeScore(0.1, { feedback: 'worst' }),
      makeScore(0.2, { feedback: 'second-worst' }),
      makeScore(0.3, { feedback: 'third-worst' }),
      makeScore(0.8, { feedback: 'good' }),
    ]);
    // Worst 3 should contain 'worst', 'second-worst', 'third-worst' in some order
    expect(agg.weaknessFeedback).toContain('worst');
    expect(agg.weaknessFeedback).toContain('second-worst');
    expect(agg.weaknessFeedback).toContain('third-worst');
    expect(agg.weaknessFeedback).not.toContain('best');
  });

  it('drops empty feedback from weakness list', () => {
    const agg = aggregateScores([
      makeScore(0.1, { feedback: '' }),
      makeScore(0.2, { feedback: 'real feedback' }),
    ]);
    expect(agg.weaknessFeedback).toEqual(['real feedback']);
  });
});

describe('paretoFront', () => {
  it('keeps a single member when only one has a score', () => {
    const a = makeCandidate('a', makeCandidateScore(0.8));
    const b = makeCandidate('b', null);
    expect(paretoFront([a, b])).toHaveLength(1);
  });

  it('removes strictly-dominated candidates', () => {
    const weak = makeCandidate('weak', makeCandidateScore(0.5, {
      correctness: 0.5, procedureFollowing: 0.5, conciseness: 0.5,
    }));
    const strong = makeCandidate('strong', makeCandidateScore(0.8, {
      correctness: 0.8, procedureFollowing: 0.8, conciseness: 0.8,
    }));
    const front = paretoFront([weak, strong]);
    expect(front).toHaveLength(1);
    expect(front[0].id).toBe('strong');
  });

  it('keeps trade-off candidates on the front', () => {
    const accurate = makeCandidate('accurate', makeCandidateScore(0.7, {
      correctness: 0.9, procedureFollowing: 0.6, conciseness: 0.5,
    }));
    const concise = makeCandidate('concise', makeCandidateScore(0.7, {
      correctness: 0.6, procedureFollowing: 0.6, conciseness: 0.9,
    }));
    const front = paretoFront([accurate, concise]);
    expect(front).toHaveLength(2);
  });

  it('returns all candidates when they have identical scores', () => {
    const a = makeCandidate('a', makeCandidateScore(0.5));
    const b = makeCandidate('b', makeCandidateScore(0.5));
    const front = paretoFront([a, b]);
    expect(front).toHaveLength(2);
  });

  it('ignores candidates with null scores entirely', () => {
    const scored = makeCandidate('scored', makeCandidateScore(0.5));
    const unscored = makeCandidate('unscored', null);
    const front = paretoFront([scored, unscored]);
    expect(front).toHaveLength(1);
    expect(front[0].id).toBe('scored');
  });
});

describe('pickWinner', () => {
  it('picks highest overall score', () => {
    const a = makeCandidate('a', makeCandidateScore(0.6));
    const b = makeCandidate('b', makeCandidateScore(0.9));
    expect(pickWinner([a, b]).id).toBe('b');
  });

  it('breaks ties using length penalty (higher = more concise, preferred)', () => {
    const verbose = makeCandidate('verbose', makeCandidateScore(0.7, { lengthPenalty: 0.6 }));
    const concise = makeCandidate('concise', makeCandidateScore(0.7, { lengthPenalty: 0.9 }));
    expect(pickWinner([verbose, concise]).id).toBe('concise');
  });

  it('breaks further ties by earliest generation', () => {
    const early = makeCandidate('early', makeCandidateScore(0.7, { lengthPenalty: 0.8 }));
    const late = makeCandidate('late', makeCandidateScore(0.7, { lengthPenalty: 0.8 }));
    late.generation = 3;
    expect(pickWinner([early, late]).id).toBe('early');
  });

  it('throws on empty input', () => {
    expect(() => pickWinner([])).toThrow();
  });
});

describe('pickSample', () => {
  const rng = () => 0.5;

  it('returns empty on k=0', () => {
    expect(pickSample(makeExamples(10), 0, rng)).toEqual([]);
  });

  it('returns full set (shuffled) when k >= length', () => {
    const sample = pickSample(makeExamples(5), 10, rng);
    expect(sample).toHaveLength(5);
  });

  it('is deterministic with a fixed rng', () => {
    const rngA = (() => { let s = 1; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; })();
    const rngB = (() => { let s = 1; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; })();
    const a = pickSample(makeExamples(20), 5, rngA).map(e => e.input);
    const b = pickSample(makeExamples(20), 5, rngB).map(e => e.input);
    expect(a).toEqual(b);
  });
});

describe('scoreCandidate', () => {
  it('scores candidate against examples and populates the score field', async () => {
    const cand = makeCandidate('c', null);
    const score = await scoreCandidate(cand, makeExamples(3), makeFakeJudge('uniform'));
    expect(score.n).toBe(3);
    expect(cand.score).not.toBeNull();
    expect(cand.perExample).toHaveLength(3);
  });

  it('returns zero-score aggregation when examples list is empty', async () => {
    const cand = makeCandidate('c', null);
    const score = await scoreCandidate(cand, [], makeFakeJudge());
    expect(score.n).toBe(0);
    expect(score.overall).toBe(0);
  });

  it('continues iterating if one score call throws', async () => {
    let callCount = 0;
    const flakyJudge = {
      async score(): Promise<JudgeScore> {
        callCount++;
        if (callCount === 2) throw new Error('transient');
        return makeScore(0.5);
      },
    };
    const cand = makeCandidate('c', null);
    const score = await scoreCandidate(cand, makeExamples(3), flakyJudge);
    expect(score.n).toBe(2); // 2 succeeded, 1 failed
  });

  it('stops early when abort signal fires', async () => {
    const ctrl = new AbortController();
    const judge = makeFakeJudge();
    // Abort before any call
    ctrl.abort();
    const cand = makeCandidate('c', null);
    await scoreCandidate(cand, makeExamples(10), judge, ctrl.signal);
    expect(cand.perExample.length).toBeLessThan(10);
  });

  // ── Concurrency ────────────────────────────────────────────────

  it('accepts an options object (new API) equivalently to AbortSignal (legacy)', async () => {
    const judge = makeFakeJudge('uniform');
    const candA = makeCandidate('a', null);
    const candB = makeCandidate('b', null);

    const ctrl = new AbortController();
    ctrl.abort();

    await scoreCandidate(candA, makeExamples(5), judge, ctrl.signal);
    await scoreCandidate(candB, makeExamples(5), judge, { signal: ctrl.signal });

    expect(candA.perExample.length).toBe(candB.perExample.length);
  });

  it('concurrency=1 produces identical aggregate to no option (sequential baseline)', async () => {
    const examples = makeExamples(6);
    const candSeq = makeCandidate('seq', null);
    const candPar = makeCandidate('par', null);

    const seqScore = await scoreCandidate(candSeq, examples, makeFakeJudge('uniform'));
    const parScore = await scoreCandidate(candPar, examples, makeFakeJudge('uniform'), { concurrency: 1 });

    expect(parScore.overall).toBeCloseTo(seqScore.overall);
    expect(parScore.n).toBe(seqScore.n);
  });

  it('with concurrency > 1, runs scores in parallel (observable via in-flight counter)', async () => {
    let inFlight = 0;
    let peakInFlight = 0;
    const judge = {
      async score(): Promise<JudgeScore> {
        inFlight++;
        peakInFlight = Math.max(peakInFlight, inFlight);
        // Await a microtask + a real delay so parallel workers can accumulate.
        await new Promise(r => setTimeout(r, 5));
        inFlight--;
        return makeScore(0.5);
      },
    };
    const cand = makeCandidate('c', null);
    await scoreCandidate(cand, makeExamples(8), judge, { concurrency: 4 });

    expect(peakInFlight).toBe(4);
    expect(cand.perExample).toHaveLength(8);
  });

  it('with concurrency=1, exactly 1 in-flight call at a time', async () => {
    let inFlight = 0;
    let peakInFlight = 0;
    const judge = {
      async score(): Promise<JudgeScore> {
        inFlight++;
        peakInFlight = Math.max(peakInFlight, inFlight);
        await new Promise(r => setTimeout(r, 3));
        inFlight--;
        return makeScore(0.5);
      },
    };
    const cand = makeCandidate('c', null);
    await scoreCandidate(cand, makeExamples(5), judge, { concurrency: 1 });
    expect(peakInFlight).toBe(1);
  });

  it('concurrency is capped at examples.length (does not start idle workers)', async () => {
    let peakInFlight = 0;
    let inFlight = 0;
    const judge = {
      async score(): Promise<JudgeScore> {
        inFlight++;
        peakInFlight = Math.max(peakInFlight, inFlight);
        await new Promise(r => setTimeout(r, 2));
        inFlight--;
        return makeScore(0.5);
      },
    };
    const cand = makeCandidate('c', null);
    await scoreCandidate(cand, makeExamples(3), judge, { concurrency: 100 });
    expect(peakInFlight).toBeLessThanOrEqual(3);
  });

  it('parallel mode still filters out thrown-error results without corrupting the batch', async () => {
    let call = 0;
    const judge = {
      async score(): Promise<JudgeScore> {
        call++;
        if (call % 3 === 0) throw new Error('flaky');
        return makeScore(0.7);
      },
    };
    const cand = makeCandidate('c', null);
    const score = await scoreCandidate(cand, makeExamples(9), judge, { concurrency: 3 });
    // 9 total, every 3rd throws → 6 succeed.
    expect(score.n).toBe(6);
  });

  it('parallel mode respects abort signal by not dispatching further workers', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const judge = makeFakeJudge();
    const cand = makeCandidate('c', null);
    await scoreCandidate(cand, makeExamples(20), judge, {
      signal: ctrl.signal,
      concurrency: 4,
    });
    expect(cand.perExample.length).toBeLessThan(20);
  });
});

// ── IterativeGEPA end-to-end with concurrency ────────────────────

describe('IterativeGEPA with concurrency', () => {
  it('threads options.concurrency into every scoreCandidate call', async () => {
    let peakInFlight = 0;
    let inFlight = 0;
    const judge = {
      async score(): Promise<JudgeScore> {
        inFlight++;
        peakInFlight = Math.max(peakInFlight, inFlight);
        await new Promise(r => setTimeout(r, 2));
        inFlight--;
        return makeScore(0.5);
      },
    };
    const mutate: MutateFn = async ({ parent, strategy }) => `${parent.prompt} :: ${strategy}`;

    await new IterativeGEPA().run({
      baseline: 'base',
      examples: makeExamples(8),
      judge,
      mutate,
      populationSize: 2,
      generations: 1,
      microScreenSize: 4,
      miniEvalSize: 4,
      anchorEvalSize: 4,
      concurrency: 3,
    });

    expect(peakInFlight).toBe(3);
  });
});

// ── End-to-end run ─────────────────────────────────────────────

describe('IterativeGEPA.run', () => {
  it('runs through all phases and produces a winner', async () => {
    const baseline = 'short baseline prompt';
    const examples = makeExamples(10);
    const judge = makeFakeJudge('uniform');

    // Mutate appends text — simulates generation of children
    const mutate: MutateFn = async ({ parent, strategy }) => {
      return `${parent.prompt} :: ${strategy}`;
    };

    const progress: string[] = [];
    const result = await new IterativeGEPA().run({
      baseline,
      examples,
      judge,
      mutate,
      populationSize: 3,
      generations: 2,
      microScreenSize: 5,
      miniEvalSize: 5,
      anchorEvalSize: 10,
      onProgress: (e) => progress.push(`${e.phase}@g${e.generation}`),
    });

    expect(result.winner).toBeDefined();
    expect(result.winner.score).not.toBeNull();
    expect(result.history.length).toBeGreaterThan(1);
    expect(progress).toContain('start@g0');
    expect(progress.some(p => p.startsWith('anchor'))).toBe(true);
    expect(progress.some(p => p.startsWith('done'))).toBe(true);
  });

  it('winner dominates or matches baseline on overall score', async () => {
    const baseline = 'x'; // very short
    const examples = makeExamples(20);
    // Long-biased judge: longer prompts score higher
    const judge = makeFakeJudge('long');

    // Mutate doubles length each time
    const mutate: MutateFn = async ({ parent }) => `${parent.prompt} ${parent.prompt}more`;

    const result = await new IterativeGEPA().run({
      baseline,
      examples,
      judge,
      mutate,
      populationSize: 3,
      generations: 2,
      microScreenSize: 5,
      miniEvalSize: 5,
      anchorEvalSize: 15,
    });

    // Winner should have evolved (not baseline prompt).
    expect(result.winner.prompt.length).toBeGreaterThan(baseline.length);
    expect(result.improved).toBe(true);
    expect(result.delta).toBeGreaterThan(0);
  });

  it('passes weakness feedback from parent into mutate()', async () => {
    const captured: Array<{ strategy: string; feedbacks: string[] }> = [];
    const mutate: MutateFn = async ({ parent, strategy, weaknessFeedback }) => {
      captured.push({ strategy, feedbacks: weaknessFeedback });
      return `${parent.prompt} mutated`;
    };

    await new IterativeGEPA().run({
      baseline: 'baseline',
      examples: makeExamples(10),
      judge: makeFakeJudge(),
      mutate,
      populationSize: 2,
      generations: 1,
      microScreenSize: 3,
      miniEvalSize: 3,
      anchorEvalSize: 5,
    });

    // 2 mutations were spawned — each received the parent's feedback
    expect(captured.length).toBe(2);
    for (const c of captured) {
      expect(Array.isArray(c.feedbacks)).toBe(true);
      // Feedback array may be empty on first gen if baseline had no weaknesses;
      // we just assert the prop is present and is an array.
    }
  });

  it('recovers when mutate throws (falls back to parent prompt)', async () => {
    let mutations = 0;
    const mutate: MutateFn = async ({ parent }) => {
      mutations++;
      if (mutations === 1) throw new Error('boom');
      return `${parent.prompt} ok`;
    };

    const result = await new IterativeGEPA().run({
      baseline: 'baseline',
      examples: makeExamples(5),
      judge: makeFakeJudge(),
      mutate,
      populationSize: 2,
      generations: 1,
      microScreenSize: 3,
      miniEvalSize: 3,
      anchorEvalSize: 3,
    });

    // Winner must be defined even though one mutation failed
    expect(result.winner).toBeDefined();
    expect(result.winner.score).not.toBeNull();
  });

  it('respects abort signal and exits early without throwing', async () => {
    const ctrl = new AbortController();
    const mutate: MutateFn = vi.fn(async () => 'should never run');

    ctrl.abort(); // abort before starting generations
    const result = await new IterativeGEPA().run({
      baseline: 'baseline',
      examples: makeExamples(5),
      judge: makeFakeJudge(),
      mutate,
      populationSize: 2,
      generations: 2,
      microScreenSize: 2,
      miniEvalSize: 2,
      anchorEvalSize: 2,
      signal: ctrl.signal,
    });

    // With abort before baseline scoring, no winner should evolve
    expect(result.winner).toBeDefined();
    expect(mutate).not.toHaveBeenCalled();
  });

  it('is deterministic with same seed', async () => {
    const examples = makeExamples(20);
    const judge = makeFakeJudge();
    const mutate: MutateFn = async ({ parent, strategy }) => `${parent.prompt}::${strategy}`;

    const run = () => new IterativeGEPA().run({
      baseline: 'seed',
      examples,
      judge,
      mutate,
      populationSize: 3,
      generations: 1,
      microScreenSize: 5,
      miniEvalSize: 5,
      anchorEvalSize: 10,
      seed: 42,
    });

    const r1 = await run();
    const r2 = await run();

    expect(r1.winner.prompt).toBe(r2.winner.prompt);
    expect(r1.history.length).toBe(r2.history.length);
  });

  it('produces history containing baseline and all mutated children', async () => {
    const result = await new IterativeGEPA().run({
      baseline: 'base',
      examples: makeExamples(5),
      judge: makeFakeJudge(),
      mutate: async ({ parent, strategy }) => `${parent.prompt}_${strategy}`,
      populationSize: 3,
      generations: 2,
      microScreenSize: 3,
      miniEvalSize: 3,
      anchorEvalSize: 3,
    });

    expect(result.history[0].id).toBe('g0-baseline');
    expect(result.history[0].strategy).toBe('baseline');
    // 2 generations * 3 mutations + 1 baseline = 7 total
    expect(result.history.length).toBe(7);
  });
});
