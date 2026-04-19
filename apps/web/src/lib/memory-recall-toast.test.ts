/**
 * M-22 / ENG-1 — memory recall toast trigger + query-building regression.
 */
import { describe, it, expect } from 'vitest';
import {
  MEMORY_RECALL_TRIGGER_AT,
  MEMORY_RECALL_PREVIEW_LIMIT,
  shouldFireMemoryRecall,
  buildRecallQuery,
  previewRecall,
} from './memory-recall-toast';

describe('shouldFireMemoryRecall', () => {
  it('fires exactly at the trigger when not yet fired', () => {
    expect(shouldFireMemoryRecall({ userMessageCount: MEMORY_RECALL_TRIGGER_AT, alreadyFired: false })).toBe(true);
  });

  it('suppresses when already fired', () => {
    expect(shouldFireMemoryRecall({ userMessageCount: MEMORY_RECALL_TRIGGER_AT, alreadyFired: true })).toBe(false);
  });

  it('does not fire below the trigger', () => {
    for (let i = 0; i < MEMORY_RECALL_TRIGGER_AT; i += 1) {
      expect(shouldFireMemoryRecall({ userMessageCount: i, alreadyFired: false })).toBe(false);
    }
  });

  it('does not re-fire past the trigger — miss once, miss forever', () => {
    expect(shouldFireMemoryRecall({ userMessageCount: MEMORY_RECALL_TRIGGER_AT + 1, alreadyFired: false })).toBe(false);
    expect(shouldFireMemoryRecall({ userMessageCount: 50, alreadyFired: false })).toBe(false);
  });

  it('defensive against non-finite counts', () => {
    expect(shouldFireMemoryRecall({ userMessageCount: Number.NaN, alreadyFired: false })).toBe(false);
    expect(shouldFireMemoryRecall({ userMessageCount: Number.POSITIVE_INFINITY, alreadyFired: false })).toBe(false);
  });
});

describe('buildRecallQuery', () => {
  it('returns empty string when there are no user messages', () => {
    expect(buildRecallQuery([])).toBe('');
    expect(buildRecallQuery([{ role: 'assistant', content: 'hi' }])).toBe('');
  });

  it('joins the last 3 user messages in order', () => {
    const messages = [
      { role: 'user', content: 'one' },
      { role: 'assistant', content: 'ack' },
      { role: 'user', content: 'two' },
      { role: 'user', content: 'three' },
      { role: 'user', content: 'four' },
    ];
    expect(buildRecallQuery(messages)).toBe('two three four');
  });

  it('collapses whitespace in each message', () => {
    const messages = [
      { role: 'user', content: 'hello   world\n\twith   noise' },
    ];
    expect(buildRecallQuery(messages)).toBe('hello world with noise');
  });

  it('skips user messages whose content is empty / whitespace', () => {
    const messages = [
      { role: 'user', content: '' },
      { role: 'user', content: '   ' },
      { role: 'user', content: 'real question' },
    ];
    expect(buildRecallQuery(messages)).toBe('real question');
  });

  it('tolerates null / undefined content', () => {
    const messages = [
      { role: 'user', content: null },
      { role: 'user', content: undefined },
      { role: 'user', content: 'ok' },
    ];
    expect(buildRecallQuery(messages)).toBe('ok');
  });

  it('caps very long queries at 500 characters', () => {
    const messages = [{ role: 'user', content: 'x'.repeat(2000) }];
    expect(buildRecallQuery(messages).length).toBe(500);
  });
});

describe('previewRecall', () => {
  it('passes short content through unchanged (except whitespace)', () => {
    expect(previewRecall('hello world')).toBe('hello world');
    expect(previewRecall('  hello   world  ')).toBe('hello world');
  });

  it('truncates at word boundary with an ellipsis', () => {
    const long = 'a b c d e f g h i '.repeat(20); // > preview limit
    const out = previewRecall(long);
    expect(out.length).toBeLessThanOrEqual(MEMORY_RECALL_PREVIEW_LIMIT + 1); // + ellipsis
    expect(out.endsWith('\u2026')).toBe(true);
  });

  it('respects a custom limit', () => {
    const out = previewRecall('some long content here that goes on', 10);
    expect(out.length).toBeLessThanOrEqual(11);
    expect(out.endsWith('\u2026')).toBe(true);
  });
});
