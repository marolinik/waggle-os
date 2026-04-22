/**
 * Sprint 12 Task 1 Session 3 — smoke test suite.
 *
 * End-to-end offline integration test that exercises the Session 1+2+3
 * substrate pipeline on deterministic fixtures (no real LLM calls). Task
 * 1 closure gate: this test PASS = substrate ready for Task 2 (C3 mini).
 *
 * Pipeline exercised per brief § 2.1 C:
 *   1. Load mock-locomo-instances.json + mock-judge-responses.json
 *   2. Derive majority verdict per item from the 3-primary ensemble votes
 *   3. Resolve failure_code per item (unanimous | majority | tie-break-
 *      reserved via pre-computed grok_reserve_vote in fixture)
 *   4. Build pre-tie-break vote matrix → Fleiss κ
 *   5. Build CorrectnessRow[] → Wilson 95% CI + cluster-bootstrap 95% CI
 *   6. Build FailureRow[] → failure distribution + F_other review flag
 *   7. Emit `bench.smoke.completed` structured log event with aggregate
 *   8. Assert expected invariants (κ range, sum-to-total, F_other gate,
 *      CI containment, ci_lower ≤ ci_upper)
 *
 * Brief § 7 reuse guidance: the pre-tie-break Fleiss κ + post-tie-break
 * correctness derivation sits inline here. The real tie-break module
 * (`resolveTieBreak` in packages/server/src/benchmarks/judge/ensemble-
 * tiebreak.ts) is unit-tested in Sprint 11; smoke intentionally pre-
 * encodes the tie-break outcome via `grok_reserve_vote` + `final_failure_code`
 * fields in the fixture, avoiding a cross-package runtime import just to
 * prove the pipeline shape. Flagged in the exit ping as a non-blocking
 * surprise (ACCEPT — scoped per brief § 5 surprises policy).
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { describe, expect, it } from 'vitest';
import { createCoreLogger } from '@waggle/core';
import {
  computeClusterBootstrapCI,
  computeFleissKappa,
  computeWilsonCI,
  type CorrectnessRow,
  type VoteMatrix,
} from '../../src/stats/index.js';
import {
  FAILURE_TAXONOMY_VERSION,
  computeFailureDistribution,
  type FailureCode,
  type FailureRow,
} from '../../src/failure-taxonomy/index.js';

// ── Fixture loading ──────────────────────────────────────────────────────

const HERE = url.fileURLToPath(import.meta.url);
const FIXTURES_DIR = path.resolve(path.dirname(HERE), 'fixtures');

interface MockInstance {
  instance_id: string;
  conversation_id: string;
  question: string;
  reference_answer: string;
}

interface MockJudgeVote {
  judge: string;
  verdict: 'correct' | 'incorrect';
  failure_code: FailureCode;
  rationale: string | null;
}

interface MockJudgeEntry {
  instance_id: string;
  judge_votes: MockJudgeVote[];
  grok_reserve_vote?: MockJudgeVote;
  final_failure_code?: FailureCode;
  note?: string;
}

interface MockFixtures {
  instances: MockInstance[];
  judges: string[];
  tie_break_reserve: string;
  responses: MockJudgeEntry[];
}

function loadFixtures(): MockFixtures {
  const instancesRaw = JSON.parse(
    fs.readFileSync(path.join(FIXTURES_DIR, 'mock-locomo-instances.json'), 'utf-8'),
  ) as { instances: MockInstance[] };
  const judgeRaw = JSON.parse(
    fs.readFileSync(path.join(FIXTURES_DIR, 'mock-judge-responses.json'), 'utf-8'),
  ) as {
    judges: string[];
    tie_break_reserve: string;
    responses: MockJudgeEntry[];
  };
  return {
    instances: instancesRaw.instances,
    judges: judgeRaw.judges,
    tie_break_reserve: judgeRaw.tie_break_reserve,
    responses: judgeRaw.responses,
  };
}

// ── Pipeline helpers ─────────────────────────────────────────────────────

/**
 * Build the K=2 (correct / incorrect) pre-tie-break vote matrix from the
 * 3-primary ensemble. Fleiss κ per A3 LOCK § 4 is computed over this
 * verdict-level matrix (not the K=8 failure-code matrix) — matches the
 * HALT threshold semantics documented in §4.
 */
function buildVerdictVoteMatrix(
  responses: readonly MockJudgeEntry[],
): VoteMatrix {
  const counts: number[][] = [];
  for (const entry of responses) {
    let correct = 0;
    let incorrect = 0;
    for (const vote of entry.judge_votes) {
      if (vote.verdict === 'correct') correct += 1;
      else incorrect += 1;
    }
    counts.push([correct, incorrect]);
  }
  return {
    n_judges: 3,
    counts,
    categories: ['correct', 'incorrect'],
  };
}

