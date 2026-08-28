import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { WaggleConfig } from '@waggle/core';
import { type Tier, TIERS, TIER_CAPABILITIES, parseTier, getCapabilities, getEffectiveTier, trialDaysRemaining } from '@waggle/shared';
import type { AutonomyLevel } from '@waggle/agent';
import { requireTier } from '../../middleware/assert-tier.js';
import { validateBody } from '../../validate-body.js';
import { probeProviderKey, validateKeyFormat } from '../llm-key-probe.js';
import { resolveExplicitRoutableModel, resolveUsableModel } from '../model-availability.js';
import { discoverProviderModels } from '../provider-model-catalog.js';
import { maxWorkspaceSessionsForTier } from '../tier-session-cap.js';
import { applyProviderKeyToEnv } from '../provider-env.js';
import { refreshManagedLiteLLM, type LiteLLMRefreshResult } from '../litellm-runtime-config.js';

const VALID_AUTONOMY: AutonomyLevel[] = ['normal', 'trusted', 'yolo'];

/** PUT /api/settings body — config write. All fields optional (partial update);
 *  unknown keys are stripped. `providers` is a free-form map (per-provider
 *  secret + metadata) validated shallowly here and destructured in the handler. */
const settingsUpdateSchema = z.object({
  defaultModel: z.string().optional(),
  providers: z.record(z.string(), z.unknown()).optional(),
  dailyBudget: z.number().nonnegative().nullable().optional(),
  budgetHardCap: z.boolean().optional(),
  fallbackModel: z.string().nullable().optional(),
  budgetModel: z.string().nullable().optional(),
  budgetThreshold: z.number().optional(),
});

/** P4: migrate legacy `yoloMode: boolean` to the three-level enum. */
function coerceDefaultAutonomy(parsed: Record<string, unknown>): AutonomyLevel {
  const raw = parsed.defaultAutonomy;
  if (typeof raw === 'string' && (VALID_AUTONOMY as readonly string[]).includes(raw)) {
    return raw as AutonomyLevel;
  }
  // Legacy: yoloMode === true migrates to 'yolo', false to 'normal'.
  if (parsed.yoloMode === true) return 'yolo';
  return 'normal';
}

function maskApiKey(key: string): string {
  if (!key || key.length < 8) return '****';
  return key.slice(0, 7) + '...' + key.slice(-4);
}

function normalizeOpenAiCompatibleBaseUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password || url.search || url.hash) return null;
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function applyRuntimeTier(server: FastifyInstance, tier: Tier): void {
  server.localConfig.tier = tier;
  server.sessionManager?.setMaxSessions(maxWorkspaceSessionsForTier(tier));
}

