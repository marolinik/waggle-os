/**
 * Tests for model-family classifier — see PromptAssembler v5 brief §7.1, §12.1.
 *
 * Family is orthogonal to tier: tier drives scoring profile and scaffold gating,
 * family drives scaffold-STYLE selection (compression vs expansion).
 */

import { describe, it, expect } from 'vitest';
import { familyForModel } from '../src/model-family.js';

describe('familyForModel — §12.1 required cases', () => {
  it('claude-opus-4-7 → claude', () => {
    expect(familyForModel('claude-opus-4-7')).toBe('claude');
  });

  it('claude-sonnet-4-6 → claude', () => {
    expect(familyForModel('claude-sonnet-4-6')).toBe('claude');
  });

  it('gemma-4-31b → gemma', () => {
    expect(familyForModel('gemma-4-31b')).toBe('gemma');
  });

  it('gemma-4-26b-a4b-it → gemma', () => {
    expect(familyForModel('gemma-4-26b-a4b-it')).toBe('gemma');
  });

  it('qwen3-30b-a3b-instruct-2507 → qwen-instruction', () => {
    expect(familyForModel('qwen3-30b-a3b-instruct-2507')).toBe('qwen-instruction');
  });

  it('qwen3-30b-a3b-thinking-2507 → qwen-reasoning', () => {
    expect(familyForModel('qwen3-30b-a3b-thinking-2507')).toBe('qwen-reasoning');
  });

  // LOCKED 2026-04-19 target model. Qwen3.6-A3B unified thinking+base into a
  // single SKU with default-on reasoning, so its slug has no reasoning marker
  // yet it must be classified as qwen-reasoning for scaffold-style selection.
  it('qwen3.6-35b-a3b → qwen-reasoning (unified thinking SKU)', () => {
    expect(familyForModel('qwen3.6-35b-a3b')).toBe('qwen-reasoning');
  });

  it('qwen3.6-35b-a3b (provider-prefixed) → qwen-reasoning', () => {
    expect(familyForModel('qwen/qwen3.6-35b-a3b')).toBe('qwen-reasoning');
    expect(familyForModel('openrouter/qwen/qwen3.6-35b-a3b')).toBe('qwen-reasoning');
  });

  it('qwen3.6-35b-a3b case-insensitive → qwen-reasoning', () => {
    expect(familyForModel('Qwen3.6-35B-A3B')).toBe('qwen-reasoning');
    expect(familyForModel('QWEN3.6-35B-A3B')).toBe('qwen-reasoning');
  });

  it('hypothetical qwen3.6 non-A3B variant stays qwen-instruction by default', () => {
    // Conservative: the 3.6-series unified thinking SKU claim only applies to
    // A3B variants per HF model card. Other 3.6 variants fall back to the
    // generic qwen family rule.
    expect(familyForModel('qwen3.6-7b-chat')).toBe('qwen-instruction');
  });

  it('qwq-32b → qwen-reasoning', () => {
    expect(familyForModel('qwq-32b')).toBe('qwen-reasoning');
  });

  it('llama-3.1-70b → llama', () => {
    expect(familyForModel('llama-3.1-70b')).toBe('llama');
  });

  it('unknown-model-xyz → other', () => {
    expect(familyForModel('unknown-model-xyz')).toBe('other');
  });

  it('is case-insensitive', () => {
    expect(familyForModel('CLAUDE-OPUS-4-7')).toBe('claude');
    expect(familyForModel('Gemma-4-31b')).toBe('gemma');
    expect(familyForModel('QWQ-32b')).toBe('qwen-reasoning');
    expect(familyForModel('Qwen3-30B-A3B-Thinking-2507')).toBe('qwen-reasoning');
  });
});

describe('familyForModel — provider-prefixed slugs (LiteLLM / OpenRouter formats)', () => {
  it('strips google/ prefix on gemma', () => {
    expect(familyForModel('google/gemma-4-31b-it')).toBe('gemma');
    expect(familyForModel('google/gemma-4-26b-a4b-it')).toBe('gemma');
  });

  it('strips qwen/ prefix on qwen instruction variant', () => {
    expect(familyForModel('qwen/qwen3-30b-a3b-instruct-2507')).toBe('qwen-instruction');
  });

  it('strips qwen/ prefix on qwen thinking variant', () => {
    expect(familyForModel('qwen/qwen3-30b-a3b-thinking-2507')).toBe('qwen-reasoning');
  });

  it('handles nested openrouter/qwen/... slug format', () => {
    expect(familyForModel('openrouter/qwen/qwen3-30b-a3b-thinking-2507')).toBe('qwen-reasoning');
    expect(familyForModel('openrouter/qwen/qwen3-30b-a3b-instruct-2507')).toBe('qwen-instruction');
  });

  it('strips meta-llama/ prefix on llama', () => {
    expect(familyForModel('meta-llama/llama-3.1-70b-instruct')).toBe('llama');
    expect(familyForModel('meta-llama/llama-4-scout')).toBe('llama');
  });

  it('strips anthropic/ prefix on claude', () => {
    expect(familyForModel('anthropic/claude-opus-4-7')).toBe('claude');
  });
});

describe('familyForModel — qwen reasoning-marker disambiguation', () => {
  it('bare qwen3-30b (no suffix) → qwen-instruction (default for qwen family)', () => {
    expect(familyForModel('qwen3-30b')).toBe('qwen-instruction');
  });

  it('qwen2.5-7b-instruct → qwen-instruction', () => {
    expect(familyForModel('qwen2.5-7b-instruct')).toBe('qwen-instruction');
  });

  it('any qwen variant with "thinking" in name → qwen-reasoning', () => {
    expect(familyForModel('qwen3-72b-thinking')).toBe('qwen-reasoning');
  });

  it('any qwen variant with "reasoner" in name → qwen-reasoning', () => {
    expect(familyForModel('qwen3-30b-reasoner')).toBe('qwen-reasoning');
  });
});

describe('familyForModel — judge models (all frontier, all outside candidate families)', () => {
  it('gemini-3.1-pro → other', () => {
    expect(familyForModel('gemini-3.1-pro')).toBe('other');
    expect(familyForModel('gemini/gemini-3.1-pro-preview')).toBe('other');
  });

  it('gpt-5.4 → other', () => {
    expect(familyForModel('gpt-5.4')).toBe('other');
    expect(familyForModel('openai/gpt-5.4')).toBe('other');
  });

  it('grok-4.20 → other', () => {
    expect(familyForModel('grok-4.20')).toBe('other');
    expect(familyForModel('xai/grok-4.20')).toBe('other');
  });

  it('minimax-m2.7 → other', () => {
    expect(familyForModel('minimax-m2.7')).toBe('other');
    expect(familyForModel('MiniMax-M2.7')).toBe('other');
  });

  it('mistral-large → other', () => {
    expect(familyForModel('mistral-large')).toBe('other');
  });
});

describe('familyForModel — edge cases', () => {
  it('trims leading/trailing whitespace', () => {
    expect(familyForModel('  claude-opus-4-7  ')).toBe('claude');
  });

  it('empty string → other', () => {
    expect(familyForModel('')).toBe('other');
  });

  it('just a slash → other', () => {
    expect(familyForModel('/')).toBe('other');
  });
});
