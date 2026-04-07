import { describe, it, expect, vi } from 'vitest';
import {
  estimateTokens,
  needsCompression,
  pruneToolResults,
  splitProtectedRegions,
  summarizeMiddle,
  compressConversation,
  createDefaultCompressionConfig,
  type CompressibleMessage,
  type CompressionConfig,
} from '../src/context-compressor.js';

// ── Helpers ──────────────────────────────────────────────────────────────

function msg(role: string, content: string): CompressibleMessage {
  return { role, content };
}

function makeHistory(count: number, contentSize = 100): CompressibleMessage[] {
  const messages: CompressibleMessage[] = [msg('system', 'You are a helpful assistant.')];
  for (let i = 0; i < count; i++) {
    const role = i % 2 === 0 ? 'user' : 'assistant';
    messages.push(msg(role, 'x'.repeat(contentSize)));
  }
  return messages;
}

function mockFetch(responseContent: string, ok = true): typeof globalThis.fetch {
  return vi.fn().mockResolvedValue({
    ok,
    json: async () => ({
      choices: [{ message: { content: responseContent } }],
    }),
  }) as unknown as typeof globalThis.fetch;
}

function testConfig(overrides: Partial<CompressionConfig> = {}): CompressionConfig {
  return createDefaultCompressionConfig({
    budgetModel: 'test-model',
    litellmUrl: 'http://localhost:4000',
    litellmApiKey: 'test-key',
    ...overrides,
  });
}

// ── Step 1: Token Estimation ─────────────────────────────────────────────

describe('estimateTokens', () => {
  it('returns 0 for empty array', () => {
    expect(estimateTokens([])).toBe(0);
  });

  it('estimates tokens based on content length', () => {
    const messages = [msg('user', 'a'.repeat(400))];
    const tokens = estimateTokens(messages);
    // (16 overhead + 400 chars) / 4 = 104
    expect(tokens).toBe(104);
  });

  it('accounts for message overhead', () => {
    const single = estimateTokens([msg('user', 'hello')]);
    const double = estimateTokens([msg('user', 'hello'), msg('assistant', 'hi')]);
    // Second message adds its own overhead + content
    expect(double).toBeGreaterThan(single);
  });

  it('handles null content gracefully', () => {
    const messages = [{ role: 'assistant', content: '' }];
    expect(estimateTokens(messages)).toBe(4); // just overhead
  });
});

// ── Step 1b: Needs Compression ───────────────────────────────────────────

describe('needsCompression', () => {
  it('returns false for small conversations', () => {
    const messages = [msg('system', 'prompt'), msg('user', 'hello')];
    expect(needsCompression(messages, { maxContextTokens: 128000, compressionThreshold: 0.5 })).toBe(false);
  });

  it('returns true when tokens exceed threshold', () => {
    // Create messages totaling > 50% of 1000 tokens = > 500 tokens = > 2000 chars
    const messages = makeHistory(30, 200);
    expect(needsCompression(messages, { maxContextTokens: 1000, compressionThreshold: 0.5 })).toBe(true);
  });

  it('respects custom threshold', () => {
    const messages = makeHistory(10, 100);
    const tokens = estimateTokens(messages);
    // With a low threshold this should trigger
    expect(needsCompression(messages, { maxContextTokens: tokens + 10, compressionThreshold: 0.1 })).toBe(true);
    // With a high threshold it should not
    expect(needsCompression(messages, { maxContextTokens: tokens * 10, compressionThreshold: 0.9 })).toBe(false);
  });
});

// ── Step 2: Prune Tool Results ───────────────────────────────────────────

describe('pruneToolResults', () => {
  it('replaces tool-role messages outside tail', () => {
    const messages = [
      msg('user', 'search something'),
      msg('tool', '{"results": [{"title": "Result 1", "url": "..."}]}'),
      msg('assistant', 'Here is what I found'),
      msg('user', 'thanks'),
    ];
    const pruned = pruneToolResults(messages, 2);
    // First two messages are outside the protected tail (last 2)
    expect(pruned[1].content).toBe('[Cleared: tool result]');
    // Tail messages are untouched
    expect(pruned[2].content).toBe('Here is what I found');
    expect(pruned[3].content).toBe('thanks');
  });

  it('preserves tool messages in protected tail', () => {
    const messages = [
      msg('user', 'do something'),
      msg('tool', 'old result'),
      msg('user', 'do another thing'),
      msg('tool', 'recent result'),
    ];
    const pruned = pruneToolResults(messages, 2);
    expect(pruned[1].content).toBe('[Cleared: tool result]');
    expect(pruned[3].content).toBe('recent result'); // in tail, preserved
  });

  it('truncates large assistant messages with code blocks', () => {
    const bigContent = '```\n' + 'x'.repeat(3000) + '\n```';
    const messages = [
      msg('assistant', bigContent),
      msg('user', 'ok'),
    ];
    const pruned = pruneToolResults(messages, 1);
    expect(pruned[0].content).toContain('[Cleared:');
    expect(pruned[0].content.length).toBeLessThan(bigContent.length);
  });

  it('leaves small assistant messages alone', () => {
    const messages = [
      msg('assistant', 'Short response'),
      msg('user', 'ok'),
    ];
    const pruned = pruneToolResults(messages, 1);
    expect(pruned[0].content).toBe('Short response');
  });

  it('returns new objects (immutability)', () => {
    const messages = [msg('user', 'hello')];
    const pruned = pruneToolResults(messages, 1);
    expect(pruned[0]).not.toBe(messages[0]);
    expect(pruned[0].content).toBe('hello');
  });
});

