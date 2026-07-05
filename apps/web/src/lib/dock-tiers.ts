import type { ElementType } from 'react';
import {
  LayoutDashboard, MessageSquare, FolderOpen, Settings, Bot, Brain,
  Zap, Activity, Radio, Clock, Package, Plug, Store, Lock, Users, Shield, Rocket, FileStack, Server,
} from 'lucide-react';

export type AppId =
  | 'home' | 'chat' | 'dashboard' | 'memory' | 'events'
  | 'capabilities' | 'connectors' | 'cockpit' | 'mission-control'
  | 'settings' | 'vault' | 'profile'
  | 'waggle-dance' | 'files' | 'artifacts' | 'agents'
  | 'scheduled-jobs' | 'marketplace' | 'voice' | 'room' | 'approvals' | 'timeline'
  | 'backup' | 'telemetry' | 'governance' | 'launcher'
  // UX-Refactor Phase 1 (S02): single-workspace runtime surface, opened from
  // Home / workspace selection (not a dock entry — A1 fixed-layout window).
  | 'workspace-desktop'
  // UX-Refactor Phase 4B (S08): standalone MCP Hub under the Extend zone.
  | 'mcp-hub';

export type UserTier = 'simple' | 'professional' | 'power' | 'admin';

export type BillingTier = 'TRIAL' | 'FREE' | 'TEAMS' | 'ENTERPRISE';

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
  /**
   * UX Refactor v2.1 P1a (conversion plan §1.3): the entry's canonical URL —
   * the appId→route table the AppShell left nav navigates by and prefix-matches
   * active state against (§2.1.2). Additive; the windowed Dock ignores it.
   * `chat` carries its prefix family ('/workspaces') because its real route is
   * parameterized — clicks resolve through routeFor('chat', ctx) (§2.3).
   */
  route?: string;
  /**
   * One-line plain-language explanation of the entry, surfaced as a hover
   * tooltip in the nav — labels like "Waggle Dance" / "MCP Hub" are opaque
   * to non-technical users without it.
   */
  description?: string;
}

export const BILLING_TIER_ORDER: Record<BillingTier, number> = {
  FREE: 0, TRIAL: 1, TEAMS: 2, ENTERPRISE: 3,
};

export const DEFAULT_TIER: UserTier = 'simple';

// UX-Refactor Phase 0 (S00 §4b): the power dock expresses the PRD §10 IA layers —
// Work (flat primary spine) + Intelligence / Extend / Team / System zone-parents.
// The Command Center (Ctrl+K) lives in the StatusBar, not the dock. Grouping is data-only; the
// Dock renders zone-parents generically off entry.type/entry.key.
const POWER_CONFIG: DockEntry[] = [
  // ── Work (primary spine, always visible) ──
  { type: 'app', key: 'home', appId: 'home', icon: LayoutDashboard, label: 'Home', color: 'text-sky-400', route: '/home', description: 'Your starting point — daily briefing and quick actions' },
  { type: 'app', key: 'chat', appId: 'chat', icon: MessageSquare, label: 'Chat', color: 'text-honey', route: '/workspaces', description: 'Talk to your AI agents' },
  { type: 'app', key: 'memory', appId: 'memory', icon: Brain, label: 'Memory', color: 'text-amber-300', route: '/memory', description: 'Everything Waggle remembers about you and your work' },
  { type: 'app', key: 'files', appId: 'files', icon: FolderOpen, label: 'Files', color: 'text-amber-300', route: '/files', description: 'Browse the files in your workspaces' },
  { type: 'app', key: 'artifacts', appId: 'artifacts', icon: FileStack, label: 'Library', color: 'text-amber-300', route: '/artifacts', description: 'Documents and files your agents produce' },
  { type: 'separator', key: 'sep-work', label: '' },
  // ── Intelligence ──
  {
    type: 'zone-parent', key: 'intelligence', icon: Bot, label: 'Intelligence', color: 'text-violet-400', description: 'Your agents and what they can do',
    children: [
      { type: 'app', key: 'agents', appId: 'agents', icon: Bot, label: 'Agents', color: 'text-orange-400', route: '/agents', description: 'Create and manage your AI agents' },
      { type: 'app', key: 'skills', appId: 'capabilities', icon: Package, label: 'Skills Hub', color: 'text-violet-400', route: '/skills', description: 'Teach your agents new abilities' },
      { type: 'app', key: 'jobs', appId: 'scheduled-jobs', icon: Clock, label: 'Automation Center', color: 'text-amber-400', route: '/automations', description: 'Set up tasks that run on a schedule' },
      { type: 'app', key: 'room', appId: 'room', icon: Users, label: 'Room', color: 'text-violet-400', route: '/room', description: 'Watch your agents work together live' },
      { type: 'app', key: 'dance', appId: 'waggle-dance', icon: Zap, label: 'Waggle Dance', color: 'text-amber-400', route: '/waggle-dance', description: 'See what your agents learn from each other' },
      // Approvals: TEAMS-tier trust/audit surface (Pro gets inline chat approvals).
      { type: 'app', key: 'approvals', appId: 'approvals', icon: Shield, label: 'Approvals', color: 'text-amber-400', minBillingTier: 'TEAMS', route: '/approvals', description: 'Review and approve actions your agents want to take' },
    ],
  },
  // ── Extend ──
  {
    type: 'zone-parent', key: 'extend', icon: Package, label: 'Extend', color: 'text-emerald-400', description: 'Add tools and connections to Waggle',
    children: [
      { type: 'app', key: 'connect', appId: 'connectors', icon: Plug, label: 'Connector Hub', color: 'text-emerald-400', route: '/connectors', description: 'Link your apps and accounts so agents can use them' },
      // Phase 4B (S08/S21): the dedicated Extend entries landed.
      { type: 'app', key: 'mcp-hub', appId: 'mcp-hub', icon: Server, label: 'MCP Hub', color: 'text-emerald-400', route: '/mcps', description: 'Connect outside tools your agents can use' },
      { type: 'app', key: 'marketplace', appId: 'marketplace', icon: Store, label: 'Marketplace', color: 'text-orange-400', route: '/marketplace', description: 'Browse ready-made skills and add-ons' },
      { type: 'app', key: 'launcher', appId: 'launcher', icon: Rocket, label: 'AI Tools', color: 'text-amber-400', route: '/launcher', description: 'Launch other AI tools you use, linked to Waggle' },
    ],
  },
  // ── Team (TEAMS-tier; whole zone hidden below TEAMS) ──
  {
    type: 'zone-parent', key: 'team', icon: Users, label: 'Team', color: 'text-violet-400', minBillingTier: 'TEAMS', description: 'Shared workspaces and team controls',
    children: [
      { type: 'app', key: 'governance', appId: 'governance', icon: Shield, label: 'Team Governance', color: 'text-violet-400', minBillingTier: 'TEAMS', route: '/team', description: 'Team rules, permissions, and oversight' },
    ],
  },
  { type: 'separator', key: 'sep-system', label: '' },
  // ── System ──
  {
    type: 'zone-parent', key: 'system', icon: Settings, label: 'System', color: 'text-muted-foreground', description: 'Settings and system tools',
    children: [
      { type: 'app', key: 'settings', appId: 'settings', icon: Settings, label: 'Settings', color: 'text-muted-foreground', route: '/settings', description: 'Preferences, account, and app options' },
      { type: 'app', key: 'vault', appId: 'vault', icon: Lock, label: 'Vault', color: 'text-amber-400', route: '/settings/vault', description: 'Your API keys and secrets, stored locally' },
      // D8 (v2.1): "Command Center" is reserved for the Ctrl+K palette.
      { type: 'app', key: 'cockpit', appId: 'cockpit', icon: Activity, label: 'Mission Control', color: 'text-emerald-400', route: '/settings/mission-control', description: 'System health at a glance' },
      { type: 'app', key: 'timeline', appId: 'timeline', icon: Clock, label: 'Timeline', color: 'text-cyan-400', route: '/settings/timeline', description: 'A history of everything that has happened' },
      { type: 'app', key: 'events', appId: 'events', icon: Radio, label: 'Events & Logs', color: 'text-cyan-400', route: '/settings/events', description: 'Live activity feed and technical logs' },
      { type: 'app', key: 'telemetry', appId: 'telemetry', icon: Activity, label: 'Usage & Cost', color: 'text-sky-400', route: '/settings/usage', description: 'What you have used and what it costs' },
      // P23: Backup stays in Settings → Backup (not a dock entry).
    ],
  },
];

