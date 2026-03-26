/**
 * Settings component tests.
 *
 * Tests utility functions and exports only — no jsdom/React Testing Library.
 * React component rendering is tested in the desktop app's E2E suite.
 */

import { describe, it, expect } from 'vitest';
import {
  SettingsPanel,
  ModelsSection,
  ModelSection,
  PermissionSection,
  ThemeSection,
  AdvancedSection,
  VaultSection,
  maskApiKey,
  getProviderDisplayName,
  getProviderKeyPrefix,
  getCostTier,
  getSpeedTier,
  validateProviderConfig,
  mergeGates,
  SUPPORTED_PROVIDERS,
  SETTINGS_TABS,
} from '../../src/index.js';

// ── maskApiKey ──────────────────────────────────────────────────────

describe('maskApiKey', () => {
  it('masks all but last 4 chars', () => {
    // 'sk-ant-1234567890abcdef' is 23 chars, mask first 19
    expect(maskApiKey('sk-ant-1234567890abcdef')).toBe('•••••••••••••••••••cdef');
  });

  it('returns the key as-is when 4 chars or fewer', () => {
    expect(maskApiKey('abcd')).toBe('abcd');
    expect(maskApiKey('abc')).toBe('abc');
  });

  it('handles empty string', () => {
    expect(maskApiKey('')).toBe('');
  });

  it('handles exactly 5 chars', () => {
    expect(maskApiKey('12345')).toBe('•2345');
  });
});

// ── getProviderDisplayName ──────────────────────────────────────────

describe('getProviderDisplayName', () => {
  it('returns "Anthropic" for anthropic', () => {
    expect(getProviderDisplayName('anthropic')).toBe('Anthropic');
  });

  it('returns "OpenAI" for openai', () => {
    expect(getProviderDisplayName('openai')).toBe('OpenAI');
  });

  it('returns "Google" for google', () => {
    expect(getProviderDisplayName('google')).toBe('Google');
  });

  it('returns "Mistral" for mistral', () => {
    expect(getProviderDisplayName('mistral')).toBe('Mistral');
  });

  it('returns custom provider name for custom', () => {
    expect(getProviderDisplayName('custom')).toBe('Custom / Local (Ollama, LM Studio, etc.)');
  });

  it('returns raw string for unknown providers', () => {
    expect(getProviderDisplayName('custom-provider')).toBe('custom-provider');
  });
});

// ── getProviderKeyPrefix ────────────────────────────────────────────

describe('getProviderKeyPrefix', () => {
  it('returns "sk-ant-" for anthropic', () => {
    expect(getProviderKeyPrefix('anthropic')).toBe('sk-ant-');
  });

  it('returns "sk-" for openai', () => {
    expect(getProviderKeyPrefix('openai')).toBe('sk-');
  });

  it('returns null for custom provider', () => {
    expect(getProviderKeyPrefix('custom')).toBeNull();
  });

  it('returns null for unknown providers', () => {
    expect(getProviderKeyPrefix('custom-provider')).toBeNull();
  });

  it('returns null for google', () => {
    expect(getProviderKeyPrefix('google')).toBeNull();
  });

  it('returns null for mistral', () => {
    expect(getProviderKeyPrefix('mistral')).toBeNull();
  });
});

// ── getCostTier ─────────────────────────────────────────────────────

describe('getCostTier', () => {
  it('returns $$$ for premium models', () => {
    expect(getCostTier('claude-opus-4-6')).toBe('$$$');
    expect(getCostTier('gpt-5.4')).toBe('$$$');
    expect(getCostTier('gemini-3.1-pro')).toBe('$$$');
  });

  it('returns $ for budget models', () => {
    expect(getCostTier('claude-haiku-4-5')).toBe('$');
    expect(getCostTier('gpt-4.1-mini')).toBe('$');
    expect(getCostTier('gemini-3.1-flash')).toBe('$');
    expect(getCostTier('mistral-small-latest')).toBe('$');
  });

  it('returns $$ as default for unknown models', () => {
    expect(getCostTier('some-unknown-model')).toBe('$$');
  });
});

// ── getSpeedTier ────────────────────────────────────────────────────

describe('getSpeedTier', () => {
  it('returns slow for premium models', () => {
    expect(getSpeedTier('claude-opus-4-6')).toBe('slow');
    expect(getSpeedTier('gpt-5.4')).toBe('slow');
    expect(getSpeedTier('gemini-3.1-pro')).toBe('slow');
    expect(getSpeedTier('deepseek-reasoner')).toBe('slow');
  });

  it('returns fast for budget/flash models', () => {
    expect(getSpeedTier('claude-haiku-4-5')).toBe('fast');
    expect(getSpeedTier('gpt-4.1-mini')).toBe('fast');
    expect(getSpeedTier('gemini-3.1-flash')).toBe('fast');
    expect(getSpeedTier('mistral-small-latest')).toBe('fast');
  });

  it('returns fast for small models', () => {
    expect(getSpeedTier('claude-haiku-3-20250307')).toBe('fast');
  });

  it('returns medium as default for unknown models', () => {
    expect(getSpeedTier('some-unknown-model')).toBe('medium');
  });
});

// ── SUPPORTED_PROVIDERS ─────────────────────────────────────────────

