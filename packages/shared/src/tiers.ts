/**
 * Tier Architecture — canonical tier definitions, capabilities, and enforcement.
 *
 * CANONICAL TIER NAMES: SOLO, BASIC, TEAMS, ENTERPRISE
 * These are the only valid values for the Tier type.
 *
 * Pricing (as of April 2026):
 *   SOLO       — Free
 *   BASIC      — $15/mo
 *   TEAMS      — $79/mo per seat
 *   ENTERPRISE — Consultative (KVARK)
 */

export const TIERS = ['SOLO', 'BASIC', 'TEAMS', 'ENTERPRISE'] as const;
export type Tier = typeof TIERS[number];

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
  SOLO: {
    connectorLimit: 10,
    workspaceLimit: 5,
    embeddingProviders: ['inprocess', 'mock'],
    embeddingQuotaPerMonth: 500,
    messageHistoryLimit: 500,
    spawnAgents: false,
    customSkills: false,
    teamSkillLibrary: false,
    cloudSync: false,
    exportFormats: ['txt'],
    teamMembersLimit: 1,
    sharedWorkspaces: false,
    adminPanel: false,
    auditLog: 'none',
    selfHosted: false,
    managedModelPool: false,
    priorityModels: false,
    kvarkCta: 'none',
    stripePriceId: null,
  },
  BASIC: {
    connectorLimit: -1,
    workspaceLimit: -1,
    embeddingProviders: ['inprocess', 'mock', 'ollama', 'voyage', 'openai'],
    embeddingQuotaPerMonth: 5000,
    messageHistoryLimit: -1,
    spawnAgents: true,
    customSkills: true,
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
    stripePriceId: process.env['STRIPE_PRICE_BASIC'] ?? null,
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
    auditLog: 'basic',
    selfHosted: true,
    managedModelPool: true,
    priorityModels: true,
    kvarkCta: 'active',
    stripePriceId: process.env['STRIPE_PRICE_TEAMS'] ?? null,
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
const TIER_ORDER: Record<Tier, number> = {
  SOLO: 0, BASIC: 1, TEAMS: 2, ENTERPRISE: 3,
};

/** Map legacy lowercase tier names to canonical uppercase. */
const LEGACY_TIER_MAP: Record<string, Tier> = {
  solo: 'SOLO',
  teams: 'BASIC',      // old 'teams' at $29 → now BASIC at $15
  business: 'TEAMS',   // old 'business' at $79 → now TEAMS at $79
  enterprise: 'ENTERPRISE',
};

/** Parse a tier string (handles both legacy lowercase and canonical uppercase). */
export function parseTier(raw: string): Tier | null {
  const upper = raw.toUpperCase();
  if (TIERS.includes(upper as Tier)) return upper as Tier;
  return LEGACY_TIER_MAP[raw.toLowerCase()] ?? null;
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
