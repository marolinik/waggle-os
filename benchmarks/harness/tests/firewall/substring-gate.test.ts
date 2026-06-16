/**
 * Gold-substring gate tests — exact + normalized containment over ALL artifacts.
 * Each leakage vector from 03 (C1 skill bodies, C4 user-turn paraphrase) and
 * memory-toggle-and-rigor-template.md §A.3 is an explicit case.
 */
import { describe, expect, it } from 'vitest';
import {
  assertNoGoldSubstring,
  type Gold,
} from '../../src/firewall/substring-gate.js';
import type { Artifact } from '../../src/firewall/artifact.js';

const cleanArtifacts: Artifact[] = [
  { kind: 'frame', id: 'f1', text: 'Alice: I want to return the blue jacket I bought last week.' },
  { kind: 'skill_body', id: 's1', text: '# process_return(order)\n1. Look up the order by id.\n2. Check the return window.' },
  { kind: 'user_turn', id: 'u1', text: 'Can you help me with a return?' },
];

const golds: Gold[] = [
  { task_id: 'B-07', text: 'The refund total is $342.18' },
  { task_id: 'B-12', text: 'flight UA-915 rebooked to 2026-07-04' },
];

describe('assertNoGoldSubstring — clean case', () => {
  it('passes when no gold appears in any artifact', () => {
    const r = assertNoGoldSubstring(cleanArtifacts, golds);
    expect(r.passed).toBe(true);
    expect(r.hits).toEqual([]);
    expect(r.n_artifacts).toBe(3);
    expect(r.n_golds).toBe(2);
  });
});

describe('assertNoGoldSubstring — exact-match leakage', () => {
  it('flags a frame containing a gold verbatim (vector 2: gold in ingested corpus)', () => {
    const leaky: Artifact[] = [
      ...cleanArtifacts,
      { kind: 'frame', id: 'fbad', text: 'note to self: The refund total is $342.18 for that order.' },
    ];
    const r = assertNoGoldSubstring(leaky, golds);
    expect(r.passed).toBe(false);
    expect(r.hits).toHaveLength(1);
    expect(r.hits[0]).toMatchObject({
      artifact_kind: 'frame',
      artifact_id: 'fbad',
      gold_task_id: 'B-07',
      match_type: 'exact',
    });
  });
});

describe('assertNoGoldSubstring — skill-body leakage (03 C1)', () => {
  it('flags a Phase-A skill body that smuggles a Phase-B gold', () => {
    const leaky: Artifact[] = [
      { kind: 'skill_body', id: 'sbad', text: '# rebook\nFor this customer, flight UA-915 rebooked to 2026-07-04.' },
    ];
    const r = assertNoGoldSubstring(leaky, golds);
    expect(r.passed).toBe(false);
    expect(r.hits[0].artifact_kind).toBe('skill_body');
    expect(r.hits[0].gold_task_id).toBe('B-12');
  });
});

describe('assertNoGoldSubstring — normalized-only leakage (case/spacing/punctuation)', () => {
  it('catches a gold that only matches after normalization', () => {
    // gold "The refund total is $342.18" re-cased + re-punctuated + re-spaced.
    const leaky: Artifact[] = [
      { kind: 'write_back', id: 'wb', text: 'THE  REFUND   TOTAL is 342 18 dollars' },
    ];
    // The gold normalizes to "the refund total is 342 18"; the artifact normalizes
    // to "the refund total is 342 18 dollars" → normalized containment hit.
    const r = assertNoGoldSubstring(leaky, golds);
    expect(r.passed).toBe(false);
    expect(r.hits[0].match_type).toBe('normalized');
    expect(r.hits[0].artifact_kind).toBe('write_back');
  });
});

describe('assertNoGoldSubstring — user-turn paraphrase boundary (03 C4)', () => {
  it('a banked user turn echoing the gold surface form is caught by the normalized gate', () => {
    const leaky: Artifact[] = [
      { kind: 'user_turn', id: 'ubad', text: 'so the refund total IS $342.18, right?' },
    ];
    const r = assertNoGoldSubstring(leaky, golds);
    expect(r.passed).toBe(false);
    expect(r.hits[0].artifact_kind).toBe('user_turn');
    // (Semantic paraphrase that shares no surface tokens is the embedding gate's
    //  job — see embedding-gate.test.ts. The substring gate owns surface forms.)
  });
});

describe('assertNoGoldSubstring — short-gold guard (avoid trivial false positives)', () => {
  it('ignores golds whose normalized form is shorter than the min length', () => {
    const shortGold: Gold[] = [{ task_id: 'B-yes', text: 'Yes' }];
    const arts: Artifact[] = [{ kind: 'frame', id: 'f', text: 'Yes, I can help with that.' }];
    const r = assertNoGoldSubstring(arts, shortGold, { minGoldChars: 8 });
    expect(r.passed).toBe(true);
    expect(r.skipped_short_golds).toContain('B-yes');
  });
});

describe('assertNoGoldSubstring — multiple hits across artifacts and golds', () => {
  it('reports every (artifact, gold) hit, not just the first', () => {
    const leaky: Artifact[] = [
      { kind: 'frame', id: 'f1', text: 'The refund total is $342.18' },
      { kind: 'skill_body', id: 's1', text: 'flight UA-915 rebooked to 2026-07-04' },
    ];
    const r = assertNoGoldSubstring(leaky, golds);
    expect(r.passed).toBe(false);
    expect(r.hits).toHaveLength(2);
  });
});

describe('assertNoGoldSubstring — validation', () => {
  it('rejects a non-array artifacts argument', () => {
    expect(() => assertNoGoldSubstring(null as unknown as Artifact[], golds)).toThrow(/array of artifacts/);
  });
  it('rejects a non-array golds argument', () => {
    expect(() => assertNoGoldSubstring(cleanArtifacts, null as unknown as Gold[])).toThrow(/array of golds/);
  });
  it('rejects a gold missing text', () => {
    const bad = [{ task_id: 'x' }] as unknown as Gold[];
    expect(() => assertNoGoldSubstring(cleanArtifacts, bad)).toThrow(/gold text must be a string/);
  });
});
