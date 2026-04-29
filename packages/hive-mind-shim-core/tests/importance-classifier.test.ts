import { describe, expect, it } from 'vitest';
import {
  classifyImportance,
  classifyWithRules,
  DEFAULT_RULES,
} from '../src/importance-classifier.js';

describe('classifyImportance — default rules', () => {
  it('"always" pattern is critical', () => {
    expect(classifyImportance('always run lint before commit')).toBe('critical');
  });

  it('"never" pattern is critical', () => {
    expect(classifyImportance('never commit secrets')).toBe('critical');
  });

  it('MEMORY.md reference is critical', () => {
    expect(classifyImportance('see MEMORY.md for the full list')).toBe('critical');
  });

  it('CLAUDE.md reference is critical', () => {
    expect(classifyImportance('this rule is documented in CLAUDE.md')).toBe('critical');
  });

  it('"do not use X" prohibition is critical', () => {
    expect(classifyImportance('do not use the legacy adapter')).toBe('critical');
    expect(classifyImportance("don't run that command")).toBe('critical');
  });

  it('decision verbs land at important', () => {
    expect(classifyImportance('we decided to use Postgres')).toBe('important');
    expect(classifyImportance('chose Option A over B')).toBe('important');
  });

  it('action verbs land at important', () => {
    expect(classifyImportance('implement the auth middleware')).toBe('important');
    expect(classifyImportance('refactor the bridge module')).toBe('important');
  });

  it('failure signals land at important', () => {
    expect(classifyImportance('the build failed on Windows')).toBe('important');
  });

  it('TODO / FIXME markers land at important', () => {
    expect(classifyImportance('TODO: wire up retry')).toBe('important');
    expect(classifyImportance('FIXME parameter is wrong')).toBe('important');
  });

  it('plain chatter floors at "normal" (Commit 1.4 — was "temporary")', () => {
    expect(classifyImportance('hi there')).toBe('normal');
    expect(classifyImportance('thanks')).toBe('normal');
  });

  it('empty / whitespace-only input is still temporary (early return short-circuits floor)', () => {
    expect(classifyImportance('')).toBe('temporary');
    expect(classifyImportance('   \n\t')).toBe('temporary');
  });

  it('session-start / session-end events floor at important', () => {
    expect(classifyImportance('hi', { eventType: 'session-start' })).toBe('important');
    expect(classifyImportance('thanks', { eventType: 'session-end' })).toBe('important');
  });

  it('critical patterns still beat the session-start floor', () => {
    expect(classifyImportance('always test before push', { eventType: 'session-start' })).toBe('critical');
  });
});

describe('classifyWithRules', () => {
  it('returns fallback when content is empty', () => {
    expect(classifyWithRules('', DEFAULT_RULES, 'temporary')).toBe('temporary');
    expect(classifyWithRules('', DEFAULT_RULES, 'normal')).toBe('normal');
  });

  it('uses custom rule set (default fallback is "normal" in Commit 1.4)', () => {
    const rules = [{ pattern: /xyzzy/i, importance: 'critical' as const, reason: 'magic word' }];
    expect(classifyWithRules('the password is xyzzy', rules)).toBe('critical');
    expect(classifyWithRules('the password is hunter2', rules)).toBe('normal');
    // Explicit fallback override still works:
    expect(classifyWithRules('the password is hunter2', rules, 'temporary')).toBe('temporary');
  });

  it('higher importance wins when multiple rules match', () => {
    const rules = [
      { pattern: /always/i, importance: 'critical' as const, reason: 'directive' },
      { pattern: /implement/i, importance: 'important' as const, reason: 'verb' },
    ];
    expect(classifyWithRules('always implement tests first', rules)).toBe('critical');
  });
});
