/**
 * Timeline event mapping helpers — label / icon / colour lookup keyed by
 * event type. Extracted from TimelineApp so the label alignment against
 * the backend AuditEventType union (see
 * packages/server/src/local/routes/events.ts) can be unit tested.
 *
 * M-42 / P21: the UI used to key on names like `memory_save` and
 * `agent_spawned` that were never emitted by the server, so Timeline
 * rendered the raw type string with no icon or colour. This module
 * unifies the vocabulary: every type the server actually emits now has
 * a matching entry here, while legacy UI-only names are kept as
 * aliases so older rows continue to render cleanly.
 */
import type { ElementType } from 'react';
import {
  Clock, Zap, Brain, FileText, Bot, Shield, CheckCircle2,
  XCircle,
} from 'lucide-react';
import type { TimelineEvent } from './types';

export type TimelineIcon = ElementType;

/** Canonical event types emitted by packages/server/src/local/routes/events.ts. */
type CanonicalEventType =
  | 'tool_call'
  | 'tool_result'
  | 'memory_write'
  | 'memory_delete'
  | 'workspace_create'
  | 'workspace_update'
  | 'workspace_delete'
  | 'session_start'
  | 'session_end'
  | 'approval_requested'
  | 'approval_granted'
  | 'approval_denied'
  | 'approval_auto'
  | 'export'
  | 'cron_trigger';

/**
 * Legacy UI-only names we once keyed on but that the server never
 * actually emitted. Kept for backward compatibility in case older
 * audit rows or non-audit sources surface them.
 */
type LegacyEventType =
  | 'memory_save'
  | 'agent_spawned'
  | 'skill_installed'
  | 'workflow_execution'
  | 'user_action'
  | 'knowledge_created'
  | 'connector_activated'
  | 'error';

export type KnownEventType = CanonicalEventType | LegacyEventType;

/** Lucide icon per event type. Unknown types fall back to `Zap`. */
export const EVENT_ICONS: Record<KnownEventType, TimelineIcon> = {
  // ── Canonical (server-emitted) ────────────────────────────────────
  tool_call: Zap,
  tool_result: Zap,
  memory_write: Brain,
  memory_delete: Brain,
  workspace_create: FileText,
  workspace_update: FileText,
  workspace_delete: XCircle,
  session_start: Clock,
  session_end: Clock,
  approval_requested: Shield,
  approval_granted: CheckCircle2,
  approval_denied: XCircle,
  approval_auto: Shield,
  export: FileText,
  cron_trigger: Clock,
  // ── Legacy UI-only aliases ────────────────────────────────────────
  memory_save: Brain,
  agent_spawned: Bot,
  skill_installed: FileText,
  workflow_execution: Zap,
  user_action: FileText,
  knowledge_created: Brain,
  connector_activated: Zap,
  error: XCircle,
};

/** Tailwind colour classes per event type. */
export const EVENT_COLORS: Record<KnownEventType, string> = {
  // ── Canonical ─────────────────────────────────────────────────────
  tool_call: 'text-primary border-primary/30',
  tool_result: 'text-primary border-primary/30',
  memory_write: 'text-amber-400 border-amber-400/30',
  memory_delete: 'text-amber-400 border-amber-400/30',
  workspace_create: 'text-sky-400 border-sky-400/30',
  workspace_update: 'text-sky-400 border-sky-400/30',
  workspace_delete: 'text-destructive border-destructive/30',
  session_start: 'text-muted-foreground border-border/30',
  session_end: 'text-muted-foreground border-border/30',
  approval_requested: 'text-primary border-primary/30',
  approval_granted: 'text-emerald-400 border-emerald-400/30',
  approval_denied: 'text-destructive border-destructive/30',
  approval_auto: 'text-emerald-400 border-emerald-400/30',
  export: 'text-sky-400 border-sky-400/30',
  cron_trigger: 'text-amber-400 border-amber-400/30',
  // ── Legacy ────────────────────────────────────────────────────────
  memory_save: 'text-amber-400 border-amber-400/30',
  agent_spawned: 'text-violet-400 border-violet-400/30',
  skill_installed: 'text-sky-400 border-sky-400/30',
  workflow_execution: 'text-primary border-primary/30',
  user_action: 'text-muted-foreground border-border/30',
  knowledge_created: 'text-amber-400 border-amber-400/30',
  connector_activated: 'text-primary border-primary/30',
  error: 'text-destructive border-destructive/30',
};

export const DEFAULT_EVENT_ICON: TimelineIcon = Zap;
export const DEFAULT_EVENT_COLOR = 'text-muted-foreground border-border/30';

/** Lookup helpers — safe against unknown event types. */
export function iconForEvent(eventType: string): TimelineIcon {
  return EVENT_ICONS[eventType as KnownEventType] ?? DEFAULT_EVENT_ICON;
}

export function colorForEvent(eventType: string): string {
  return EVENT_COLORS[eventType as KnownEventType] ?? DEFAULT_EVENT_COLOR;
}

/**
 * Human-readable description of a timeline event. Prefers a verb-subject
 * phrase over the raw type string. Unknown types fall back to the type
 * string with underscores replaced by spaces.
 */
export function describeEvent(e: Pick<TimelineEvent, 'eventType' | 'toolName'>): string {
  switch (e.eventType) {
    // ── Canonical ───────────────────────────────────────────────────
    case 'tool_call':
      return e.toolName ? `Used ${e.toolName}` : 'Tool call';
    case 'tool_result':
      return e.toolName ? `${e.toolName} finished` : 'Tool result';
    case 'memory_write':
    case 'memory_save': // legacy alias
      return 'Saved memory';
    case 'memory_delete':
      return 'Deleted memory';
    case 'workspace_create':
      return 'Created workspace';
    case 'workspace_update':
      return 'Updated workspace';
    case 'workspace_delete':
      return 'Deleted workspace';
    case 'session_start':
      return 'Started session';
    case 'session_end':
      return 'Ended session';
    case 'approval_requested':
      return `Approval requested: ${e.toolName ?? 'action'}`;
    case 'approval_granted':
      return `Approved: ${e.toolName ?? 'action'}`;
    case 'approval_denied':
      return `Denied: ${e.toolName ?? 'action'}`;
    case 'approval_auto':
      return `Auto-approved: ${e.toolName ?? 'action'}`;
    case 'export':
      return 'Exported data';
    case 'cron_trigger':
      return 'Triggered scheduled job';
    // ── Legacy ──────────────────────────────────────────────────────
    case 'agent_spawned':
      return 'Spawned sub-agent';
    case 'skill_installed':
      return 'Installed skill';
    case 'workflow_execution':
      return 'Ran workflow';
    case 'knowledge_created':
      return 'Created knowledge entity';
    case 'connector_activated':
      return 'Activated connector';
    case 'error':
      return 'Error occurred';
    default:
      return e.eventType.replace(/_/g, ' ');
  }
}
