import type { UserTier } from './dock-tiers';

export type PlanTier = 'solo' | 'teams' | 'business' | 'enterprise';

export interface FeatureGate {
  feature: string;
  minTier: PlanTier;
  label: string;
  upgradePrompt: string;
}

const TIER_ORDER: PlanTier[] = ['solo', 'teams', 'business', 'enterprise'];

export const FEATURE_GATES: FeatureGate[] = [
  { feature: 'multi-workspace', minTier: 'teams', label: 'Multiple Workspaces', upgradePrompt: 'Upgrade to Teams for unlimited workspaces' },
  { feature: 'all-personas', minTier: 'teams', label: 'All 13 Personas', upgradePrompt: 'Upgrade to Teams to unlock all agent personas' },
  { feature: 'connectors', minTier: 'teams', label: 'Connectors', upgradePrompt: 'Upgrade to Teams for third-party integrations' },
  { feature: 'waggle-dance', minTier: 'teams', label: 'Waggle Dance', upgradePrompt: 'Upgrade to Teams for multi-agent workflows' },
  { feature: 'terminal', minTier: 'teams', label: 'Terminal', upgradePrompt: 'Upgrade to Teams for terminal access' },
  { feature: 'events-log', minTier: 'teams', label: 'Events & Logs', upgradePrompt: 'Upgrade to Teams for agent observability' },
  { feature: 'skills-marketplace', minTier: 'teams', label: 'Skills Marketplace', upgradePrompt: 'Upgrade to Teams for the skills marketplace' },
  { feature: 'mission-control', minTier: 'business', label: 'Mission Control', upgradePrompt: 'Upgrade to Business for team management' },
  { feature: 'scheduled-jobs', minTier: 'business', label: 'Scheduled Jobs', upgradePrompt: 'Upgrade to Business for scheduled automation' },
  { feature: 'audit-trail', minTier: 'enterprise', label: 'Audit Trail', upgradePrompt: 'Enterprise feature — contact sales' },
  { feature: 'rbac', minTier: 'enterprise', label: 'Role-Based Access', upgradePrompt: 'Enterprise feature — contact sales' },
];

export function dockTierToPlanTier(dockTier: string): PlanTier {
  switch (dockTier) {
    case 'simple': return 'solo';
    case 'professional': return 'teams';
    case 'power': return 'business';
    case 'admin': return 'enterprise';
    default: return 'solo';
  }
}

export function isFeatureEnabled(feature: string, currentTier: PlanTier): boolean {
  const gate = FEATURE_GATES.find(g => g.feature === feature);
  if (!gate) return true;
  return TIER_ORDER.indexOf(currentTier) >= TIER_ORDER.indexOf(gate.minTier);
}

export function getGate(feature: string): FeatureGate | undefined {
  return FEATURE_GATES.find(g => g.feature === feature);
}
