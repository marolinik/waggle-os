import { describe, it, expect } from 'vitest';
import { extractClaimedSpecifics, checkGrounding } from '../src/grounding-check.js';

// The real LOCKED-frame memory the live agent recalled (abridged).
const MEMORY = `Marko Markovic is founder and CEO of Egzakta Group. Working on Waggle OS launch project.
LOCKED DECISIONS:
1. Pricing: Pro at $19/month, Teams at $49/seat/month
2. Public launch gated on beating Mem0's LoCoMo memory benchmark
TEAM:
- Ivan: owns LM TEK and GPU hardware, default rack is eight H200s
- Mihail: owns GAPA+BPMN prompt architecture`;

describe('extractClaimedSpecifics', () => {
  it('extracts money, percent, duration, and stat-noun counts', () => {
    const s = extractClaimedSpecifics('We have $19/month pricing, a 73% gap, 4 months runway, and 227 entities.');
    const kinds = s.map((x) => x.kind).sort();
    expect(kinds).toContain('money');
    expect(kinds).toContain('percent');
    expect(kinds).toContain('duration');
    expect(kinds).toContain('count');
  });

  it('does NOT flag benign advice quantities (non-stat nouns)', () => {
    const s = extractClaimedSpecifics('Ask Ivan 3 questions, pick 2 options, try 5 ways.');
    // "questions"/"options"/"ways" are not stat nouns → no count specifics
    expect(s.filter((x) => x.kind === 'count')).toHaveLength(0);
  });
});

describe('checkGrounding — the live confabulation cases', () => {
  it('flags "4 months runway" as ungrounded (not in memory)', () => {
    const r = checkGrounding('You are pre-revenue with 4 months runway.', MEMORY);
    expect(r.ungrounded.some((s) => s.text.includes('4 month'))).toBe(true);
  });

  it('flags "227 entities" as ungrounded (real count is not in memory)', () => {
    const r = checkGrounding('I have 227 entities tracked.', MEMORY);
    expect(r.ungrounded.some((s) => s.number === '227')).toBe(true);
  });

  it('grounds "$19/month" (it IS in the LOCKED decisions)', () => {
    const r = checkGrounding('Your pricing is Pro at $19/month.', MEMORY);
    expect(r.grounded.some((s) => s.number === '19')).toBe(true);
    expect(r.ungrounded.some((s) => s.number === '19')).toBe(false);
  });

  it('grounds a percentage that appears in sources, flags one that does not', () => {
    expect(checkGrounding('a 73% lift', 'we measured a 73% lift').ungrounded).toHaveLength(0);
    expect(checkGrounding('a 99% lift', MEMORY).ungrounded.some((s) => s.number === '99')).toBe(true);
  });

  it('score is 1 when there are no quantitative specifics', () => {
    const r = checkGrounding('Let me help you think this through.', MEMORY);
    expect(r.specifics).toHaveLength(0);
    expect(r.score).toBe(1);
  });

  it('score reflects grounded ratio on a mixed reply', () => {
    // "$19/month" grounded; "4 months runway" + "227 entities" ungrounded → 1/3
    const r = checkGrounding('Pro at $19/month, 4 months runway, 227 entities.', MEMORY);
    expect(r.specifics.length).toBeGreaterThanOrEqual(3);
    expect(r.score).toBeLessThan(0.5);
    expect(r.ungrounded.length).toBeGreaterThanOrEqual(2);
  });
});
