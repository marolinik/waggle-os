/**
 * Workspace State — structured current-state reconstruction for a workspace.
 *
 * Assembles typed, classified items from memory frames, session files,
 * and awareness layer into a coherent model of "what's going on now."
 *
 * Design principles:
 * - Freshness comes from timestamps, not item type (a blocker can be stale)
 * - Stale means "not recently touched", not "unimportant"
 * - Compounding quality > quantity — deduplicate, distill, don't spam
 */

import fs from 'node:fs';
import path from 'node:path';
import { MindDB } from '@waggle/core';
import {
  extractProgressItems,
  extractOpenQuestions,
  classifyThreads,
  type ProgressItem,
  type OpenQuestion,
  type ThreadInfo,
} from './routes/sessions.js';

// ── Types ──────────────────────────────────────────────────────────────

export type Freshness = 'fresh' | 'aging' | 'stale';
export type StateSource = 'memory' | 'session' | 'awareness';

export interface StateItem {
  content: string;
  freshness: Freshness;
  source: StateSource;
  sourceId?: string;
  dateLastTouched: string; // ISO date (YYYY-MM-DD)
}

export interface WorkspaceState {
  /** Currently active threads (fresh sessions, active awareness items) */
  active: StateItem[];
  /** Unresolved questions / undecided items from recent sessions */
  openQuestions: StateItem[];
  /** Tasks mentioned but not yet completed */
  pending: StateItem[];
  /** Items explicitly blocked */
  blocked: StateItem[];
  /** Recently completed work */
  completed: StateItem[];
  /** Threads not touched in 7+ days */
  stale: StateItem[];
  /** Recent decisions from memory */
  recentDecisions: StateItem[];
  /** Derived: prioritized list of what to do next */
  nextActions: string[];
}

// ── Freshness calculation ──────────────────────────────────────────────

/** Thresholds in days */
const FRESH_DAYS = 2;
const AGING_DAYS = 7;

export function computeFreshness(dateStr: string): Freshness {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = diffMs / (86400 * 1000);

  if (diffDays < FRESH_DAYS) return 'fresh';
  if (diffDays < AGING_DAYS) return 'aging';
  return 'stale';
}

// ── Decision extraction from memory frames ─────────────────────────────

interface DecisionFrame {
  id: number;
  content: string;
  created_at: string;
}

function extractDecisionItems(
  raw: ReturnType<MindDB['getDatabase']>,
  max: number,
): StateItem[] {
  const frames = raw.prepare(
    `SELECT id, content, created_at FROM memory_frames
     WHERE importance != 'deprecated' AND importance != 'temporary'
       AND (content LIKE 'Decision%' OR content LIKE '%decided%'
         OR content LIKE '%decision made%' OR content LIKE '%chose %'
         OR content LIKE '%selected %' OR content LIKE '%agreed %'
         OR importance = 'critical')
     ORDER BY id DESC LIMIT ?`,
  ).all(max + 2) as DecisionFrame[];

  return frames.slice(0, max).map(f => {
    const firstLine = f.content.split('\n')[0];
    const sentenceMatch = firstLine.match(/^(.+?\.\s)(?=[A-Z])/);
    const text = sentenceMatch
      ? sentenceMatch[1].trim()
      : (firstLine.length > 150 ? firstLine.slice(0, 147) + '...' : firstLine);

    return {
      content: text.replace(/\.\s*$/, ''),
      freshness: computeFreshness(f.created_at),
      source: 'memory' as StateSource,
      sourceId: String(f.id),
      dateLastTouched: f.created_at.slice(0, 10),
    };
  });
}

// ── Active items from awareness layer ──────────────────────────────────

interface AwarenessRow {
  id: number;
  category: string;
  content: string;
  created_at: string;
}

function extractAwarenessItems(raw: ReturnType<MindDB['getDatabase']>): StateItem[] {
  const items = raw.prepare(
    `SELECT id, category, content, created_at FROM awareness
     WHERE expires_at IS NULL OR expires_at > datetime('now')
     ORDER BY priority DESC LIMIT 10`,
  ).all() as AwarenessRow[];

  return items
    .filter(i => i.category === 'task' || i.category === 'action' || i.category === 'pending')
    .map(i => ({
      content: i.content,
      freshness: computeFreshness(i.created_at),
      source: 'awareness' as StateSource,
      sourceId: String(i.id),
      dateLastTouched: i.created_at.slice(0, 10),
    }));
}

