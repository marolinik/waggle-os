import type { ElementType } from 'react';
import {
  MessageSquare, LayoutDashboard, Settings, Brain, Activity,
  Package, Radio, Zap, FolderOpen, Bot, Lock, UserCircle, Plug,
  Clock, Store, Mic, Users, Shield,
} from 'lucide-react';
import type { AppId } from './dock-tiers';

/**
 * Single source of truth for app chrome metadata.
 *
 * Desktop window chrome reads `title`, `iconType`, `iconColorClass`, and `size`.
 * Spotlight (GlobalSearch) derives its COMMANDS list from this catalog directly,
 * which was the structural fix for FR #13 — two hand-maintained parallel registries
 * drifting out of sync each time a new app was added.
 *
 * When adding a new app: add one entry here. Desktop and Spotlight both update
 * automatically. No second list to maintain.
 */
export interface AppCatalogEntry {
  title: string;
  /** One-line description used in Spotlight search results */
  subtitle: string;
  /** Icon component. Each consumer wraps it with its own size/color classes. */
  iconType: ElementType;
  /** Tailwind color class applied to the icon in Desktop window chrome */
  iconColorClass: string;
  /** Default window size */
  size: { w: string; h: string };
}

export const APP_CATALOG: Partial<Record<AppId, AppCatalogEntry>> = {
  dashboard:        { title: 'Dashboard',          subtitle: 'Home overview',                           iconType: LayoutDashboard, iconColorClass: 'text-sky-400',          size: { w: '560px', h: '440px' } },
  chat:             { title: 'Waggle Chat',         subtitle: 'Open conversation',                       iconType: MessageSquare,   iconColorClass: 'text-primary',           size: { w: '520px', h: '520px' } },
  agents:           { title: 'Personas',            subtitle: 'Manage personas & groups',                iconType: Bot,             iconColorClass: 'text-orange-400',        size: { w: '640px', h: '480px' } },
  files:            { title: 'Files',               subtitle: 'Workspace documents',                     iconType: FolderOpen,      iconColorClass: 'text-amber-300',         size: { w: '620px', h: '440px' } },
  memory:           { title: 'Memory',              subtitle: 'Knowledge frames',                        iconType: Brain,           iconColorClass: 'text-amber-300',         size: { w: '640px', h: '460px' } },
  cockpit:          { title: 'Cockpit',             subtitle: 'System health & ops',                     iconType: Activity,        iconColorClass: 'text-emerald-400',       size: { w: '520px', h: '520px' } },
  'mission-control':{ title: 'Mission Control',     subtitle: 'Multi-agent overview',                    iconType: Radio,           iconColorClass: 'text-rose-400',          size: { w: '520px', h: '440px' } },
  capabilities:     { title: 'Skills & Apps',       subtitle: 'Installed capabilities',                  iconType: Package,         iconColorClass: 'text-violet-400',        size: { w: '560px', h: '480px' } },
  'waggle-dance':   { title: 'Waggle Dance',        subtitle: 'Cross-workspace signals',                 iconType: Zap,             iconColorClass: 'text-amber-400',         size: { w: '580px', h: '460px' } },
  connectors:       { title: 'Connectors',          subtitle: 'Service integrations',                    iconType: Plug,            iconColorClass: 'text-emerald-400',       size: { w: '580px', h: '500px' } },
  'scheduled-jobs': { title: 'Scheduled Jobs',      subtitle: 'Recurring tasks',                         iconType: Clock,           iconColorClass: 'text-amber-400',         size: { w: '600px', h: '460px' } },
  marketplace:      { title: 'Marketplace',         subtitle: 'Browse extensions',                       iconType: Store,           iconColorClass: 'text-orange-400',        size: { w: '640px', h: '500px' } },
  voice:            { title: 'Voice',               subtitle: 'Voice interface',                         iconType: Mic,             iconColorClass: 'text-rose-400',          size: { w: '480px', h: '400px' } },
  room:             { title: 'Room',                subtitle: 'Sub-agent canvas',                        iconType: Users,           iconColorClass: 'text-violet-400',        size: { w: '640px', h: '520px' } },
  approvals:        { title: 'Approvals',           subtitle: 'Pending approvals',                       iconType: Shield,          iconColorClass: 'text-amber-400',         size: { w: '520px', h: '560px' } },
  timeline:         { title: 'Timeline',            subtitle: 'Workspace activity history',               iconType: Clock,           iconColorClass: 'text-cyan-400',          size: { w: '520px', h: '560px' } },
  events:           { title: 'Events',              subtitle: 'System events stream',                    iconType: Activity,        iconColorClass: 'text-cyan-400',          size: { w: '580px', h: '420px' } },
  vault:            { title: 'Vault',               subtitle: 'Encrypted secrets & API keys',            iconType: Lock,            iconColorClass: 'text-amber-400',         size: { w: '560px', h: '480px' } },
  profile:          { title: 'My Profile',          subtitle: 'User profile, identity & preferences',    iconType: UserCircle,      iconColorClass: 'text-sky-400',           size: { w: '560px', h: '520px' } },
  backup:           { title: 'Backup & Restore',    subtitle: 'Mind backups',                            iconType: Activity,        iconColorClass: 'text-emerald-400',       size: { w: '520px', h: '480px' } },
  telemetry:        { title: 'Usage & Telemetry',   subtitle: 'Token + cost analytics',                  iconType: Activity,        iconColorClass: 'text-sky-400',           size: { w: '560px', h: '500px' } },
  governance:       { title: 'Team Governance',     subtitle: 'Roles & permissions',                     iconType: Shield,          iconColorClass: 'text-violet-400',        size: { w: '480px', h: '520px' } },
  settings:         { title: 'Settings',            subtitle: 'Configuration',                           iconType: Settings,        iconColorClass: 'text-muted-foreground',  size: { w: '560px', h: '460px' } },
};
