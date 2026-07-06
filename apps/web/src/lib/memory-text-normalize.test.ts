import { describe, it, expect } from 'vitest';
import {
  normalizeMemoryKey,
  isGroupableKey,
  MIN_NORMALIZED_KEY_CHARS,
  buildMemoryPreview,
  sentenceTruncate,
} from './memory-text-normalize';

describe('normalizeMemoryKey', () => {
  it('collapses two strings that differ only by an embedded audit-run id', () => {
    const a = normalizeMemoryKey('BENCHMARK completed for audit-run-id: 3f9a2b0c on the LoCoMo suite');
    const b = normalizeMemoryKey('BENCHMARK completed for audit-run-id: 71ee4400 on the LoCoMo suite');
    expect(a).toBe(b);
    expect(a).toContain('benchmark completed');
    expect(a).not.toContain('3f9a2b0c');
  });

  it('strips bare "audit-<digits>" ids without requiring the word "run"', () => {
    // Real live-data shape found in wave-4 QA: "audit-1782648502308", not the
    // "audit-run-id: …" form RUN_ID_RE already covers.
    const a = normalizeMemoryKey('Imran uses 2x2 frameworks and wants every decision remembered (audit-1782648502308)');
    const b = normalizeMemoryKey('Imran uses 2x2 frameworks and wants every decision remembered (audit-1782638749061)');
    expect(a).toBe(b);
    expect(a).toContain('imran uses 2x2 frameworks');
  });

  it('does NOT strip ordinary prose containing the word "audit" (e.g. "audit trail")', () => {
    const key = normalizeMemoryKey('This constitutes an audit trail requirement for the compliance review');
    expect(key).toContain('audit trail');
  });

  it('strips the whole "Audit run audit-<id>" phrase, label words included (live wave-5 QA)', () => {
    // The exact live shape: label "Audit run" + a doubled "audit-<digits>" id.
    // Stripping only the id left "audit run" behind -> two dedup keys
    // ("…account" vs "…account audit run") -> the SAME fact showed twice in the
    // login briefing. The label words must go too.
    const withRun = normalizeMemoryKey('Imran uses 2x2 frameworks and wants every client decision remembered by account. Audit run audit-1782648502308.');
    const without = normalizeMemoryKey('Imran uses 2x2 frameworks and wants every client decision remembered by account.');
    expect(withRun).toBe(without);
    expect(withRun).not.toContain('audit');
    expect(withRun).not.toContain('1782648502308');
  });

  it('strips "benchmark run <date>" as a phrase but keeps "audit trail" prose', () => {
    const a = normalizeMemoryKey('Deploy uses a benchmark run 20260704 marker');
    const b = normalizeMemoryKey('Deploy uses a benchmark run 20260812 marker');
    expect(a).toBe(b);
    // ordinary prose containing "audit" (no run/id) is untouched
    expect(normalizeMemoryKey('an audit trail requirement')).toContain('audit trail');
  });

  it('strips a raw epoch-ms "Timestamp: …" label (not just ISO-8601)', () => {
    const a = normalizeMemoryKey('BENCHMARK anchor fact. Timestamp: 1782400441971');
    const b = normalizeMemoryKey('BENCHMARK anchor fact. Timestamp: 1782639999999');
    expect(a).toBe(b);
    expect(a).toContain('benchmark anchor fact');
  });

  it('strips BENCH-SECRET benchmark-harness tokens', () => {
    const a = normalizeMemoryKey('Confidential: BENCH-SECRET-5yu27cwrmsv');
    const b = normalizeMemoryKey('Confidential: BENCH-SECRET-9zz10qexampl');
    expect(a).toBe(b);
    expect(a).toContain('confidential');
  });

  it('strips UUIDs', () => {
    const a = normalizeMemoryKey('Imran prefers dark mode (uuid a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d)');
    const b = normalizeMemoryKey('Imran prefers dark mode (uuid ffffffff-1111-4222-8333-444455556666)');
    expect(a).toBe(b);
    expect(a).toContain('imran prefers dark mode');
  });

  it('strips ISO timestamps', () => {
    const a = normalizeMemoryKey('Session recorded 2026-07-01T12:30:00Z about the launch plan');
    const b = normalizeMemoryKey('Session recorded 2026-07-04T09:00:00Z about the launch plan');
    expect(a).toBe(b);
  });

  it('case-folds and collapses whitespace', () => {
    expect(normalizeMemoryKey('  The   Launch\nPlan  ')).toBe('the launch plan');
  });

  it('returns empty string for nullish input', () => {
    expect(normalizeMemoryKey(null)).toBe('');
    expect(normalizeMemoryKey(undefined)).toBe('');
    expect(normalizeMemoryKey('')).toBe('');
  });

  it('does not merge genuinely different facts (guard via isGroupableKey)', () => {
    const a = normalizeMemoryKey('Ships in Q3');
    const b = normalizeMemoryKey('Ships in Q4');
    expect(a).not.toBe(b);
  });

  it('min-length guard flags short normalized keys as non-groupable', () => {
    expect(isGroupableKey(normalizeMemoryKey('#42'))).toBe(false);
    expect(isGroupableKey(normalizeMemoryKey(''))).toBe(false);
    expect(normalizeMemoryKey('#42').length).toBeLessThan(MIN_NORMALIZED_KEY_CHARS);
    expect(isGroupableKey(normalizeMemoryKey('The Germany GTM launches in Q3'))).toBe(true);
  });

  it('does not mutate or retain state across calls', () => {
    const input = 'audit-run-id: abc123 stable body text here';
    const first = normalizeMemoryKey(input);
    const second = normalizeMemoryKey(input);
    expect(first).toBe(second);
  });
});