describe('SUPPORTED_PROVIDERS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(SUPPORTED_PROVIDERS)).toBe(true);
    expect(SUPPORTED_PROVIDERS.length).toBeGreaterThan(0);
  });

  it('includes anthropic, openai, google, mistral, custom', () => {
    const ids = SUPPORTED_PROVIDERS.map((p) => p.id);
    expect(ids).toContain('anthropic');
    expect(ids).toContain('openai');
    expect(ids).toContain('google');
    expect(ids).toContain('mistral');
    expect(ids).toContain('custom');
  });

  it('each provider has id, name, and models array', () => {
    for (const provider of SUPPORTED_PROVIDERS) {
      expect(typeof provider.id).toBe('string');
      expect(typeof provider.name).toBe('string');
      expect(Array.isArray(provider.models)).toBe(true);
    }
  });

  it('custom provider has empty models (user-defined)', () => {
    const custom = SUPPORTED_PROVIDERS.find((p) => p.id === 'custom');
    expect(custom).toBeDefined();
    expect(custom!.name).toBe('Custom / Local (Ollama, LM Studio, etc.)');
    expect(custom!.keyPrefix).toBeNull();
    expect(custom!.models).toEqual([]);
  });
});

// ── SETTINGS_TABS ───────────────────────────────────────────────────

describe('SETTINGS_TABS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(SETTINGS_TABS)).toBe(true);
    expect(SETTINGS_TABS.length).toBeGreaterThan(0);
  });

  it('has General, Models, Keys & Connections, Permissions, Team, Backup, Advanced tabs', () => {
    const labels = SETTINGS_TABS.map((t) => t.label);
    expect(labels).toContain('General');
    expect(labels).toContain('Models');
    expect(labels).toContain('Keys & Connections');
    expect(labels).toContain('Permissions');
    expect(labels).toContain('Team');
    expect(labels).toContain('Backup');
    expect(labels).toContain('Advanced');
  });

  it('each tab has id and label', () => {
    for (const tab of SETTINGS_TABS) {
      expect(typeof tab.id).toBe('string');
      expect(typeof tab.label).toBe('string');
    }
  });
});

// ── validateProviderConfig ──────────────────────────────────────────

describe('validateProviderConfig', () => {
  it('returns valid for a correct anthropic key', () => {
    const result = validateProviderConfig('anthropic', 'sk-ant-abc123def456');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('returns valid for a correct openai key', () => {
    const result = validateProviderConfig('openai', 'sk-abc123def456');
    expect(result.valid).toBe(true);
  });

  it('returns invalid for empty key', () => {
    const result = validateProviderConfig('anthropic', '');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns invalid for whitespace-only key', () => {
    const result = validateProviderConfig('openai', '   ');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns invalid for anthropic key without expected prefix', () => {
    const result = validateProviderConfig('anthropic', 'sk-wrongprefix123');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('sk-ant-');
  });

  it('returns invalid for openai key without expected prefix', () => {
    const result = validateProviderConfig('openai', 'wrong-prefix-123');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('sk-');
  });

  it('returns valid for unknown provider with any non-empty key', () => {
    const result = validateProviderConfig('custom', 'any-key-here');
    expect(result.valid).toBe(true);
  });

  it('returns invalid for key shorter than 8 chars', () => {
    const result = validateProviderConfig('custom', 'short');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ── mergeGates ─────────────────────────────────────────────────────

describe('mergeGates', () => {
  it('returns global gates when no workspace gates provided', () => {
    expect(mergeGates(['git push', 'rm -rf'])).toEqual(['git push', 'rm -rf']);
  });

  it('returns global gates when workspace gates is undefined', () => {
    expect(mergeGates(['git push'], undefined)).toEqual(['git push']);
  });

  it('returns global gates when workspace gates is empty', () => {
    expect(mergeGates(['git push'], [])).toEqual(['git push']);
  });

  it('merges global and workspace gates', () => {
    const result = mergeGates(['git push'], ['deploy', 'db migrate']);
    expect(result).toContain('git push');
    expect(result).toContain('deploy');
    expect(result).toContain('db migrate');
    expect(result).toHaveLength(3);
  });

  it('deduplicates overlapping gates', () => {
    const result = mergeGates(['git push', 'rm -rf'], ['git push', 'deploy']);
    expect(result).toHaveLength(3);
    expect(result).toContain('git push');
    expect(result).toContain('rm -rf');
    expect(result).toContain('deploy');
  });

  it('handles empty global gates with workspace gates', () => {
    const result = mergeGates([], ['deploy']);
    expect(result).toEqual(['deploy']);
  });

  it('handles both empty', () => {
    expect(mergeGates([], [])).toEqual([]);
  });
});

// ── Component exports ───────────────────────────────────────────────

describe('Settings component exports', () => {
  it('exports SettingsPanel as a function', () => {
    expect(typeof SettingsPanel).toBe('function');
  });

  it('exports ModelsSection as a function', () => {
    expect(typeof ModelsSection).toBe('function');
  });

  it('exports VaultSection as a function', () => {
    expect(typeof VaultSection).toBe('function');
  });

  it('exports ModelSection as a function', () => {
    expect(typeof ModelSection).toBe('function');
  });

  it('exports PermissionSection as a function', () => {
    expect(typeof PermissionSection).toBe('function');
  });

  it('exports ThemeSection as a function', () => {
    expect(typeof ThemeSection).toBe('function');
  });

  it('exports AdvancedSection as a function', () => {
    expect(typeof AdvancedSection).toBe('function');
  });

  it('exports maskApiKey as a function', () => {
    expect(typeof maskApiKey).toBe('function');
  });

  it('exports validateProviderConfig as a function', () => {
    expect(typeof validateProviderConfig).toBe('function');
  });
});