// ── Step 3: Split Protected Regions ──────────────────────────────────────

describe('splitProtectedRegions', () => {
  it('protects head messages', () => {
    const messages = makeHistory(20, 50);
    const regions = splitProtectedRegions(messages, {
      protectedHeadMessages: 3,
      protectedTailTokens: 500,
    });
    // Head: system prompt (index 0) + 3 messages = 4 total
    expect(regions.head.length).toBe(4);
    expect(regions.head[0].role).toBe('system');
  });

  it('protects tail messages based on token budget', () => {
    // Each message is ~29 tokens ((16 + 100) / 4)
    const messages = makeHistory(20, 100);
    const regions = splitProtectedRegions(messages, {
      protectedHeadMessages: 2,
      protectedTailTokens: 200, // ~7 messages worth
    });
    expect(regions.tail.length).toBeGreaterThanOrEqual(5);
    expect(regions.tail.length).toBeLessThanOrEqual(10);
  });

  it('middle contains everything between head and tail', () => {
    const messages = makeHistory(20, 50);
    const regions = splitProtectedRegions(messages, {
      protectedHeadMessages: 2,
      protectedTailTokens: 200,
    });
    const total = regions.head.length + regions.middle.length + regions.tail.length;
    expect(total).toBe(messages.length);
  });

  it('handles small conversations where head+tail overlap', () => {
    const messages = [msg('system', 'prompt'), msg('user', 'hi'), msg('assistant', 'hello')];
    const regions = splitProtectedRegions(messages, {
      protectedHeadMessages: 3,
      protectedTailTokens: 50000,
    });
    // Everything is in head, middle is empty
    expect(regions.head.length).toBe(3);
    expect(regions.middle.length).toBe(0);
    expect(regions.tail.length).toBe(0);
  });
});

// ── Step 4: Summarize Middle ─────────────────────────────────────────────

