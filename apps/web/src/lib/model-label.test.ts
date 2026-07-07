import { describe, it, expect } from 'vitest';
import { formatModelLabel } from './model-label';
import type { Provider } from '@/hooks/useProviders';

const providers: Provider[] = [
  {
    id: 'anthropic', name: 'Anthropic', hasKey: true, badge: null, keyUrl: null, requiresKey: true,
    models: [{ id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', cost: '', speed: '' }],
  },
];

describe('formatModelLabel (W2C)', () => {
  it('returns the catalog friendly name on an exact match', () => {
    expect(formatModelLabel('claude-sonnet-4-6', providers)).toBe('Claude Sonnet 4.6');
  });

  it('prettifies an ollama tag the catalog cannot name', () => {
    expect(formatModelLabel('ollama/minimax-m2.7:cloud', providers)).toBe('Minimax M2.7 (cloud)');
  });

  it('strips an 8-digit date suffix', () => {
    expect(formatModelLabel('gpt-4o-20260115')).toBe('GPT 4o');
  });

  it('title-cases an unknown bare id', () => {
    expect(formatModelLabel('qwen3-35b')).toBe('Qwen3 35b');
  });

  it('re-joins dash-encoded version digits with a dot (heuristic path, no catalog)', () => {
    expect(formatModelLabel('claude-opus-4-6')).toBe('Claude Opus 4.6');
    expect(formatModelLabel('claude-3-5-sonnet')).toBe('Claude 3.5 Sonnet');
  });

  it('is empty-safe', () => {
    expect(formatModelLabel(undefined)).toBe('');
    expect(formatModelLabel('')).toBe('');
  });

  it('falls back to the heuristic when the catalog name equals the id', () => {
    const p: Provider[] = [{ id: 'x', name: 'X', hasKey: true, badge: null, keyUrl: null, requiresKey: false, models: [{ id: 'kimi-k2', name: 'kimi-k2', cost: '', speed: '' }] }];
    expect(formatModelLabel('kimi-k2', p)).toBe('Kimi K2');
  });

  it('humanizes an installed Ollama model even when the catalog carries a matching (bare-tag) entry (wave-4 QA regression)', () => {
    // Reproduces the live bug: routes/providers.ts fetchOllamaModels sets
    // `name` to the bare installed tag by design ("Display name stays the
    // bare tag") — the catalog-match branch must not trust that as an
    // already-friendly name and short-circuit before the heuristic runs.
    const p: Provider[] = [{
      id: 'ollama', name: 'Local / Ollama', hasKey: true, badge: null, keyUrl: null, requiresKey: false,
      models: [{ id: 'ollama/gemma4:31b', name: 'gemma4:31b', cost: '', speed: '' }],
    }];
    expect(formatModelLabel('ollama/gemma4:31b', p)).toBe('Gemma4 (31b)');
  });
});
