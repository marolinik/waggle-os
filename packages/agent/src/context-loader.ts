/**
 * Recent-context loaders for the system prompt + PromptAssembler.
 *
 * Extracted from orchestrator.ts (PR-F, 2026-05-27) — was ~165L of mixed
 * SQL + formatting + injection-scanning in the Orchestrator class body.
 * Lifting these as free functions over the mind layers narrows the
 * Orchestrator's surface and makes the two views (string for direct
 * prompt inclusion, typed for assembler) easier to keep aligned.
 *
 * Two views, same backing data:
 *   - `loadRecentContext`: pre-formatted markdown string for the system
 *     prompt (legacy path; injection-scanned and dropped on hit)
 *   - `loadRecentContextFrames`: typed `ContextFrames` for the
 *     PromptAssembler layer (injection scan is the assembler's job)
 *
 * Personal preferences always come from personal mind (cross-workspace
 * continuity); other queries route to workspace mind when active.
 */

import {
  type MindDB,
  type MemoryFrame,
  type AwarenessLayer,
  createCoreLogger,
} from '@waggle/core';
import { scanForInjection } from './injection-scanner.js';
import { CONTEXT_PREVIEW_LENGTH } from './content-constants.js';

const logger = createCoreLogger('context-loader');

/**
 * Mind layers the context loaders read from. Workspace is optional —
 * when null, personal mind is used for both frames and preferences.
 */
export interface ContextLoaderDeps {
  /** Personal mind DB — queried for personal preferences regardless of workspace */
  personalDb: MindDB;
  /** Workspace mind DB if active (else null) */
  workspaceDb: MindDB | null;
  /** Awareness layer (always personal) */
  awareness: AwarenessLayer;
}

/**
 * Typed snapshot for `PromptAssembler`. Caller is responsible for
 * injection-scanning before composing into a prompt.
 *
 * `stateFrames`: I-frames (identity/state snapshots).
 * `recentChanges`: P-frames (deltas) + B-frames (background notes).
 * `activeWork`: structured awareness items (tasks, actions, pending, flags).
 * `keyEntities`: most-connected KG entities (workspace when active).
 * `personalPreferences`: cross-workspace preference/correction frames.
 */
export interface ContextFrames {
  stateFrames: MemoryFrame[];
  recentChanges: MemoryFrame[];
  activeWork: Array<{ category: string; content: string; priority: number }>;
  keyEntities: Array<{ name: string; type: string }>;
  personalPreferences: string[];
}

/** Compact row shape returned by `fetchRecentFrames` */
export interface RecentFrameRow {
  id: number;
  content: string;
  frame_type: string;
  importance: string;
  created_at: string;
}

/**
 * Fetch recent frames ordered by importance then recency. Used by both
 * loadRecentContext and the recallMemory catch-up branch. Excludes
 * 'deprecated' always; optionally excludes 'temporary' (R2 sign-gate
 * authoritative-recall filter).
 */
export function fetchRecentFrames(
  db: MindDB,
  limit: number,
  opts?: { excludeTemporary?: boolean },
): RecentFrameRow[] {
  const raw = db.getDatabase();
  const excludeTemp = opts?.excludeTemporary ?? false;
  const whereClause = excludeTemp
    ? `WHERE importance != 'deprecated' AND importance != 'temporary'`
    : `WHERE importance != 'deprecated'`;
  return raw.prepare(
    `SELECT id, content, frame_type, importance, created_at
     FROM memory_frames
     ${whereClause}
     ORDER BY
       CASE importance
         WHEN 'critical' THEN 0
         WHEN 'important' THEN 1
         WHEN 'normal' THEN 2
         ELSE 3
       END,
       id DESC
     LIMIT ?`
  ).all(limit) as RecentFrameRow[];
}

/**
 * Pre-formatted markdown view of recent context, scanned for prompt
 * injection. Used by the legacy `buildSystemPrompt` path. On a positive
 * scan, returns '' so the poisoned content never enters the prompt.
 */