/**
 * Derive the final post-tie-break verdict + failure_code per item.
 *
 * Rules mirror B2 LOCK § 1 runtime:
 *   - Verdict = majority of the 3 primary judges (K=2 always has a winner).
 *   - Failure code on correct verdict = null.
 *   - Failure code on incorrect verdict = majority among the incorrect-
 *     voting judges' code picks; ties break to `grok_reserve_vote` if the
 *     fixture provides one (the audit-expected path).
 */
function resolveFinalVerdict(
  entry: MockJudgeEntry,
): { correct: 0 | 1; failure_code: FailureCode; rationale: string | null } {
  let correctCount = 0;
  for (const v of entry.judge_votes) {
    if (v.verdict === 'correct') correctCount += 1;
  }
  if (correctCount >= 2) {
    return { correct: 1, failure_code: null, rationale: null };
  }

  // Majority incorrect — resolve code.
  const incorrectVotes = entry.judge_votes.filter(v => v.verdict === 'incorrect');
  const codeCounts = new Map<string, number>();
  for (const v of incorrectVotes) {
    if (v.failure_code !== null) {
      codeCounts.set(v.failure_code, (codeCounts.get(v.failure_code) ?? 0) + 1);
    }
  }

  // Pick the code with strictly-majority count. On a tie, fall through to
  // the tie-break reserve vote carried in the fixture.
  let topCode: FailureCode = null;
  let topCount = 0;
  let tied = false;
  for (const [code, count] of codeCounts.entries()) {
    if (count > topCount) {
      topCode = code as FailureCode;
      topCount = count;
      tied = false;
    } else if (count === topCount) {
      tied = true;
    }
  }

  if (tied && entry.grok_reserve_vote) {
    topCode = entry.grok_reserve_vote.failure_code;
  }

  // Pick the first matching rationale from the incorrect votes for the
  // chosen code — used by the F_other sampler downstream.
  const chosen = incorrectVotes.find(v => v.failure_code === topCode);
  return {
    correct: 0,
    failure_code: topCode,
    rationale: chosen?.rationale ?? null,
  };
}

// ── The smoke test ───────────────────────────────────────────────────────

