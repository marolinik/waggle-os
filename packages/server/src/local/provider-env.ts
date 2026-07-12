import { WaggleConfig, type VaultStore } from '@waggle/core';

/** Provider credentials consumed by LiteLLM and provider SDKs. */
export const PROVIDER_ENV_NAMES: Record<string, readonly string[]> = {
  anthropic: ['ANTHROPIC_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  google: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  xai: ['XAI_API_KEY'],
  deepseek: ['DEEPSEEK_API_KEY'],
  mistral: ['MISTRAL_API_KEY'],
  alibaba: ['DASHSCOPE_API_KEY'],
  minimax: ['MINIMAX_API_KEY'],
  zhipu: ['ZHIPU_API_KEY'],
  moonshot: ['MOONSHOT_API_KEY'],
  perplexity: ['PERPLEXITY_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY'],
};

export function applyProviderKeyToEnv(
  providerId: string,
  apiKey: string,
  overwrite = true,
): number {
  const envNames = PROVIDER_ENV_NAMES[providerId] ?? [];
  let updated = 0;
  for (const envName of envNames) {
    if (!overwrite && process.env[envName]) continue;
    if (process.env[envName] === apiKey) continue;
    process.env[envName] = apiKey;
    updated += 1;
  }
  return updated;
}

export function getProviderApiKey(providerId: string, vault: VaultStore): string | undefined {
  const vaultKey = vault.get(providerId)?.value;
  if (vaultKey) return vaultKey;
  return PROVIDER_ENV_NAMES[providerId]
    ?.map((envName) => process.env[envName])
    .find((value): value is string => Boolean(value));
}

/** Hydrate provider SDK/LiteLLM env before a child process snapshots it. */
export function hydrateProviderEnvFromVault(vault: VaultStore, overwrite = false): number {
  let updated = 0;
  for (const providerId of Object.keys(PROVIDER_ENV_NAMES)) {
    const entry = vault.get(providerId);
    if (!entry?.value) continue;
    updated += applyProviderKeyToEnv(providerId, entry.value, overwrite);
  }
  return updated;
}

/** Move legacy config.json secrets before LiteLLM starts, then scrub plaintext. */
export function migrateLegacyProviderKeysToVault(dataDir: string, vault: VaultStore): number {
  const config = new WaggleConfig(dataDir);
  const providers = config.getProviders();
  const migrated = vault.migrateFromConfig({ providers });
  let scrubbed = 0;

  for (const [providerId, provider] of Object.entries(providers)) {
    if (!provider.apiKey) continue;
    config.setProvider(providerId, { ...provider, apiKey: '' });
    scrubbed += 1;
  }
  if (scrubbed > 0) config.save();
  return migrated;
}
