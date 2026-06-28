import { describe, it, expect } from 'vitest';
import {
  computeInputTokenBudget,
  getModelContextWindow,
  createDefaultCompressionConfig,
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_HARD_MAX,
} from '../src/index.js';

describe('computeInputTokenBudget', () => {
  // ── auto path (explicit=false) ────────────────────────────────────────────
  it('auto-scales a known window by the 0.85 headroom', () => {
    expect(computeInputTokenBudget(0, 8192, false)).toBe(Math.floor(8192 * 0.85)); // 6963
    expect(computeInputTokenBudget(0, 32768, false)).toBe(Math.floor(32768 * 0.85)); // 27852
  });

  it('caps the auto-scaled budget at the hard max for huge windows', () => {
    // 1_000_000 * 0.85 = 850000 > 200000 → clamped
    expect(computeInputTokenBudget(0, 1_000_000, false)).toBe(DEFAULT_HARD_MAX);
  });

  it('returns the conservative default when the window is unknown (0)', () => {
    expect(computeInputTokenBudget(0, 0, false)).toBe(DEFAULT_CONTEXT_WINDOW);
    expect(computeInputTokenBudget(0, -1, false)).toBe(DEFAULT_CONTEXT_WINDOW);
  });

  it('uses a positive configured value as the fallback when window unknown', () => {
    expect(computeInputTokenBudget(5000, 0, false)).toBe(5000);
  });

  // ── explicit path (explicit=true) ─────────────────────────────────────────
  it('honours an explicit cap exactly when below the window', () => {
    expect(computeInputTokenBudget(4000, 32768, true)).toBe(4000);
  });

  it('clamps an explicit cap down to a known window', () => {
    expect(computeInputTokenBudget(50000, 8192, true)).toBe(8192);
  });

  it('honours an explicit cap unclamped when the window is unknown', () => {
    expect(computeInputTokenBudget(50000, 0, true)).toBe(50000);
  });

  it('ignores explicit when configured is 0 and falls through to auto/unknown', () => {
    expect(computeInputTokenBudget(0, 0, true)).toBe(DEFAULT_CONTEXT_WINDOW);
    expect(computeInputTokenBudget(0, 16384, true)).toBe(Math.floor(16384 * 0.85));
  });

  // ── option overrides ──────────────────────────────────────────────────────
  it('respects custom headroom / hardMax / conservativeDefault', () => {
    expect(computeInputTokenBudget(0, 10000, false, { headroom: 0.5 })).toBe(5000);
    expect(computeInputTokenBudget(0, 10000, false, { hardMax: 1000 })).toBe(1000);
    expect(computeInputTokenBudget(0, 0, false, { conservativeDefault: 2048 })).toBe(2048);
  });

  it('never returns below 1 on a tiny known window', () => {
    expect(computeInputTokenBudget(0, 1, false)).toBeGreaterThanOrEqual(1);
  });
});

describe('getModelContextWindow', () => {
  it('maps Claude / Anthropic to 200k', () => {
    expect(getModelContextWindow('claude-opus-4-8')).toBe(200_000);
    expect(getModelContextWindow('anthropic/claude-3.7-sonnet')).toBe(200_000);
  });
  it('maps GPT / OpenAI / o-series to 128k', () => {
    expect(getModelContextWindow('gpt-4o')).toBe(128_000);
    expect(getModelContextWindow('openai/gpt-4.1')).toBe(128_000);
    expect(getModelContextWindow('o3-mini')).toBe(128_000);
  });
  it('maps Gemini to 1M', () => {
    expect(getModelContextWindow('gemini-2.5-pro')).toBe(1_000_000);
  });
  it('returns 0 (conservative) for local Ollama and unknown models', () => {
    expect(getModelContextWindow('ollama/qwen2.5-coder:7b')).toBe(0);
    expect(getModelContextWindow('ollama/llama3.2:3b')).toBe(0);
    expect(getModelContextWindow('some-unknown-model')).toBe(0);
    expect(getModelContextWindow('')).toBe(0);
  });
});

// ── integration assertion: reproduce the exact chat.ts call-site composition ──
describe('chat.ts compression-config wiring (composition)', () => {
  function buildConfigFor(resolvedModel: string) {
    // Mirror the chat.ts call site exactly: local (ollama/*) unknown windows get
    // the conservative 8k floor; non-local/unknown cloud ids keep the 128k baseline.
    const discoveredWindow = getModelContextWindow(resolvedModel);
    const isLocalModel = resolvedModel.trim().toLowerCase().startsWith('ollama/');
    const maxContextTokens = computeInputTokenBudget(0, discoveredWindow, false, {
      conservativeDefault: isLocalModel ? 8192 : 128_000,
    });
    return createDefaultCompressionConfig({
      budgetModel: 'qwen/qwen3.6-plus:free',
      litellmUrl: 'http://localhost:4000',
      litellmApiKey: 'test',
      maxContextTokens,
    });
  }

  it('sizes a local Ollama model conservatively, NOT at the 128k default', () => {
    const cfg = buildConfigFor('ollama/qwen2.5-coder:7b');
    expect(cfg.maxContextTokens).toBe(DEFAULT_CONTEXT_WINDOW); // 8192, not 128000
    expect(cfg.maxContextTokens).toBeLessThan(128_000);
  });

  it('sizes a Claude model to 0.85 of its 200k window', () => {
    const cfg = buildConfigFor('claude-opus-4-8');
    expect(cfg.maxContextTokens).toBe(Math.floor(200_000 * 0.85)); // 170000
  });

  it('keeps the 128k baseline for an unmapped cloud model (no 8k over-compaction)', () => {
    // deepseek/mistral/openrouter/etc. are not in getModelContextWindow yet → window 0,
    // but they are NOT local, so they keep the prior 128k baseline, not the 8k floor.
    const cfg = buildConfigFor('deepseek-chat');
    expect(cfg.maxContextTokens).toBe(128_000);
  });
});