describe('buildMemoryPreview (round-7 fix 3 — humanized row titles)', () => {
  it('skips a bare "Timestamp: <digits>" lead line and titles with the first human line', () => {
    const { title, excerpt } = buildMemoryPreview(
      'Timestamp: 1782400441971\nImran prefers dark mode in every editor he uses',
    );
    expect(title).toBe('Imran prefers dark mode in every editor he uses');
    expect(excerpt).toBe('');
  });

  it('de-slugifies a "[Harvest:…] <slug>" lead line into a readable title', () => {
    const { title } = buildMemoryPreview(
      '[Harvest:claude-code] session-handoff-2026-06-24-s2-final\nBody of the harvested note follows here.',
    );
    expect(title).toBe('session handoff 2026 06 24 s2 final');
  });

  it('keeps the remainder as the title when the harvest prefix wraps human text', () => {
    const { title } = buildMemoryPreview('[Harvest:claude] Marko prefers dark mode across all tools');
    expect(title).toBe('Marko prefers dark mode across all tools');
  });

  it('advances past a harvest lead with no usable remainder to the first human line', () => {
    const { title } = buildMemoryPreview(
      '[Harvest:gemini]\n#42\nThe Germany GTM launch plan needs a final review',
    );
    expect(title).toBe('The Germany GTM launch plan needs a final review');
  });

  it('falls back to the raw first line when nothing qualifies (today\'s behavior)', () => {
    const { title } = buildMemoryPreview('Timestamp: 1782400441971');
    expect(title).toBe('Timestamp: 1782400441971');
  });

  it('leaves ordinary content untouched: first line = title, rest = excerpt', () => {
    const { title, excerpt } = buildMemoryPreview('The launch plan\nWe ship Q3. Then we review.');
    expect(title).toBe('The launch plan');
    expect(excerpt).toBe('We ship Q3. Then we review.');
  });

  it('still strips markdown tokens for the display split', () => {
    const { title } = buildMemoryPreview('## Weekly review notes for the team\nbody');
    expect(title).toBe('Weekly review notes for the team');
  });

  it('excludes skipped machine lines from the excerpt', () => {
    const { excerpt } = buildMemoryPreview(
      'Timestamp: 1782400441971\nA human title line for this memory\nAnd the excerpt body.',
    );
    expect(excerpt).toBe('And the excerpt body.');
    expect(excerpt).not.toContain('1782400441971');
  });

  it('handles empty content without throwing', () => {
    expect(buildMemoryPreview('')).toEqual({ title: '', excerpt: '' });
  });
});

describe('sentenceTruncate', () => {
  it('returns short text unchanged', () => {
    expect(sentenceTruncate('Short and sweet.', 220)).toBe('Short and sweet.');
  });

  it('cuts a long excerpt at the last full stop inside the budget', () => {
    const text = 'First sentence here. Second sentence lands inside. Third one runs well past the budget and keeps going.';
    const out = sentenceTruncate(text, 60);
    expect(out).toBe('First sentence here. Second sentence lands inside.');
  });

  it('leaves text without a usable stop for the CSS clamp', () => {
    const text = 'x'.repeat(300);
    expect(sentenceTruncate(text, 220)).toBe(text);
  });
});