describe('summarizeMiddle', () => {
  it('returns summary from LLM response', async () => {
    const middle = [msg('user', 'Tell me about X'), msg('assistant', 'X is...')];
    const fetchMock = mockFetch('## Summary\nThe user asked about X.');

    const summary = await summarizeMiddle(middle, {
      budgetModel: 'test',
      litellmUrl: 'http://localhost:4000',
      litellmApiKey: 'key',
      fetch: fetchMock,
    });

    expect(summary).toContain('Summary');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('includes previous summary in system message', async () => {
    const middle = [msg('user', 'more work')];
    const fetchMock = mockFetch('Updated summary');

    await summarizeMiddle(middle, {
      budgetModel: 'test',
      litellmUrl: 'http://localhost:4000',
      litellmApiKey: 'key',
      fetch: fetchMock,
    }, 'Previous context here');

    const callBody = JSON.parse((fetchMock as any).mock.calls[0][1].body);
    const systemMsg = callBody.messages[0];
    expect(systemMsg.role).toBe('system');
    expect(systemMsg.content).toContain('Previous context here');
  });

  it('falls back gracefully on fetch failure', async () => {
    const middle = [msg('user', 'Tell me about Y'), msg('assistant', 'Y is a topic')];
    const fetchMock = mockFetch('', false);

    const summary = await summarizeMiddle(middle, {
      budgetModel: 'test',
      litellmUrl: 'http://localhost:4000',
      litellmApiKey: 'key',
      fetch: fetchMock,
    });

    expect(summary).toContain('Compressed Region');
    expect(summary).toContain('2 messages');
  });

  it('returns previous summary when middle is empty', async () => {
    const summary = await summarizeMiddle([], {
      budgetModel: 'test',
      litellmUrl: 'http://localhost:4000',
      litellmApiKey: 'key',
    }, 'Existing summary');

    expect(summary).toBe('Existing summary');
  });

  it('returns empty string when no middle and no previous', async () => {
    const summary = await summarizeMiddle([], {
      budgetModel: 'test',
      litellmUrl: 'http://localhost:4000',
      litellmApiKey: 'key',
    });
    expect(summary).toBe('');
  });
});

// ── Step 5: Full Pipeline ────────────────────────────────────────────────

describe('compressConversation', () => {
  it('skips compression when under threshold', async () => {
    const messages = [msg('system', 'prompt'), msg('user', 'hi')];
    const config = testConfig({ maxContextTokens: 128000 });

    const result = await compressConversation(messages, config);

    expect(result.compressed).toBe(false);
    expect(result.summaryGenerated).toBe(false);
    expect(result.messages.length).toBe(2);
  });

  it('compresses when over threshold', async () => {
    // Create a large conversation that exceeds 50% of a small window
    const messages = makeHistory(40, 200);
    const config = testConfig({
      maxContextTokens: 2000,
      compressionThreshold: 0.3,
      protectedHeadMessages: 2,
      protectedTailTokens: 300,
      fetch: mockFetch('## Summary\nWork was done on multiple topics.'),
    });

    const result = await compressConversation(messages, config);

    expect(result.compressed).toBe(true);
    expect(result.summaryGenerated).toBe(true);
    expect(result.compressedTokens).toBeLessThan(result.originalTokens);
    expect(result.summary).toContain('Summary');
    // Should have head + summary message + tail
    expect(result.messages.length).toBeLessThan(messages.length);
  });

  it('preserves head and tail messages', async () => {
    const messages = makeHistory(30, 200);
    messages[0] = msg('system', 'SYSTEM_PROMPT_MARKER');
    messages[1] = msg('user', 'FIRST_USER_MESSAGE');

    const config = testConfig({
      maxContextTokens: 1000,
      compressionThreshold: 0.1,
      protectedHeadMessages: 2,
      protectedTailTokens: 500,
      fetch: mockFetch('Summarized.'),
    });

    const result = await compressConversation(messages, config);

    expect(result.compressed).toBe(true);
    // Head messages preserved
    expect(result.messages[0].content).toBe('SYSTEM_PROMPT_MARKER');
    expect(result.messages[1].content).toBe('FIRST_USER_MESSAGE');
    // Last message preserved (tail)
    const lastOriginal = messages[messages.length - 1];
    const lastCompressed = result.messages[result.messages.length - 1];
    expect(lastCompressed.content).toBe(lastOriginal.content);
  });

  it('includes summary message in compressed output', async () => {
    const messages = makeHistory(30, 200);
    const config = testConfig({
      maxContextTokens: 1000,
      compressionThreshold: 0.1,
      protectedHeadMessages: 2,
      protectedTailTokens: 200,
      fetch: mockFetch('The conversation covered topics A, B, C.'),
    });

    const result = await compressConversation(messages, config);

    const summaryMsg = result.messages.find(m => m.content.includes('Conversation compressed'));
    expect(summaryMsg).toBeDefined();
    expect(summaryMsg!.role).toBe('system');
    expect(summaryMsg!.content).toContain('topics A, B, C');
  });

  it('passes previous summary for iterative compression', async () => {
    const messages = makeHistory(30, 200);
    const fetchMock = mockFetch('Updated summary with old + new context.');
    const config = testConfig({
      maxContextTokens: 1000,
      compressionThreshold: 0.1,
      protectedHeadMessages: 2,
      protectedTailTokens: 200,
      fetch: fetchMock,
    });

    const result = await compressConversation(messages, config, 'Old summary from last compression');

    expect(result.summary).toContain('Updated summary');
    // Verify the previous summary was sent to the LLM
    const callBody = JSON.parse((fetchMock as any).mock.calls[0][1].body);
    const hasOldSummary = callBody.messages.some(
      (m: { content: string }) => m.content.includes('Old summary from last compression')
    );
    expect(hasOldSummary).toBe(true);
  });

  it('handles fetch failure gracefully', async () => {
    const messages = makeHistory(30, 200);
    const config = testConfig({
      maxContextTokens: 1000,
      compressionThreshold: 0.1,
      protectedHeadMessages: 2,
      protectedTailTokens: 200,
      fetch: mockFetch('', false),
    });

    const result = await compressConversation(messages, config);

    // Should still compress, just with fallback summary
    expect(result.compressed).toBe(true);
    expect(result.summary).toContain('Compressed Region');
  });

  it('skips summarization when middle is tiny', async () => {
    // Only 5 messages: system + 2 head + 2 tail = middle is empty
    const messages = makeHistory(4, 200);
    const config = testConfig({
      maxContextTokens: 100,
      compressionThreshold: 0.1,
      protectedHeadMessages: 2,
      protectedTailTokens: 50000, // large enough to cover everything
    });

    const result = await compressConversation(messages, config);
    expect(result.summaryGenerated).toBe(false);
  });
});

// ── Config Factory ───────────────────────────────────────────────────────

describe('createDefaultCompressionConfig', () => {
  it('applies sensible defaults', () => {
    const config = createDefaultCompressionConfig({
      budgetModel: 'qwen/qwen3.6-plus:free',
      litellmUrl: 'http://localhost:4000',
      litellmApiKey: 'key',
    });

    expect(config.maxContextTokens).toBe(128000);
    expect(config.compressionThreshold).toBe(0.5);
    expect(config.protectedHeadMessages).toBe(3);
    expect(config.protectedTailTokens).toBe(20000);
  });

  it('allows overrides', () => {
    const config = createDefaultCompressionConfig({
      budgetModel: 'test',
      litellmUrl: 'http://localhost:4000',
      litellmApiKey: 'key',
      maxContextTokens: 200000,
      compressionThreshold: 0.6,
    });

    expect(config.maxContextTokens).toBe(200000);
    expect(config.compressionThreshold).toBe(0.6);
  });
});
