import { describe, it, expect } from 'vitest';
import { resolveModelForClass, LIGHTWEIGHT_MODEL } from '../src/model-class-router.js';

describe('resolveModelForClass', () => {
  it('routes a lightweight call to the cheap model', () => {
    expect(
      resolveModelForClass('claude-sonnet-4-6', { klass: 'lightweight', lightweightModel: LIGHTWEIGHT_MODEL }),
    ).toBe(LIGHTWEIGHT_MODEL);
  });

  it('leaves a lightweight call unchanged when no cheap model is supplied', () => {
    expect(resolveModelForClass('claude-sonnet-4-6', { klass: 'lightweight' })).toBe('claude-sonnet-4-6');
  });

  it('leaves general / reasoning / unclassified calls unchanged', () => {
    const opts = { lightweightModel: LIGHTWEIGHT_MODEL };
    expect(resolveModelForClass('claude-opus-4-8', { ...opts, klass: 'reasoning' })).toBe('claude-opus-4-8');
    expect(resolveModelForClass('claude-opus-4-8', { ...opts, klass: 'general' })).toBe('claude-opus-4-8');
    expect(resolveModelForClass('claude-opus-4-8', opts)).toBe('claude-opus-4-8');
  });

  it('routes a privacy-required call to the on-device model when provided', () => {
    expect(
      resolveModelForClass('claude-sonnet-4-6', { privacyRequired: true, localModel: 'ollama/llama3.1' }),
    ).toBe('ollama/llama3.1');
  });

  it('NEVER downgrades a privacy-required call to the cloud budget model', () => {
    // privacyRequired + lightweight, but no local model → keep the caller's model,
    // do NOT fall through to the cloud lightweightModel.
    const out = resolveModelForClass('claude-sonnet-4-6', {
      privacyRequired: true,
      klass: 'lightweight',
      lightweightModel: LIGHTWEIGHT_MODEL,
    });
    expect(out).toBe('claude-sonnet-4-6');
    expect(out).not.toBe(LIGHTWEIGHT_MODEL);
  });

  it('privacy precedence: on-device model wins over the lightweight override', () => {
    expect(
      resolveModelForClass('claude-sonnet-4-6', {
        privacyRequired: true,
        localModel: 'ollama/qwen3',
        klass: 'lightweight',
        lightweightModel: LIGHTWEIGHT_MODEL,
      }),
    ).toBe('ollama/qwen3');
  });
});
