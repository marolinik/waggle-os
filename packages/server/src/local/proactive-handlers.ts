/**
 * Proactive Behavior Handlers — Solo mode proactive agent behaviors.
 *
 * These handlers generate contextual notifications based on workspace state,
 * memory activity, and usage patterns. They are triggered by cron schedules
 * and emit results through the notification eventBus so the desktop app's
 * toast system picks them up.
 *
 * Separate from the Team proactive service (ProactiveService) which uses
 * Drizzle/PostgreSQL. These handlers operate on local workspace/mind data.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { WorkspaceManager, WorkspaceConfig } from '@waggle/core';

// ── Types ──────────────────────────────────────────────────────────────

export interface ProactiveMessage {
  type: 'morning_briefing' | 'stale_workspace' | 'task_reminder' | 'capability_suggestion';
  title: string;
  body: string;
  workspaceId?: string;
  actionUrl?: string;
  priority: 'low' | 'medium' | 'high';
}

export interface ProactiveContext {
  dataDir: string;
  workspaceManager: WorkspaceManager;
  /** Get a cached workspace MindDB (opens on demand). Returns null if workspace not found. */
  getWorkspaceMindDb: (workspaceId: string) => import('@waggle/core').MindDB | null;
}

// ── Helpers ────────────────────────────────────────────────────────────

/** Get the most recent session file modification time for a workspace. */
function getLastSessionActivity(dataDir: string, workspaceId: string): Date | null {
  const sessionsDir = path.join(dataDir, 'workspaces', workspaceId, 'sessions');
  if (!fs.existsSync(sessionsDir)) return null;

  const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl'));
  if (files.length === 0) return null;

  let latest = 0;
  for (const file of files) {
    try {
      const stat = fs.statSync(path.join(sessionsDir, file));
      if (stat.mtimeMs > latest) latest = stat.mtimeMs;
    } catch { /* skip unreadable files */ }
  }

  return latest > 0 ? new Date(latest) : null;
}

/** Count pending awareness items in a workspace mind. */
function countPendingAwareness(ctx: ProactiveContext, workspaceId: string): number {
  const db = ctx.getWorkspaceMindDb(workspaceId);
  if (!db) return 0;
  try {
    const raw = db.getDatabase();
    const row = raw.prepare(
      "SELECT COUNT(*) as cnt FROM awareness WHERE (category = 'task' OR category = 'pending') AND (expires_at IS NULL OR expires_at > datetime('now'))",
    ).get() as { cnt: number } | undefined;
    return row?.cnt ?? 0;
  } catch {
    return 0;
  }
}

/** Count memory frames in a workspace mind. */
function countMemoryFrames(ctx: ProactiveContext, workspaceId: string): number {
  const db = ctx.getWorkspaceMindDb(workspaceId);
  if (!db) return 0;
  try {
    const raw = db.getDatabase();
    const row = raw.prepare('SELECT COUNT(*) as cnt FROM memory_frames').get() as { cnt: number } | undefined;
    return row?.cnt ?? 0;
  } catch {
    return 0;
  }
}

/** Count total tool uses logged in improvement_signals (proxy for usage patterns). */
function countToolSignals(ctx: ProactiveContext): number {
  // Use personal mind to check for improvement signals — they track tool patterns
  try {
    const personalMindPath = path.join(ctx.dataDir, 'personal.mind');
    if (!fs.existsSync(personalMindPath)) return 0;
    // We don't re-open the personal mind here; just check if improvement_signals table exists
    // and count entries. This is a lightweight heuristic.
    return 0; // Will be enriched when improvement signals are populated
  } catch {
    return 0;
  }
}

/** Check if any capability packs are installed. */
function hasInstalledCapabilities(dataDir: string): boolean {
  const skillsDir = path.join(dataDir, 'skills');
  if (!fs.existsSync(skillsDir)) return false;
  try {
    const entries = fs.readdirSync(skillsDir);
    return entries.length > 0;
  } catch {
    return false;
  }
}

// ── Handlers ───────────────────────────────────────────────────────────