export const TIER_DOCK_CONFIG: Record<UserTier, DockEntry[]> = {
  simple: [
    { type: 'app', key: 'home', appId: 'home', icon: LayoutDashboard, label: 'Home', color: 'text-sky-400', route: '/home', description: 'Your starting point — daily briefing and quick actions' },
    { type: 'app', key: 'chat', appId: 'chat', icon: MessageSquare, label: 'Chat', color: 'text-honey', route: '/workspaces', description: 'Talk to your AI agents' },
    // Memory is the product's flagship — onboarding imports the user's AI
    // history into it; hiding it from the novice tier orphaned that moment.
    { type: 'app', key: 'memory', appId: 'memory', icon: Brain, label: 'Memory', color: 'text-amber-300', route: '/memory', description: 'Everything Waggle remembers about you and your work' },
    { type: 'app', key: 'files', appId: 'files', icon: FolderOpen, label: 'Files', color: 'text-amber-300', route: '/files', description: 'Browse the files in your workspaces' },
    { type: 'separator', key: 'sep-1', label: '' },
    { type: 'app', key: 'vault', appId: 'vault', icon: Lock, label: 'Vault', color: 'text-amber-400', route: '/settings/vault', description: 'Your API keys and secrets, stored locally' },
    { type: 'app', key: 'system', appId: 'settings', icon: Settings, label: 'Settings', color: 'text-muted-foreground', route: '/settings', description: 'Preferences, account, and app options' },
  ],

  professional: [
    { type: 'app', key: 'home', appId: 'home', icon: LayoutDashboard, label: 'Home', color: 'text-sky-400', route: '/home', description: 'Your starting point — daily briefing and quick actions' },
    { type: 'app', key: 'chat', appId: 'chat', icon: MessageSquare, label: 'Chat', color: 'text-honey', route: '/workspaces', description: 'Talk to your AI agents' },
    { type: 'app', key: 'agents', appId: 'agents', icon: Bot, label: 'Agents', color: 'text-orange-400', route: '/agents', description: 'Create and manage your AI agents' },
    { type: 'app', key: 'files', appId: 'files', icon: FolderOpen, label: 'Files', color: 'text-amber-300', route: '/files', description: 'Browse the files in your workspaces' },
    { type: 'separator', key: 'sep-1', label: '' },
    { type: 'app', key: 'memory', appId: 'memory', icon: Brain, label: 'Memory', color: 'text-amber-300', route: '/memory', description: 'Everything Waggle remembers about you and your work' },
    { type: 'app', key: 'vault', appId: 'vault', icon: Lock, label: 'Vault', color: 'text-amber-400', route: '/settings/vault', description: 'Your API keys and secrets, stored locally' },
    { type: 'app', key: 'system', appId: 'settings', icon: Settings, label: 'Settings', color: 'text-muted-foreground', route: '/settings', description: 'Preferences, account, and app options' },
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
