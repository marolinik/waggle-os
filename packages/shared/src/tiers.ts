/**
 * Tier Architecture — canonical tier definitions, capabilities, and enforcement.
 *
 * CANONICAL TIER NAMES: TRIAL, FREE, PRO, TEAMS, ENTERPRISE
 * These are the only valid values for the Tier type.
 *
 * Pricing (confirmed April 12, 2026):
 *   TRIAL      — $0 / 15 days (all features unlocked)
 *   FREE       — $0 forever (5 workspaces, agents, built-in skills only)
 *   PRO        — $19/mo (unlimited, marketplace, all connectors)
 *   TEAMS      — $49/mo per seat (shared workspaces, WaggleDance, governance)
 *   ENTERPRISE — Consultative (KVARK sovereign on-prem)
 *
 * Strategy: Memory + Harvest is free forever (lock-in moat).
 *           Agents are free (they generate memory).
 *           Skills/connectors are the upgrade trigger.
 *           Trial → Free fallback after 15 days (painful but not destructive).
 */

export const TIERS = ['TRIAL', 'FREE', 'PRO', 'TEAMS', 'ENTERPRISE'] as const;
export type Tier = typeof TIERS[number];

export const TRIAL_DURATION_DAYS = 15;

/**
 * Read an env var safely from either Node (`process.env`) or the browser
 * (where `process` is undefined). Used by shared tier config so this module
 * can be imported by both the sidecar and the web bundle.
 */
const readEnv = (key: string): string | null => {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env?.[key] ?? null;
};

export type EmbeddingProviderType = 'inprocess' | 'ollama' | 'voyage' | 'openai' | 'litellm' | 'mock';
export type ExportFormat = 'txt' | 'md' | 'pdf' | 'json';

export interface TierCapabilities {
  connectorLimit: number;
  workspaceLimit: number;
  embeddingProviders: EmbeddingProviderType[];
  embeddingQuotaPerMonth: number;
  messageHistoryLimit: number;
  spawnAgents: boolean;
  customSkills: boolean;
  teamSkillLibrary: boolean;
  cloudSync: boolean;
  exportFormats: ExportFormat[];
  teamMembersLimit: number;
  sharedWorkspaces: boolean;
  adminPanel: boolean;
  auditLog: 'none' | 'basic' | 'full';
  selfHosted: boolean;
  managedModelPool: boolean;
  priorityModels: boolean;
  kvarkCta: 'none' | 'subtle' | 'active';
  stripePriceId: string | null;
}

export const TIER_CAPABILITIES: Record<Tier, TierCapabilities> = {
  TRIAL: {
    connectorLimit: -1,
    workspaceLimit: -1,
    embeddingProviders: ['inprocess', 'mock', 'ollama', 'voyage', 'openai', 'litellm'],
    embeddingQuotaPerMonth: -1,
    messageHistoryLimit: -1,
    spawnAgents: true,
    customSkills: true,
    teamSkillLibrary: true,
    cloudSync: true,
    exportFormats: ['txt', 'md', 'pdf', 'json'],
    teamMembersLimit: -1,
    sharedWorkspaces: true,
    adminPanel: true,
    auditLog: 'full',
    selfHosted: false,
    managedModelPool: true,
    priorityModels: true,
    kvarkCta: 'subtle',
    stripePriceId: null,
  },
  FREE: {
    connectorLimit: 5,
    workspaceLimit: 5,
    embeddingProviders: ['inprocess', 'mock', 'ollama'],
    embeddingQuotaPerMonth: -1,
    messageHistoryLimit: -1,
    spawnAgents: true,
    customSkills: false,
    teamSkillLibrary: false,
    cloudSync: false,
    exportFormats: ['txt', 'md'],
    teamMembersLimit: 1,
    sharedWorkspaces: false,
    adminPanel: false,
    auditLog: 'none',
    selfHosted: false,
    managedModelPool: false,
    priorityModels: false,
    kvarkCta: 'subtle',
    stripePriceId: null,
  },
  PRO: {
    connectorLimit: -1,
    workspaceLimit: -1,
    embeddingProviders: ['inprocess', 'mock', 'ollama', 'voyage', 'openai'],
    embeddingQuotaPerMonth: -1,
    messageHistoryLimit: -1,
    spawnAgents: true,
    customSkills: true,
    teamSkillLibrary: false,
    cloudSync: false,
    exportFormats: ['txt', 'md', 'pdf', 'json'],
    teamMembersLimit: 1,
    sharedWorkspaces: false,
    adminPanel: false,
    auditLog: 'basic',
    selfHosted: false,
    managedModelPool: false,
    priorityModels: false,
    kvarkCta: 'subtle',
    stripePriceId: readEnv('STRIPE_PRICE_PRO'),
  },
  TEAMS: {
    connectorLimit: -1,
    workspaceLimit: -1,
    embeddingProviders: ['inprocess', 'mock', 'ollama', 'voyage', 'openai', 'litellm'],
    embeddingQuotaPerMonth: -1,
    messageHistoryLimit: -1,
    spawnAgents: true,
    customSkills: true,
    teamSkillLibrary: true,
    cloudSync: true,
    exportFormats: ['txt', 'md', 'pdf', 'json'],
    teamMembersLimit: -1,
    sharedWorkspaces: true,
    adminPanel: true,
    auditLog: 'full',
    selfHosted: true,
    managedModelPool: true,
    priorityModels: true,
    kvarkCta: 'active',
    stripePriceId: readEnv('STRIPE_PRICE_TEAMS'),
  },
  ENTERPRISE: {
    connectorLimit: -1,
    workspaceLimit: -1,
    embeddingProviders: ['inprocess', 'mock', 'ollama', 'voyage', 'openai', 'litellm'],
    embeddingQuotaPerMonth: -1,
    messageHistoryLimit: -1,
    spawnAgents: true,
    customSkills: true,
    teamSkillLibrary: true,
    cloudSync: true,
    exportFormats: ['txt', 'md', 'pdf', 'json'],
    teamMembersLimit: -1,
    sharedWorkspaces: true,
    adminPanel: true,
    auditLog: 'full',
    selfHosted: true,
    managedModelPool: true,
    priorityModels: true,
    kvarkCta: 'none',
    stripePriceId: null,
  },
};

