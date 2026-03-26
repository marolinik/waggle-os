import fs from 'node:fs';
import path from 'node:path';
import { MindDB } from '@waggle/core';
import { extractProgressItems, type ProgressItem } from './sessions.js';
import {
  buildWorkspaceState,
  formatWorkspaceStatePrompt,
  type WorkspaceState,
} from '../workspace-state.js';

// ── Types ──────────────────────────────────────────────────────────────

export interface WorkspaceNowBlock {
  workspaceName: string;
  summary: string;           // 2-4 sentences max
  recentDecisions: string[]; // max 3, one line each
  activeThreads: string[];   // max 3, title + last active
  progressItems: string[];   // max 5, formatted as "type: content"
  nextActions: string[];     // max 3, derived from progress/decisions
  /** Time-aware greeting based on hour-of-day and inactivity */
  greeting: string;
  /** Open/blocker progress items as pending tasks */
  pendingTasks: string[];
  /** Next upcoming cron schedules (max 3) */
  upcomingSchedules: string[];
  /** Structured state — richer model for programmatic access */
  structuredState?: WorkspaceState;
}

// Re-export for consumers that need the structured state types
export type { WorkspaceState } from '../workspace-state.js';

// ── Workspace Manager interface (minimal, passed via opts) ─────────────

interface WsManagerLike {
  get: (id: string) => { id: string; name: string } | null;
  getMindPath: (id: string) => string;
}

// ── Summary builder (mirrors composeWorkspaceSummary from workspaces.ts) ──

function buildCompactSummary(
  frames: Array<{ content: string; importance: string; created_at: string }>,
  memoryCount: number,
  sessionCount: number,
): string {
  const parts: string[] = [];

  // What this workspace is about (from important/critical frames)
  const important = frames.filter(f => f.importance === 'critical' || f.importance === 'important');
  const workContextFrames = frames.filter(f =>
    f.content.toLowerCase().includes('project') ||
    f.content.toLowerCase().includes('workspace') ||
    f.content.toLowerCase().includes('working on'),
  );

  const aboutFrame = important[0] ?? workContextFrames[0] ?? frames[0];
  if (aboutFrame) {
    const aboutLine = aboutFrame.content.split('\n')[0].replace(/\.\s*$/, '').trim();
    const aboutText = aboutLine.length > 140 ? aboutLine.slice(0, 137) + '...' : aboutLine;
    if (aboutText.length > 10) {
      parts.push(aboutText + '.');
    }
  }

  // Current state (activity level + recency)
  const mostRecent = frames[0]?.created_at?.slice(0, 10) ?? '';
  const now = new Date();
  const lastDate = mostRecent ? new Date(mostRecent) : null;
  const daysSince = lastDate ? Math.floor((now.getTime() - lastDate.getTime()) / (86400 * 1000)) : 0;

  if (daysSince === 0) {
    parts.push(`Active today with ${memoryCount} memories across ${sessionCount} session${sessionCount !== 1 ? 's' : ''}.`);
  } else if (daysSince === 1) {
    parts.push(`Last active yesterday. ${memoryCount} memories across ${sessionCount} session${sessionCount !== 1 ? 's' : ''}.`);
  } else if (daysSince <= 7) {
    parts.push(`Last active ${daysSince} days ago. ${memoryCount} memories across ${sessionCount} session${sessionCount !== 1 ? 's' : ''}.`);
  } else {
    parts.push(`Last active ${mostRecent}. ${memoryCount} memories across ${sessionCount} session${sessionCount !== 1 ? 's' : ''}.`);
  }

  return parts.join(' ');
}

// ── Relative time formatting ────────────────────────────────────────────

