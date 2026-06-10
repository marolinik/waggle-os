/**
 * MCP Hub view-model types (UX-Refactor Phase 4B, S08).
 *
 * `McpListItem` mirrors the GET /api/mcps list item: the static catalog entry
 * joined with the persisted-config + live-runtime instance fields (present
 * only when installed). The runtime's raw 4-state machine arrives as `state`;
 * the coarser shared `McpInstance.status` rides alongside.
 */
import type { McpInstance } from '@waggle/shared';
import type { StatusTone } from '@/components/ui/status-badge';

export type McpRuntimeState = 'starting' | 'ready' | 'error' | 'stopped';

export interface McpListItem {
  id: string;
  name: string;
  description: string;
  category: string;
  official: boolean;
  installCmd: string;
  source: 'catalog' | 'custom';
  installed: boolean;
  tools: string[];
  status?: McpInstance['status'];
  scope?: McpInstance['scope'];
  connectedTo?: string[];
  state?: McpRuntimeState;
}

/** §14.7 runtime status → badge tone + TEXT label (never colour alone). */
export function mcpStateBadge(item: Pick<McpListItem, 'state' | 'status' | 'installed'>): { tone: StatusTone; label: string } {
  switch (item.state) {
    case 'starting': return { tone: 'info', label: 'Starting…' };
    case 'ready': return { tone: 'healthy', label: 'Ready' };
    case 'error': return { tone: 'risk', label: 'Error' };
    case 'stopped': return { tone: 'neutral', label: 'Stopped' };
  }
  if (item.status === 'running') return { tone: 'healthy', label: 'Running' };
  if (item.status === 'error') return { tone: 'risk', label: 'Error' };
  if (item.status === 'stopped') return { tone: 'neutral', label: 'Stopped' };
  if (item.installed) return { tone: 'neutral', label: 'Installed — not running' };
  return { tone: 'neutral', label: 'Not installed' };
}
