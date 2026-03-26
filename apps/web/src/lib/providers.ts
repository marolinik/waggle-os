/**
 * Shared provider & model registry — single source of truth for:
 *  - OnboardingWizard (step 5)
 *  - SettingsApp → Models tab
 *  - VaultApp → API key management
 *  - Adapter → key validation
 *
 * Users can add custom providers at runtime via addProvider().
 */

export interface ProviderModel {
  id: string;
  name: string;
  cost: '$' | '$$' | '$$$';
  speed: 'fast' | 'medium' | 'slow';
}

export interface ProviderConfig {
  id: string;
  name: string;
  keyPrefix: string | null;
  keyUrl: string | null;
  badge: string | null;
  models: ProviderModel[];
  requiresKey: boolean;
}

const BUILT_IN_PROVIDERS: ProviderConfig[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    keyPrefix: 'sk-ant-',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    badge: null,
    requiresKey: true,
    models: [
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', cost: '$$$', speed: 'slow' },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', cost: '$$', speed: 'medium' },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', cost: '$', speed: 'fast' },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    keyPrefix: 'sk-',
    keyUrl: 'https://platform.openai.com/api-keys',
    badge: null,
    requiresKey: true,
    models: [
      { id: 'gpt-5.4', name: 'GPT-5.4', cost: '$$$', speed: 'medium' },
      { id: 'gpt-4o', name: 'GPT-4o', cost: '$$', speed: 'fast' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', cost: '$', speed: 'fast' },
      { id: 'o3', name: 'o3', cost: '$$$', speed: 'slow' },
      { id: 'o3-mini', name: 'o3-mini', cost: '$$', speed: 'medium' },
    ],
  },
  {
    id: 'google',
    name: 'Google',
    keyPrefix: null,
    keyUrl: 'https://aistudio.google.com/apikey',
    badge: null,
    requiresKey: true,
    models: [
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', cost: '$$$', speed: 'medium' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', cost: '$', speed: 'fast' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', cost: '$$', speed: 'medium' },
    ],
  },
  {
    id: 'mistral',
    name: 'Mistral',
    keyPrefix: null,
    keyUrl: 'https://console.mistral.ai/api-keys',
    badge: null,
    requiresKey: true,
    models: [
      { id: 'mistral-large-latest', name: 'Mistral Large', cost: '$$', speed: 'medium' },
      { id: 'mistral-small-latest', name: 'Mistral Small', cost: '$', speed: 'fast' },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    keyPrefix: null,
    keyUrl: 'https://platform.deepseek.com/api_keys',
    badge: null,
    requiresKey: true,
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat', cost: '$', speed: 'fast' },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', cost: '$$', speed: 'slow' },
    ],
  },
  {
    id: 'xai',
    name: 'xAI',
    keyPrefix: null,
    keyUrl: 'https://console.x.ai/',
    badge: null,
    requiresKey: true,
    models: [
      { id: 'grok-3', name: 'Grok 3', cost: '$$', speed: 'medium' },
      { id: 'grok-3-mini', name: 'Grok 3 Mini', cost: '$', speed: 'fast' },
    ],
  },
  {
    id: 'alibaba',
    name: 'Alibaba / Qwen',
    keyPrefix: null,
    keyUrl: 'https://dashscope.console.aliyun.com/apiKey',
    badge: null,
    requiresKey: true,
    models: [
      { id: 'qwen-max', name: 'Qwen Max', cost: '$$', speed: 'medium' },
      { id: 'qwen-plus', name: 'Qwen Plus', cost: '$', speed: 'fast' },
      { id: 'qwen-turbo', name: 'Qwen Turbo', cost: '$', speed: 'fast' },
    ],
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    keyPrefix: null,
    keyUrl: 'https://www.minimaxi.com/platform',
    badge: null,
    requiresKey: true,
    models: [
      { id: 'minimax-01', name: 'MiniMax-01', cost: '$$', speed: 'medium' },
    ],
  },
  {
    id: 'zhipu',
    name: 'GLM / Zhipu',
    keyPrefix: null,
    keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    badge: null,
    requiresKey: true,
    models: [
      { id: 'glm-5', name: 'GLM-5', cost: '$$', speed: 'medium' },
      { id: 'glm-4-plus', name: 'GLM-4 Plus', cost: '$', speed: 'fast' },
    ],
  },
  {
    id: 'moonshot',
    name: 'Kimi / Moonshot',
    keyPrefix: null,
    keyUrl: 'https://platform.moonshot.cn/console/api-keys',
    badge: null,
    requiresKey: true,
    models: [
      { id: 'kimi-2.5', name: 'Kimi 2.5', cost: '$$', speed: 'medium' },
      { id: 'kimi-2.5-thinking', name: 'Kimi 2.5 Thinking', cost: '$$', speed: 'slow' },
    ],
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    keyPrefix: 'pplx-',
    keyUrl: 'https://www.perplexity.ai/settings/api',
    badge: 'Search + LLM',
    requiresKey: true,
    models: [
      { id: 'sonar-pro', name: 'Sonar Pro', cost: '$$', speed: 'medium' },
      { id: 'sonar', name: 'Sonar', cost: '$', speed: 'fast' },
    ],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    keyPrefix: 'sk-or-',
    keyUrl: 'https://openrouter.ai/keys',
    badge: 'Free models!',
    requiresKey: true,
    models: [
      { id: 'openrouter/auto', name: 'Auto (best available)', cost: '$$', speed: 'medium' },
    ],
  },
  {
    id: 'ollama',
    name: 'Local / Ollama',
    keyPrefix: null,
    keyUrl: 'https://ollama.ai/download',
    badge: 'No key needed',
    requiresKey: false,
    models: [],
  },
];

