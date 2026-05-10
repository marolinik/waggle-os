/**
 * PerplexityAdapter — harvest adapter for Perplexity conversation exports.
 */
import { describe, it, expect } from 'vitest';
import { PerplexityAdapter } from '../../src/harvest/perplexity-adapter.js';

describe('PerplexityAdapter', () => {
  const adapter = new PerplexityAdapter();

  it('has the expected sourceType + displayName', () => {
    expect(adapter.sourceType).toBe('perplexity');
    expect(adapter.displayName).toBe('Perplexity');
  });

  it('parses a { threads: [] } wrapper', () => {
    const input = {
      threads: [
        {
          id: 't1',
          title: 'How does Perplexity work?',
          created_at: '2026-04-01T12:00:00Z',
          messages: [
            { role: 'user', content: 'Explain Perplexity.' },
            { role: 'assistant', content: 'It is an answer engine.', sources: ['https://perplexity.ai/about'] },
          ],
        },
      ],
    };
    const out = adapter.parse(input);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('How does Perplexity work?');
    expect(out[0].source).toBe('perplexity');
    expect(out[0].type).toBe('conversation');
    expect(out[0].messages).toHaveLength(2);
    // Sources get flattened into the assistant text
    expect(out[0].messages![1].text).toContain('Sources:');
    expect(out[0].messages![1].text).toContain('https://perplexity.ai/about');
    expect(out[0].metadata.hasCitations).toBe(true);
    expect(out[0].metadata.threadId).toBe('t1');
  });

  it('parses a bare array of threads', () => {
    const input = [
      { id: 'a', title: 'Alpha', messages: [{ role: 'user', content: 'Q1' }, { role: 'assistant', content: 'A1' }] },
      { id: 'b', title: 'Beta',  messages: [{ role: 'user', content: 'Q2' }, { role: 'assistant', content: 'A2' }] },
    ];
    const out = adapter.parse(input);
    expect(out).toHaveLength(2);
    expect(out.map(i => i.title)).toEqual(['Alpha', 'Beta']);
  });

  it('parses a single-thread root object', () => {
    const input = {
      title: 'Single',
      messages: [
        { role: 'user', content: 'Q' },
        { role: 'assistant', content: 'A' },
      ],
    };
    const out = adapter.parse(input);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('Single');
  });

  it('skips threads with no parseable messages', () => {
    const input = { threads: [{ id: 'x', title: 'Empty', messages: [] }] };
    expect(adapter.parse(input)).toHaveLength(0);
  });

  it('resolves alternate role names (question/answer)', () => {
    const input = {
      threads: [{
        id: 'alt',
        title: 'Alt roles',
        messages: [
          { role: 'question', content: 'Q' },
          { role: 'answer', content: 'A' },
        ],
      }],
    };
    const out = adapter.parse(input);
    expect(out).toHaveLength(1);
    expect(out[0].messages![0].role).toBe('user');
    expect(out[0].messages![1].role).toBe('assistant');
  });

  it('extracts sources from object-shaped citations', () => {
    const input = {
      threads: [{
        id: 'cit',
        title: 'Citation obj',
        messages: [
          { role: 'user', content: 'Q' },
          {
            role: 'assistant',
            content: 'A',
            sources: [
              { url: 'https://example.com/1', title: 'Ex1' },
              { link: 'https://example.com/2' },
              'https://example.com/3',
            ],
          },
        ],
      }],
    };
    const out = adapter.parse(input);
    const text = out[0].messages![1].text;
    expect(text).toContain('https://example.com/1');
    expect(text).toContain('https://example.com/2');
    expect(text).toContain('https://example.com/3');
  });

  it('returns [] for invalid input shapes', () => {
    expect(adapter.parse(null)).toEqual([]);
    expect(adapter.parse('not json')).toEqual([]);
    expect(adapter.parse({ random: 'object' })).toEqual([]);
    expect(adapter.parse(42 as unknown)).toEqual([]);
  });

  it('does not emit hasCitations for threads without sources', () => {
    const input = {
      threads: [{
        id: 'no-cite',
        title: 'Plain',
        messages: [
          { role: 'user', content: 'Q' },
          { role: 'assistant', content: 'A' },
        ],
      }],
    };
    const out = adapter.parse(input);
    expect(out[0].metadata.hasCitations).toBe(false);
    expect(out[0].messages![1].text).toBe('A');
  });
});