export const settingsRoutes: FastifyPluginAsync = async (server) => {
  // GET /api/settings — read config (keys from vault, metadata from vault+config)
  server.get('/api/settings', async () => {
    const config = new WaggleConfig(server.localConfig.dataDir);
    const configProviders = config.getProviders();

    // Build providers response from vault (encrypted) with config fallback
    const providers: Record<string, { apiKey: string; models: string[]; baseUrl?: string }> = {};

    if (server.vault) {
      const vaultEntries = server.vault.list();
      for (const entry of vaultEntries) {
        const full = server.vault.get(entry.name);
        if (full) {
          providers[entry.name] = {
            apiKey: maskApiKey(full.value),
            models: (full.metadata?.models as string[]) ?? configProviders[entry.name]?.models ?? [],
            baseUrl: (full.metadata?.baseUrl as string | undefined) ?? configProviders[entry.name]?.baseUrl,
          };
        }
      }
    }

    // Fallback: merge any config.json providers not in vault (backward compat)
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
  }>('/api/settings', { preHandler: validateBody(settingsUpdateSchema) }, async (request, reply) => {
    const config = new WaggleConfig(server.localConfig.dataDir);
    const { defaultModel, providers, dailyBudget, budgetHardCap, fallbackModel, budgetModel, budgetThreshold } = request.body;
    let providerKeyChanged = false;

    const compatibleEntry = providers?.['openai-compatible'];
    if (compatibleEntry && typeof compatibleEntry === 'object') {
      const { baseUrl } = compatibleEntry as { baseUrl?: unknown };
      if (baseUrl !== undefined && (typeof baseUrl !== 'string' || normalizeOpenAiCompatibleBaseUrl(baseUrl) === null)) {
        return reply.code(400).send({
          error: 'OpenAI-compatible base URL must be an http(s) URL without credentials, query, or fragment.',
        });
      }
    }

    if (defaultModel) {
      config.setDefaultModel(defaultModel);
      // W2C: keep the in-memory runtime model in lockstep with the saved
      // default so the top-bar chip tracks a Settings save live (it used to
      // only change on restart, so Settings and the chip diverged until then).
      server.agentState.currentModel = defaultModel;
    }

    // F8: Update daily cost budget
    if (dailyBudget !== undefined) {
      config.setDailyBudget(dailyBudget === 0 ? null : dailyBudget);
    }
    if (budgetHardCap !== undefined) {
      config.setBudgetHardCap(budgetHardCap);
    }
    // Model Pilot fields
    if (fallbackModel !== undefined) {
      // W2C: a fallback equal to the primary can never fire (chat.ts guards
      // `resolvedModel !== fallbackModel`) — dead config presented as a safety
      // net. Clear it instead of persisting the no-op.
      const effectiveDefault = defaultModel ?? config.getDefaultModel();
      if (fallbackModel === null || fallbackModel === effectiveDefault) {
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
        const existingConfig = config.getProviders()[name];
        const existingVault = server.vault?.get(name);
        const providerModels = Array.isArray(models)
          ? models.filter((model): model is string => typeof model === 'string')
          : (existingVault?.metadata?.models as string[] | undefined) ?? existingConfig?.models ?? [];
        const submittedBaseUrl = typeof baseUrl === 'string'
          ? (name === 'openai-compatible' ? normalizeOpenAiCompatibleBaseUrl(baseUrl)! : baseUrl)
          : undefined;
        const providerBaseUrl = submittedBaseUrl
          ?? (existingVault?.metadata?.baseUrl as string | undefined)
          ?? existingConfig?.baseUrl;

        // Save secret to vault (encrypted)
        if (apiKey && server.vault) {
          server.vault.set(name, apiKey, { models: providerModels, baseUrl: providerBaseUrl });
          applyProviderKeyToEnv(name, apiKey, true);
          providerKeyChanged = true;
          // Invalidate health check key cache so next /health re-validates
          if (typeof server._invalidateKeyValidationCache === 'function') {
            server._invalidateKeyValidationCache();
          }
        } else if (existingVault && server.vault && (models !== undefined || baseUrl !== undefined)) {
          server.vault.set(name, existingVault.value, { models: providerModels, baseUrl: providerBaseUrl });
        }

        // Keep only non-secret provider metadata in config.json. The raw key is
        // Vault-only; an empty value preserves the legacy provider shape while
        // preventing new saves from reintroducing plaintext credentials.
        config.setProvider(name, {
          apiKey: '',
          models: providerModels,
          ...(providerBaseUrl ? { baseUrl: providerBaseUrl } : {}),
        });
      }
    }

    config.save();

    // Apply the live guard only after the durable settings transaction wins.
    // A failed write must not leave this process less restrictive than disk.
    if (dailyBudget !== undefined || budgetHardCap !== undefined) {
      server.agentState.costTracker.setBudget(
        config.getDailyBudget(),
        config.getBudgetHardCap() ? 'hard' : 'soft',
      );
    }

    let router: LiteLLMRefreshResult | undefined;
    if (providerKeyChanged && server.localConfig.manageLiteLLM) {
      router = await refreshManagedLiteLLM(server);
    }
    if (defaultModel) {
      server.agentState.currentModel = await resolveUsableModel(server, defaultModel);
    }

    // Return providers from vault (same as GET)
    const responseProviders: Record<string, { apiKey: string; models: string[]; baseUrl?: string }> = {};
    if (server.vault) {
      const configProviders = config.getProviders();
      const vaultEntries = server.vault.list();
      for (const vEntry of vaultEntries) {
        const full = server.vault.get(vEntry.name);
        if (full) {
          responseProviders[vEntry.name] = {
            apiKey: maskApiKey(full.value),
            models: (full.metadata?.models as string[]) ?? configProviders[vEntry.name]?.models ?? [],
            baseUrl: (full.metadata?.baseUrl as string | undefined) ?? configProviders[vEntry.name]?.baseUrl,
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
      ...(router ? { router } : {}),
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

  // POST /api/settings/test-key — validate an API key.
  //
  // D3: `live: true` does a real 1-token / cheap-auth probe against the provider
  // (generalised from the private Anthropic `/health` probe) and reports
  // `verified: true` only when the provider actually accepted the key. Without
  // `live`, or for a provider with no cheap probe, it is format-only and reports
  // `verified: false` — never a confident "valid" on an unchecked key.
  server.post<{
    Body: { provider: string; apiKey: string; live?: boolean };
  }>('/api/settings/test-key', async (request, reply) => {
    const { provider, apiKey, live } = request.body ?? {};

    if (!provider || !apiKey) {
      return reply.status(400).send({ error: 'provider and apiKey are required' });
    }

    if (live) {
      return await probeProviderKey(provider, apiKey);
    }
    const fmt = validateKeyFormat(provider, apiKey);
    return { ...fmt, verified: false };
  });

  // POST /api/settings/test-compatible — discover and optionally verify an
  // OpenAI-compatible model without mutating config or Vault state. The
  // candidate secret remains server-side and is sent only to the endpoint the
  // user supplied. A catalog response proves discovery; `verified` requires a
  // real non-empty completion from the exact selected model.
  const compatibleProbeSchema = z.object({
    baseUrl: z.string().min(1),
    apiKey: z.string().optional(),
    model: z.string().min(1).optional(),
  });
  server.post<{
    Body: { baseUrl: string; apiKey?: string; model?: string };
  }>(
    '/api/settings/test-compatible',
    { preHandler: validateBody(compatibleProbeSchema) },
    async (request, reply) => {
      const baseUrl = normalizeOpenAiCompatibleBaseUrl(request.body.baseUrl);
      if (!baseUrl) {
        return reply.code(400).send({
          error: 'OpenAI-compatible base URL must be an http(s) URL without credentials, query, or fragment.',
        });
      }

      const apiKey = request.body.apiKey?.trim() ?? '';
      const noRedirectFetch: typeof fetch = (input, init) => fetch(input, { ...init, redirect: 'error' });
      const catalog = await discoverProviderModels('openai-compatible', apiKey, baseUrl, {
        fetchImpl: noRedirectFetch,
      });
      const discovered = catalog.status === 'provider-api' && catalog.models.length > 0;
      const common = {
        valid: discovered,
        verified: false,
        baseUrl,
        models: catalog.models,
        modelsSource: catalog.status,
        ...(catalog.error ? { error: catalog.error } : {}),
      };
      if (!request.body.model || !discovered) return common;

      const model = request.body.model.trim();
      if (!catalog.models.some((candidate) => candidate.id === model)) {
        return { ...common, valid: false, model, error: 'Selected model was not returned by this endpoint.' };
      }

      try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          signal: AbortSignal.timeout(45_000),
          redirect: 'error',
          body: JSON.stringify({
            model: model.slice('openai-compatible/'.length),
            max_tokens: 512,
            stream: false,
            messages: [{ role: 'user', content: 'Reply with exactly WAGGLE_OK.' }],
          }),
        });
        if (!response.ok) {
          return { ...common, valid: false, model, error: `Selected model returned HTTP ${response.status}.` };
        }
        const payload = await response.json() as {
          choices?: Array<{ message?: { content?: unknown } }>;
        };
        const content = payload.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || content.trim().length === 0) {
          return { ...common, valid: false, model, error: 'Selected model returned no assistant response.' };
        }
        return { ...common, valid: true, verified: true, model };
      } catch {
        return {
          ...common,
          valid: false,
          model,
          error: 'Selected model could not be reached before the connection test timed out.',
        };
      }
    },
  );

  // POST /api/settings/probe-provider — live-probe a STORED provider key (F3).
  // test-key only probes a RAW key sent in the body (used on key SAVE); this
  // resolves the vaulted/config key by provider id so the ModelGate banner can
  // verify readiness on mount without the user re-entering the key. Returns only
  // booleans + an error string — the key itself never leaves the server.
  const probeProviderSchema = z.object({ provider: z.string().min(1) });
  server.post<{ Body: { provider: string } }>(
    '/api/settings/probe-provider',
    { preHandler: validateBody(probeProviderSchema) },
    async (request) => {
      const provider = request.body.provider.toLowerCase();
      const key =
        server.vault?.get(provider)?.value ??
        new WaggleConfig(server.localConfig.dataDir).getProviders()[provider]?.apiKey;
      if (!key) return { configured: false, valid: false, verified: false };
      // probeProviderKey brings its own 5s timeout + 60s TTL cache.
      return { configured: true, ...(await probeProviderKey(provider, key)) };
    },
  );

  // POST /api/settings/probe-model — live-probe the WORKSPACE'S ACTUAL DEFAULT
  // MODEL (MODEL-GATE). probe-provider only confirms a provider KEY works; this
  // resolves the default model server-side (the SAME resolver chat.ts uses) and
  // fires a 1-token completion to prove the model actually answers. Only booleans
  // + the resolved model string come back — no key crosses the wire.
  const probeModelSchema = z.object({ model: z.string().min(1).optional() });
  server.post<{ Body: { model?: string } }>(
    '/api/settings/probe-model',
    { preHandler: validateBody(probeModelSchema) },
    async (request) => {
      const preferred = (
        request.body.model ??
        new WaggleConfig(server.localConfig.dataDir).getDefaultModel() ??
        ''
      ).trim();
      if (!preferred) return { model: null, configured: false, verified: false };

      // A caller-supplied model is an exact-model gate. Never turn a successful
      // probe of a different provider into false assurance for the requested
      // model. Default probes retain normal fallback-capable resolution.
      const model = request.body.model
        ? await resolveExplicitRoutableModel(server, preferred)
        : await resolveUsableModel(server, preferred);
      if (!model) {
        return { model: preferred, configured: false, verified: false };
      }

      // Endpoint selection mirrors chat.ts: Ollama models go direct to Ollama's
      // OpenAI-compatible endpoint (strip the 'ollama/' prefix); everything else
      // through the built-in proxy on this same sidecar (port from the address
      // info, harvest.ts pattern).
      const isOllama = model.startsWith('ollama/');
      const addr = server.server.address();
      const port = typeof addr === 'object' && addr ? addr.port : server.localConfig.port;
      const url = isOllama
        ? (process.env.OLLAMA_HOST?.replace(/\/+$/, '') ?? 'http://localhost:11434') + '/v1/chat/completions'
        : `http://127.0.0.1:${port}/v1/chat/completions`;
      const sendModel = isOllama ? model.slice('ollama/'.length) : model;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(!isOllama
              ? { Authorization: `Bearer ${server.agentState.wsSessionToken}` }
              : {}),
          },
          signal: controller.signal,
          body: JSON.stringify({ model: sendModel, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
        });
        if (res.ok) return { model, configured: true, verified: true };
        // Hard rejection (bad/absent key or unknown model) → client maps to
        // 'failed'. Check status + body so a 401/403 or a model_not_found body
        // both classify as rejected.
        const detail = `${res.status} ${await res.text().catch(() => '')}`;
        if (/401|403|authentication|model_not_found/i.test(detail)) {
          return { model, configured: true, verified: false, rejected: true };
        }
        // Other non-2xx → transient (client maps to 'unverified').
        return { model, configured: true, verified: false };
      } catch {
        // Timeout / network → transient.
        return { model, configured: true, verified: false };
      } finally {
        clearTimeout(timeoutId);
      }
    },
  );

  // ── Permission settings ─────────────────────────────────────────────

  const DEFAULTS: PermissionsData = {
    defaultAutonomy: 'normal',
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
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        return {
          defaultAutonomy: coerceDefaultAutonomy(parsed),
          externalGates: (parsed.externalGates as string[] | undefined) ?? DEFAULTS.externalGates,
          workspaceOverrides:
            (parsed.workspaceOverrides as Record<string, string[]> | undefined) ??
            DEFAULTS.workspaceOverrides,
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

  // PUT /api/settings/permissions — save permission settings.
  // Accepts the new `defaultAutonomy` enum and the legacy `yoloMode` boolean
  // so older clients don't 400 during a deploy. Legacy values migrate via
  // coerceDefaultAutonomy() on the way in.
  server.put<{
    Body: {
      defaultAutonomy?: AutonomyLevel;
      yoloMode?: boolean;
      externalGates?: string[];
      workspaceOverrides?: Record<string, string[]>;
    };
  }>('/api/settings/permissions', async (request, reply) => {
    const { defaultAutonomy, yoloMode, externalGates, workspaceOverrides } = request.body ?? {};
    const current = readPermissions();

    let nextAutonomy: AutonomyLevel = current.defaultAutonomy;
    if (defaultAutonomy !== undefined) {
      if (!(VALID_AUTONOMY as readonly string[]).includes(defaultAutonomy)) {
        return reply.status(400).send({
          error: `defaultAutonomy must be one of ${VALID_AUTONOMY.join(', ')}`,
        });
      }
      nextAutonomy = defaultAutonomy;
    } else if (yoloMode !== undefined) {
      nextAutonomy = yoloMode ? 'yolo' : 'normal';
    }

    const updated: PermissionsData = {
      defaultAutonomy: nextAutonomy,
      externalGates: externalGates ?? current.externalGates,
      workspaceOverrides: workspaceOverrides ?? current.workspaceOverrides,
    };

    writePermissions(updated);
    return updated;
  });

  // ── Tier detection ───────────────────────────────────────────────────
  // Tier is read from config.json → tier field (defaults to FREE).
  // Canonical values: TRIAL | FREE | TEAMS | ENTERPRISE (@waggle/shared
  // tiers.ts). Legacy names (PRO/BASIC/lowercase) auto-migrate via parseTier().
  // The Stripe webhook (packages/server/src/stripe/webhook.ts) writes this field.

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
        maxSessions: tier === 'FREE' ? 10 : 25,
        maxMembers: caps.teamMembersLimit,
        features: {
          teams: caps.sharedWorkspaces,
          marketplace: true,
          budgetControls: caps.adminPanel,
          kvark: tier === 'ENTERPRISE',
          governance: tier === 'ENTERPRISE',
          customModels: true,
        },
      },
    };
  });

  // PATCH /api/tier — change tier (testing/dev — will be replaced by Stripe webhook)
  server.patch<{
    Body: { tier: string };
  }>('/api/tier', async (request, reply) => {
    // AV-3: this dev/test-only override must NOT be a production privilege-escalation
    // path. Under the loopback-trust model any local page/extension could PATCH a paid
    // tier for free (no payment, no auth). Fail closed — disabled unless explicitly
    // enabled for dev/testing. Legit tier changes flow through Stripe (sync/webhook)
    // and POST /api/tier/start-trial.
    if (process.env.WAGGLE_ALLOW_TIER_OVERRIDE !== '1') {
      return reply.status(403).send({ error: 'Tier override disabled', code: 'TIER_OVERRIDE_DISABLED' });
    }
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
    applyRuntimeTier(server, parsed);

    return { tier: parsed, capabilities: getCapabilities(parsed), updated: true };
  });

  // POST /api/tier/start-trial — atomic trial start.
  //
  // Sets `tier='TRIAL'` + `trialStartedAt=now` in a single write. Idempotent
  // by design: if `trialStartedAt` is already set, returns 409 with the
  // current tier state — a user gets exactly one 15-day trial. The previous
  // path (client-side `adapter.updateSettings({ tier: 'TRIAL', trialStartedAt })`)
  // was doubly broken: `updateSettings` didn't exist on the adapter, and
  // `PATCH /api/tier` ignores `trialStartedAt`, so trials silently never
  // started. See UpgradeModal `onStartTrial` and OnboardingWizard completion.
  server.post('/api/tier/start-trial', async (_request, reply) => {
    const configPath = path.join(server.localConfig.dataDir, 'config.json');
    let raw: Record<string, unknown> = {};
    try {
      if (fs.existsSync(configPath)) {
        raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      }
    } catch { /* fresh */ }

    if (typeof raw.trialStartedAt === 'string' && raw.trialStartedAt.length > 0) {
      const existingTier = parseTier(String(raw.tier ?? '')) ?? 'FREE';
      const effective = getEffectiveTier(existingTier, raw.trialStartedAt);
      return reply.status(409).send({
        error: 'TRIAL_ALREADY_STARTED',
        message: 'A trial has already been started for this installation.',
        tier: effective,
        rawTier: existingTier,
        trialStartedAt: raw.trialStartedAt,
        trialDaysRemaining: trialDaysRemaining(raw.trialStartedAt),
        trialExpired: existingTier === 'TRIAL' && effective === 'FREE',
      });
    }

    const now = new Date().toISOString();
    raw.tier = 'TRIAL';
    raw.trialStartedAt = now;
    fs.writeFileSync(configPath, JSON.stringify(raw, null, 2), 'utf-8');
    applyRuntimeTier(server, 'TRIAL');

    return {
      tier: 'TRIAL' as Tier,
      rawTier: 'TRIAL' as Tier,
      trialStartedAt: now,
      trialDaysRemaining: trialDaysRemaining(now),
      trialExpired: false,
      capabilities: getCapabilities('TRIAL'),
    };
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
    const auditStore = server.auditStore;
    if (!auditStore?.getAll) {
      return reply.code(503).send({ error: 'Audit store not available' });
    }
    const records = auditStore.getAll();
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
  /**
   * P4: three-level default autonomy for newly-created chat windows.
   *   - normal  = gate every write + risky op
   *   - trusted = auto-pass writes/edits, still gate git push / install / xws
   *   - yolo    = auto-pass everything except the critical blacklist
   * Per-window overrides in Chat take precedence over this default.
   */
  defaultAutonomy: AutonomyLevel;
  externalGates: string[];
  workspaceOverrides: Record<string, string[]>;
}
