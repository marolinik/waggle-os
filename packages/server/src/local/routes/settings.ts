import fs from 'node:fs';
import path from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import { WaggleConfig } from '@waggle/core';

function maskApiKey(key: string): string {
  if (!key || key.length < 8) return '****';
  return key.slice(0, 7) + '...' + key.slice(-4);
}

export const settingsRoutes: FastifyPluginAsync = async (server) => {
  // GET /api/settings — read config (keys from vault, metadata from vault+config)
  server.get('/api/settings', async () => {
    const config = new WaggleConfig(server.localConfig.dataDir);

    // Build providers response from vault (encrypted) with config fallback
    const providers: Record<string, { apiKey: string; models: string[]; baseUrl?: string }> = {};

    if (server.vault) {
      const vaultEntries = server.vault.list();
      for (const entry of vaultEntries) {
        const full = server.vault.get(entry.name);
        if (full) {
          providers[entry.name] = {
            apiKey: maskApiKey(full.value),
            models: (full.metadata?.models as string[]) ?? [],
            baseUrl: full.metadata?.baseUrl as string | undefined,
          };
        }
      }
    }

    // Fallback: merge any config.json providers not in vault (backward compat)
    const configProviders = config.getProviders();
    for (const [name, entry] of Object.entries(configProviders)) {
      if (!providers[name]) {
        providers[name] = { ...entry, apiKey: maskApiKey(entry.apiKey) };
      }
    }

    // BUG-R3-02: Include onboarding state in settings response
    let onboardingCompleted = false;
    try {
      const configPath = path.join(server.localConfig.dataDir, 'config.json');
      if (fs.existsSync(configPath)) {
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        onboardingCompleted = raw.onboardingCompleted === true;
      }
    } catch { /* ignore */ }
    return {
      defaultModel: config.getDefaultModel(),
      providers,
      mindPath: config.getMindPath(),
      dataDir: server.localConfig.dataDir,
      litellmUrl: server.localConfig.litellmUrl,
      dailyBudget: config.getDailyBudget(),
      onboardingCompleted,
    };
  });

  // PUT /api/settings — update config (keys to vault, non-secret fields to config.json)
  server.put<{
    Body: { defaultModel?: string; providers?: Record<string, unknown>; dailyBudget?: number | null };
  }>('/api/settings', async (request) => {
    const config = new WaggleConfig(server.localConfig.dataDir);
    const { defaultModel, providers, dailyBudget } = request.body;

    if (defaultModel) {
      config.setDefaultModel(defaultModel);
    }

    // F8: Update daily cost budget
    if (dailyBudget !== undefined) {
      config.setDailyBudget(dailyBudget);
    }

    if (providers && typeof providers === 'object') {
      for (const [name, entry] of Object.entries(providers)) {
        const { apiKey, models, baseUrl } = entry as { apiKey?: string; models?: string[]; baseUrl?: string };

        // Save secret to vault (encrypted)
        if (apiKey && server.vault) {
          server.vault.set(name, apiKey, { models, baseUrl });
        }

        // Also keep in config.json for backward compat (non-secret fields)
        config.setProvider(name, entry as { apiKey: string; models: string[] });
      }
    }

    config.save();

    // Return providers from vault (same as GET)
    const responseProviders: Record<string, { apiKey: string; models: string[]; baseUrl?: string }> = {};
    if (server.vault) {
      const vaultEntries = server.vault.list();
      for (const vEntry of vaultEntries) {
        const full = server.vault.get(vEntry.name);
        if (full) {
          responseProviders[vEntry.name] = {
            apiKey: maskApiKey(full.value),
            models: (full.metadata?.models as string[]) ?? [],
            baseUrl: full.metadata?.baseUrl as string | undefined,
          };
        }
      }
    }
    // Fallback for any providers not in vault
    const configProviders = config.getProviders();
    for (const [name, entry] of Object.entries(configProviders)) {
      if (!responseProviders[name]) {
        responseProviders[name] = { ...entry, apiKey: maskApiKey(entry.apiKey) };
      }
    }

    return {
      defaultModel: config.getDefaultModel(),
      providers: responseProviders,
      mindPath: config.getMindPath(),
    };
  });

  // PATCH /api/settings — partial update for non-provider settings (onboarding, preferences)
  server.patch<{
    Body: { onboardingCompleted?: boolean; [key: string]: unknown };
  }>('/api/settings', async (request) => {
    const configPath = path.join(server.localConfig.dataDir, 'config.json');
    let raw: Record<string, unknown> = {};
    try {
      if (fs.existsSync(configPath)) {
        raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      }
    } catch { /* fresh config */ }
    const { onboardingCompleted, ...rest } = request.body ?? {};
    if (onboardingCompleted !== undefined) raw.onboardingCompleted = onboardingCompleted;
    // Merge any other simple fields
    Object.assign(raw, rest);
    fs.writeFileSync(configPath, JSON.stringify(raw, null, 2), 'utf-8');
    return { updated: true, onboardingCompleted: raw.onboardingCompleted };
  });

  // POST /api/settings/test-key — test an API key by validating its format
  server.post<{
    Body: { provider: string; apiKey: string };
  }>('/api/settings/test-key', async (request, reply) => {
    const { provider, apiKey } = request.body ?? {};

    if (!provider || !apiKey) {
      return reply.status(400).send({ error: 'provider and apiKey are required' });
    }

    // Validate key format per provider
    const result = validateApiKeyFormat(provider, apiKey);
    return result;
  });

  // ── Permission settings ─────────────────────────────────────────────

  const DEFAULTS: PermissionsData = {
    yoloMode: false,
    externalGates: [],
    workspaceOverrides: {},
  };

  function getPermissionsPath(): string {
    return path.join(server.localConfig.dataDir, 'permissions.json');
  }

  function readPermissions(): PermissionsData {
    const filePath = getPermissionsPath();
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          yoloMode: parsed.yoloMode ?? DEFAULTS.yoloMode,
          externalGates: parsed.externalGates ?? DEFAULTS.externalGates,
          workspaceOverrides: parsed.workspaceOverrides ?? DEFAULTS.workspaceOverrides,
        };
      }
    } catch {
      // Corrupted file — return defaults
    }
    return { ...DEFAULTS };
  }

  function writePermissions(data: PermissionsData): void {
    const filePath = getPermissionsPath();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  // GET /api/settings/permissions — read permission settings
  server.get('/api/settings/permissions', async () => {
    return readPermissions();
  });

  // PUT /api/settings/permissions — save permission settings
  server.put<{
    Body: { yoloMode?: boolean; externalGates?: string[]; workspaceOverrides?: Record<string, string[]> };
  }>('/api/settings/permissions', async (request) => {
    const { yoloMode, externalGates, workspaceOverrides } = request.body ?? {};
    const current = readPermissions();

    const updated: PermissionsData = {
      yoloMode: yoloMode ?? current.yoloMode,
      externalGates: externalGates ?? current.externalGates,
      workspaceOverrides: workspaceOverrides ?? current.workspaceOverrides,
    };

    writePermissions(updated);
    return updated;
  });

  // ── Tier detection (MOCK) ────────────────────────────────────────────
  // MOCK: Remove when real tier/billing system is integrated.
  // Tier is read from config.json → tier field (defaults to 'solo').
  // Supported values: 'solo' | 'teams' | 'business' | 'enterprise'

  type Tier = 'solo' | 'teams' | 'business' | 'enterprise';

  function getTierLimits(tier: Tier) {
    return {
      maxWorkspaces: tier === 'solo' ? 5 : tier === 'teams' ? 25 : tier === 'business' ? 100 : -1,
      maxSessions: tier === 'solo' ? 3 : tier === 'teams' ? 10 : tier === 'business' ? 25 : -1,
      maxMembers: tier === 'solo' ? 1 : tier === 'teams' ? 10 : tier === 'business' ? 50 : -1,
      features: {
        teams: tier !== 'solo',
        marketplace: tier !== 'solo',
        budgetControls: tier === 'business' || tier === 'enterprise',
        kvark: tier === 'enterprise',
        governance: tier === 'enterprise',
        customModels: tier !== 'solo',
      },
    };
  }

  function readTier(dataDir: string): Tier {
    try {
      const configPath = path.join(dataDir, 'config.json');
      if (fs.existsSync(configPath)) {
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const t = raw.tier as string;
        if (t === 'solo' || t === 'teams' || t === 'business' || t === 'enterprise') return t;
      }
    } catch { /* ignore */ }
    return 'solo';
  }

  // GET /api/tier — return current tier and feature limits
  server.get('/api/tier', async () => {
    const tier = readTier(server.localConfig.dataDir);
    return { tier, limits: getTierLimits(tier) };
  });

  // PATCH /api/tier — change tier for testing
  // MOCK: In production, tier changes are managed by the billing system.
  server.patch<{
    Body: { tier: string };
  }>('/api/tier', async (request, reply) => {
    const { tier } = request.body ?? {};
    const valid: Tier[] = ['solo', 'teams', 'business', 'enterprise'];
    if (!valid.includes(tier as Tier)) {
      return reply.status(400).send({ error: `Invalid tier. Must be one of: ${valid.join(', ')}` });
    }

    const configPath = path.join(server.localConfig.dataDir, 'config.json');
    let raw: Record<string, unknown> = {};
    try {
      if (fs.existsSync(configPath)) {
        raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      }
    } catch { /* fresh */ }

    raw.tier = tier;
    fs.writeFileSync(configPath, JSON.stringify(raw, null, 2), 'utf-8');

    const newTier = tier as Tier;
    return { tier: newTier, limits: getTierLimits(newTier), updated: true };
  });
};