/** Generate morning briefing across all workspaces. */
export function generateMorningBriefing(ctx: ProactiveContext): ProactiveMessage | null {
  const workspaces = ctx.workspaceManager.list();
  if (workspaces.length === 0) return null;

  const summaryParts: string[] = [];
  let totalPending = 0;
  let staleCount = 0;
  const now = Date.now();
  const STALE_THRESHOLD_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

  for (const ws of workspaces) {
    const pending = countPendingAwareness(ctx, ws.id);
    totalPending += pending;

    const lastActivity = getLastSessionActivity(ctx.dataDir, ws.id);
    if (lastActivity && (now - lastActivity.getTime()) > STALE_THRESHOLD_MS) {
      staleCount++;
    }

    if (pending > 0) {
      summaryParts.push(`${ws.name}: ${pending} pending item${pending === 1 ? '' : 's'}`);
    }
  }

  // W5.8: Also extract recent decisions and memory highlights per workspace
  const decisionParts: string[] = [];
  for (const ws of workspaces.slice(0, 5)) { // cap at 5 workspaces for brevity
    const db = ctx.getWorkspaceMindDb(ws.id);
    if (!db) continue;
    try {
      const raw = db.getDatabase();
      const decisions = raw.prepare(
        `SELECT content FROM memory_frames
         WHERE (importance IN ('critical', 'important') OR content LIKE 'Decision%' OR content LIKE '%decided%')
           AND created_at > datetime('now', '-7 day')
         ORDER BY id DESC LIMIT 2`
      ).all() as Array<{ content: string }>;
      if (decisions.length > 0) {
        decisionParts.push(`**${ws.name}**: ${decisions.map(d => d.content.slice(0, 80)).join(' | ')}`);
      }
    } catch { /* non-blocking */ }
  }

  // Nothing noteworthy — skip the briefing
  if (totalPending === 0 && staleCount === 0 && decisionParts.length === 0) return null;

  const bodyParts: string[] = [];
  bodyParts.push(`${workspaces.length} workspace${workspaces.length === 1 ? '' : 's'} total.`);

  if (totalPending > 0) {
    bodyParts.push(`${totalPending} pending item${totalPending === 1 ? '' : 's'} across workspaces.`);
  }
  if (staleCount > 0) {
    bodyParts.push(`${staleCount} workspace${staleCount === 1 ? '' : 's'} not visited in 14+ days.`);
  }
  if (summaryParts.length > 0) {
    bodyParts.push(summaryParts.slice(0, 3).join('; '));
  }
  // W5.8: Include recent decisions in briefing
  if (decisionParts.length > 0) {
    bodyParts.push('\n\nRecent decisions:\n' + decisionParts.join('\n'));
  }

  return {
    type: 'morning_briefing',
    title: 'Good morning — here\'s your workspace briefing',
    body: bodyParts.join(' '),
    priority: totalPending > 5 ? 'high' : 'medium',
    actionUrl: '/',
  };
}

/** Check for stale workspaces (not visited in 14+ days). */
export function checkStaleWorkspaces(ctx: ProactiveContext): ProactiveMessage[] {
  const workspaces = ctx.workspaceManager.list();
  if (workspaces.length === 0) return [];

  const messages: ProactiveMessage[] = [];
  const now = Date.now();
  const STALE_THRESHOLD_MS = 14 * 24 * 60 * 60 * 1000;

  for (const ws of workspaces) {
    const lastActivity = getLastSessionActivity(ctx.dataDir, ws.id);

    // If no sessions at all, check workspace creation date
    const referenceDate = lastActivity ?? new Date(ws.created);
    const idleDays = Math.floor((now - referenceDate.getTime()) / (24 * 60 * 60 * 1000));

    if (idleDays >= 14) {
      const frameCount = countMemoryFrames(ctx, ws.id);

      messages.push({
        type: 'stale_workspace',
        title: `"${ws.name}" hasn't been visited in ${idleDays} days`,
        body: frameCount > 0
          ? `This workspace has ${frameCount} memory frame${frameCount === 1 ? '' : 's'} that may need attention.`
          : 'Consider archiving or revisiting this workspace.',
        workspaceId: ws.id,
        actionUrl: `/workspace/${ws.id}`,
        priority: idleDays > 30 ? 'medium' : 'low',
      });
    }
  }

  return messages;
}

/** Check for pending tasks across workspaces. */
export function checkPendingTasks(ctx: ProactiveContext): ProactiveMessage[] {
  const workspaces = ctx.workspaceManager.list();
  if (workspaces.length === 0) return [];

  const messages: ProactiveMessage[] = [];

  for (const ws of workspaces) {
    const pending = countPendingAwareness(ctx, ws.id);
    if (pending === 0) continue;

    messages.push({
      type: 'task_reminder',
      title: `${ws.name}: ${pending} pending item${pending === 1 ? '' : 's'}`,
      body: `You have ${pending} unresolved task${pending === 1 ? '' : 's'} or pending item${pending === 1 ? '' : 's'} in "${ws.name}".`,
      workspaceId: ws.id,
      actionUrl: `/workspace/${ws.id}`,
      priority: pending > 3 ? 'high' : 'medium',
    });
  }

  return messages;
}

/** Suggest capabilities based on usage patterns. */
export function suggestCapabilities(ctx: ProactiveContext): ProactiveMessage | null {
  // If the user has no installed capabilities, suggest exploring the catalog
  if (!hasInstalledCapabilities(ctx.dataDir)) {
    return {
      type: 'capability_suggestion',
      title: 'Boost your workflow with capability packs',
      body: 'You haven\'t installed any capability packs yet. Explore Research, Writing, and Planning packs to supercharge your agent.',
      priority: 'low',
      actionUrl: '/capabilities',
    };
  }

  // Check workspace count and memory size for growth-based suggestions
  const workspaces = ctx.workspaceManager.list();
  if (workspaces.length === 0) return null;

  // Count total memories across all workspaces
  let totalFrames = 0;
  for (const ws of workspaces) {
    totalFrames += countMemoryFrames(ctx, ws.id);
  }

  // If accumulating significant memories but no connectors, suggest connectors
  if (totalFrames > 50) {
    const hasConnectors = (() => {
      try {
        const vaultPath = path.join(ctx.dataDir, 'vault.db');
        return fs.existsSync(vaultPath);
      } catch {
        return false;
      }
    })();

    if (!hasConnectors) {
      return {
        type: 'capability_suggestion',
        title: 'Connect your external tools',
        body: `You have ${totalFrames} memories across ${workspaces.length} workspace${workspaces.length === 1 ? '' : 's'}. Consider connecting GitHub, Slack, or other tools for richer context.`,
        priority: 'low',
        actionUrl: '/settings',
      };
    }
  }

  return null;
}
