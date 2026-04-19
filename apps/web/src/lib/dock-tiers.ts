import type { ElementType } from 'react';
import {
  LayoutDashboard, MessageSquare, FolderOpen, Settings, Bot, Brain,
  Zap, Activity, Radio, Clock, Package, Plug, Store, Lock, Users, Shield,
} from 'lucide-react';

export type AppId =
  | 'chat' | 'dashboard' | 'memory' | 'events'
  | 'capabilities' | 'connectors' | 'cockpit' | 'mission-control'
  | 'settings' | 'vault' | 'profile' | 'terminal' | 'calculator'
  | 'notes' | 'waggle-dance' | 'files' | 'agents'
  | 'scheduled-jobs' | 'marketplace' | 'voice' | 'room' | 'approvals' | 'timeline'
  | 'backup' | 'telemetry' | 'governance';

export type UserTier = 'simple' | 'professional' | 'power' | 'admin';

export type BillingTier = 'TRIAL' | 'FREE' | 'PRO' | 'TEAMS' | 'ENTERPRISE';

export interface DockEntry {
  type: 'app' | 'zone-parent' | 'separator';
  key: string;
  appId?: AppId;
  icon?: ElementType;
  label: string;
  color?: string;
  children?: DockEntry[];
  /**
   * Minimum billing tier required to see this entry.
   * If the user's tier is below this, the entry is hidden from the dock.
   * Undefined = always visible.
   */
  minBillingTier?: BillingTier;
}

const BILLING_TIER_ORDER: Record<BillingTier, number> = {
  FREE: 0, TRIAL: 1, PRO: 2, TEAMS: 3, ENTERPRISE: 4,
};

export const DEFAULT_TIER: UserTier = 'simple';

const POWER_CONFIG: DockEntry[] = [
  { type: 'app', key: 'home', appId: 'dashboard', icon: LayoutDashboard, label: 'Home', color: 'text-sky-400' },
  { type: 'separator', key: 'sep-0', label: '' },
  { type: 'app', key: 'chat', appId: 'chat', icon: MessageSquare, label: 'Chat', color: 'text-primary' },
  { type: 'app', key: 'room', appId: 'room', icon: Users, label: 'Room', color: 'text-violet-400' },
  { type: 'app', key: 'agents', appId: 'agents', icon: Bot, label: 'Personas', color: 'text-orange-400' },
  { type: 'app', key: 'files', appId: 'files', icon: FolderOpen, label: 'Files', color: 'text-amber-300' },
  { type: 'app', key: 'dance', appId: 'waggle-dance', icon: Zap, label: 'Waggle Dance', color: 'text-amber-400' },
  { type: 'separator', key: 'sep-1', label: '' },
  {
    type: 'zone-parent', key: 'ops', icon: Activity, label: 'Ops', color: 'text-emerald-400',
    children: [
      { type: 'app', key: 'cockpit', appId: 'cockpit', icon: Activity, label: 'Command Center', color: 'text-emerald-400' },
      { type: 'app', key: 'timeline', appId: 'timeline', icon: Clock, label: 'Timeline', color: 'text-cyan-400' },
      { type: 'app', key: 'telemetry', appId: 'telemetry', icon: Activity, label: 'Usage & Cost', color: 'text-sky-400' },
      // P23: Backup lives in Settings → Backup, removed from dock to avoid duplication
      { type: 'app', key: 'events', appId: 'events', icon: Radio, label: 'Events & Logs', color: 'text-cyan-400' },
      { type: 'app', key: 'jobs', appId: 'scheduled-jobs', icon: Clock, label: 'Scheduled Jobs', color: 'text-amber-400' },
    ],
  },
  {
    type: 'zone-parent', key: 'extend', icon: Package, label: 'Extend', color: 'text-violet-400',
    children: [
      { type: 'app', key: 'skills', appId: 'capabilities', icon: Package, label: 'Skills & Apps', color: 'text-violet-400' },
      { type: 'app', key: 'connect', appId: 'connectors', icon: Plug, label: 'Connectors', color: 'text-emerald-400' },
      // P31: Marketplace already a tab inside Skills & Apps — no separate dock entry
      // P32: Team Governance is Teams-tier only
      { type: 'app', key: 'governance', appId: 'governance', icon: Shield, label: 'Team Governance', color: 'text-violet-400', minBillingTier: 'TEAMS' },
    ],
  },
  { type: 'separator', key: 'sep-2', label: '' },
  { type: 'app', key: 'approvals', appId: 'approvals', icon: Shield, label: 'Approvals', color: 'text-amber-400' },
  { type: 'app', key: 'vault', appId: 'vault', icon: Lock, label: 'Vault', color: 'text-amber-400' },
  { type: 'app', key: 'system', appId: 'settings', icon: Settings, label: 'Settings', color: 'text-muted-foreground' },
];