interface PermissionsData {
  yoloMode: boolean;
  externalGates: string[];
  workspaceOverrides: Record<string, string[]>;
}

/**
 * Validate API key format without making real API calls.
 * In production, actual validation would go through LiteLLM.
 */
function validateApiKeyFormat(provider: string, apiKey: string): { valid: boolean; error?: string } {
  switch (provider.toLowerCase()) {
    case 'openai':
      if (!apiKey.startsWith('sk-')) {
        return { valid: false, error: 'OpenAI keys must start with "sk-"' };
      }
      if (apiKey.length < 20) {
        return { valid: false, error: 'API key is too short' };
      }
      return { valid: true };

    case 'anthropic':
      if (!apiKey.startsWith('sk-ant-')) {
        return { valid: false, error: 'Anthropic keys must start with "sk-ant-"' };
      }
      if (apiKey.length < 20) {
        return { valid: false, error: 'API key is too short' };
      }
      return { valid: true };

    case 'google':
    case 'gemini':
      if (apiKey.length < 10) {
        return { valid: false, error: 'API key is too short' };
      }
      return { valid: true };

    default:
      // For unknown providers, just check it's non-empty and reasonable length
      if (apiKey.length < 8) {
        return { valid: false, error: 'API key is too short' };
      }
      return { valid: true };
  }
}
