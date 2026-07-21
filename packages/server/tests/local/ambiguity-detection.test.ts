/**
 * Ambiguity Detection Tests (GAP-006)
 *
 * Tests for the isAmbiguousMessage() function that detects short/vague
 * user messages and triggers a clarification prompt before acting.
 *
 * NOTE (Q11:A): Context-awareness is enforced at the CALL SITE in chat.ts,
 * not inside isAmbiguousMessage() itself. The call site skips ambiguity
 * detection for mid-conversation follow-ups (i.e., when prior user messages
 * already exist in the session). These unit tests validate the pure detection
 * logic only — the context gate is integration-level.
 */

import { describe, it, expect } from 'vitest';
import { isAmbiguousMessage } from '../../src/local/routes/chat.js';
import {
  AMBIGUITY_PROMPT,
  USER_RESPONSE_FORMAT_PRECEDENCE,
  buildTemplateWelcomePrompt,
} from '../../src/local/routes/chat-helpers.js';

describe('isAmbiguousMessage', () => {
  // ── Should be AMBIGUOUS (true) ──────────────────────────────────────

  it('returns true for "make it better" (short, no verb, no question)', () => {
    expect(isAmbiguousMessage('make it better')).toBe(true);
  });

  it('returns true for "ok" (very short, no intent signal)', () => {
    expect(isAmbiguousMessage('ok')).toBe(true);
  });

  it('returns true for "do it" (short, generic)', () => {
    expect(isAmbiguousMessage('do it')).toBe(true);
  });

  it('returns true for "yes" (confirmation, still ambiguous for agent)', () => {
    expect(isAmbiguousMessage('yes')).toBe(true);
  });

  it('returns true for "sounds good" (vague acknowledgement)', () => {
    expect(isAmbiguousMessage('sounds good')).toBe(true);
  });

  it('returns true for "go ahead" (no clear action)', () => {
    expect(isAmbiguousMessage('go ahead')).toBe(true);
  });

  it('returns true for empty string', () => {
    expect(isAmbiguousMessage('')).toBe(true);
  });

  it('returns true for whitespace-only string', () => {
    expect(isAmbiguousMessage('   ')).toBe(true);
  });

  it('returns true for "thanks" (not actionable)', () => {
    expect(isAmbiguousMessage('thanks')).toBe(true);
  });

  // ── Should NOT be ambiguous (false) ─────────────────────────────────

  it('returns false for messages with file path pattern (auth.ts)', () => {
    expect(isAmbiguousMessage('fix the bug in auth.ts')).toBe(false);
  });

  it('returns false for messages starting with action verb "search"', () => {
    expect(isAmbiguousMessage('search for AI trends')).toBe(false);
  });

  it('returns false for messages starting with action verb "find"', () => {
    expect(isAmbiguousMessage('find recent emails')).toBe(false);
  });

  it('returns false for messages starting with action verb "create"', () => {
    expect(isAmbiguousMessage('create a new task')).toBe(false);
  });

  it('returns false for messages starting with action verb "help"', () => {
    expect(isAmbiguousMessage('help me with this')).toBe(false);
  });

  it('returns false for messages starting with action verb "analyze"', () => {
    expect(isAmbiguousMessage('analyze the report')).toBe(false);
  });

  it('returns false for slash commands', () => {
    expect(isAmbiguousMessage('/research quantum computing')).toBe(false);
  });

  it('returns false for messages with question marks', () => {
    expect(isAmbiguousMessage('What should I focus on?')).toBe(false);
  });

  it('returns false for long messages (>= 10 words)', () => {
    expect(isAmbiguousMessage('Write a competitive analysis of Tesla vs BYD for the European market')).toBe(false);
  });

  it('returns false for messages with URLs (http)', () => {
    expect(isAmbiguousMessage('check https://example.com')).toBe(false);
  });

  it('returns false for messages with URLs (www)', () => {
    expect(isAmbiguousMessage('look at www.example.com')).toBe(false);
  });

  it('returns false for messages with forward slash paths', () => {
    expect(isAmbiguousMessage('read src/index.ts')).toBe(false);
  });

  it('returns false for messages with backslash paths', () => {
    expect(isAmbiguousMessage('check C:\\Users\\file')).toBe(false);
  });

  it('returns false for "draft a memo" (starts with action verb)', () => {
    expect(isAmbiguousMessage('draft a memo')).toBe(false);
  });

  it('returns false for "delete old backups" (starts with action verb)', () => {
    expect(isAmbiguousMessage('delete old backups')).toBe(false);
  });

  it('returns false for "run the tests" (starts with action verb)', () => {
    expect(isAmbiguousMessage('run the tests')).toBe(false);
  });

  it('returns false for "generate a report" (starts with action verb)', () => {
    expect(isAmbiguousMessage('generate a report')).toBe(false);
  });

  it('returns false for "plan the sprint" (starts with action verb)', () => {
    expect(isAmbiguousMessage('plan the sprint')).toBe(false);
  });

  // ── Edge cases ──────────────────────────────────────────────────────

  it('returns false for exactly 10 words without signals', () => {
    expect(isAmbiguousMessage('one two three four five six seven eight nine ten')).toBe(false);
  });

  it('returns true for 9 words without any intent signals', () => {
    expect(isAmbiguousMessage('one two three four five six seven eight nine')).toBe(true);
  });

  it('returns false for short message with file extension mid-text', () => {
    expect(isAmbiguousMessage('update config.json please')).toBe(false);
  });

  it('handles "review my code" correctly (starts with action verb)', () => {
    expect(isAmbiguousMessage('review my code')).toBe(false);
  });

  it('handles "write tests" correctly (starts with action verb)', () => {
    expect(isAmbiguousMessage('write tests')).toBe(false);
  });
});

describe('first-turn response-format precedence', () => {
  it('keeps ambiguous format requests classified while making their format authoritative', () => {
    expect(isAmbiguousMessage('Return JSON only.')).toBe(true);
    expect(AMBIGUITY_PROMPT).toContain(USER_RESPONSE_FORMAT_PRECEDENCE);
    expect(AMBIGUITY_PROMPT).toContain('express any essential clarification only within');
    expect(AMBIGUITY_PROMPT).toContain('format-valid, truthful failure or refusal');
    expect(AMBIGUITY_PROMPT).toContain('Otherwise, ask ONE specific clarifying question');
    expect(AMBIGUITY_PROMPT).toContain('verdicts, fixed values, or claims are not presentation constraints');
    expect(AMBIGUITY_PROMPT).toContain('never override safety, evidence, attribution');
  });

  it('makes template greetings default-only while preserving starter context', () => {
    const prompt = buildTemplateWelcomePrompt({
      name: 'Sales Pipeline',
      description: 'Track leads and draft outreach.',
      starterMemory: ['Qualify new leads before outreach.'],
    });

    expect(prompt).toContain(USER_RESPONSE_FORMAT_PRECEDENCE);
    expect(prompt).toContain('When no response format is specified, greet the user');
    expect(prompt).toContain('When one is specified, omit the greeting');
    expect(prompt).toContain('Starter context:\n- Qualify new leads before outreach.');
  });
});