// Tier ordering — higher index = more capable
// TRIAL has max capabilities but is time-limited, so it ranks above TEAMS
const TIER_ORDER: Record<Tier, number> = {
  FREE: 0, PRO: 1, TEAMS: 2, ENTERPRISE: 3, TRIAL: 3,
};

/** Map legacy tier names to new canonical names. */
const LEGACY_TIER_MAP: Record<string, Tier> = {
  solo: 'FREE',
  basic: 'PRO',
  business: 'TEAMS',
  enterprise: 'ENTERPRISE',
  trial: 'TRIAL',
};

/** Parse a tier string (handles both legacy and canonical names). */
export function parseTier(raw: string): Tier | null {
  const upper = raw.toUpperCase();
  if (TIERS.includes(upper as Tier)) return upper as Tier;
  return LEGACY_TIER_MAP[raw.toLowerCase()] ?? null;
}

/** Check if a trial has expired. `trialStartedAt` is an ISO date string. */
export function isTrialExpired(trialStartedAt: string | null | undefined): boolean {
  if (!trialStartedAt) return true;
  const start = new Date(trialStartedAt).getTime();
  if (isNaN(start)) return true;
  const now = Date.now();
  const elapsed = now - start;
  return elapsed > TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000;
}

/** Get the effective tier — downgrades TRIAL to FREE if expired. */
export function getEffectiveTier(tier: Tier, trialStartedAt?: string | null): Tier {
  if (tier === 'TRIAL' && isTrialExpired(trialStartedAt)) return 'FREE';
  return tier;
}

/** Days remaining in trial (0 if expired or not on trial). */
export function trialDaysRemaining(trialStartedAt: string | null | undefined): number {
  if (!trialStartedAt) return 0;
  const start = new Date(trialStartedAt).getTime();
  if (isNaN(start)) return 0;
  const elapsed = Date.now() - start;
  const remaining = TRIAL_DURATION_DAYS - elapsed / (24 * 60 * 60 * 1000);
  return Math.max(0, Math.ceil(remaining));
}

export class TierError extends Error {
  constructor(
    public readonly required: Tier,
    public readonly actual: Tier,
  ) {
    super(`Tier insufficient: requires ${required}, actual is ${actual}`);
    this.name = 'TierError';
  }
}

export function tierSatisfies(actual: Tier, required: Tier): boolean {
  return TIER_ORDER[actual] >= TIER_ORDER[required];
}

export function assertTierCapability(actual: Tier, required: Tier): void {
  if (!tierSatisfies(actual, required)) {
    throw new TierError(required, actual);
  }
}

export function getCapabilities(tier: Tier): TierCapabilities {
  return TIER_CAPABILITIES[tier];
}

export function hasCapability<K extends keyof TierCapabilities>(
  tier: Tier,
  capability: K,
  minimumValue?: TierCapabilities[K],
): boolean {
  const cap = TIER_CAPABILITIES[tier][capability];
  if (minimumValue === undefined) return Boolean(cap);
  if (typeof cap === 'number' && typeof minimumValue === 'number') {
    return cap === -1 || cap >= minimumValue;
  }
  return cap === minimumValue;
}