export function loadRecentContext(deps: ContextLoaderDeps, limit = 5): string {
  // Use workspace mind for recent context when available (it's more relevant)
  const primaryDb = deps.workspaceDb ?? deps.personalDb;
  const raw = primaryDb.getDatabase();

  // Recent memories — prioritized by importance, then recency (A3 fix)
  const recentFrames = fetchRecentFrames(primaryDb, limit);

  // Active tasks (from personal awareness — always available)
  const awarenessCtx = deps.awareness.toContext();

  // Top knowledge entities (from workspace if available).
  // UNION ALL avoids `OR` in the JOIN, which defeats both relation
  // indexes (idx_relations_source, idx_relations_target) at 1M+ relations.
  const topEntities = raw.prepare(
    `SELECT ke.name, ke.entity_type, COUNT(rc.entity_id) as rel_count
     FROM knowledge_entities ke
     LEFT JOIN (
       SELECT source_id AS entity_id FROM knowledge_relations
       UNION ALL
       SELECT target_id AS entity_id FROM knowledge_relations
     ) rc ON rc.entity_id = ke.id
     GROUP BY ke.id ORDER BY rel_count DESC LIMIT 10`
  ).all() as Array<{ name: string; entity_type: string; rel_count: number }>;

  const parts: string[] = [];

  if (recentFrames.length > 0) {
    const source = deps.workspaceDb ? 'Workspace' : 'Personal';
    parts.push(`## Recent ${source} Memory`);
    for (const f of recentFrames) {
      parts.push(`- [${f.importance}] ${f.content.slice(0, CONTEXT_PREVIEW_LENGTH)}`);
    }
  }

  if (awarenessCtx !== 'No active awareness items.') {
    parts.push('\n## Active Tasks & State');
    parts.push(awarenessCtx);
  }

  if (topEntities.length > 0) {
    parts.push('\n## Key Knowledge');
    parts.push(topEntities.map(e => `${e.entity_type}: ${e.name}`).join(', '));
  }

  // E4: Always include personal preferences (cross-workspace continuity)
  {
    const prefDb = deps.personalDb.getDatabase();
    const personalPrefs = prefDb.prepare(
      `SELECT content FROM memory_frames
       WHERE importance != 'deprecated'
         AND (content LIKE 'User preference:%' OR content LIKE 'Correction from user:%'
              OR content LIKE 'Style note:%' OR content LIKE 'Workspace topic:%')
       ORDER BY id DESC LIMIT 5`
    ).all() as Array<{ content: string }>;
    if (personalPrefs.length > 0) {
      const label = deps.workspaceDb
        ? 'Personal Preferences (across all workspaces)'
        : 'Personal Preferences';
      parts.push(`\n## ${label}`);
      for (const p of personalPrefs) {
        parts.push(`- ${p.content.slice(0, CONTEXT_PREVIEW_LENGTH)}`);
      }
    }
  }

  // Review #1: scan preloaded context for injection before it enters the
  // system prompt. Harvested personal preferences and workspace frames
  // can carry poisoned instructions.
  const joined = parts.join('\n');
  const scan = scanForInjection(joined, 'tool_output');
  if (!scan.safe) {
    logger.warn('preloaded context injection detected — dropping', {
      score: scan.score,
      flags: scan.flags,
    });
    return '';
  }
  return joined;
}

/**
 * Typed counterpart to `loadRecentContext`. Returns structured data for
 * the PromptAssembler layer to compose into a model-tier-aware prompt.
 *
 * Pure data — injection scanning is the assembler's responsibility (it
 * has the tier context needed to decide what to drop vs sanitize).
 */
export function loadRecentContextFrames(deps: ContextLoaderDeps, limit = 10): ContextFrames {
  const primaryDb = deps.workspaceDb ?? deps.personalDb;
  const raw = primaryDb.getDatabase();

  const frameRows = raw.prepare(
    `SELECT id, frame_type, gop_id, t, base_frame_id, content, importance, source,
            access_count, created_at, last_accessed
     FROM memory_frames
     WHERE importance != 'deprecated'
     ORDER BY
       CASE importance
         WHEN 'critical' THEN 0
         WHEN 'important' THEN 1
         WHEN 'normal' THEN 2
         ELSE 3
       END,
       id DESC
     LIMIT ?`
  ).all(limit) as MemoryFrame[];

  const stateFrames: MemoryFrame[] = [];
  const recentChanges: MemoryFrame[] = [];
  for (const f of frameRows) {
    if (f.frame_type === 'I') stateFrames.push(f);
    else recentChanges.push(f);
  }

  const awarenessItems = deps.awareness.getAll();
  const activeWork = awarenessItems.map(item => ({
    category: item.category,
    content: item.content,
    priority: item.priority,
  }));

  const topEntities = raw.prepare(
    `SELECT ke.name, ke.entity_type, COUNT(rc.entity_id) as rel_count
     FROM knowledge_entities ke
     LEFT JOIN (
       SELECT source_id AS entity_id FROM knowledge_relations
       UNION ALL
       SELECT target_id AS entity_id FROM knowledge_relations
     ) rc ON rc.entity_id = ke.id
     GROUP BY ke.id ORDER BY rel_count DESC LIMIT 10`
  ).all() as Array<{ name: string; entity_type: string; rel_count: number }>;

  const keyEntities = topEntities.map(e => ({ name: e.name, type: e.entity_type }));

  const prefDb = deps.personalDb.getDatabase();
  const prefRows = prefDb.prepare(
    `SELECT content FROM memory_frames
     WHERE importance != 'deprecated'
       AND (content LIKE 'User preference:%' OR content LIKE 'Correction from user:%'
            OR content LIKE 'Style note:%' OR content LIKE 'Workspace topic:%')
     ORDER BY id DESC LIMIT 5`
  ).all() as Array<{ content: string }>;

  const personalPreferences = prefRows.map(p => p.content);

  return {
    stateFrames,
    recentChanges,
    activeWork,
    keyEntities,
    personalPreferences,
  };
}
