import type { ElementType } from 'react';
import {
  LayoutDashboard, MessageSquare, FolderOpen, Settings, Bot, Brain,
  Zap, Activity, Radio, Clock, Package, Plug, Store, Lock,
} from 'lucide-react';

export type AppId =
  | 'chat' | 'dashboard' | 'memory' | 'events'
  | 'capabilities' | 'connectors' | 'cockpit' | 'mission-control'
  | 'settings' | 'vault' | 'profile' | 'terminal' | 'calculator'
  | 'notes' | 'waggle-dance' | 'files' | 'agents'
  | 'scheduled-jobs' | 'marketplace' | 'voice';

export type UserTier = 'simple' | 'professional' | 'power' | 'admin';

export interface DockEntry {
  type: 'app' | 'zone-parent' | 'separator';
  key: string;
  appId?: AppId;
  icon?: ElementType;
  label: string;
  color?: string;
  children?: DockEntry[];
}

export const DEFAULT_TIER: UserTier = 'simple';

const POWER_CONFIG: DockEntry[] = [
  { type: 'app', key: 'home', appId: 'dashboard', icon: LayoutDashboard, label: 'Home', color: 'text-sky-400' },
  { type: 'separator', key: 'sep-0', label: '' },
  { type: 'app', key: 'chat', appId: 'chat', icon: MessageSquare, label: 'Chat', color: 'text-primary' },
  { type: 'app', key: 'agents', appId: 'agents', icon: Bot, label: 'Agents', color: 'text-orange-400' },
  { type: 'app', key: 'files', appId: 'files', icon: FolderOpen, label: 'Files', color: 'text-amber-300' },
  { type: 'app', key: 'dance', appId: 'waggle-dance', icon: Zap, label: 'Waggle Dance', color: 'text-amber-400' },
  { type: 'separator', key: 'sep-1', label: '' },
  {
    type: 'zone-parent', key: 'ops', icon: Activity, label: 'Ops', color: 'text-emerald-400',
    children: [
      { type: 'app', key: 'cockpit', appId: 'cockpit', icon: Activity, label: 'Command Center', color: 'text-emerald-400' },
      { type: 'app', key: 'events', appId: 'events', icon: Radio, label: 'Events & Logs', color: 'text-cyan-400' },
      { type: 'app', key: 'jobs', appId: 'scheduled-jobs', icon: Clock, label: 'Scheduled Jobs', color: 'text-amber-400' },
    ],
  },
  {
    type: 'zone-parent', key: 'extend', icon: Package, label: 'Extend', color: 'text-violet-400',
    children: [
      { type: 'app', key: 'skills', appId: 'capabilities', icon: Package, label: 'Skills & Apps', color: 'text-violet-400' },
      { type: 'app', key: 'connect', appId: 'connectors', icon: Plug, label: 'Connectors', color: 'text-emerald-400' },
      { type: 'app', key: 'market', appId: 'marketplace', icon: Store, label: 'Marketplace', color: 'text-orange-400' },
    ],
  },
  { type: 'separator', key: 'sep-2', label: '' },
  { type: 'app', key: 'vault', appId: 'vault', icon: Lock, label: 'API Keys', color: 'text-amber-400' },
  { type: 'app', key: 'system', appId: 'settings', icon: Settings, label: 'Settings', color: 'text-muted-foreground' },
];

export const TIER_DOCK_CONFIG: Record<UserTier, DockEntry[]> = {
  simple: [
    { type: 'app', key: 'home', appId: 'dashboard', icon: LayoutDashboard, label: 'Home', color: 'text-sky-400' },
    { type: 'app', key: 'chat', appId: 'chat', icon: MessageSquare, label: 'Chat', color: 'text-primary' },
    { type: 'app', key: 'files', appId: 'files', icon: FolderOpen, label: 'Files', color: 'text-amber-300' },
    { type: 'separator', key: 'sep-1', label: '' },
    { type: 'app', key: 'vault', appId: 'vault', icon: Lock, label: 'API Keys', color: 'text-amber-400' },
    { type: 'app', key: 'system', appId: 'settings', icon: Settings, label: 'Settings', color: 'text-muted-foreground' },
  ],

  professional: [
    { type: 'app', key: 'home', appId: 'dashboard', icon: LayoutDashboard, label: 'Home', color: 'text-sky-400' },
    { type: 'app', key: 'chat', appId: 'chat', icon: MessageSquare, label: 'Chat', color: 'text-primary' },
    { type: 'app', key: 'agents', appId: 'agents', icon: Bot, label: 'Agents', color: 'text-orange-400' },
    { type: 'app', key: 'files', appId: 'files', icon: FolderOpen, label: 'Files', color: 'text-amber-300' },
    { type: 'separator', key: 'sep-1', label: '' },
    { type: 'app', key: 'memory', appId: 'memory', icon: Brain, label: 'Memory', color: 'text-amber-300' },
    { type: 'app', key: 'vault', appId: 'vault', icon: Lock, label: 'API Keys', color: 'text-amber-400' },
    { type: 'app', key: 'system', appId: 'settings', icon: Settings, label: 'Settings', color: 'text-muted-foreground' },
  ],

  power: POWER_CONFIG,
  admin: POWER_CONFIG,
};

export function getDockForTier(tier: UserTier): DockEntry[] {
  return TIER_DOCK_CONFIG[tier] ?? TIER_DOCK_CONFIG[DEFAULT_TIER];
}
