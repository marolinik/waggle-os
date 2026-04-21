/**
 * Sprint 11 Task B2 — Tie-break policy for multi-vendor judge ensemble.
 *
 * Authority:
 *   - PM-Waggle-OS/briefs/2026-04-22-cc-sprint-11-kickoff.md §3 Track B B2
 *   - PM-Waggle-OS/decisions/2026-04-22-tie-break-policy-locked.md (LOCKED)
 *
 * Context — what this resolves:
 *
 * The Sprint 10 Task 2.2 ratified primary judge ensemble is a THREE-vendor
 * panel (Anthropic Opus 4.7 + OpenAI GPT-5.4 + Google Gemini 3.1-Pro). Three
 * votes means three possible distributions:
 *
 *   - 3-0 consensus   → trivial, no tie-break
 *   - 2-1 majority    → majority wins, no tie-break
 *   - 1-1-1 split     → three different verdicts, no primary majority
 *
 * On 1-1-1, we escalate to a FOURTH vendor from a lineage disjoint from the
 * primary trio: xai/grok-4.20 per Marko's 2026-04-22 LOCK. After the 4th
 * vote arrives we have four votes total:
 *
 *   - 2-1-1 / 1-1-2  → plurality winner (2 votes)
 *   - 1-1-1-1        → four-way split → PM escalation
 *
 * The fourth vendor is SPECIFICALLY xai/grok-4.20 — not Sonnet 4.6 (which
 * would give Anthropic 2-of-4 weight → homogeneous-bias risk — rejected per
 * LOCK doc §2) and not Opus 4.7 (already Judge 1).
 *
 * Observability: pino structured log emits `tie_break.path` ∈ { 'none',
 * 'majority', 'quadri-vendor', 'pm-escalation' } plus
 * `tie_break.fourth_vendor_slug` on quadri paths (field is future-proof
 * even though Sprint 11 scope is grok-4.20 only).
 */

import type { JudgeResult } from './failure-mode-judge.js';

// ── Public types ───────────────────────────────────────────────────────────

/**
 * A single judge vote. Reusing JudgeResult from failure-mode-judge.ts keeps
 * the tie-break input shape aligned with what judgeEnsemble already produces.
 */
export type Vote = JudgeResult;

export type TieBreakPath = 'none' | 'majority' | 'quadri-vendor' | 'pm-escalation';

/**
 * The canonical sentinel verdict returned on a 1-1-1-1 four-way split.
 * Callers (aggregators, report generators) MUST treat this as an operator
 * action signal, not as a normal verdict string. The shape is intentionally
 * unambiguous so no accidental inclusion into recall/accuracy math.
 */
export const PM_ESCALATION_VERDICT = '__PM_ESCALATION__';

/** Default fourth vendor for Sprint 11 — per LOCK doc §1. */
export const DEFAULT_FOURTH_VENDOR = 'xai/grok-4.20';

export interface TieBreakResult {
  /**
   * The resolved verdict string. Encoded as `<verdict>|<failure_mode_or_NA>`
   * matching the aggregation key used in computeMajority of failure-mode-judge.ts,
   * so downstream consumers can uniformly decompose.
   * On pm-escalation path: `__PM_ESCALATION__`.
   */
  verdict: string;
  path: TieBreakPath;
  /** The full vote list after resolution — 3 votes for none/majority, 4 for quadri/pm-escalation. */
  votes: Vote[];
  /** The fourth vendor's vote when a quadri path was taken. Undefined on none/majority. */
  fourthVendorVote?: Vote;
  /** The fourth-vendor slug that was used, for observability. Undefined on none/majority. */
  fourthVendorSlug?: string;
}

export interface FourthVendorCallPayload {
  /** The three primary votes that produced the 1-1-1 split. */
  primaryVotes: Vote[];
  /** Model slug to invoke — e.g. 'xai/grok-4.20'. */
  model: string;
}

export type CallFourthVendor = (payload: FourthVendorCallPayload) => Promise<Vote>;

export interface TieBreakLogger {
  info(event: string, fields: Record<string, unknown>): void;
  warn?(event: string, fields: Record<string, unknown>): void;
}