// ── Progress items → StateItems ────────────────────────────────────────

function progressToStateItems(items: ProgressItem[], type: 'task' | 'completed' | 'blocker'): StateItem[] {
  return items
    .filter(p => p.type === type)
    .map(p => ({
      content: p.content,
      freshness: computeFreshness(p.date),
      source: 'session' as StateSource,
      sourceId: p.sessionId,
      dateLastTouched: p.date,
    }));
}

// ── Open questions → StateItems ────────────────────────────────────────

function questionsToStateItems(questions: OpenQuestion[]): StateItem[] {
  return questions.map(q => ({
    content: q.content,
    freshness: computeFreshness(q.date),
    source: 'session' as StateSource,
    sourceId: q.sessionId,
    dateLastTouched: q.date,
  }));
}

// ── Threads → StateItems ───────────────────────────────────────────────

function threadsToStateItems(threads: ThreadInfo[], freshness: Freshness): StateItem[] {
  return threads
    .filter(t => t.freshness === freshness || (freshness === 'fresh' && t.freshness === 'fresh'))
    .map(t => ({
      content: t.title,
      freshness: t.freshness,
      source: 'session' as StateSource,
      sourceId: t.sessionId,
      dateLastTouched: t.lastActive.slice(0, 10),
    }));
}

// ── Next-action derivation (priority cascade) ──────────────────────────

function deriveNextActions(state: Omit<WorkspaceState, 'nextActions'>, max: number): string[] {
  const actions: string[] = [];

  // 1. Blocked items (by freshness — fresher blockers first)
  const freshBlockers = state.blocked.filter(b => b.freshness !== 'stale');
  for (const b of freshBlockers) {
    if (actions.length >= max) break;
    actions.push(`Resolve: ${b.content}`);
  }

  // 2. Open questions
  const freshQuestions = state.openQuestions.filter(q => q.freshness !== 'stale');
  for (const q of freshQuestions) {
    if (actions.length >= max) break;
    actions.push(`Decide: ${q.content}`);
  }

  // 3. Pending tasks
  const freshPending = state.pending.filter(p => p.freshness !== 'stale');
  for (const p of freshPending) {
    if (actions.length >= max) break;
    actions.push(p.content);
  }

  // 4. Stale threads with work
  for (const s of state.stale) {
    if (actions.length >= max) break;
    actions.push(`Resume: ${s.content}`);
  }

  // 5. Fallback
  if (actions.length === 0 && state.recentDecisions.length > 0) {
    actions.push('Review recent decisions and plan next steps');
  }

  return actions.slice(0, max);
}

// ── Main builder ───────────────────────────────────────────────────────

interface WsManagerLike {
  get: (id: string) => { id: string; name: string } | null;
  getMindPath: (id: string) => string;
}

export interface BuildWorkspaceStateOpts {
  dataDir: string;
  workspaceId: string;
  wsManager: WsManagerLike;
  activateWorkspaceMind: (id: string) => boolean;
}

