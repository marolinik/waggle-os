import { describe, it, expect } from 'vitest';
import { tierForModel } from '../src/model-tier.js';

describe('tierForModel', () => {
  it('claude-opus-4-7 → frontier', () => {
    expect(tierForModel('claude-opus-4-7')).toBe('frontier');
  });

  it('claude-opus-4-6 → frontier', () => {
    expect(tierForModel('claude-opus-4-6')).toBe('frontier');
  });

  it('claude-sonnet-4-6 → mid', () => {
    expect(tierForModel('claude-sonnet-4-6')).toBe('mid');
  });

  it('claude-haiku-4-5 → mid', () => {
    expect(tierForModel('claude-haiku-4-5')).toBe('mid');
  });

  it('gemma-4-31b → small', () => {
    expect(tierForModel('gemma-4-31b')).toBe('small');
  });

  it('gemma-4-26b-moe → small', () => {
    expect(tierForModel('gemma-4-26b-moe')).toBe('small');
  });

  it('qwen3-30b-a3b → small', () => {
    expect(tierForModel('qwen3-30b-a3b')).toBe('small');
  });

  it('qwen3-32b → small', () => {
    expect(tierForModel('qwen3-32b')).toBe('small');
  });

  it('unknown-model-xyz → mid (default)', () => {
    expect(tierForModel('unknown-model-xyz')).toBe('mid');
  });

  it('Claude-Opus-4-7 → frontier (case-insensitive)', () => {
    expect(tierForModel('Claude-Opus-4-7')).toBe('frontier');
  });

  it('handles LiteLLM slugs with it suffix', () => {
    expect(tierForModel('gemma-4-31b-it')).toBe('small');
  });

  it('handles future claude-opus variants', () => {
    expect(tierForModel('claude-opus-5-0-20270101')).toBe('frontier');
  });
});