/** Runtime-mutable provider list (built-in + user-added) */
let _providers: ProviderConfig[] = [...BUILT_IN_PROVIDERS];

/** Custom providers added by user, persisted to localStorage */
const CUSTOM_PROVIDERS_KEY = 'waggle_custom_providers';

function loadCustomProviders(): ProviderConfig[] {
  try {
    const raw = localStorage.getItem(CUSTOM_PROVIDERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveCustomProviders(customs: ProviderConfig[]) {
  localStorage.setItem(CUSTOM_PROVIDERS_KEY, JSON.stringify(customs));
}

// Load custom providers on init
try {
  const customs = loadCustomProviders();
  for (const p of customs) {
    if (!_providers.find(bp => bp.id === p.id)) {
      _providers.push(p);
    }
  }
} catch { /* ignore in SSR/test */ }

/** Get all providers (built-in + custom) */
export function getProviders(): ProviderConfig[] {
  return _providers;
}

/** Get a provider by ID */
export function getProvider(id: string): ProviderConfig | undefined {
  return _providers.find(p => p.id === id);
}

/** Add a custom provider (persisted to localStorage) */
export function addProvider(provider: ProviderConfig): void {
  if (_providers.find(p => p.id === provider.id)) return;
  _providers.push(provider);
  const customs = loadCustomProviders();
  customs.push(provider);
  saveCustomProviders(customs);
}

/** Remove a custom provider */
export function removeProvider(id: string): void {
  // Don't remove built-in providers
  if (BUILT_IN_PROVIDERS.find(p => p.id === id)) return;
  _providers = _providers.filter(p => p.id !== id);
  const customs = loadCustomProviders().filter(p => p.id !== id);
  saveCustomProviders(customs);
}

/** Get all models across all providers (flat list) */
export function getAllModels(): (ProviderModel & { provider: string })[] {
  return _providers.flatMap(p =>
    p.models.map(m => ({ ...m, provider: p.id }))
  );
}

/** Get cost tier from model name (fallback for unknown models) */
export function getCostTier(model: string): '$' | '$$' | '$$$' {
  const m = model.toLowerCase();
  if (m.includes('opus') || m.includes('gpt-5') || m.includes('o3') && !m.includes('mini')) return '$$$';
  if (m.includes('haiku') || m.includes('mini') || m.includes('flash') || m.includes('turbo')) return '$';
  return '$$';
}

/** Get speed tier from model name (fallback for unknown models) */
export function getSpeedTier(model: string): 'fast' | 'medium' | 'slow' {
  const m = model.toLowerCase();
  if (m.includes('haiku') || m.includes('mini') || m.includes('flash') || m.includes('turbo')) return 'fast';
  if (m.includes('opus') || m.includes('reasoner') || m.includes('o3') && !m.includes('mini')) return 'slow';
  return 'medium';
}

/** Mask an API key for display (first 7 + ... + last 4) */
export function maskApiKey(key: string): string {
  if (!key || key.length < 12) return '••••••••';
  return key.slice(0, 7) + '...' + key.slice(-4);
}
