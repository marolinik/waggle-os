import fs from 'node:fs';
import path from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import { WaggleConfig } from '@waggle/core';
import { type Tier, TIERS, TIER_CAPABILITIES, parseTier, getCapabilities, getEffectiveTier, trialDaysRemaining } from '@waggle/shared';
import { requireTier } from '../../middleware/assert-tier.js';

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
      fallbackModel: config.getFallbackModel(),
      budgetModel: config.getBudgetModel(),
      budgetThreshold: config.getBudgetThreshold(),
      providers,
      mindPath: config.getMindPath(),
      dataDir: server.localConfig.dataDir,
      litellmUrl: server.localConfig.litellmUrl,
      dailyBudget: config.getDailyBudget(),
      budgetHardCap: config.getBudgetHardCap(),
      onboardingCompleted,
    };
  });

  // PUT /api/settings — update config (keys to vault, non-secret fields to config.json)
  server.put<{
    Body: {
      defaultModel?: string;
      providers?: Record<string, unknown>;
      dailyBudget?: number | null;
      budgetHardCap?: boolean;
      fallbackModel?: string | null;
      budgetModel?: string | null;
      budgetThreshold?: number;
    };
  }>('/api/settings', async (request) => {
    const config = new WaggleConfig(server.localConfig.dataDir);
    const { defaultModel, providers, dailyBudget, budgetHardCap, fallbackModel, budgetModel, budgetThreshold } = request.body;

    if (defaultModel) {
      config.setDefaultModel(defaultModel);
    }

    // F8: Update daily cost budget
    if (dailyBudget !== undefined) {
      config.setDailyBudget(dailyBudget);
    }
    if (budgetHardCap !== undefined) {
      config.setBudgetHardCap(budgetHardCap);
      server.agentState.costTracker.setBudget(
        config.getDailyBudget(),
        budgetHardCap ? 'hard' : 'soft',
      );
    }

    // Model Pilot fields
    if (fallbackModel !== undefined) {
      if (fallbackModel === null) {
        config.clearFallbackModel();
      } else {
        config.setFallbackModel(fallbackModel);
      }
    }
    if (budgetModel !== undefined) {
      if (budgetModel === null) {
        config.clearBudgetModel();
      } else {
        config.setBudgetModel(budgetModel);
      }
    }
    if (budgetThreshold !== undefined) {
      config.setBudgetThreshold(budgetThreshold);
    }

    if (providers && typeof providers === 'object') {
      for (const [name, entry] of Object.entries(providers)) {
        const { apiKey, models, baseUrl } = entry as { apiKey?: string; models?: string[]; baseUrl?: string };

        // Save secret to vault (encrypted)
        if (apiKey && server.vault) {
          server.vault.set(name, apiKey, { models, baseUrl });
          // Invalidate health check key cache so next /health re-validates
          if (typeof (server as any)._invalidateKeyValidationCache === 'function') {
            (server as any)._invalidateKeyValidationCache();
          }
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

  // ── Tier detection ───────────────────────────────────────────────────
  // Tier is read from config.json → tier field (defaults to SOLO).
  // Canonical values: SOLO | BASIC | TEAMS | ENTERPRISE (from @waggle/shared)
  // Legacy lowercase names are auto-migrated via parseTier().
  // Will be replaced by Stripe webhook in Prompt 04.

  function readTierConfig(dataDir: string): { tier: Tier; trialStartedAt: string | null } {
    try {
      const configPath = path.join(dataDir, 'config.json');
      if (fs.existsSync(configPath)) {
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const parsed = parseTier(String(raw.tier ?? ''));
        if (parsed) return { tier: parsed, trialStartedAt: raw.trialStartedAt ?? null };
      }
    } catch { /* ignore */ }
    return { tier: 'FREE', trialStartedAt: null };
  }

  // GET /api/tier — authoritative tier source for frontend
  server.get('/api/tier', async () => {
    const { tier: rawTier, trialStartedAt } = readTierConfig(server.localConfig.dataDir);
    const tier = getEffectiveTier(rawTier, trialStartedAt);
    const caps = getCapabilities(tier);
    const daysRemaining = trialDaysRemaining(trialStartedAt);
    // Usage counts for limit display
    const workspaceCount = server.workspaceManager?.list().length ?? 0;
    return {
      tier,
      rawTier,
      trialStartedAt,
      trialDaysRemaining: daysRemaining,
      trialExpired: rawTier === 'TRIAL' && tier === 'FREE',
      capabilities: caps,
      teamsServerUrl: process.env.DATABASE_URL
        ? `http://127.0.0.1:${process.env.TEAMS_SERVER_PORT ?? '3101'}`
        : null,
      teamsServerAvailable: !!process.env.DATABASE_URL,
      usage: {
        workspaceCount,
      },
      // Legacy shape — kept for backward compatibility with existing frontend
      limits: {
        maxWorkspaces: caps.workspaceLimit,
        maxSessions: tier === 'FREE' ? 3 : tier === 'PRO' ? 10 : 25,
        maxMembers: caps.teamMembersLimit,
        features: {
          teams: caps.sharedWorkspaces,
          marketplace: tier !== 'FREE',
          budgetControls: caps.adminPanel,
          kvark: tier === 'ENTERPRISE',
          governance: tier === 'ENTERPRISE',
          customModels: tier !== 'FREE',
        },
      },
    };
  });

  // PATCH /api/tier — change tier (testing/dev — will be replaced by Stripe webhook)
  server.patch<{
    Body: { tier: string };
  }>('/api/tier', async (request, reply) => {
    const { tier: tierRaw } = request.body ?? {};
    const parsed = parseTier(String(tierRaw ?? ''));
    if (!parsed) {
      return reply.status(400).send({ error: `Invalid tier. Must be one of: ${TIERS.join(', ')}` });
    }

    const configPath = path.join(server.localConfig.dataDir, 'config.json');
    let raw: Record<string, unknown> = {};
    try {
      if (fs.existsSync(configPath)) {
        raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      }
    } catch { /* fresh */ }

    raw.tier = parsed;
    fs.writeFileSync(configPath, JSON.stringify(raw, null, 2), 'utf-8');

    return { tier: parsed, capabilities: getCapabilities(parsed), updated: true };
  });

  // ── Cloud Sync ────────────────────────────────────────────────────

  server.get('/api/cloud-sync', async () => {
    const { tier } = readTierConfig(server.localConfig.dataDir);
    const caps = getCapabilities(tier);
    const configPath = path.join(server.localConfig.dataDir, 'config.json');
    let raw: Record<string, unknown> = {};
    try { if (fs.existsSync(configPath)) raw = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch { /* */ }
    return {
      available: caps.cloudSync,
      enabled: raw.cloudSyncEnabled === true,
      tier,
      teamServerUrl: (raw.teamServer as Record<string, unknown>)?.url ?? null,
      connected: !!((raw.teamServer as Record<string, unknown>)?.token),
    };
  });

  server.post<{ Body: { enabled: boolean } }>('/api/cloud-sync/toggle', { preHandler: [requireTier('TEAMS')] }, async (request, reply) => {
    const { enabled } = request.body ?? {};
    if (typeof enabled !== 'boolean') return reply.code(400).send({ error: 'enabled must be a boolean' });
    const configPath = path.join(server.localConfig.dataDir, 'config.json');
    let raw: Record<string, unknown> = {};
    try { if (fs.existsSync(configPath)) raw = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch { /* */ }
    raw.cloudSyncEnabled = enabled;
    fs.writeFileSync(configPath, JSON.stringify(raw, null, 2), 'utf-8');
    return { ok: true, enabled };
  });

  // ── Admin Overview ────────────────────────────────────────────────

  server.get('/api/admin/overview', { preHandler: [requireTier('TEAMS')] }, async () => {
    const workspaces = server.workspaceManager?.list() ?? [];
    return {
      usage: { totalInputTokens: 0, totalOutputTokens: 0 },
      workspaces: workspaces.map((w: { id?: string; name: string; teamId?: string }) => ({
        id: w.id ?? w.name,
        name: w.name,
        hasTeam: !!(w.teamId),
      })),
      connectors: [],
      plugins: server.agentState?.pluginRuntimeManager?.getActive()?.map((p: { getManifest: () => { name: string; version: string }; getContributedTools: () => unknown[] }) => ({
        name: p.getManifest().name,
        version: p.getManifest().version,
        tools: p.getContributedTools().length,
      })) ?? [],
      generatedAt: new Date().toISOString(),
    };
  });

  // GET /api/admin/audit-export — download audit log as JSON or CSV
  server.get<{
    Querystring: { from?: string; to?: string; format?: 'json' | 'csv' };
  }>('/api/admin/audit-export', { preHandler: [requireTier('TEAMS')] }, async (request, reply) => {
    const { from, to, format = 'json' } = request.query;
    const auditStore = (server as any).installAuditStore;
    if (!auditStore?.getAll) {
      return reply.code(503).send({ error: 'Audit store not available' });
    }
    const records = auditStore.getAll() as Array<Record<string, string>>;
    const filtered = records.filter((r) => {
      if (from && (r.timestamp ?? '') < from) return false;
      if (to && (r.timestamp ?? '') > to) return false;
      return true;
    });
    if (format === 'csv') {
      const header = 'timestamp,capability_name,capability_type,source,risk_level,action,initiator\n';
      const rows = filtered.map(r =>
        [r.timestamp, r.capability_name, r.capability_type, r.source, r.risk_level, r.action, r.initiator]
          .map(v => `"${v ?? ''}"`)
          .join(',')
      ).join('\n');
      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', 'attachment; filename="audit-export.csv"');
      return reply.send(header + rows);
    }
    return { records: filtered, total: filtered.length, exportedAt: new Date().toISOString() };
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