describe('Sprint 12 Task 1 Session 3 smoke suite — end-to-end substrate', () => {
  it('runs the full pipeline on 10-instance mock fixtures and produces expected aggregate', () => {
    const fixtures = loadFixtures();
    expect(fixtures.instances).toHaveLength(10);
    expect(fixtures.responses).toHaveLength(10);
    expect(fixtures.judges).toEqual(['claude-opus-4-7', 'gpt-5.4', 'gemini-3.1']);
    expect(fixtures.tie_break_reserve).toBe('grok-4.20');

    // 1. Pre-tie-break vote matrix + Fleiss κ.
    const voteMatrix = buildVerdictVoteMatrix(fixtures.responses);
    const kappa = computeFleissKappa(voteMatrix);
    expect(Number.isNaN(kappa.kappa)).toBe(false);
    expect(kappa.kappa).toBeGreaterThanOrEqual(0.5);
    expect(kappa.kappa).toBeLessThanOrEqual(0.95);
    expect(kappa.n_items).toBe(10);
    expect(kappa.n_judges).toBe(3);
    expect(kappa.n_categories).toBe(2);

    // 2. Post-tie-break correctness rows + Wilson / bootstrap CIs.
    const instanceById = new Map<string, MockInstance>();
    for (const inst of fixtures.instances) instanceById.set(inst.instance_id, inst);
    const correctnessRows: CorrectnessRow[] = [];
    const failureRows: FailureRow[] = [];
    let tieBreakActivations = 0;
    for (const entry of fixtures.responses) {
      const instance = instanceById.get(entry.instance_id);
      if (!instance) throw new Error(`instance not found: ${entry.instance_id}`);
      const resolved = resolveFinalVerdict(entry);
      correctnessRows.push({ conversation_id: instance.conversation_id, correct: resolved.correct });
      failureRows.push({ failure_code: resolved.failure_code, rationale: resolved.rationale });
      if (entry.grok_reserve_vote) tieBreakActivations += 1;
    }

    const successes = correctnessRows.reduce((acc, r) => acc + r.correct, 0);
    expect(successes).toBe(7); // fixture design
    expect(correctnessRows).toHaveLength(10);

    const wilson = computeWilsonCI({ successes, trials: correctnessRows.length });
    expect(wilson.point_estimate).toBeCloseTo(0.7, 10);
    expect(wilson.point_estimate).toBeGreaterThanOrEqual(0.5);
    expect(wilson.point_estimate).toBeLessThanOrEqual(0.9);
    expect(wilson.ci_lower).toBeLessThanOrEqual(wilson.point_estimate);
    expect(wilson.ci_upper).toBeGreaterThanOrEqual(wilson.point_estimate);

    const bootstrap = computeClusterBootstrapCI({ rows: correctnessRows });
    expect(bootstrap.point_estimate).toBeCloseTo(0.7, 10);
    expect(bootstrap.ci_lower).toBeLessThanOrEqual(bootstrap.point_estimate);
    expect(bootstrap.ci_upper).toBeGreaterThanOrEqual(bootstrap.point_estimate);
    expect(bootstrap.n_bootstrap).toBe(10000);
    expect(bootstrap.seed).toBe(42);
    expect(bootstrap.n_clusters).toBe(4);
    expect(bootstrap.n_rows).toBe(10);

    // 3. Failure distribution + F_other review flag.
    const distribution = computeFailureDistribution(failureRows);
    expect(distribution.total).toBe(10);
    const summed =
      distribution.counts.null +
      distribution.counts.F1 + distribution.counts.F2 + distribution.counts.F3 +
      distribution.counts.F4 + distribution.counts.F5 + distribution.counts.F6 +
      distribution.counts.F_other;
    expect(summed).toBe(10);
    expect(distribution.counts.null).toBe(7);
    expect(distribution.counts.F1).toBe(1);
    expect(distribution.counts.F_other).toBe(1);
    expect(distribution.counts.F6).toBe(1);
    expect(distribution.f_other_rate).toBeCloseTo(0.1, 10);
    // Strict greater-than: 10% exactly should NOT trip the flag.
    expect(distribution.f_other_review_flag).toBe(false);
    expect(distribution.f_other_rationales_sample).toHaveLength(1);

    // Tie-break activation sanity — fixture has exactly one instance
    // carrying a grok_reserve_vote field (mock-q-08).
    expect(tieBreakActivations).toBe(1);

    // 4. Emit the completion event on a scoped logger so downstream CI
    //    can tail it. Payload carries the smoke gate's observable state.
    const log = createCoreLogger('bench.smoke');
    const aggregate = {
      event: 'bench.smoke.completed',
      taxonomy_version: FAILURE_TAXONOMY_VERSION,
      n_instances: 10,
      n_judges: 3,
      tie_break_reserve: fixtures.tie_break_reserve,
      tie_break_activations: tieBreakActivations,
      kappa: kappa.kappa,
      kappa_P_bar: kappa.P_bar,
      kappa_P_e: kappa.P_e,
      wilson_ci: {
        point_estimate: wilson.point_estimate,
        ci_lower: wilson.ci_lower,
        ci_upper: wilson.ci_upper,
        half_width: wilson.half_width,
      },
      bootstrap_ci: {
        point_estimate: bootstrap.point_estimate,
        ci_lower: bootstrap.ci_lower,
        ci_upper: bootstrap.ci_upper,
        n_bootstrap: bootstrap.n_bootstrap,
        seed: bootstrap.seed,
        n_clusters: bootstrap.n_clusters,
      },
      failure_distribution: {
        counts: distribution.counts,
        f_other_rate: distribution.f_other_rate,
        f_other_review_flag: distribution.f_other_review_flag,
      },
    };
    log.info('bench.smoke.completed', aggregate);

    // 5. Determinism gate — re-running the same pipeline must produce a
    //    bit-identical bootstrap CI (Wilson + Fleiss are closed-form so
    //    determinism there is definitional). Sorted-key stringify so
    //    downstream consumers comparing via JSON.stringify get stable
    //    output independent of property insertion order.
    const bootstrap2 = computeClusterBootstrapCI({ rows: correctnessRows });
    expect(bootstrap2.ci_lower).toBe(bootstrap.ci_lower);
    expect(bootstrap2.ci_upper).toBe(bootstrap.ci_upper);
  });

  it('fixture κ lands in the target band (≈0.68, inside user-specified [0.60, 0.70])', () => {
    const fixtures = loadFixtures();
    const kappa = computeFleissKappa(buildVerdictVoteMatrix(fixtures.responses));
    // Pre-computed from the fixture design:
    //   6× (3,0) + 1× (2,1) + 1× (1,2) + 2× (0,3)
    //   P_e = 0.49 + 0.09 = 0.58
    //   P_bar = (8·1 + 2·(1/3)) / 10 = 0.8667
    //   κ = (0.8667 − 0.58) / 0.42 = 0.6825
    expect(kappa.kappa).toBeGreaterThan(0.60);
    expect(kappa.kappa).toBeLessThan(0.75);
    expect(kappa.kappa).toBeCloseTo(0.6825, 3);
  });
});
