/**
 * Shared provider metadata for:
 *  - OnboardingWizard (step 5)
 *  - SettingsApp → Models tab
 *  - VaultApp → API key management
 *  - Adapter → key validation
 *
 * Model inventories are deliberately not stored here. The server fetches them
 * from each configured provider's model API and exposes the live catalog.
 *
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
  { id: 'anthropic', name: 'Anthropic', keyPrefix: 'sk-ant-', keyUrl: 'https://console.anthropic.com/settings/keys', badge: null, requiresKey: true, models: [] },
  { id: 'openai', name: 'OpenAI', keyPrefix: 'sk-', keyUrl: 'https://platform.openai.com/api-keys', badge: null, requiresKey: true, models: [] },
  { id: 'google', name: 'Google', keyPrefix: null, keyUrl: 'https://aistudio.google.com/apikey', badge: null, requiresKey: true, models: [] },
  { id: 'mistral', name: 'Mistral', keyPrefix: null, keyUrl: 'https://console.mistral.ai/api-keys', badge: null, requiresKey: true, models: [] },
  { id: 'deepseek', name: 'DeepSeek', keyPrefix: null, keyUrl: 'https://platform.deepseek.com/api_keys', badge: null, requiresKey: true, models: [] },
  { id: 'xai', name: 'xAI', keyPrefix: null, keyUrl: 'https://console.x.ai/', badge: null, requiresKey: true, models: [] },
  { id: 'alibaba', name: 'Alibaba / Qwen', keyPrefix: null, keyUrl: 'https://dashscope.console.aliyun.com/apiKey', badge: null, requiresKey: true, models: [] },
  { id: 'minimax', name: 'MiniMax', keyPrefix: null, keyUrl: 'https://www.minimaxi.com/platform', badge: null, requiresKey: true, models: [] },
  { id: 'zhipu', name: 'GLM / Zhipu', keyPrefix: null, keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys', badge: null, requiresKey: true, models: [] },
  { id: 'moonshot', name: 'Kimi / Moonshot', keyPrefix: null, keyUrl: 'https://platform.moonshot.cn/console/api-keys', badge: null, requiresKey: true, models: [] },
  { id: 'perplexity', name: 'Perplexity', keyPrefix: 'pplx-', keyUrl: 'https://www.perplexity.ai/settings/api', badge: 'Search + LLM', requiresKey: true, models: [] },
  { id: 'openrouter', name: 'OpenRouter', keyPrefix: 'sk-or-', keyUrl: 'https://openrouter.ai/keys', badge: 'Provider catalog', requiresKey: true, models: [] },
  { id: 'ollama', name: 'Local / Ollama', keyPrefix: null, keyUrl: 'https://ollama.ai/download', badge: 'No key needed', requiresKey: false, models: [] },
];

/** Runtime-mutable provider list (built-in + user-added) */
let _providers: ProviderConfig[] = [...BUILT_IN_PROVIDERS];

/** Custom providers added by user, persisted to localStorage */
const CUSTOM_PROVIDERS_KEY = 'waggle:custom-providers';

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

