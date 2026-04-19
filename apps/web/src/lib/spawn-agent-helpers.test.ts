/**
 * Unit coverage for provider / model mapping helpers used by
 * SpawnAgentDialog. Guards the empty-state branching and the
 * workspace-model inheritance logic.
 */
import { describe, it, expect } from 'vitest';
import {
  countProvidersWithKeys,
  selectDefaultModel,
  type ProviderSummary,
} from './spawn-agent-helpers';

describe('countProvidersWithKeys', () => {
  it('returns 0 for an empty list', () => {
    expect(countProvidersWithKeys([])).toBe(0);
  });

  it('returns 0 when no provider has a key', () => {
    const providers: ProviderSummary[] = [{ hasKey: false }, { hasKey: false }];
    expect(countProvidersWithKeys(providers)).toBe(0);
  });

  it('counts only providers with hasKey=true', () => {
    const providers: ProviderSummary[] = [
      { hasKey: true },
      { hasKey: false },
      { hasKey: true },
      { hasKey: false },
    ];
    expect(countProvidersWithKeys(providers)).toBe(2);
  });

  it('handles a list where every provider has a key', () => {
    const providers: ProviderSummary[] = [{ hasKey: true }, { hasKey: true }];
    expect(countProvidersWithKeys(providers)).toBe(2);
  });
});

describe('selectDefaultModel', () => {
  const models = ['claude-sonnet-4-6', 'gpt-4.1', 'gemma4:31b'];

  it('returns empty string when no models are available', () => {
    expect(selectDefaultModel(undefined, [])).toBe('');
    expect(selectDefaultModel('claude-sonnet-4-6', [])).toBe('');
  });

  it('returns the workspace model when it is present in availableModels', () => {
    expect(selectDefaultModel('gpt-4.1', models)).toBe('gpt-4.1');
  });

  it('falls back to the first model when the workspace model is missing from the list', () => {
    // Regression: a workspace configured for a model that is no longer
    // served should not leave the dropdown stuck on a stale value.
    expect(selectDefaultModel('claude-opus-4-6', models)).toBe('claude-sonnet-4-6');
  });

  it('returns the first available model when no workspace model is set', () => {
    expect(selectDefaultModel(undefined, models)).toBe('claude-sonnet-4-6');
  });

  it('treats empty-string workspace model as absent', () => {
    expect(selectDefaultModel('', models)).toBe('claude-sonnet-4-6');
  });
});