export const TIER_DOCK_CONFIG: Record<UserTier, DockEntry[]> = {
  simple: [
    { type: 'app', key: 'home', appId: 'dashboard', icon: LayoutDashboard, label: 'Home', color: 'text-sky-400' },
    { type: 'app', key: 'chat', appId: 'chat', icon: MessageSquare, label: 'Chat', color: 'text-primary' },
    { type: 'app', key: 'files', appId: 'files', icon: FolderOpen, label: 'Files', color: 'text-amber-300' },
    { type: 'separator', key: 'sep-1', label: '' },
    { type: 'app', key: 'vault', appId: 'vault', icon: Lock, label: 'Vault', color: 'text-amber-400' },
    { type: 'app', key: 'system', appId: 'settings', icon: Settings, label: 'Settings', color: 'text-muted-foreground' },
  ],

  professional: [
    { type: 'app', key: 'home', appId: 'dashboard', icon: LayoutDashboard, label: 'Home', color: 'text-sky-400' },
    { type: 'app', key: 'chat', appId: 'chat', icon: MessageSquare, label: 'Chat', color: 'text-primary' },
    { type: 'app', key: 'agents', appId: 'agents', icon: Bot, label: 'Personas', color: 'text-orange-400' },
    { type: 'app', key: 'files', appId: 'files', icon: FolderOpen, label: 'Files', color: 'text-amber-300' },
    { type: 'separator', key: 'sep-1', label: '' },
    { type: 'app', key: 'memory', appId: 'memory', icon: Brain, label: 'Memory', color: 'text-amber-300' },
    { type: 'app', key: 'vault', appId: 'vault', icon: Lock, label: 'Vault', color: 'text-amber-400' },
    { type: 'app', key: 'system', appId: 'settings', icon: Settings, label: 'Settings', color: 'text-muted-foreground' },
  ],

  power: POWER_CONFIG,
  admin: POWER_CONFIG,
};

/**
 * Recursively filter out entries whose minBillingTier exceeds the user's tier.
 * Zone parents with no remaining children are also removed.
 */
function filterByBillingTier(entries: DockEntry[], billingTier: BillingTier): DockEntry[] {
  const userRank = BILLING_TIER_ORDER[billingTier] ?? 0;
  const out: DockEntry[] = [];
  for (const e of entries) {
    if (e.minBillingTier && BILLING_TIER_ORDER[e.minBillingTier] > userRank) continue;
    if (e.type === 'zone-parent' && e.children) {
      const kids = filterByBillingTier(e.children, billingTier);
      if (kids.length === 0) continue;
      out.push({ ...e, children: kids });
    } else {
      out.push(e);
    }
  }
  return out;
}

export function getDockForTier(tier: UserTier, billingTier: BillingTier = 'FREE'): DockEntry[] {
  const base = TIER_DOCK_CONFIG[tier] ?? TIER_DOCK_CONFIG[DEFAULT_TIER];
  return filterByBillingTier(base, billingTier);
}
