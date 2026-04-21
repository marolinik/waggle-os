/**
 * Sprint 11 Task B2 — Tie-break policy unit tests.
 *
 * Authority: decisions/2026-04-22-tie-break-policy-locked.md (LOCKED)
 *
 * The four core scenarios from the brief §3 B2 + LOCK §0:
 *
 *   1. 3-0 consensus          → path=none, no fourth-vendor call.
 *   2. 2-1 majority           → path=majority, no fourth-vendor call.
 *   3. 1-1-1 split resolves   → path=quadri-vendor, plurality verdict,
 *                                fourth-vendor called once with correct payload.
 *   4. 1-1-1 stays unresolved → path=pm-escalation (1-1-1-1 four-way),
 *                                fourth-vendor called once; verdict is the
 *                                PM_ESCALATION_VERDICT sentinel.
 *
 * Tests use a mocked CallFourthVendor function and an in-memory logger —
 * no network, no API spend. The LIVE grok-4.20 smoke lives in the B2 exit
 * ping's companion script and runs independently.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  resolveTieBreak,
  DEFAULT_FOURTH_VENDOR,
  PM_ESCALATION_VERDICT,
  type Vote,
  type TieBreakLogger,
  type CallFourthVendor,
} from '../../src/benchmarks/judge/ensemble-tiebreak.js';

function vote(verdict: 'correct' | 'incorrect', failure_mode: 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | null, model: string): Vote {
  return {
    verdict,
    failure_mode,
    rationale: `rationale from ${model}`,
    judge_model: model,
  };
}

function makeLogger(): { logger: TieBreakLogger; events: Array<{ event: string; fields: Record<string, unknown> }> } {
  const events: Array<{ event: string; fields: Record<string, unknown> }> = [];
  const logger: TieBreakLogger = {
    info: (event, fields) => {
      events.push({ event, fields });
    },
    warn: (event, fields) => {
      events.push({ event, fields });
    },
  };
  return { logger, events };
}

describe('Sprint 11 B2 — resolveTieBreak', () => {
  it('3-0 consensus returns path=none and does not call the fourth vendor', async () => {
    const votes: Vote[] = [
      vote('correct', null, 'claude-opus-4-7'),
      vote('correct', null, 'gpt-5.4-pro'),
      vote('correct', null, 'gemini-3.1-pro'),
    ];
    const callFourthVendor = vi.fn<CallFourthVendor>();
    const { logger, events } = makeLogger();

    const result = await resolveTieBreak(votes, { callFourthVendor, logger });

    expect(result.path).toBe('none');
    expect(result.verdict).toBe('correct|NA');
    expect(result.votes).toHaveLength(3);
    expect(result.fourthVendorVote).toBeUndefined();
    expect(result.fourthVendorSlug).toBeUndefined();
    expect(callFourthVendor).not.toHaveBeenCalled();
    expect(events).toContainEqual(
      expect.objectContaining({ event: 'tie_break', fields: expect.objectContaining({ path: 'none' }) }),
    );
  });

  it('2-1 majority returns path=majority and does not call the fourth vendor', async () => {
    const votes: Vote[] = [
      vote('correct', null, 'claude-opus-4-7'),
      vote('correct', null, 'gpt-5.4-pro'),
      vote('incorrect', 'F3', 'gemini-3.1-pro'),
    ];
    const callFourthVendor = vi.fn<CallFourthVendor>();
    const { logger, events } = makeLogger();

    const result = await resolveTieBreak(votes, { callFourthVendor, logger });

    expect(result.path).toBe('majority');
    expect(result.verdict).toBe('correct|NA');
    expect(result.votes).toHaveLength(3);
    expect(callFourthVendor).not.toHaveBeenCalled();
    expect(events).toContainEqual(
      expect.objectContaining({ event: 'tie_break', fields: expect.objectContaining({ path: 'majority' }) }),
    );
  });

  it('1-1-1 split triggers quadri-vendor call on xai/grok-4.20 and resolves via plurality', async () => {
    const primaryVotes: Vote[] = [
      vote('correct', null, 'claude-opus-4-7'),        // bucket A: correct|NA
      vote('incorrect', 'F3', 'gpt-5.4-pro'),          // bucket B: incorrect|F3
      vote('incorrect', 'F4', 'gemini-3.1-pro'),       // bucket C: incorrect|F4
    ];
    const grokVote = vote('correct', null, 'xai/grok-4.20'); // joins bucket A → plurality
    const callFourthVendor = vi.fn<CallFourthVendor>().mockResolvedValue(grokVote);
    const { logger, events } = makeLogger();

    const result = await resolveTieBreak(primaryVotes, { callFourthVendor, logger });

    expect(result.path).toBe('quadri-vendor');
    expect(result.verdict).toBe('correct|NA');
    expect(result.votes).toHaveLength(4);
    expect(result.fourthVendorVote).toEqual(grokVote);
    expect(result.fourthVendorSlug).toBe(DEFAULT_FOURTH_VENDOR);

    // Exactly one fourth-vendor call with the correct payload.
    expect(callFourthVendor).toHaveBeenCalledTimes(1);
    expect(callFourthVendor).toHaveBeenCalledWith({
      primaryVotes,
      model: 'xai/grok-4.20',
    });

    // pino-shaped events: invoke + resolved.
    const invokeEvent = events.find(e => e.event === 'tie_break.quadri-vendor.invoke');
    const resolvedEvent = events.find(e => e.event === 'tie_break.quadri-vendor.resolved');
    expect(invokeEvent).toBeDefined();
    expect(invokeEvent!.fields).toMatchObject({
      path: 'quadri-vendor',
      fourth_vendor_slug: 'xai/grok-4.20',
    });
    expect(resolvedEvent).toBeDefined();
    expect(resolvedEvent!.fields).toMatchObject({
      path: 'quadri-vendor',
      fourth_vendor_slug: 'xai/grok-4.20',
      verdict: 'correct|NA',
    });
  });

  it('1-1-1 split where the fourth vote is a fourth distinct bucket escalates to PM', async () => {
    const primaryVotes: Vote[] = [
      vote('correct', null, 'claude-opus-4-7'),        // A
      vote('incorrect', 'F2', 'gpt-5.4-pro'),          // B
      vote('incorrect', 'F3', 'gemini-3.1-pro'),       // C
    ];
    // Fourth vote takes a fourth distinct failure mode → 1-1-1-1.
    const grokVote = vote('incorrect', 'F4', 'xai/grok-4.20');
    const callFourthVendor = vi.fn<CallFourthVendor>().mockResolvedValue(grokVote);
    const { logger, events } = makeLogger();

    const result = await resolveTieBreak(primaryVotes, { callFourthVendor, logger });

    expect(result.path).toBe('pm-escalation');
    expect(result.verdict).toBe(PM_ESCALATION_VERDICT);
    expect(result.votes).toHaveLength(4);
    expect(result.fourthVendorVote).toEqual(grokVote);
    expect(result.fourthVendorSlug).toBe(DEFAULT_FOURTH_VENDOR);

    expect(callFourthVendor).toHaveBeenCalledTimes(1);

    // Logger emits a pm-escalation path event on the 4-vote recursive call.
    const escalationEvent = events.find(e =>
      e.event === 'tie_break' && e.fields.path === 'pm-escalation',
    );
    expect(escalationEvent).toBeDefined();
    expect(escalationEvent!.fields).toMatchObject({
      path: 'pm-escalation',
      verdict: PM_ESCALATION_VERDICT,
    });
  });
});

describe('Sprint 11 B2 — resolveTieBreak defensive invariants', () => {
  it('throws on invalid vote length (2 votes)', async () => {
    const votes: Vote[] = [
      vote('correct', null, 'a'),
      vote('correct', null, 'b'),
    ];
    await expect(resolveTieBreak(votes)).rejects.toThrow(/must be 3 .* or 4/);
  });

  it('throws on invalid vote length (5 votes)', async () => {
    const votes: Vote[] = [
      vote('correct', null, 'a'),
      vote('correct', null, 'b'),
      vote('correct', null, 'c'),
      vote('correct', null, 'd'),
      vote('correct', null, 'e'),
    ];
    await expect(resolveTieBreak(votes)).rejects.toThrow(/must be 3 .* or 4/);
  });

  it('1-1-1 without a callFourthVendor dep throws explicitly', async () => {
    const votes: Vote[] = [
      vote('correct', null, 'a'),
      vote('incorrect', 'F3', 'b'),
      vote('incorrect', 'F4', 'c'),
    ];
    await expect(resolveTieBreak(votes)).rejects.toThrow(/requires a callFourthVendor/);
  });

  it('caller-provided 4-vote vector resolves to plurality without extra calls', async () => {
    // Test the caller-driven 4-vote shape — harness may pre-construct this.
    const votes: Vote[] = [
      vote('correct', null, 'claude-opus-4-7'),
      vote('correct', null, 'gpt-5.4-pro'),
      vote('incorrect', 'F3', 'gemini-3.1-pro'),
      vote('incorrect', 'F4', 'xai/grok-4.20'),
    ];
    const callFourthVendor = vi.fn<CallFourthVendor>();
    const { logger, events } = makeLogger();

    const result = await resolveTieBreak(votes, { callFourthVendor, logger });

    expect(result.path).toBe('majority');
    expect(result.verdict).toBe('correct|NA');
    expect(callFourthVendor).not.toHaveBeenCalled();
    expect(events.some(e => e.fields.path === 'majority')).toBe(true);
  });

  it('caller-provided 2-2 tie on 4 votes escalates (defensive, never silent coin-flip)', async () => {
    const votes: Vote[] = [
      vote('correct', null, 'a'),
      vote('correct', null, 'b'),
      vote('incorrect', 'F3', 'c'),
      vote('incorrect', 'F3', 'd'),
    ];
    const { logger, events } = makeLogger();

    const result = await resolveTieBreak(votes, { logger });

    expect(result.path).toBe('pm-escalation');
    expect(result.verdict).toBe(PM_ESCALATION_VERDICT);
    expect(events.some(e => e.event === 'tie_break.two-two-tie')).toBe(true);
  });

  it('fourthVendorModel override is respected', async () => {
    const votes: Vote[] = [
      vote('correct', null, 'a'),
      vote('incorrect', 'F3', 'b'),
      vote('incorrect', 'F4', 'c'),
    ];
    const callFourthVendor = vi.fn<CallFourthVendor>().mockResolvedValue(
      vote('correct', null, 'custom-slug/vendor-x'),
    );

    const result = await resolveTieBreak(votes, {
      callFourthVendor,
      fourthVendorModel: 'custom-slug/vendor-x',
    });

    expect(result.fourthVendorSlug).toBe('custom-slug/vendor-x');
    expect(callFourthVendor).toHaveBeenCalledWith({
      primaryVotes: votes,
      model: 'custom-slug/vendor-x',
    });
  });
});
