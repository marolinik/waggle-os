/**
 * Settings utility functions and constants.
 */

// ── Provider Definitions ────────────────────────────────────────────

export interface ModelInfo {
  id: string;         // API model ID sent to the provider
  displayName: string; // Human-friendly name shown in UI
}

export interface ProviderConfig {
  id: string;
  name: string;
  keyPrefix: string | null;
  models: ModelInfo[];
}

export const SUPPORTED_PROVIDERS: ProviderConfig[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    keyPrefix: 'sk-ant-',
    models: [
      { id: 'claude-opus-4-6', displayName: 'Claude Opus 4.6' },
      { id: 'claude-sonnet-4-6', displayName: 'Claude Sonnet 4.6' },
      { id: 'claude-haiku-4-5', displayName: 'Claude Haiku 4.5' },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    keyPrefix: 'sk-',
    models: [
      { id: 'gpt-5.4', displayName: 'GPT-5.4' },
      { id: 'gpt-4.1', displayName: 'GPT-4.1' },
      { id: 'gpt-4.1-mini', displayName: 'GPT-4.1 Mini' },
      { id: 'gpt-4.1-nano', displayName: 'GPT-4.1 Nano' },
      { id: 'o4-mini', displayName: 'o4 Mini' },
      { id: 'o3', displayName: 'o3' },
    ],
  },
  {
    id: 'google',
    name: 'Google',
    keyPrefix: null,
    models: [
      { id: 'gemini-3.1-flash', displayName: 'Gemini 3.1 Flash' },
      { id: 'gemini-3.1-pro', displayName: 'Gemini 3.1 Pro' },
      { id: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro' },
    ],
  },
  {
    id: 'mistral',
    name: 'Mistral',
    keyPrefix: null,
    models: [
      { id: 'mistral-large-latest', displayName: 'Mistral Large' },
      { id: 'mistral-medium-latest', displayName: 'Mistral Medium' },
      { id: 'mistral-small-latest', displayName: 'Mistral Small' },
      { id: 'codestral-latest', displayName: 'Codestral' },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    keyPrefix: null,
    models: [
      { id: 'deepseek-chat', displayName: 'DeepSeek V3' },
      { id: 'deepseek-reasoner', displayName: 'DeepSeek R1' },
    ],
  },
  {
    id: 'xai',
    name: 'xAI',
    keyPrefix: null,
    models: [
      { id: 'grok-3', displayName: 'Grok 3' },
      { id: 'grok-3-mini', displayName: 'Grok 3 Mini' },
    ],
  },
  {
    id: 'alibaba',
    name: 'Alibaba Cloud',
    keyPrefix: null,
    models: [
      { id: 'qwen-max', displayName: 'Qwen 3.5' },
      { id: 'qwen-turbo', displayName: 'Qwen 3.5 Turbo' },
      { id: 'qwen-coder', displayName: 'Qwen 2.5 Coder' },
    ],
  },
  {
    id: 'zhipu',
    name: 'Zhipu AI',
    keyPrefix: null,
    models: [
      { id: 'glm-5', displayName: 'GLM-5' },
      { id: 'glm-4-plus', displayName: 'GLM-4 Plus' },
    ],
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    keyPrefix: null,
    models: [
      { id: 'minimax-2.7', displayName: 'MiniMax 2.7' },
      { id: 'minimax-2.7-lite', displayName: 'MiniMax 2.7 Lite' },
    ],
  },
  {
    id: 'moonshot',
    name: 'Moonshot AI',
    keyPrefix: null,
    models: [
      { id: 'kimi-2.5', displayName: 'Kimi 2.5' },
      { id: 'kimi-2.5-thinking', displayName: 'Kimi 2.5 Thinking' },
    ],
  },
  {
    id: 'zai',
    name: 'Z.AI',
    keyPrefix: null,
    models: [
      { id: 'z1-preview', displayName: 'Z1 Preview' },
      { id: 'z1-mini', displayName: 'Z1 Mini' },
    ],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    keyPrefix: 'sk-or-',
    models: [
      { id: 'openrouter/auto', displayName: 'Auto (best free)' },
      { id: 'meta-llama/llama-3.3-70b-instruct:free', displayName: 'Llama 3.3 70B (Free)' },
      { id: 'google/gemini-2.5-flash-preview:free', displayName: 'Gemini 2.5 Flash (Free)' },
      { id: 'deepseek/deepseek-chat-v3-0324:free', displayName: 'DeepSeek V3 (Free)' },
      { id: 'qwen/qwen-2.5-72b-instruct:free', displayName: 'Qwen 2.5 72B (Free)' },
    ],
  },
  {
    id: 'custom',
    name: 'Custom / Local (Ollama, LM Studio, etc.)',
    keyPrefix: null,
    models: [],
  },
];

// ── Tab Definitions ─────────────────────────────────────────────────

export interface SettingsTab {
  id: string;
  label: string;
}

// BUG-R2-03: Shortened labels prevent wrapping at 1024px
export const SETTINGS_TABS: SettingsTab[] = [
  { id: 'general', label: 'General' },
  { id: 'models', label: 'Models' },
  { id: 'vault', label: 'Keys & Connections' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'team', label: 'Team' },
  { id: 'backup', label: 'Backup' },
  { id: 'kvark', label: 'Enterprise' },
  { id: 'advanced', label: 'Advanced' },
];

// ── Utility Functions ───────────────────────────────────────────────

/**
 * Masks an API key, showing only the last 4 characters.
 * Keys of 4 characters or fewer are returned as-is.
 */
export function maskApiKey(key: string): string {
  if (key.length <= 4) return key;
  return '\u2022'.repeat(key.length - 4) + key.slice(-4);
}

/**
 * Returns a human-readable display name for a provider ID.
 */
export function getProviderDisplayName(provider: string): string {
  const found = SUPPORTED_PROVIDERS.find((p) => p.id === provider);
  return found ? found.name : provider;
}

/**
 * Returns the expected API key prefix for a provider, or null if none.
 */
export function getProviderKeyPrefix(provider: string): string | null {
  const found = SUPPORTED_PROVIDERS.find((p) => p.id === provider);
  return found ? found.keyPrefix : null;
}

// ── Model Classification ────────────────────────────────────────────

/**
 * Derive cost tier from model name patterns (no hardcoded map needed).
 */
export function getCostTier(model: string): '$' | '$$' | '$$$' {
  const m = model.toLowerCase();
  // Premium/flagship models (check first)
  if (m.includes('opus') || m.includes('gpt-5') || m.includes('o3') ||
      /\bpro\b/.test(m) || m.includes('large') || (m.includes('grok-3') && !/\bmini\b/.test(m))) return '$$$';
  // Budget/small models (word boundary for 'mini' to avoid matching 'gemini')
  if (m.includes('haiku') || m.includes('nano') || m.includes('small') ||
      /\bmini\b/.test(m) || m.includes('-mini') || m.includes('flash')) return '$';
  // Mid-tier default
  return '$$';
}

/**
 * Returns speed tier for a model name.
 */
/**
 * Derive speed tier from model name patterns.
 */
export function getSpeedTier(model: string): 'fast' | 'medium' | 'slow' {
  const m = model.toLowerCase();
  // Slow: premium/reasoning models (check first to avoid false positives)
  if (m.includes('opus') || m.includes('gpt-5') || m.includes('o3') ||
      m.includes('reasoner') || m.includes('large') ||
      /\bpro\b/.test(m)) return 'slow';
  // Fast: budget/small models (use word boundary for 'mini' to avoid matching 'gemini')
  if (m.includes('flash') || m.includes('haiku') || m.includes('nano') ||
      m.includes('small') || /\bmini\b/.test(m) || m.includes('-mini')) return 'fast';
  // Medium default
  return 'medium';
}

// ── Permission Gate Merging ─────────────────────────────────────────

/**
 * Merges global gates with optional workspace-specific gates.
 * Workspace gates extend the global set (union, deduplicated).
 */
export function mergeGates(globalGates: string[], workspaceGates?: string[]): string[] {
  if (!workspaceGates || workspaceGates.length === 0) return [...globalGates];
  const merged = new Set([...globalGates, ...workspaceGates]);
  return [...merged];
}

// ── Validation ──────────────────────────────────────────────────────

/**
 * Client-side validation for a provider API key before calling the API.
 */
export function validateProviderConfig(
  provider: string,
  apiKey: string,
): { valid: boolean; error?: string } {
  const trimmed = apiKey.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'API key cannot be empty' };
  }

  if (trimmed.length < 8) {
    return { valid: false, error: 'API key must be at least 8 characters' };
  }

  const prefix = getProviderKeyPrefix(provider);
  if (prefix && !trimmed.startsWith(prefix)) {
    return {
      valid: false,
      error: `${getProviderDisplayName(provider)} keys should start with ${prefix}`,
    };
  }

  return { valid: true };
}
