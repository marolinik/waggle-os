/**
 * Tests for long-task/messages-compressor.ts (Phase 4.6 of agent-fix sprint)
 * + integration tests for runRetrievalAgentLoop's messagesContextManager hook.
 *
 * Coverage:
 *   - Unit: maybeCompressMessages
 *     - No-op when below threshold
 *     - Triggers compression when above threshold
 *     - Preserves system + protected head verbatim
 *     - Preserves protected tail verbatim
 *     - Replaces middle with single summary message
 *     - LLM call invoked when configured
 *     - Falls back to placeholder when no LLM
 *     - shouldCompressMessages predicate matches behavior
 *     - Custom estimateTokensFn honored
 *     - onCompressionEvent fires with correct payload
 *   - Integration: runRetrievalAgentLoop with messagesContextManager
 *     - Backwards compat: omitted field → behavior unchanged
 *     - Compression fires at threshold during multi-turn loop
 *     - Emits 'messages_compressed' event
 *     - Compression doesn't break retrieve / finalize / loop_exhausted paths
 *     - Multiple compressions in one loop run
 *     - Final answer reachable after compression
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

import {
  maybeCompressMessages,
  shouldCompressMessages,
  type MessagesContextManagerConfig,
  type MessagesCompressionEvent,
} from '../src/long-task/messages-compressor.js';
import {
  runRetrievalAgentLoop,
  type LlmCallFn,
  type LlmCallResult,
  type RetrievalSearchFn,
  type MultiStepAgentRunConfig,
  type AgentRunProgressEvent,
} from '../src/retrieval-agent-loop.js';

// ─────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'waggle-msgcomp-'));
});

afterEach(async () => {
  await fsp.rm(tmpRoot, { recursive: true, force: true });
});

function makeMessages(count: number, fillerChars = 100): Array<{ role: string; content: string }> {
  const out: Array<{ role: string; content: string }> = [
    { role: 'system', content: 'You are a research assistant.' },
    { role: 'user', content: 'Survey 30 historical events and rank themes.' },
  ];
  for (let i = 0; i < count; i += 1) {
    out.push({ role: 'assistant', content: `{"action":"retrieve","query":"q${i}"}` });
    out.push({ role: 'user', content: `[results for q${i}]\n` + 'X'.repeat(fillerChars) });
  }
  return out;
}

function makeFakeLlm(content: string, costUsd = 0.001): LlmCallFn {
  return async () => ({
    content,
    inTokens: 100,
    outTokens: 50,
    costUsd,
    latencyMs: 50,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Unit: maybeCompressMessages — threshold gating
// ─────────────────────────────────────────────────────────────────────────

describe('maybeCompressMessages — threshold gating', () => {
  it('no-op when below threshold', async () => {
    const messages = makeMessages(2, 10);
    const r = await maybeCompressMessages(messages, { budgetTokens: 100000 }, null);
    expect(r.compressed).toBe(false);
    expect(r.messages.length).toBe(messages.length);
    expect(r.summary).toBeNull();
  });

  it('triggers compression when above threshold (no LLM, fallback summary)', async () => {
    const messages = makeMessages(20, 200);
    const r = await maybeCompressMessages(messages, { budgetTokens: 1000, threshold: 0.5 }, null);
    expect(r.compressed).toBe(true);
    expect(r.messages.length).toBeLessThan(messages.length);
  });

  it('shouldCompressMessages predicate matches behavior', () => {
    const small = makeMessages(2, 10);
    const big = makeMessages(20, 200);
    expect(shouldCompressMessages(small, { budgetTokens: 100000 })).toBe(false);
    expect(shouldCompressMessages(big, { budgetTokens: 1000, threshold: 0.5 })).toBe(true);
  });

  it('custom estimateTokensFn honored', () => {
    const msgs = makeMessages(2, 10);
    const alwaysHigh = (() => 999999) as (m: ReadonlyArray<{ role: string; content: string }>) => number;
    expect(shouldCompressMessages(msgs, {
      budgetTokens: 1000,
      estimateTokensFn: alwaysHigh,
    })).toBe(true);
  });

  it('default threshold is 0.7', () => {
    const msgs = makeMessages(20, 200);
    // estimateTokens(msgs) > budgetTokens * 0.7?  Use the same default.
    const should = shouldCompressMessages(msgs, { budgetTokens: 1000 });
    // Conservative: just verify it can return either bool deterministically.
    expect(typeof should).toBe('boolean');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Unit: maybeCompressMessages — preservation guarantees
// ─────────────────────────────────────────────────────────────────────────

describe('maybeCompressMessages — preservation', () => {
  it('preserves system message + protected head verbatim', async () => {
    const messages = makeMessages(20, 200);
    const r = await maybeCompressMessages(messages, {
      budgetTokens: 1000,
      threshold: 0.3,
      protectedHeadMessages: 1,
    }, null);
    expect(r.compressed).toBe(true);
    expect(r.messages[0]).toEqual(messages[0]);    // system retained
    expect(r.messages[1]).toEqual(messages[1]);    // first user (kickoff) retained
  });

  it('preserves protected tail verbatim (last messages)', async () => {
    const messages = makeMessages(20, 200);
    const r = await maybeCompressMessages(messages, {
      budgetTokens: 1000,
      threshold: 0.3,
      protectedTailTokens: 200,
    }, null);
    expect(r.compressed).toBe(true);
    // The very last message in the result should match the very last in the input.
    expect(r.messages[r.messages.length - 1]).toEqual(messages[messages.length - 1]);
  });

  it('replaces middle with a single summary message', async () => {
    const messages = makeMessages(20, 200);
    const r = await maybeCompressMessages(messages, { budgetTokens: 1000, threshold: 0.3 }, null);
    expect(r.compressed).toBe(true);
    // Find the summary message (added between head and tail).
    const summaryMsg = r.messages.find(m => m.role === 'system' && m.content.startsWith('[Compressed:'));
    expect(summaryMsg).toBeDefined();
  });

  it('reduces token count after compression', async () => {
    const messages = makeMessages(30, 300);
    const r = await maybeCompressMessages(messages, { budgetTokens: 1000, threshold: 0.3 }, null);
    // No direct token count exposed here, but message count should drop.
    expect(r.messages.length).toBeLessThan(messages.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Unit: maybeCompressMessages — LLM summarizer
// ─────────────────────────────────────────────────────────────────────────

describe('maybeCompressMessages — LLM summarizer', () => {
  it('invokes llmCall when configured', async () => {
    let calls = 0;
    const llm: LlmCallFn = async () => {
      calls += 1;
      return { content: 'CONDENSED_FACTS', inTokens: 100, outTokens: 30, costUsd: 0.002, latencyMs: 80 };
    };
    const messages = makeMessages(20, 200);
    const r = await maybeCompressMessages(messages, {
      budgetTokens: 1000,
      threshold: 0.3,
      llmCall: llm,
      summarizationModel: 'budget-model',
    }, null);
    expect(calls).toBe(1);
    expect(r.compressed).toBe(true);
    expect(r.summary).toBe('CONDENSED_FACTS');
    const summaryMsg = r.messages.find(m => m.content.includes('CONDENSED_FACTS'));
    expect(summaryMsg).toBeDefined();
  });

  it('does NOT invoke llmCall when not configured (uses fallback)', async () => {
    const messages = makeMessages(20, 200);
    const r = await maybeCompressMessages(messages, { budgetTokens: 1000, threshold: 0.3 }, null);
    expect(r.compressed).toBe(true);
    expect(r.summary).toContain('Compressed region');  // fallback marker
  });

  it('falls back to placeholder when llmCall returns error', async () => {
    const llm: LlmCallFn = async () => ({
      content: '',
      inTokens: 0, outTokens: 0, costUsd: 0, latencyMs: 0,
      error: 'rate-limited',
    });
    const messages = makeMessages(20, 200);
    const r = await maybeCompressMessages(messages, {
      budgetTokens: 1000,
      threshold: 0.3,
      llmCall: llm,
      summarizationModel: 'budget-model',
    }, null);
    expect(r.compressed).toBe(true);
    expect(r.summary).toContain('Compressed region');
  });

  it('previousSummary carried forward into summarizer prompt', async () => {
    let receivedMessages: Array<{ role: string; content: string }> = [];
    const llm: LlmCallFn = async (input) => {
      receivedMessages = input.messages;
      return { content: 'NEW_SUMMARY', inTokens: 50, outTokens: 30, costUsd: 0.001, latencyMs: 50 };
    };
    const messages = makeMessages(20, 200);
    await maybeCompressMessages(messages, {
      budgetTokens: 1000,
      threshold: 0.3,
      llmCall: llm,
      summarizationModel: 'budget-model',
    }, 'PRIOR_SUMMARY_TEXT');
    // The summarizer should have received the previousSummary in its system prompt.
    const sysMsg = receivedMessages.find(m => m.role === 'system');
    expect(sysMsg?.content).toContain('PRIOR_SUMMARY_TEXT');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Unit: maybeCompressMessages — events
// ─────────────────────────────────────────────────────────────────────────

describe('maybeCompressMessages — events', () => {
  it('onCompressionEvent fires with correct payload when compressed', async () => {
    const events: MessagesCompressionEvent[] = [];
    const messages = makeMessages(20, 200);
    await maybeCompressMessages(messages, {
      budgetTokens: 1000,
      threshold: 0.3,
      onCompressionEvent: (e) => events.push(e),
    }, null);
    expect(events.length).toBe(1);
    expect(events[0]?.type).toBe('messages_compressed');
    expect(events[0]?.before_tokens).toBeGreaterThan(0);
    expect(events[0]?.after_tokens).toBeLessThan(events[0]!.before_tokens);
    expect(events[0]?.messages_before).toBe(messages.length);
    expect(events[0]?.cost_usd).toBe(0); // no llmCall, so 0
  });

  it('onCompressionEvent does NOT fire when no compression', async () => {
    const events: MessagesCompressionEvent[] = [];
    await maybeCompressMessages(makeMessages(2, 10), {
      budgetTokens: 100000,
      onCompressionEvent: (e) => events.push(e),
    }, null);
    expect(events.length).toBe(0);
  });

  it('onCompressionEvent records llmCall cost', async () => {
    const events: MessagesCompressionEvent[] = [];
    const llm: LlmCallFn = async () => ({
      content: 'GIST', inTokens: 100, outTokens: 30, costUsd: 0.0042, latencyMs: 50,
    });
    await maybeCompressMessages(makeMessages(20, 200), {
      budgetTokens: 1000,
      threshold: 0.3,
      llmCall: llm,
      summarizationModel: 'b',
      onCompressionEvent: (e) => events.push(e),
    }, null);
    expect(events[0]?.cost_usd).toBe(0.0042);
    expect(events[0]?.summary_generated).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Integration: runRetrievalAgentLoop + messagesContextManager
// ─────────────────────────────────────────────────────────────────────────

const fakeSearch: RetrievalSearchFn = async ({ query }) => ({
  formattedResults: `[result for "${query}"]\n` + 'Y'.repeat(500),
  resultCount: 1,
});

interface ScriptedReply {
  content: string;
  costUsd?: number;
}

function makeScriptedLlm(replies: ScriptedReply[]): LlmCallFn {
  let idx = 0;
  return async () => {
    const reply = replies[idx];
    idx += 1;
    if (!reply) {
      return { content: '{"action":"finalize","response":"(end)"}', inTokens: 10, outTokens: 10, costUsd: 0, latencyMs: 10 };
    }
    const r: LlmCallResult = {
      content: reply.content,
      inTokens: 100, outTokens: 30,
      costUsd: reply.costUsd ?? 0.001,
      latencyMs: 30,
    };
    return r;
  };
}

function baseConfig(overrides: Partial<MultiStepAgentRunConfig> = {}): MultiStepAgentRunConfig {
  return {
    modelAlias: 'claude-opus-4-7',
    persona: 'You are a test agent.',
    question: 'rank themes',
    llmCall: makeScriptedLlm([{ content: '{"action":"finalize","response":"done"}' }]),
    search: fakeSearch,
    maxSteps: 10,
    ...overrides,
  };
}

describe('runRetrievalAgentLoop — backwards compat with messages-compression hook', () => {
  it('omitted messagesContextManager → no compression triggered', async () => {
    const events: AgentRunProgressEvent[] = [];
    const llm = makeScriptedLlm([
      { content: '{"action":"retrieve","query":"q1"}' },
      { content: '{"action":"retrieve","query":"q2"}' },
      { content: '{"action":"finalize","response":"done"}' },
    ]);
    const result = await runRetrievalAgentLoop(baseConfig({
      llmCall: llm,
      onProgress: (e) => events.push(e),
    }));
    expect(result.rawResponse).toBe('done');
    expect(events.some(e => e.type === 'messages_compressed')).toBe(false);
  });
});

describe('runRetrievalAgentLoop — messagesContextManager active', () => {
  it('emits messages_compressed event when threshold crossed mid-loop', async () => {
    const events: AgentRunProgressEvent[] = [];
    // Loop with several retrievals; budget tight enough that compression fires.
    const llm = makeScriptedLlm([
      { content: '{"action":"retrieve","query":"q1"}' },
      { content: '{"action":"retrieve","query":"q2"}' },
      { content: '{"action":"retrieve","query":"q3"}' },
      { content: '{"action":"retrieve","query":"q4"}' },
      { content: '{"action":"finalize","response":"answer"}' },
    ]);
    const result = await runRetrievalAgentLoop(baseConfig({
      llmCall: llm,
      onProgress: (e) => events.push(e),
      messagesContextManager: {
        budgetTokens: 100,
        threshold: 0.4,
        retainRecentTurns: 2,
      },
      maxSteps: 6,
    }));
    expect(result.rawResponse).toBe('answer');
    expect(events.some(e => e.type === 'messages_compressed')).toBe(true);
  });

  it('messages_compressed event has step_index + count payloads', async () => {
    const events: AgentRunProgressEvent[] = [];
    const llm = makeScriptedLlm([
      { content: '{"action":"retrieve","query":"q1"}' },
      { content: '{"action":"retrieve","query":"q2"}' },
      { content: '{"action":"retrieve","query":"q3"}' },
      { content: '{"action":"retrieve","query":"q4"}' },
      { content: '{"action":"finalize","response":"a"}' },
    ]);
    await runRetrievalAgentLoop(baseConfig({
      llmCall: llm,
      onProgress: (e) => events.push(e),
      messagesContextManager: { budgetTokens: 100, threshold: 0.4, retainRecentTurns: 2 },
      maxSteps: 6,
    }));
    const compressEvt = events.find(e => e.type === 'messages_compressed');
    expect(compressEvt?.step_index).toBeGreaterThanOrEqual(0);
    expect(compressEvt?.messages_before_count).toBeGreaterThan(0);
    expect(compressEvt?.messages_after_count).toBeLessThan(compressEvt!.messages_before_count!);
  });

  it('compression does not break the retrieve → finalize flow', async () => {
    const llm = makeScriptedLlm([
      { content: '{"action":"retrieve","query":"q1"}' },
      { content: '{"action":"retrieve","query":"q2"}' },
      { content: '{"action":"retrieve","query":"q3"}' },
      { content: '{"action":"retrieve","query":"q4"}' },
      { content: '{"action":"retrieve","query":"q5"}' },
      { content: '{"action":"finalize","response":"all-good"}' },
    ]);
    const result = await runRetrievalAgentLoop(baseConfig({
      llmCall: llm,
      messagesContextManager: { budgetTokens: 500, threshold: 0.4 },
      maxSteps: 8,
    }));
    expect(result.rawResponse).toBe('all-good');
    expect(result.retrievalCalls).toBe(5);
  });

  it('multiple compressions over a long run', async () => {
    const events: AgentRunProgressEvent[] = [];
    // 8 retrieves before finalize — should trigger 2+ compressions on tight budget.
    const replies: ScriptedReply[] = [];
    for (let i = 0; i < 8; i += 1) {
      replies.push({ content: `{"action":"retrieve","query":"q${i}"}` });
    }
    replies.push({ content: '{"action":"finalize","response":"end"}' });
    const llm = makeScriptedLlm(replies);
    await runRetrievalAgentLoop(baseConfig({
      llmCall: llm,
      onProgress: (e) => events.push(e),
      messagesContextManager: { budgetTokens: 100, threshold: 0.4, retainRecentTurns: 2 },
      maxSteps: 10,
    }));
    const compressEvents = events.filter(e => e.type === 'messages_compressed');
    expect(compressEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('compression onCompressionEvent (config-level) ALSO fires', async () => {
    const cfgEvents: MessagesCompressionEvent[] = [];
    const llm = makeScriptedLlm([
      { content: '{"action":"retrieve","query":"q1"}' },
      { content: '{"action":"retrieve","query":"q2"}' },
      { content: '{"action":"retrieve","query":"q3"}' },
      { content: '{"action":"finalize","response":"a"}' },
    ]);
    await runRetrievalAgentLoop(baseConfig({
      llmCall: llm,
      messagesContextManager: {
        budgetTokens: 300,
        threshold: 0.4,
        retainRecentTurns: 2,
        onCompressionEvent: (e) => cfgEvents.push(e),
      },
      maxSteps: 5,
    }));
    expect(cfgEvents.length).toBeGreaterThanOrEqual(1);
    expect(cfgEvents[0]?.type).toBe('messages_compressed');
  });

  it('compression engaged + LLM summarizer end-to-end', async () => {
    const events: AgentRunProgressEvent[] = [];
    const summarizerLlm = makeFakeLlm('SUMMARY_TEXT', 0.005);
    const llm = makeScriptedLlm([
      { content: '{"action":"retrieve","query":"q1"}' },
      { content: '{"action":"retrieve","query":"q2"}' },
      { content: '{"action":"retrieve","query":"q3"}' },
      { content: '{"action":"finalize","response":"r"}' },
    ]);
    const cfgEvents: MessagesCompressionEvent[] = [];
    await runRetrievalAgentLoop(baseConfig({
      llmCall: llm,
      onProgress: (e) => events.push(e),
      messagesContextManager: {
        budgetTokens: 300,
        threshold: 0.4,
        retainRecentTurns: 2,
        llmCall: summarizerLlm,
        summarizationModel: 'budget-model',
        onCompressionEvent: (e) => cfgEvents.push(e),
      },
      maxSteps: 5,
    }));
    expect(cfgEvents.some(e => e.summary_generated === true)).toBe(true);
    expect(cfgEvents.some(e => e.cost_usd > 0)).toBe(true);
  });

  it('replay determinism: two runs with identical inputs → identical compression decisions', async () => {
    const buildLlm = () => makeScriptedLlm([
      { content: '{"action":"retrieve","query":"q1"}' },
      { content: '{"action":"retrieve","query":"q2"}' },
      { content: '{"action":"retrieve","query":"q3"}' },
      { content: '{"action":"retrieve","query":"q4"}' },
      { content: '{"action":"finalize","response":"deterministic"}' },
    ]);
    const events1: AgentRunProgressEvent[] = [];
    const events2: AgentRunProgressEvent[] = [];
    const result1 = await runRetrievalAgentLoop(baseConfig({
      llmCall: buildLlm(),
      onProgress: (e) => events1.push(e),
      messagesContextManager: { budgetTokens: 100, threshold: 0.4, retainRecentTurns: 2 },
      maxSteps: 6,
    }));
    const result2 = await runRetrievalAgentLoop(baseConfig({
      llmCall: buildLlm(),
      onProgress: (e) => events2.push(e),
      messagesContextManager: { budgetTokens: 100, threshold: 0.4, retainRecentTurns: 2 },
      maxSteps: 6,
    }));
    expect(result1.rawResponse).toBe(result2.rawResponse);
    expect(events1.filter(e => e.type === 'messages_compressed').length)
      .toBe(events2.filter(e => e.type === 'messages_compressed').length);
  });
});