export interface ResolveTieBreakOptions {
  /**
   * Invoked only on 1-1-1 splits. Required when primaryVotes.length === 3
   * and the distribution is 1-1-1; optional otherwise. Tests mock this.
   */
  callFourthVendor?: CallFourthVendor;
  /** Override the fourth vendor slug. Defaults to `DEFAULT_FOURTH_VENDOR`. */
  fourthVendorModel?: string;
  /** Structured logger. Silently no-ops when omitted. */
  logger?: TieBreakLogger;
}

// ── Internal helpers ───────────────────────────────────────────────────────

/**
 * Canonical key for a vote — combines verdict + failure_mode so identical
 * answers with different failure codes don't accidentally tie.
 */
function voteKey(v: Vote): string {
  return `${v.verdict}|${v.failure_mode ?? 'NA'}`;
}

function countByKey(votes: Vote[]): Map<string, { count: number; first: Vote }> {
  const tally = new Map<string, { count: number; first: Vote }>();
  for (const v of votes) {
    const key = voteKey(v);
    const existing = tally.get(key);
    if (existing) existing.count += 1;
    else tally.set(key, { count: 1, first: v });
  }
  return tally;
}

function pluralityTop(tally: Map<string, { count: number; first: Vote }>): {
  topCount: number;
  topKeys: string[];
} {
  let topCount = 0;
  for (const { count } of tally.values()) if (count > topCount) topCount = count;
  const topKeys: string[] = [];
  for (const [key, { count }] of tally) if (count === topCount) topKeys.push(key);
  return { topCount, topKeys };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Resolve a multi-vendor judge ensemble vote.
 *
 * Input shape:
 *   - 3 primary votes (Sprint 10 Task 2.2 trio) — the normal call path.
 *   - 4 votes also accepted, in which case the function treats the vector
 *     as already-quadri-resolved and returns the plurality winner (or
 *     pm-escalation on 1-1-1-1). This shape exists for tests and for
 *     caller-side recomposition.
 *
 * On 1-1-1 with 3 primary votes, `callFourthVendor` MUST be provided.
 * The function invokes it with the three primary votes and the canonical
 * model slug, then recurses with the four-vote list.
 *
 * Returns:
 *   - `{ path: 'none' }` for 3-0 consensus (3 primary votes).
 *   - `{ path: 'majority' }` for 2-1 majority (3 votes) OR for a plurality
 *     win on 4 votes when the caller supplied the vector directly.
 *   - `{ path: 'quadri-vendor' }` when we called the 4th vendor ourselves
 *     and got a 2-1-1 or 1-1-2 distribution.
 *   - `{ path: 'pm-escalation' }` on a 1-1-1-1 four-way split; verdict is
 *     the `PM_ESCALATION_VERDICT` sentinel.
 */
export async function resolveTieBreak(
  votes: Vote[],
  options: ResolveTieBreakOptions = {},
): Promise<TieBreakResult> {
  if (votes.length !== 3 && votes.length !== 4) {
    throw new Error(
      `resolveTieBreak: votes.length must be 3 (primary ensemble) or 4 (post-quadri). Got ${votes.length}.`,
    );
  }

  const logger = options.logger;

  if (votes.length === 3) {
    const tally = countByKey(votes);
    const { topCount, topKeys } = pluralityTop(tally);

    // 3-0 consensus — one bucket holds all three.
    if (topCount === 3) {
      const entry = tally.get(topKeys[0])!;
      logger?.info('tie_break', { path: 'none' as TieBreakPath, verdict: topKeys[0] });
      return {
        verdict: topKeys[0],
        path: 'none',
        votes,
      };
    }

    // 2-1 majority — one bucket holds two, another holds one.
    if (topCount === 2 && topKeys.length === 1) {
      logger?.info('tie_break', { path: 'majority' as TieBreakPath, verdict: topKeys[0] });
      return {
        verdict: topKeys[0],
        path: 'majority',
        votes,
      };
    }

    // 1-1-1 split — three buckets of one each. Escalate to fourth vendor.
    if (topCount === 1 && topKeys.length === 3) {
      if (!options.callFourthVendor) {
        throw new Error(
          'resolveTieBreak: 1-1-1 three-way split requires a callFourthVendor implementation.',
        );
      }
      const fourthVendorModel = options.fourthVendorModel ?? DEFAULT_FOURTH_VENDOR;

      logger?.info('tie_break.quadri-vendor.invoke', {
        path: 'quadri-vendor' as TieBreakPath,
        fourth_vendor_slug: fourthVendorModel,
        primary_keys: topKeys,
      });

      const fourthVote = await options.callFourthVendor({
        primaryVotes: votes,
        model: fourthVendorModel,
      });

      // Recurse with four votes. The 4-vote branch returns quadri-vendor or pm-escalation.
      const resolved = await resolveTieBreak([...votes, fourthVote], options);

      // Re-tag the path so "quadri-vendor" sticks on success cases and
      // "pm-escalation" stays on 1-1-1-1 after escalation.
      const path: TieBreakPath =
        resolved.path === 'pm-escalation' ? 'pm-escalation' : 'quadri-vendor';

      logger?.info('tie_break.quadri-vendor.resolved', {
        path,
        fourth_vendor_slug: fourthVendorModel,
        verdict: resolved.verdict,
      });

      return {
        verdict: resolved.verdict,
        path,
        votes: resolved.votes,
        fourthVendorVote: fourthVote,
        fourthVendorSlug: fourthVendorModel,
      };
    }

    // Should be unreachable under correct input (any 3-vote distribution is
    // 3-0, 2-1, or 1-1-1), but stay defensive.
    throw new Error(
      `resolveTieBreak: unexpected 3-vote distribution — topCount=${topCount} topKeys=${topKeys.length}`,
    );
  }

  // votes.length === 4 — post-quadri-vendor resolution path.
  const tally = countByKey(votes);
  const { topCount, topKeys } = pluralityTop(tally);

  // 1-1-1-1 four-way split — every bucket is one. PM escalation.
  if (topCount === 1) {
    logger?.info('tie_break', {
      path: 'pm-escalation' as TieBreakPath,
      verdict: PM_ESCALATION_VERDICT,
      four_way_keys: topKeys,
    });
    return {
      verdict: PM_ESCALATION_VERDICT,
      path: 'pm-escalation',
      votes,
    };
  }

  // Plurality winner: 2-1-1 / 1-1-2 (unique top). 2-2 ties with 4 votes are
  // structurally impossible from our flow (3 primary votes make 2-2
  // impossible after the +1 fourth vote; the fourth vote always creates a
  // unique plurality or a 1-1-1-1). Still handle 2-2 defensively by
  // promoting to pm-escalation so no silent coin-flip ever lands in prod.
  if (topCount === 2 && topKeys.length === 1) {
    logger?.info('tie_break', {
      path: 'majority' as TieBreakPath,
      verdict: topKeys[0],
      vote_count: 4,
    });
    return {
      verdict: topKeys[0],
      path: 'majority',
      votes,
    };
  }

  if (topCount === 2 && topKeys.length >= 2) {
    // 2-2 tie on 4 votes — not reachable from 1-1-1→quadri flow, but a
    // caller may pass in a pre-constructed 4-vote vector. Escalate rather
    // than coin-flip.
    logger?.warn?.('tie_break.two-two-tie', {
      path: 'pm-escalation' as TieBreakPath,
      verdict: PM_ESCALATION_VERDICT,
      two_two_keys: topKeys,
    });
    return {
      verdict: PM_ESCALATION_VERDICT,
      path: 'pm-escalation',
      votes,
    };
  }

  if (topCount === 3 || topCount === 4) {
    logger?.info('tie_break', {
      path: 'majority' as TieBreakPath,
      verdict: topKeys[0],
      vote_count: 4,
    });
    return {
      verdict: topKeys[0],
      path: 'majority',
      votes,
    };
  }

  // Truly unreachable given 4 input votes; defensive.
  throw new Error(
    `resolveTieBreak: unexpected 4-vote distribution — topCount=${topCount} topKeys=${topKeys.length}`,
  );
}