export function buildWorkspaceState(opts: BuildWorkspaceStateOpts): WorkspaceState | null {
  const { dataDir, workspaceId, wsManager, activateWorkspaceMind } = opts;

  const ws = wsManager.get(workspaceId);
  if (!ws) return null;

  const mindPath = wsManager.getMindPath(workspaceId);
  if (!fs.existsSync(mindPath)) return null;

  activateWorkspaceMind(workspaceId);

  // ── Memory-sourced state ─────────────────────────────────────────
  let recentDecisions: StateItem[] = [];
  let awarenessItems: StateItem[] = [];
  let wsDb: MindDB | null = null;

  try {
    wsDb = new MindDB(mindPath);
    const raw = wsDb.getDatabase();

    const memoryCount = (raw.prepare('SELECT COUNT(*) as cnt FROM memory_frames').get() as { cnt: number }).cnt;
    if (memoryCount === 0) {
      wsDb.close();
      return null;
    }

    recentDecisions = extractDecisionItems(raw, 5);
    awarenessItems = extractAwarenessItems(raw);

    wsDb.close();
    wsDb = null;
  } catch {
    if (wsDb) { try { wsDb.close(); } catch { /* ignore */ } }
    return null;
  }

  // ── Session-sourced state ────────────────────────────────────────
  const sessionsDir = path.join(dataDir, 'workspaces', workspaceId, 'sessions');

  let progress: ProgressItem[] = [];
  let openQuestions: OpenQuestion[] = [];
  let threads: ThreadInfo[] = [];

  if (fs.existsSync(sessionsDir)) {
    try { progress = extractProgressItems(sessionsDir, 10); } catch { /* non-blocking */ }
    try { openQuestions = extractOpenQuestions(sessionsDir, 10); } catch { /* non-blocking */ }
    try { threads = classifyThreads(sessionsDir, 20); } catch { /* non-blocking */ }
  }

  // ── Assemble state ──────────────────────────────────────────────

  const pending = progressToStateItems(progress, 'task').slice(0, 5);
  const blocked = progressToStateItems(progress, 'blocker').slice(0, 5);
  const completed = progressToStateItems(progress, 'completed').slice(0, 5);

  // Active = fresh threads + awareness items
  const activeThreadItems = threadsToStateItems(threads.filter(t => t.freshness === 'fresh'), 'fresh').slice(0, 5);
  const active = [...awarenessItems, ...activeThreadItems].slice(0, 5);

  // Stale = threads not recently touched (but potentially still important!)
  const staleThreads = threadsToStateItems(threads.filter(t => t.freshness === 'stale'), 'stale').slice(0, 3);

  const openQuestionItems = questionsToStateItems(openQuestions).slice(0, 5);

  const stateWithoutActions = {
    active,
    openQuestions: openQuestionItems,
    pending,
    blocked,
    completed,
    stale: staleThreads,
    recentDecisions: recentDecisions.slice(0, 5),
  };

  const nextActions = deriveNextActions(stateWithoutActions, 5);

  return { ...stateWithoutActions, nextActions };
}

// ── Formatter (for system prompt injection) ────────────────────────────

export function formatWorkspaceStatePrompt(state: WorkspaceState, workspaceName: string): string {
  const sections: string[] = [];
  sections.push(`# Workspace Now — ${workspaceName}`);
  sections.push('');

  if (state.active.length > 0) {
    sections.push('## Active');
    for (const a of state.active) {
      sections.push(`- ${a.content}${a.freshness === 'aging' ? ' (aging)' : ''}`);
    }
    sections.push('');
  }

  if (state.openQuestions.length > 0) {
    sections.push('## Open Questions');
    for (const q of state.openQuestions) {
      sections.push(`- ${q.content}${q.freshness !== 'fresh' ? ` (${q.freshness})` : ''}`);
    }
    sections.push('');
  }

  if (state.blocked.length > 0) {
    sections.push('## Blocked');
    for (const b of state.blocked) {
      sections.push(`- ${b.content}${b.freshness !== 'fresh' ? ` (${b.freshness})` : ''}`);
    }
    sections.push('');
  }

  if (state.pending.length > 0) {
    sections.push('## Pending');
    for (const p of state.pending) {
      sections.push(`- ${p.content}`);
    }
    sections.push('');
  }

  if (state.recentDecisions.length > 0) {
    sections.push('## Recent Decisions');
    for (const d of state.recentDecisions) {
      sections.push(`- ${d.content}${d.freshness !== 'fresh' ? ` (${d.freshness})` : ''}`);
    }
    sections.push('');
  }

  if (state.completed.length > 0) {
    sections.push('## Completed');
    for (const c of state.completed) {
      sections.push(`- ${c.content}`);
    }
    sections.push('');
  }

  if (state.stale.length > 0) {
    sections.push('## Needs Attention (stale)');
    for (const s of state.stale) {
      sections.push(`- ${s.content} — not touched recently`);
    }
    sections.push('');
  }

  if (state.nextActions.length > 0) {
    sections.push('## Likely Next Actions');
    for (const a of state.nextActions) {
      sections.push(`- ${a}`);
    }
    sections.push('');
  }

  return sections.join('\n').trimEnd();
}