function formatRelativeTime(mtimeMs: number): string {
  const diffMs = Date.now() - mtimeMs;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return mins <= 1 ? 'just now' : `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

// ── Time-aware greeting builder ─────────────────────────────────────

export interface CronScheduleLike {
  name: string;
  next_run_at: string | null;
  enabled: number;
  workspace_id: string | null;
}

/**
 * Build a time-aware greeting based on hour-of-day and workspace inactivity.
 * If the workspace has been inactive for >24h, the greeting reflects the absence duration.
 */
export function buildTimeAwareGreeting(lastActiveIso: string | null): string {
  const now = new Date();
  const hour = now.getHours();

  // Check inactivity override (>24 hours)
  if (lastActiveIso) {
    const lastActive = new Date(lastActiveIso);
    const diffMs = now.getTime() - lastActive.getTime();
    const diffDays = Math.floor(diffMs / (86400 * 1000));
    if (diffDays > 0) {
      const dayLabel = diffDays === 1 ? '1 day' : `${diffDays} days`;
      return `You've been away ${dayLabel}. Here's what happened:`;
    }
  }

  // Time-of-day greeting
  if (hour >= 6 && hour < 12) return "Good morning. Here's your day:";
  if (hour >= 12 && hour < 18) return "Good afternoon. Here's where you left off:";
  if (hour >= 18 && hour <= 23) return "Good evening. Here's what you accomplished today:";
  return "Working late. Here's your current state:";
}

/**
 * Extract pending task labels from structured progress items.
 * Returns open tasks and blockers as human-readable strings.
 */
function extractPendingTasks(progressItems: string[]): string[] {
  return progressItems
    .filter(p => p.startsWith('[task]') || p.startsWith('[blocker]'))
    .map(p => p.replace(/^\[(task|blocker)\]\s*/, ''))
    .slice(0, 5);
}

/**
 * Build upcoming schedule descriptions from cron schedules.
 * Returns the next 3 enabled schedules sorted by next_run_at.
 */
export function buildUpcomingSchedules(schedules: CronScheduleLike[], workspaceId?: string): string[] {
  const upcoming = schedules
    .filter(s => s.enabled === 1 && s.next_run_at)
    .filter(s => !s.workspace_id || s.workspace_id === '*' || s.workspace_id === workspaceId)
    .sort((a, b) => {
      const ta = a.next_run_at ? new Date(a.next_run_at).getTime() : Infinity;
      const tb = b.next_run_at ? new Date(b.next_run_at).getTime() : Infinity;
      return ta - tb;
    })
    .slice(0, 3);

  return upcoming.map(s => {
    const nextDate = s.next_run_at ? new Date(s.next_run_at) : null;
    const timeStr = nextDate
      ? nextDate.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      : 'unknown';
    return `${s.name} at ${timeStr}`;
  });
}

// ── Main builder ───────────────────────────────────────────────────────

export function buildWorkspaceNowBlock(opts: {
  dataDir: string;
  workspaceId: string;
  wsManager: WsManagerLike;
  activateWorkspaceMind: (id: string) => boolean;
  /** Optional cron schedules for upcoming schedule display */
  cronSchedules?: CronScheduleLike[];
}): WorkspaceNowBlock | null {
  const { dataDir, workspaceId, wsManager, activateWorkspaceMind } = opts;

  const ws = wsManager.get(workspaceId);
  if (!ws) return null;

  const mindPath = wsManager.getMindPath(workspaceId);
  if (!fs.existsSync(mindPath)) return null;

  activateWorkspaceMind(workspaceId);

  // ── Try structured state first (new path) ────────────────────
  const structuredState = buildWorkspaceState({
    dataDir,
    workspaceId,
    wsManager,
    activateWorkspaceMind,
  });

  if (structuredState) {
    // Convert structured state → WorkspaceNowBlock for backward compat
    const activeThreads = structuredState.active.slice(0, 3).map(a => {
      const ago = formatRelativeTime(new Date(a.dateLastTouched).getTime());
      const label = a.content.length > 60 ? a.content.slice(0, 57) + '...' : a.content;
      return `${label} (${ago})`;
    });

    const progressItems: string[] = [];
    for (const p of structuredState.pending.slice(0, 3)) {
      progressItems.push(`[task] ${p.content}`);
    }
    for (const b of structuredState.blocked.slice(0, 2)) {
      progressItems.push(`[blocker] ${b.content}`);
    }
    for (const c of structuredState.completed.slice(0, 2)) {
      progressItems.push(`[completed] ${c.content}`);
    }

    const decisions = structuredState.recentDecisions.slice(0, 3).map(d => d.content);

    // Build summary from mind DB (still needed — structuredState doesn't carry it)
    let summary = '';
    let wsDb: MindDB | null = null;
    try {
      wsDb = new MindDB(mindPath);
      const raw = wsDb.getDatabase();
      const memoryCount = (raw.prepare('SELECT COUNT(*) as cnt FROM memory_frames').get() as { cnt: number }).cnt;
      const frames = raw.prepare(
        `SELECT content, importance, created_at FROM memory_frames
         WHERE importance != 'deprecated' AND importance != 'temporary'
         ORDER BY CASE importance
           WHEN 'critical' THEN 1 WHEN 'important' THEN 2
           WHEN 'normal' THEN 3 ELSE 4 END,
         id DESC LIMIT 8`,
      ).all() as Array<{ content: string; importance: string; created_at: string }>;

      const sessDir = path.join(dataDir, 'workspaces', workspaceId, 'sessions');
      const sessCount = fs.existsSync(sessDir)
        ? fs.readdirSync(sessDir).filter(f => f.endsWith('.jsonl')).length
        : 0;

      if (frames.length > 0) {
        summary = buildCompactSummary(frames, memoryCount, sessCount);
      }
      wsDb.close();
      wsDb = null;
    } catch {
      if (wsDb) { try { wsDb.close(); } catch { /* */ } }
    }

    // Compute last active from active threads or structured state
    const lastActiveThread = structuredState.active[0]?.dateLastTouched ?? null;
    const greeting = buildTimeAwareGreeting(lastActiveThread);
    const pendingTasks = extractPendingTasks(progressItems);
    const upcomingSchedules = buildUpcomingSchedules(opts.cronSchedules ?? [], workspaceId);

    return {
      workspaceName: ws.name as string,
      summary,
      recentDecisions: decisions,
      activeThreads,
      progressItems: progressItems.slice(0, 5),
      nextActions: structuredState.nextActions.slice(0, 3),
      greeting,
      pendingTasks,
      upcomingSchedules,
      structuredState,
    };
  }

  // ── Fallback: legacy path (no structured state available) ────
  let summary = '';
  let decisions: string[] = [];
  let wsDb: MindDB | null = null;

  try {
    wsDb = new MindDB(mindPath);
    const raw = wsDb.getDatabase();

    const memoryCount = (raw.prepare('SELECT COUNT(*) as cnt FROM memory_frames').get() as { cnt: number }).cnt;
    if (memoryCount === 0) {
      wsDb.close();
      return null;
    }

    const frames = raw.prepare(
      `SELECT content, importance, created_at FROM memory_frames
       WHERE importance != 'deprecated' AND importance != 'temporary'
       ORDER BY CASE importance
         WHEN 'critical' THEN 1 WHEN 'important' THEN 2
         WHEN 'normal' THEN 3 ELSE 4 END,
       id DESC LIMIT 8`,
    ).all() as Array<{ content: string; importance: string; created_at: string }>;

    const sessDir = path.join(dataDir, 'workspaces', workspaceId, 'sessions');
    const sessCount = fs.existsSync(sessDir)
      ? fs.readdirSync(sessDir).filter(f => f.endsWith('.jsonl')).length
      : 0;

    if (frames.length > 0) {
      summary = buildCompactSummary(frames, memoryCount, sessCount);
    }

    // Extract decisions inline (legacy)
    const decisionFrames = raw.prepare(
      `SELECT content FROM memory_frames
       WHERE importance != 'deprecated' AND importance != 'temporary'
         AND (content LIKE 'Decision%' OR content LIKE '%decided%'
           OR content LIKE '%decision made%' OR content LIKE '%chose %'
           OR content LIKE '%selected %' OR content LIKE '%agreed %'
           OR importance = 'critical')
       ORDER BY id DESC LIMIT 5`,
    ).all() as Array<{ content: string }>;

    decisions = decisionFrames.slice(0, 3).map(f => {
      const firstLine = f.content.split('\n')[0];
      const sentenceMatch = firstLine.match(/^(.+?\.\s)(?=[A-Z])/);
      const text = sentenceMatch
        ? sentenceMatch[1].trim()
        : (firstLine.length > 150 ? firstLine.slice(0, 147) + '...' : firstLine);
      return text.replace(/\.\s*$/, '');
    });

    wsDb.close();
    wsDb = null;
  } catch {
    if (wsDb) { try { wsDb.close(); } catch { /* ignore */ } }
    return null;
  }

  // Extract progress items (cap at 5)
  const sessionsDir = path.join(dataDir, 'workspaces', workspaceId, 'sessions');
  let rawProgress: ProgressItem[] = [];
  if (fs.existsSync(sessionsDir)) {
    try { rawProgress = extractProgressItems(sessionsDir, 5); } catch { /* */ }
  }
  const progressItems = rawProgress.slice(0, 5).map(p => `[${p.type}] ${p.content}`);

  // Derive next actions
  const nextActions: string[] = [];
  for (const p of rawProgress) {
    if (p.type === 'blocker' && nextActions.length < 3) nextActions.push(`Resolve: ${p.content}`);
  }
  for (const p of rawProgress) {
    if (p.type === 'task' && nextActions.length < 3) nextActions.push(p.content);
  }
  if (nextActions.length === 0 && decisions.length > 0) {
    nextActions.push('Review recent decisions and determine next steps');
  }

  // Legacy path: derive last-active from session files
  let legacyLastActive: string | null = null;
  if (fs.existsSync(sessionsDir)) {
    try {
      const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl'));
      let maxMtime = 0;
      for (const file of files) {
        const stat = fs.statSync(path.join(sessionsDir, file));
        if (stat.mtimeMs > maxMtime) maxMtime = stat.mtimeMs;
      }
      if (maxMtime > 0) legacyLastActive = new Date(maxMtime).toISOString();
    } catch { /* */ }
  }

  const greeting = buildTimeAwareGreeting(legacyLastActive);
  const pendingTasks = extractPendingTasks(progressItems);
  const upcomingSchedules = buildUpcomingSchedules(opts.cronSchedules ?? [], workspaceId);

  return {
    workspaceName: ws.name as string,
    summary,
    recentDecisions: decisions,
    activeThreads: [],
    progressItems,
    nextActions: nextActions.slice(0, 3),
    greeting,
    pendingTasks,
    upcomingSchedules,
  };
}

// ── Formatter (for system prompt injection) ────────────────────────────

export function formatWorkspaceNowPrompt(block: WorkspaceNowBlock): string {
  const sections: string[] = [];

  sections.push(`# Workspace Now — ${block.workspaceName}`);
  sections.push('');

  if (block.greeting) {
    sections.push(block.greeting);
    sections.push('');
  }

  if (block.summary) {
    sections.push(block.summary);
    sections.push('');
  }

  if (block.recentDecisions.length > 0) {
    sections.push('## Recent Decisions');
    for (const d of block.recentDecisions) {
      sections.push(`- ${d}`);
    }
    sections.push('');
  }

  if (block.activeThreads.length > 0) {
    sections.push('## Active Threads');
    for (const t of block.activeThreads) {
      sections.push(`- ${t}`);
    }
    sections.push('');
  }

  if (block.progressItems.length > 0) {
    sections.push('## Progress');
    for (const p of block.progressItems) {
      sections.push(`- ${p}`);
    }
    sections.push('');
  }

  if (block.nextActions.length > 0) {
    sections.push('## Likely Next Actions');
    for (const a of block.nextActions) {
      sections.push(`- ${a}`);
    }
    sections.push('');
  }

  // Trim trailing blank line but ensure single newline at end
  return sections.join('\n').trimEnd();
}
