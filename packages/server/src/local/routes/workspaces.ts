import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { MindDB, WaggleConfig, createFileStore, reconcileFtsIndex } from '@waggle/core';
import { parseTier, getCapabilities } from '@waggle/shared';
import { assertSafeSegment } from './validate.js';
import { validateBody } from '../../validate-body.js';

/** POST /api/workspaces body — create a workspace (name + group required). Model
 *  format + local-path existence get deeper checks in the handler; enum fields
 *  are constrained here so a bad `tone`/`storageType`/`teamRole` 400s cleanly. */
const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(200),
  group: z.string().min(1).max(200),
  icon: z.string().max(200).optional(),
  model: z.string().optional(),
  personaId: z.string().optional(),
  directory: z.string().optional(),
  template: z.string().optional(),
  templateId: z.string().optional(),
  tone: z.enum(['professional', 'casual', 'technical', 'legal', 'marketing']).optional(),
  storageType: z.enum(['virtual', 'local', 'team']).optional(),
  storagePath: z.string().optional(),
  storageConfig: z.record(z.string(), z.unknown()).optional(),
  teamId: z.string().optional(),
  teamServerUrl: z.string().optional(),
  teamRole: z.enum(['owner', 'admin', 'member', 'viewer']).optional(),
  teamUserId: z.string().optional(),
});

/**
 * Workspace trust-boundary fields are immutable through the generic metadata
 * update routes. In particular, accepting storage or execution-root fields
 * here would let a caller rebind an existing workspace to an arbitrary host
 * directory without the create/link validation flow.
 */
const updateWorkspaceSchema = z.object({
  name: z.string().optional(),
  group: z.string().optional(),
  icon: z.string().optional(),
  model: z.string().optional(),
  persona: z.string().nullable().optional(),
  personaId: z.string().nullable().optional(),
  agentGroupId: z.string().nullable().optional(),
  templateId: z.string().optional(),
  tone: z.enum(['professional', 'casual', 'technical', 'legal', 'marketing']).optional(),
  budget: z.number().finite().nullable().optional(),
  status: z.string().optional(),
  description: z.string().optional(),
  type: z.enum(['project', 'client', 'research', 'personal', 'team', 'organization']).optional(),
}).strict();
import { extractProgressItems, type ProgressItem } from './sessions.js';
import { readFileRegistry, type FileRegistryEntry } from './ingest.js';
import { buildWorkspaceState, type WorkspaceState, type StateItem } from '../workspace-state.js';
import { buildTimeAwareGreeting, buildUpcomingSchedules } from './workspace-context.js';
import { emitAuditEvent, getAuditDb } from './events.js';
import { createLogger } from '../logger.js';
const log = createLogger('workspaces');

// G2 (UX-Northstar 2026-06-13): lifecycle statuses settable over PUT/PATCH
const VALID_WORKSPACE_STATUSES = new Set(['active', 'paused', 'archived']);

// BUG-R3-03: Known model IDs for validation
/** Accept any reasonable model string — provider registry is the authority, not a hardcoded set */
function isValidModelId(model: string): boolean {
  if (!model || model.length < 2) return false;
  // Accept any model that follows naming conventions (alphanumeric, hyphens, dots, slashes)
  return /^[a-zA-Z0-9][\w./-]*$/.test(model);
}

function normalizeTeamServerBaseUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      return null;
    }
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

/**
 * A6: Compose a structured workspace summary — the "return reward moment."
 * Produces a narrative summary with: what this workspace is about, recent state, key decisions.
 */
function composeWorkspaceSummary(
  frames: Array<{ content: string; importance: string; created_at: string }>,
  memoryCount: number,
  decisions: Array<{ content: string; created_at: string }>,
  sessionCount: number,
): string {
  const parts: string[] = [];

  // ── What this workspace is about (from important/critical frames) ──
  const important = frames.filter(f => f.importance === 'critical' || f.importance === 'important');
  const workContextFrames = frames.filter(f =>
    f.content.toLowerCase().includes('project') ||
    f.content.toLowerCase().includes('workspace') ||
    f.content.toLowerCase().includes('working on'),
  );

  // Find the best "about" frame
  const aboutFrame = important[0] ?? workContextFrames[0] ?? frames[0];
  const aboutLine = aboutFrame.content.split('\n')[0].replace(/\.\s*$/, '').trim();
  const aboutText = aboutLine.length > 140 ? aboutLine.slice(0, 137) + '...' : aboutLine;
  if (aboutText.length > 10) {
    parts.push(aboutText + '.');
  }

  // ── Current state (activity level + recency) ──
  const mostRecent = frames[0]?.created_at?.slice(0, 10) ?? '';
  const now = new Date();
  const lastDate = mostRecent ? new Date(mostRecent) : null;
  const daysSince = lastDate ? Math.floor((now.getTime() - lastDate.getTime()) / (86400 * 1000)) : 0;

  if (daysSince === 0) {
    parts.push(`Active today with ${memoryCount} ${memoryCount !== 1 ? 'memories' : 'memory'} across ${sessionCount} session${sessionCount !== 1 ? 's' : ''}.`);
  } else if (daysSince === 1) {
    parts.push(`Last active yesterday. ${memoryCount} ${memoryCount !== 1 ? 'memories' : 'memory'} across ${sessionCount} session${sessionCount !== 1 ? 's' : ''}.`);
  } else if (daysSince <= 7) {
    parts.push(`Last active ${daysSince} days ago. ${memoryCount} ${memoryCount !== 1 ? 'memories' : 'memory'} across ${sessionCount} session${sessionCount !== 1 ? 's' : ''}.`);
  } else {
    parts.push(`Last active ${mostRecent}. ${memoryCount} ${memoryCount !== 1 ? 'memories' : 'memory'} across ${sessionCount} session${sessionCount !== 1 ? 's' : ''}.`);
  }

  // D1: Decisions and topics are rendered separately by the UI (ChatArea recentDecisions list),
  // so we omit them from the narrative summary to avoid duplication.

  return parts.join(' ');
}

// ── UX-Refactor Phase 1 (S01/S02) view-model mappers ──────────────────────
// The FE contract (`_phase1-contract.md` §2) mirrors WorkspaceState as
// WorkspaceStateView with stable `{ id, content, date?, freshness? }` items and
// `nextActions` as SuggestedAction[]. Map the server StateItem → that shape.

/** Map a server StateItem list into the contract's `{ id, content, date?, freshness? }` rows. */
export function toStateItemViews(items: StateItem[], prefix: string): Array<{
  id: string;
  content: string;
  date?: string;
  freshness?: StateItem['freshness'];
}> {
  // Index suffix always: multiple items routinely share a sourceId (e.g. all
  // completed items from one session), and the FE uses these ids as React
  // keys — `prefix:sourceId` alone produced duplicate-key collisions.
  return items.map((item, i) => ({
    id: item.sourceId ? `${prefix}:${item.sourceId}:${i}` : `${prefix}:${i}`,
    content: item.content,
    ...(item.dateLastTouched ? { date: item.dateLastTouched } : {}),
    ...(item.freshness ? { freshness: item.freshness } : {}),
  }));
}

/** Project a full WorkspaceState into the FE WorkspaceStateView contract shape. */
function toWorkspaceStateView(state: WorkspaceState, workspaceId: string): {
  active: ReturnType<typeof toStateItemViews>;
  openQuestions: ReturnType<typeof toStateItemViews>;
  pending: ReturnType<typeof toStateItemViews>;
  blocked: ReturnType<typeof toStateItemViews>;
  completed: ReturnType<typeof toStateItemViews>;
  stale: ReturnType<typeof toStateItemViews>;
  recentDecisions: ReturnType<typeof toStateItemViews>;
  nextActions: Array<{ label: string; workspaceId: string; sessionId?: string; kind: string }>;
} {
  return {
    active: toStateItemViews(state.active, 'active'),
    openQuestions: toStateItemViews(state.openQuestions, 'oq'),
    pending: toStateItemViews(state.pending, 'pending'),
    blocked: toStateItemViews(state.blocked, 'blocked'),
    completed: toStateItemViews(state.completed, 'completed'),
    stale: toStateItemViews(state.stale, 'stale'),
    recentDecisions: toStateItemViews(state.recentDecisions, 'decision'),
    nextActions: state.nextActions.map((label) => ({
      label,
      workspaceId,
      kind: 'next-action',
    })),
  };
}

// IMP-012: Template-to-capability-pack mapping for workspace templates
const TEMPLATE_PACK_MAP: Record<string, string> = {
  'sales': 'collaboration_hub',
  'research': 'research_analyst',
  'legal': 'document_master',
  'marketing': 'document_master',
  'code-review': 'developer_workspace',
  'product-launch': 'workflow_automator',
  'agency': 'collaboration_hub',
};

// Wave 1.6: Template-specific agent welcome messages
// Stored in workspace config so the UI can show contextual starter content.
const TEMPLATE_WELCOME: Record<string, string> = {
  'sales-pipeline': "I'm set up as your Sales workspace. I can research prospects, draft outreach emails, prep for calls, and track your pipeline. What's your top priority?",
  'research-project': "I'm your research workspace. I can deep-dive on any topic, synthesize sources, and generate reports. What should we investigate?",
  'code-review': "I'm configured for code work. I can review diffs, debug issues, and analyze architecture. Paste some code or describe what you're working on.",
  'marketing-campaign': "Marketing workspace ready. I can plan campaigns, draft content, analyze competitors, and build content calendars. What's the initiative?",
  'product-launch': "Product workspace activated. I can write PRDs, plan roadmaps, draft stakeholder updates, and track decisions. What's the feature?",
  'legal-review': "Legal workspace ready. I can review contracts, research regulations, draft legal documents, and flag compliance issues. What's the first matter?",
  'agency-consulting': "Consulting workspace set up. I can research clients, draft deliverables, plan projects, and prepare presentations. Who's the client?",
};

/**
 * Wave R (Lane B): cheap per-workspace memory count for the list route. Opens a
 * READONLY raw sqlite connection (no MindDB schema-init, no sqlite-vec load) and
 * runs a single COUNT(*) — far lighter than the full MindDB the /:id/context
 * route uses, and it never touches the MultiMindCache, so the LRU-eviction
 * hazard that originally kept memoryCount off this route does not apply. Returns
 * undefined on any error (missing file / table / lock) so the card omits the
 * count rather than fabricating a 0.
 */
function countWorkspaceMemories(mindPath: string): number | undefined {
  if (!fs.existsSync(mindPath)) return undefined;
  let db: import('better-sqlite3').Database | undefined;
  try {
    db = new Database(mindPath, { readonly: true, fileMustExist: true });
    const row = db.prepare('SELECT COUNT(*) as cnt FROM memory_frames').get() as { cnt: number };
    return row.cnt;
  } catch {
    return undefined;
  } finally {
    try { db?.close(); } catch { /* already closed / never opened */ }
  }
}

/**
 * Wave R (Lane B): title of the most-recent session, for the list card's
 * activity body. Stats the session files (cheap) to find the newest, then reads
 * just that ONE jsonl for its meta/first-message title — bounded per workspace.
 * Returns undefined when there are no sessions or no readable title (never the
 * raw session-<uuid> id, never fabricated).
 */
function readLastSessionTitle(sessionsDir: string): string | undefined {
  try {
    if (!fs.existsSync(sessionsDir)) return undefined;
    const files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith('.jsonl'));
    if (files.length === 0) return undefined;
    let newest: { file: string; mtime: number } | undefined;
    for (const file of files) {
      try {
        const mtime = fs.statSync(path.join(sessionsDir, file)).mtimeMs;
        if (!newest || mtime > newest.mtime) newest = { file, mtime };
      } catch { /* skip unreadable */ }
    }
    if (!newest) return undefined;
    const content = fs.readFileSync(path.join(sessionsDir, newest.file), 'utf-8').trim();
    if (!content) return undefined;
    const lines = content.split('\n').filter((l) => l.trim());
    let title: string | undefined;
    if (lines.length > 0) {
      try {
        const first = JSON.parse(lines[0]);
        if (first.type === 'meta' && first.title) title = String(first.title);
        else if (first.content) title = String(first.content).slice(0, 60);
      } catch { /* fall through */ }
    }
    if (!title && lines.length > 1) {
      try {
        const msg = JSON.parse(lines[1]);
        if (msg.content) title = String(msg.content).slice(0, 60);
      } catch { /* fall through */ }
    }
    const trimmed = title?.trim();
    return trimmed ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

export const workspaceRoutes: FastifyPluginAsync = async (server) => {
  // GET /api/workspaces — list all workspaces (F6: optional ?group and ?teamId filters)
  server.get<{
    Querystring: { group?: string; teamId?: string };
  }>('/api/workspaces', async (request) => {
    let workspaces = server.workspaceManager.list();
    const groupFilter = request.query.group;
    const teamFilter = request.query.teamId;
    if (groupFilter) {
      workspaces = workspaces.filter(ws => ws.group === groupFilter);
    }
    // F3: Filter by teamId — return only workspaces linked to this team
    if (teamFilter) {
      workspaces = workspaces.filter((ws) => ws.teamId === teamFilter || ws.team === teamFilter);
    }
    // Wave F (fix 1a) + Wave R (Lane B): enrich each row with real card signal.
    // - sessionCount: a readdir of the same sessions dir /:id/context counts.
    // - memoryCount: a readonly COUNT(*) over the workspace mind (countWorkspace-
    //   Memories) — this is the R-round "living identity" unlock. It opens a
    //   lightweight readonly connection per row (no schema init, no vec load) and
    //   never touches the MultiMindCache, sidestepping the LRU hazard the prior
    //   comment warned about. Bounded to the user's own handful of workspaces.
    // - lastSessionTitle: the newest session's title, for the card's "Last: …"
    //   activity body.
    // Every enrichment omits its field on any error — never a fabricated 0/string.
    return workspaces.map((ws) => {
      try {
        const sessionsDir = path.join(server.localConfig.dataDir, 'workspaces', ws.id, 'sessions');
        const sessionCount = fs.existsSync(sessionsDir)
          ? fs.readdirSync(sessionsDir).filter((f) => f.endsWith('.jsonl')).length
          : 0;
        const memoryCount = countWorkspaceMemories(server.workspaceManager.getMindPath(ws.id));
        const lastSessionTitle = readLastSessionTitle(sessionsDir);
        return {
          ...ws,
          sessionCount,
          ...(typeof memoryCount === 'number' ? { memoryCount } : {}),
          ...(lastSessionTitle ? { lastSessionTitle } : {}),
        };
      } catch {
        return ws;
      }
    });
  });

  // POST /api/workspaces — create workspace
  server.post<{
    Body: {
      name: string;
      group: string;
      icon?: string;
      model?: string;
      personaId?: string;
      directory?: string;
      template?: string;
      templateId?: string;
      tone?: 'professional' | 'casual' | 'technical' | 'legal' | 'marketing';
      storageType?: 'virtual' | 'local' | 'team';
      storagePath?: string;
      storageConfig?: Record<string, unknown>;
      teamId?: string;
      teamServerUrl?: string;
      teamRole?: 'owner' | 'admin' | 'member' | 'viewer';
      teamUserId?: string;
    };
  }>('/api/workspaces', { preHandler: validateBody(createWorkspaceSchema) }, async (request, reply) => {
    const { name, group, icon, model, personaId, directory, tone, teamId, teamServerUrl, teamRole, teamUserId, storageType, storagePath, storageConfig } = request.body;

    // Tier limit enforcement: check workspaceLimit from @waggle/shared
    try {
      const configPath = path.join(server.localConfig.dataDir, 'config.json');
      const tierRaw = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf-8')).tier : '';
      const tier = parseTier(String(tierRaw ?? '')) ?? 'FREE';
      const caps = getCapabilities(tier);
      if (caps.workspaceLimit > 0) {
        const currentCount = server.workspaceManager.list().length;
        if (currentCount >= caps.workspaceLimit) {
          return reply.status(403).send({
            error: `Workspace limit reached for ${tier} tier (${caps.workspaceLimit} max). Upgrade to create more.`,
            tier,
            limit: caps.workspaceLimit,
            current: currentCount,
          });
        }
      }
    } catch { /* tier check failed — allow creation */ }

    // BUG-R3-03: Validate model ID if provided
    if (model && !isValidModelId(model)) {
      return reply.status(400).send({
        error: `Invalid model ID "${model}". Examples: claude-sonnet-4-6, gpt-4o, gemini-2.0-flash`,

      });
    }
    // Resolve templateId from either templateId or template body field
    const resolvedTemplateId = request.body.templateId ?? request.body.template;
    // Validate local storagePath exists
    if (storageType === 'local' && storagePath) {
      if (!fs.existsSync(storagePath)) {
        return reply.status(400).send({ error: `Storage path does not exist: ${storagePath}` });
      }
    }

    let boundTeamServerUrl = teamServerUrl;
    let teamServerToken: string | undefined;
    const hasTeamId = typeof teamId === 'string' && teamId.trim().length > 0;
    const hasTeamServerUrl = typeof teamServerUrl === 'string' && teamServerUrl.trim().length > 0;
    if ((teamId !== undefined || teamServerUrl !== undefined) && (!hasTeamId || !hasTeamServerUrl)) {
      return reply.status(400).send({ error: 'Team workspaces require both teamId and teamServerUrl' });
    }
    if (teamId && teamServerUrl) {
      const configuredTeamServer = new WaggleConfig(server.localConfig.dataDir).getTeamServer();
      const requestedBaseUrl = normalizeTeamServerBaseUrl(teamServerUrl);
      const configuredBaseUrl = configuredTeamServer?.url
        ? normalizeTeamServerBaseUrl(configuredTeamServer.url)
        : null;
      if (!requestedBaseUrl || !configuredBaseUrl || requestedBaseUrl !== configuredBaseUrl) {
        return reply.status(400).send({ error: 'Team workspace URL must match the configured Team server' });
      }
      boundTeamServerUrl = configuredBaseUrl;
      teamServerToken = configuredTeamServer?.token;
    }

    const ws = server.workspaceManager.create({
      name, group, icon, model, personaId, directory, tone,
      teamId, teamServerUrl: boundTeamServerUrl, teamRole, teamUserId,
      ...(resolvedTemplateId && { templateId: resolvedTemplateId }),
      ...(storageType && { storageType }),
      ...(storagePath && { storagePath }),
      ...(storageConfig && { storageConfig }),
    });

    // Auto-create standard file directory structure
    try {
      const { getStorageProvider } = await import('../storage/index.js');
      const provider = getStorageProvider(
        { id: ws.id, storageType: storageType ?? 'virtual', storagePath, storageConfig },
        server.localConfig.dataDir,
      );
      const maybeStructured = provider as { ensureStructure?: () => void };
      if (typeof maybeStructured.ensureStructure === 'function') {
        maybeStructured.ensureStructure();
      }
    } catch { /* non-blocking */ }

    // Auto-install starter skills on first workspace creation
    try {
      const waggleHome = server.localConfig.dataDir || path.join(os.homedir(), '.waggle');
      const skillsDir = path.join(waggleHome, 'skills');
      const existingSkills = fs.existsSync(skillsDir)
        ? fs.readdirSync(skillsDir).filter(f => f.endsWith('.md'))
        : [];
      if (existingSkills.length < 5) {
        const { installStarterSkills } = await import('@waggle/sdk');
        installStarterSkills(skillsDir);
      }
    } catch {
      // Non-blocking — starter skill installation failure shouldn't block workspace creation
    }

    emitAuditEvent(server, { workspaceId: ws.id, eventType: 'workspace_create', input: JSON.stringify({ name: ws.name, group: ws.group }) });

    // M2-7: Track workspace creation (no content — just template/persona IDs)
    if (server.telemetry) {
      server.telemetry.track('workspace_created', {
        templateId: resolvedTemplateId ?? null,
        personaId: personaId ?? null,
      });
    }

    // M2-5: Seed template starter memory as visible Memory frames
    if (resolvedTemplateId && resolvedTemplateId !== 'blank') {
      try {
        const { BUILT_IN_TEMPLATES } = await import('./workspace-templates.js');
        const tpl = BUILT_IN_TEMPLATES.find(t => t.id === resolvedTemplateId);
        if (tpl?.starterMemory?.length) {
          const mindPath = server.workspaceManager.getMindPath(ws.id);
          const wsDb = new MindDB(mindPath);
          const raw = wsDb.getDatabase();
          // Create a synthetic session for onboarding frames (FK enforced)
          raw.prepare(
            "INSERT OR IGNORE INTO sessions (gop_id, project_id, status, summary) VALUES (?, ?, 'closed', 'Workspace template starter content')"
          ).run(`onboarding-${ws.id}`, ws.id);
          // Seed each starter memory as an I-frame
          const insert = raw.prepare(
            "INSERT INTO memory_frames (frame_type, gop_id, t, content, importance, source) VALUES ('I', ?, ?, ?, 'normal', 'system')"
          );
          for (let i = 0; i < tpl.starterMemory.length; i++) {
            insert.run(`onboarding-${ws.id}`, i, tpl.starterMemory[i]);
          }
          // These raw INSERTs bypass FrameStore.indexFts(), so the starter frames
          // would be present in memory_frames but invisible to FTS5 keyword search.
          // Reconcile the FTS index to make them searchable.
          reconcileFtsIndex(wsDb);
          wsDb.close();
        }
      } catch (err) {
        // Non-blocking — workspace creation succeeds even if memory seeding fails
        log.warn(`[waggle] Starter memory seeding failed:`, (err as Error).message);
      }
    }

    // IMP-012: Fire-and-forget template skill pack installation
    const template = resolvedTemplateId;
    if (template && TEMPLATE_PACK_MAP[template]) {
      const packId = TEMPLATE_PACK_MAP[template];
      const addr = server.server.address();
      const port = (addr && typeof addr === 'object') ? addr.port : 3333;
      fetch(`http://127.0.0.1:${port}/api/skills/capability-packs/${packId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => { /* pack install is best-effort */ });
    }

    // Register workspace on team server (fire-and-forget)
    if (teamId && boundTeamServerUrl && teamServerToken) {
      try {
        fetch(`${boundTeamServerUrl}/api/teams/${teamId}/entities`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${teamServerToken}`,
          },
          body: JSON.stringify({
            entityType: 'workspace',
            name: ws.id,
            properties: {
              displayName: ws.name,
              group: ws.group,
              model: ws.model,
              personaId: ws.personaId,
              createdBy: teamUserId ?? 'local-user',
            },
          }),
          signal: AbortSignal.timeout(5000),
        }).catch(err => {
          log.warn(`[waggle] Team workspace registration failed:`, err.message);
        });
      } catch { /* team registration is best-effort */ }
    }

    return reply.status(201).send(ws);
  });

  // GET /api/workspaces/:id — get workspace by id
  server.get<{ Params: { id: string } }>('/api/workspaces/:id', async (request, reply) => {
    assertSafeSegment(request.params.id, 'id');
    const ws = server.workspaceManager.get(request.params.id);
    if (!ws) {
      return reply.status(404).send({ error: 'Workspace not found' });
    }
    return ws;
  });

  // GET /api/workspaces/:id/context — workspace catch-up context
  // Returns summary, recent threads, suggested prompts, and stats.
  // Used by the frontend to show the "Workspace Now" block on workspace open.
  server.get<{ Params: { id: string } }>('/api/workspaces/:id/context', async (request, reply) => {
    const { id } = request.params;
    assertSafeSegment(id, 'id');

    const ws = server.workspaceManager.get(id);
    if (!ws) {
      return reply.status(404).send({ error: 'Workspace not found' });
    }

    // ── Gather workspace memory context ──────────────────────
    let summary = '';
    let memoryCount = 0;
    let recentMemories: Array<{ content: string; importance: string; source: string; date: string }> = [];
    let recentDecisions: Array<{ content: string; source: string; date: string }> = [];

    const mindPath = server.workspaceManager.getMindPath(id);
    if (fs.existsSync(mindPath)) {
      try {
        // Activate workspace mind to access its data
        server.agentState.activateWorkspaceMind(id);

        // Read workspace memory stats and recent frames
        const wsDb = new MindDB(mindPath);
        const raw = wsDb.getDatabase();

        memoryCount = (raw.prepare('SELECT COUNT(*) as cnt FROM memory_frames').get() as { cnt: number }).cnt;

        // Get recent important memories for the summary
        // D2: Order by importance first (matching A3 preloaded-context fix), then recency
        const frames = raw.prepare(
          `SELECT content, importance, source, created_at FROM memory_frames
           WHERE importance != 'deprecated' AND importance != 'temporary'
           ORDER BY CASE importance
             WHEN 'critical' THEN 1 WHEN 'important' THEN 2
             WHEN 'normal' THEN 3 ELSE 4 END,
           id DESC LIMIT 8`
        ).all() as Array<{ content: string; importance: string; source: string; created_at: string }>;

        recentMemories = frames.map(f => ({
          content: f.content.slice(0, 200),
          importance: f.importance,
          source: f.source,
          date: f.created_at?.slice(0, 10) ?? 'unknown',
        }));

        // Extract decision-like memories (moved before summary so we can pass them)
        const decisionFrames = raw.prepare(
          `SELECT content, source, created_at FROM memory_frames
           WHERE importance != 'deprecated' AND importance != 'temporary'
             AND (content LIKE 'Decision%' OR content LIKE '%decided%'
               OR content LIKE '%decision made%' OR content LIKE '%chose %'
               OR content LIKE '%selected %' OR content LIKE '%agreed %'
               OR importance = 'critical')
           ORDER BY id DESC LIMIT 5`
        ).all() as Array<{ content: string; source: string; created_at: string }>;

        recentDecisions = decisionFrames.map(f => {
          const firstLine = f.content.split('\n')[0];
          const sentenceMatch = firstLine.match(/^(.+?\.\s)(?=[A-Z])/);
          const text = sentenceMatch
            ? sentenceMatch[1].trim()
            : (firstLine.length > 150 ? firstLine.slice(0, 147) + '...' : firstLine);
          return {
            content: text.replace(/\.\s*$/, ''),
            source: f.source,
            date: f.created_at?.slice(0, 10) ?? 'unknown',
          };
        });

        // A6: Build structured summary with decisions + session count
        if (frames.length > 0) {
          // Count sessions from filesystem (we'll have accurate count later, estimate here)
          const sessDir = path.join(server.localConfig.dataDir, 'workspaces', id, 'sessions');
          const sessCount = fs.existsSync(sessDir) ? fs.readdirSync(sessDir).filter(f => f.endsWith('.jsonl')).length : 0;
          summary = composeWorkspaceSummary(frames, memoryCount, decisionFrames, sessCount);
        }

        wsDb.close();
      } catch {
        // If workspace mind can't be read, continue with empty context
      }
    }

    // ── Gather session info ──────────────────────────────────
    const sessionsDir = path.join(server.localConfig.dataDir, 'workspaces', id, 'sessions');
    let sessionCount = 0;
    const recentThreads: Array<{ id: string; title: string; lastActive: string }> = [];

    if (fs.existsSync(sessionsDir)) {
      const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl'));
      sessionCount = files.length;

      // Get recent session titles
      const sessionMeta: Array<{ id: string; title: string; mtime: number }> = [];
      for (const file of files) {
        const sessionId = file.replace('.jsonl', '');
        const filePath = path.join(sessionsDir, file);
        try {
          const stat = fs.statSync(filePath);
          const content = fs.readFileSync(filePath, 'utf-8').trim();
          const lines = content ? content.split('\n').filter(l => l.trim()) : [];

          let title = sessionId;
          // Check meta line for title
          if (lines.length > 0) {
            try {
              const first = JSON.parse(lines[0]);
              if (first.type === 'meta' && first.title) title = first.title;
              else if (first.content) title = first.content.slice(0, 50);
            } catch { /* use default */ }
          }
          // Fallback: first user message
          if (title === sessionId && lines.length > 1) {
            try {
              const msg = JSON.parse(lines[1]);
              if (msg.content) title = msg.content.slice(0, 50);
            } catch { /* use default */ }
          }

          sessionMeta.push({ id: sessionId, title, mtime: stat.mtimeMs });
        } catch { /* skip */ }
      }

      // Sort by last modified, take top 5
      sessionMeta.sort((a, b) => b.mtime - a.mtime);
      for (const s of sessionMeta.slice(0, 5)) {
        recentThreads.push({
          id: s.id,
          title: s.title,
          lastActive: new Date(s.mtime).toISOString(),
        });
      }
    }

    // ── F2: Count registered files ─────────────────────────
    const fileRegistry = readFileRegistry(server.localConfig.dataDir, id);
    const fileCount = fileRegistry.length;

    // ── E3: Extract progress items from sessions ───────────
    let progressItems: ProgressItem[] = [];
    if (fs.existsSync(sessionsDir)) {
      try {
        progressItems = extractProgressItems(sessionsDir, 8);
      } catch { /* non-blocking */ }
    }

    // ── Build contextual suggested prompts ──────────────────
    const suggestedPrompts: string[] = [];

    if (memoryCount === 0 && sessionCount === 0) {
      // Brand new workspace — action-oriented onboarding prompts
      suggestedPrompts.push('Tell me about this project so I can remember it');
      suggestedPrompts.push('Help me think through what to work on first');
      suggestedPrompts.push('What can you do in this workspace?');
    } else {
      // Workspace with history — contextual prompts
      if (recentThreads.length > 0) {
        const topThread = recentThreads[0].title;
        const resumeLabel = topThread.length > 40 ? topThread.slice(0, 37) + '...' : topThread;
        suggestedPrompts.push(`Continue: ${resumeLabel}`);
      }
      suggestedPrompts.push('Catch me up on this workspace');
      if (recentDecisions.length > 0) {
        suggestedPrompts.push('Review recent decisions and next steps');
      } else {
        suggestedPrompts.push('What matters here now?');
      }
      const hasBlockers = progressItems.some(p => p.type === 'blocker');
      const hasOpenTasks = progressItems.some(p => p.type === 'task');
      if (hasBlockers) {
        suggestedPrompts.push('What\'s blocking us right now?');
      } else if (hasOpenTasks) {
        suggestedPrompts.push('What should I do next?');
      } else {
        suggestedPrompts.push('What should I do next?');
      }
      if (ws.directory) {
        suggestedPrompts.push('What files are in this workspace?');
      } else {
        suggestedPrompts.push('Draft an update from what we know');
      }
    }

    // ── Structured workspace state (Slice 6) ──────────────
    let workspaceState: WorkspaceState | null = null;
    try {
      workspaceState = buildWorkspaceState({
        dataDir: server.localConfig.dataDir,
        workspaceId: id,
        wsManager: server.workspaceManager,
        activateWorkspaceMind: server.agentState.activateWorkspaceMind,
      });
    } catch { /* non-blocking */ }

    // ── J4: Team catch-up context (for team workspaces) ────
    let teamContext: {
      isTeam: boolean;
      teamId?: string;
      tasks?: Array<{ id: string; title: string; status: string; assigneeName?: string }>;
    } | undefined;

    if (ws.teamId) {
      teamContext = { isTeam: true, teamId: ws.teamId };

      // Load workspace tasks
      try {
        const { readTasks } = await import('./tasks.js');
        const tasks = readTasks(server.localConfig.dataDir, id);
        teamContext.tasks = tasks.map(t => ({
          id: t.id, title: t.title, status: t.status, assigneeName: t.assigneeName,
        }));
      } catch { /* tasks file may not exist */ }

      // Add team-specific suggested prompts
      if (suggestedPrompts.length > 0) {
        suggestedPrompts.push('What has the team been working on?');
        if (teamContext.tasks && teamContext.tasks.some(t => t.status === 'open')) {
          suggestedPrompts.push('What team tasks are open?');
        }
      }
    }

    // Wave 1.6: Resolve template-specific welcome message for first-time context
    const welcomeMessage = ws.templateId ? TEMPLATE_WELCOME[ws.templateId] : undefined;

    // Wave 3.1: Time-aware greeting, pending tasks, and upcoming schedules
    // FR #29: pass memoryCount so a brand-new workspace shows fresh-state copy
    // ("Welcome — anything you discuss here will be remembered.") instead of
    // the time-of-day fallback (e.g. "Working late. Here's your current state:")
    // surfacing on a workspace with no current state.
    const lastActive = recentThreads[0]?.lastActive ?? ws.created;
    const greeting = buildTimeAwareGreeting(lastActive, { frameCount: memoryCount });

    const pendingTasks = progressItems
      .filter(p => p.type === 'task' || p.type === 'blocker')
      .map(p => p.content)
      .slice(0, 5);

    let upcomingSchedules: string[] = [];
    try {
      const cronSchedules = server.cronStore.list();
      upcomingSchedules = buildUpcomingSchedules(cronSchedules, id);
    } catch { /* non-blocking — cron store may not be available */ }

    // ── Wave 6.5 (DISABLED): Cross-workspace relevance hints ──
    // Security review (cowork/Code-Review_MultiMind_April-2026.md Critical #1) flagged
    // the original implementation as a privacy leak: it iterated every workspace the
    // user owns, opened each MindDB directly, and returned 80-char content snippets in
    // the HTTP response with NO grant check and no approval gate. That is a complete
    // bypass of the `read_other_workspace` agent-tool approval contract.
    //
    // Keeping the field to preserve frontend compat (consumed by WorkspaceBriefing.tsx
    // + ChatArea.tsx) but returning an empty array until grant-based access is wired
    // through `server.approvalGrantStore`. Cross-workspace context remains available
    // via the agent tool path where user approval is enforced.
    const crossWorkspaceHints: string[] = [];

    return {
      // P2 (PRD §12.2 header FRs): project type/status/description so the
      // Workspace Desktop header renders real values — the FE already reads
      // all three (`ctx?.workspace?.type` / `.status` / description) and fell
      // back to hardcoded 'active' while the block omitted them.
      workspace: {
        id: ws.id, name: ws.name, group: ws.group, model: ws.model,
        directory: ws.directory, templateId: ws.templateId, personaId: ws.personaId,
        ...(ws.description ? { description: ws.description } : {}),
        ...(ws.type ? { type: ws.type } : {}),
        status: ws.status ?? 'active',
      },
      // FR #25: avoid the "Default Workspace workspace" duplication when the
      // workspace name already includes the word "workspace". The fallback now
      // names the workspace inline rather than treating "workspace" as a noun
      // suffix on top of the name.
      summary: summary || `Everything you discuss in ${ws.name} stays in context — decisions, research, and progress are remembered across sessions.`,
      recentThreads,
      recentDecisions,
      suggestedPrompts,
      recentMemories,
      progressItems: progressItems.slice(0, 10),
      stats: {
        memoryCount,
        sessionCount,
        fileCount,
      },
      lastActive,
      greeting,
      pendingTasks,
      upcomingSchedules,
      welcomeMessage,
      teamContext,
      workspaceState,
      crossWorkspaceHints: crossWorkspaceHints.length > 0 ? crossWorkspaceHints : undefined,
    };
  });

  // UX-Refactor Phase 1 (S01/S02): GET /api/workspaces/:id/state — thin route
  // over the existing buildWorkspaceState() builder, projected into the FE
  // WorkspaceStateView contract. Returns the bare object (no envelope) per
  // `_phase1-contract.md` §3. 404 for unknown workspaces; an empty state (no
  // memory yet) yields all-empty arrays so the Workspace Desktop renders its
  // empty-state cleanly rather than erroring.
  server.get<{ Params: { id: string } }>('/api/workspaces/:id/state', async (request, reply) => {
    const { id } = request.params;
    assertSafeSegment(id, 'id');
    const ws = server.workspaceManager.get(id);
    if (!ws) {
      return reply.status(404).send({ error: 'Workspace not found' });
    }

    let state: WorkspaceState | null = null;
    try {
      state = buildWorkspaceState({
        dataDir: server.localConfig.dataDir,
        workspaceId: id,
        wsManager: server.workspaceManager,
        activateWorkspaceMind: server.agentState.activateWorkspaceMind,
      });
    } catch (err) {
      log.warn(`state build failed for ${id}:`, (err as Error).message);
    }

    if (!state) {
      // No memory yet (or unreadable) — return the empty view so the FE can
      // render its empty-state instead of treating the absence as a failure.
      return {
        active: [], openQuestions: [], pending: [], blocked: [],
        completed: [], stale: [], recentDecisions: [], nextActions: [],
      };
    }

    return toWorkspaceStateView(state, id);
  });

  // UX-Refactor Phase 1 (S02): GET /api/workspaces/:id/activity — thin alias
  // over the audit-event store, scoped to this workspace and shaped into the
  // FE WorkspaceActivityEvent contract (`{ events: [...] }`). Reuses the same
  // audit.db the /api/events listing reads; no new store.
  server.get<{
    Params: { id: string };
    Querystring: { limit?: string };
  }>('/api/workspaces/:id/activity', async (request, reply) => {
    const { id } = request.params;
    assertSafeSegment(id, 'id');
    const ws = server.workspaceManager.get(id);
    if (!ws) {
      return reply.status(404).send({ error: 'Workspace not found' });
    }

    const limit = Math.min(parseInt(request.query.limit ?? '50', 10) || 50, 200);

    let rows: Array<{
      id: number;
      timestamp: string;
      event_type: string;
      tool_name: string | null;
      user_id: string | null;
    }> = [];
    try {
      const db = getAuditDb(server.localConfig.dataDir);
      rows = db
        .prepare(
          `SELECT id, timestamp, event_type, tool_name, user_id
           FROM audit_events WHERE workspace_id = ?
           ORDER BY id DESC LIMIT ?`,
        )
        .all(id, limit) as typeof rows;
    } catch (err) {
      // Degrade gracefully — an unreadable audit DB yields an empty feed.
      log.warn(`activity read failed for ${id}:`, (err as Error).message);
    }

    const events = rows.map((row) => ({
      id: row.id,
      ts: row.timestamp,
      type: row.event_type,
      ...(row.user_id ? { actor: row.user_id } : {}),
      summary: row.tool_name ? `${row.event_type}: ${row.tool_name}` : row.event_type,
    }));

    return { events };
  });

  // F2: GET /api/workspaces/:id/files — list ingested files
  server.get<{ Params: { id: string } }>('/api/workspaces/:id/files', async (request, reply) => {
    const { id } = request.params;
    assertSafeSegment(id, 'id');
    const ws = server.workspaceManager.get(id);
    if (!ws) {
      return reply.status(404).send({ error: 'Workspace not found' });
    }
    // The ingest registry (files.jsonl) and the storage-provider filesystem are
    // two disjoint stores: Harvest/ingest appends to the registry, while uploads
    // write to the provider fs. Union both so uploaded files also appear here.
    // Registry wins on a name collision.
    const registry = readFileRegistry(server.localConfig.dataDir, id);
    const registryNames = new Set(registry.map((f) => f.name));
    const storageRows: FileRegistryEntry[] = [];
    try {
      const { getStorageProvider } = await import('../storage/index.js');
      const provider = getStorageProvider(
        {
          id,
          storageType: ws.storageType ?? 'virtual',
          storagePath: ws.storagePath,
          storageConfig: (ws as unknown as { storageConfig?: Record<string, unknown> }).storageConfig,
        },
        server.localConfig.dataDir,
      );
      const entries = await provider.list('/');
      for (const e of entries) {
        if (e.type !== 'file') continue;
        if (registryNames.has(e.name)) continue;
        storageRows.push({
          name: e.name,
          type: e.mimeType ?? 'file',
          summary: '',
          sizeBytes: e.size ?? 0,
          ingestedAt: e.modifiedAt ?? e.createdAt ?? '',
        });
      }
    } catch {
      // Non-blocking — a missing/unreadable storage root degrades to registry-only.
    }
    // Registry newest-first, then storage-only rows.
    const files = [...registry].reverse().concat(storageRows);
    return { files };
  });

  // PUT /api/workspaces/:id — update workspace
  server.put<{
    Params: { id: string };
    Body: { name?: string; group?: string; icon?: string; model?: string; persona?: string | null; personaId?: string | null; agentGroupId?: string | null; templateId?: string; tone?: 'professional' | 'casual' | 'technical' | 'legal' | 'marketing'; budget?: number | null; status?: 'active' | 'paused' | 'archived'; description?: string; type?: 'project' | 'client' | 'research' | 'personal' | 'team' | 'organization' };
  }>('/api/workspaces/:id', { preHandler: validateBody(updateWorkspaceSchema) }, async (request, reply) => {
    assertSafeSegment(request.params.id, 'id');
    const existing = server.workspaceManager.get(request.params.id);
    if (!existing) {
      return reply.status(404).send({ error: 'Workspace not found' });
    }
    // BUG-R3-03: Validate model ID if provided
    if (request.body.model && !isValidModelId(request.body.model)) {
      return reply.status(400).send({
        error: `Invalid model ID "${request.body.model}". Examples: claude-sonnet-4-6, gpt-4o, gemini-2.0-flash`,

      });
    }
    if (request.body.status !== undefined && !VALID_WORKSPACE_STATUSES.has(request.body.status)) {
      return reply.status(400).send({ error: `Invalid status "${request.body.status}". Must be one of: active, paused, archived` });
    }
    const { persona, personaId, agentGroupId, ...rest } = request.body;
    const normalizedPersonaId = personaId !== undefined ? personaId : persona;
    server.workspaceManager.update(request.params.id, {
      ...rest,
      ...(normalizedPersonaId !== undefined ? { personaId: normalizedPersonaId ?? undefined } : {}),
      ...(agentGroupId !== undefined ? { agentGroupId: agentGroupId ?? undefined } : {}),
    });
    emitAuditEvent(server, { workspaceId: request.params.id, eventType: 'workspace_update', input: JSON.stringify(request.body) });
    return server.workspaceManager.get(request.params.id);
  });

  // PATCH /api/workspaces/:id — partial update (same as PUT but PATCH method)
  server.patch<{
    Params: { id: string };
    Body: { name?: string; group?: string; icon?: string; model?: string; persona?: string | null; personaId?: string | null; agentGroupId?: string | null; templateId?: string; tone?: 'professional' | 'casual' | 'technical' | 'legal' | 'marketing'; budget?: number | null; status?: 'active' | 'paused' | 'archived'; description?: string; type?: 'project' | 'client' | 'research' | 'personal' | 'team' | 'organization' };
  }>('/api/workspaces/:id', { preHandler: validateBody(updateWorkspaceSchema) }, async (request, reply) => {
    assertSafeSegment(request.params.id, 'id');
    const existing = server.workspaceManager.get(request.params.id);
    if (!existing) {
      return reply.status(404).send({ error: 'Workspace not found' });
    }
    if (request.body.model && !isValidModelId(request.body.model)) {
      return reply.status(400).send({ error: `Invalid model ID "${request.body.model}"` });
    }
    if (request.body.status !== undefined && !VALID_WORKSPACE_STATUSES.has(request.body.status)) {
      return reply.status(400).send({ error: `Invalid status "${request.body.status}". Must be one of: active, paused, archived` });
    }
    const { persona, personaId, agentGroupId, ...rest } = request.body;
    const normalizedPersonaId = personaId !== undefined ? personaId : persona;
    server.workspaceManager.update(request.params.id, {
      ...rest,
      ...(normalizedPersonaId !== undefined ? { personaId: normalizedPersonaId ?? undefined } : {}),
      ...(agentGroupId !== undefined ? { agentGroupId: agentGroupId ?? undefined } : {}),
    });
    emitAuditEvent(server, { workspaceId: request.params.id, eventType: 'workspace_update', input: JSON.stringify(request.body) });
    return server.workspaceManager.get(request.params.id);
  });

  // DELETE /api/workspaces/:id — delete workspace
  server.delete<{ Params: { id: string } }>('/api/workspaces/:id', async (request, reply) => {
    assertSafeSegment(request.params.id, 'id');
    const existing = server.workspaceManager.get(request.params.id);
    if (!existing) {
      return reply.status(404).send({ error: 'Workspace not found' });
    }
    // A6: Close workspace mind DB before filesystem deletion to prevent EBUSY
    server.agentState.closeWorkspaceMind(request.params.id);
    server.workspaceManager.delete(request.params.id);
    emitAuditEvent(server, { workspaceId: request.params.id, eventType: 'workspace_delete' });
    return reply.status(204).send();
  });

  // GET /api/workspaces/:id/export — export workspace data as JSON or briefing markdown
  server.get<{
    Params: { id: string };
    Querystring: { format?: string };
  }>('/api/workspaces/:id/export', async (request, reply) => {
    const { id } = request.params;
    assertSafeSegment(id, 'id');

    const ws = server.workspaceManager.get(id);
    if (!ws) {
      return reply.status(404).send({ error: 'Workspace not found' });
    }

    // ── Gather memories ──────────────────────────────────────────
    const memories: Array<{ content: string; importance: string; created_at: string; frame_type?: string }> = [];
    const mindPath = server.workspaceManager.getMindPath(id);
    if (fs.existsSync(mindPath)) {
      try {
        const wsDb = new MindDB(mindPath);
        const raw = wsDb.getDatabase();
        const frames = raw.prepare(
          `SELECT content, importance, created_at, frame_type FROM memory_frames
           WHERE importance != 'deprecated'
           ORDER BY id DESC LIMIT 500`
        ).all() as Array<{ content: string; importance: string; created_at: string; frame_type: string }>;
        memories.push(...frames);
        wsDb.close();
      } catch { /* non-blocking */ }
    }

    // ── Gather pinned items ──────────────────────────────────────
    let pinnedItems: Array<{ id: string; messageContent: string; pinnedAt: string; label?: string }> = [];
    try {
      const pinsDir = path.join(server.localConfig.dataDir, 'workspaces', id, 'pins.json');
      if (fs.existsSync(pinsDir)) {
        pinnedItems = JSON.parse(fs.readFileSync(pinsDir, 'utf-8'));
      }
    } catch { /* non-blocking */ }

    // ── Gather session list ──────────────────────────────────────
    const sessionsDir = path.join(server.localConfig.dataDir, 'workspaces', id, 'sessions');
    const sessions: Array<{ id: string; title: string; lastActive: string }> = [];
    if (fs.existsSync(sessionsDir)) {
      const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl'));
      for (const file of files) {
        const sessionId = file.replace('.jsonl', '');
        const filePath = path.join(sessionsDir, file);
        try {
          const stat = fs.statSync(filePath);
          const content = fs.readFileSync(filePath, 'utf-8').trim();
          const lines = content ? content.split('\n').filter(l => l.trim()) : [];
          let title = sessionId;
          if (lines.length > 0) {
            try {
              const first = JSON.parse(lines[0]);
              if (first.type === 'meta' && first.title) title = first.title;
              else if (first.content) title = first.content.slice(0, 80);
            } catch { /* use default */ }
          }
          sessions.push({ id: sessionId, title, lastActive: new Date(stat.mtimeMs).toISOString() });
        } catch { /* skip */ }
      }
      sessions.sort((a, b) => b.lastActive.localeCompare(a.lastActive));
    }

    // ── Briefing format ──────────────────────────────────────────
    if (request.query.format === 'briefing') {
      const lines: string[] = [];
      lines.push(`# Workspace Briefing: ${ws.name}`);
      lines.push('');
      lines.push(`**Group:** ${ws.group}`);
      lines.push(`**Memories:** ${memories.length}`);
      lines.push(`**Sessions:** ${sessions.length}`);
      lines.push('');

      // Key decisions (critical/important memories)
      const keyDecisions = memories.filter(m =>
        m.importance === 'critical' || m.importance === 'important'
      ).slice(0, 10);
      if (keyDecisions.length > 0) {
        lines.push('## Key Decisions & Important Memories');
        lines.push('');
        for (const m of keyDecisions) {
          const firstLine = m.content.split('\n')[0].slice(0, 200);
          lines.push(`- **[${m.importance}]** ${firstLine} _(${m.created_at?.slice(0, 10) ?? 'unknown'})_`);
        }
        lines.push('');
      }

      // Recent memories
      const recentMemories = memories.slice(0, 15);
      if (recentMemories.length > 0) {
        lines.push('## Recent Memories');
        lines.push('');
        for (const m of recentMemories) {
          const firstLine = m.content.split('\n')[0].slice(0, 200);
          lines.push(`- ${firstLine} _(${m.created_at?.slice(0, 10) ?? 'unknown'})_`);
        }
        lines.push('');
      }

      // Recent sessions
      if (sessions.length > 0) {
        lines.push('## Recent Sessions');
        lines.push('');
        for (const s of sessions.slice(0, 10)) {
          lines.push(`- **${s.title}** — last active ${s.lastActive.slice(0, 10)}`);
        }
        lines.push('');
      }

      // Pinned items
      if (pinnedItems.length > 0) {
        lines.push('## Pinned Items');
        lines.push('');
        for (const pin of pinnedItems) {
          const content = pin.messageContent.length > 150 ? pin.messageContent.slice(0, 147) + '...' : pin.messageContent;
          lines.push(`- ${content}${pin.label ? ` [${pin.label}]` : ''}`);
        }
        lines.push('');
      }

      lines.push(`---`);
      lines.push(`_Exported ${new Date().toISOString().slice(0, 10)}_`);

      return reply.type('text/markdown').send(lines.join('\n'));
    }

    // ── JSON format (default) ────────────────────────────────────
    emitAuditEvent(server, { workspaceId: id, eventType: 'export', input: JSON.stringify({ format: 'json' }) });

    return {
      workspace: {
        id: ws.id,
        name: ws.name,
        group: ws.group,
        model: ws.model,
        directory: ws.directory,
        created: ws.created,
      },
      memories,
      pinnedItems,
      sessions,
      exportedAt: new Date().toISOString(),
    };
  });

  // GET /api/workspaces/:id/cost — per-workspace cost and budget status
  server.get<{ Params: { id: string } }>('/api/workspaces/:id/cost', async (request, reply) => {
    assertSafeSegment(request.params.id, 'id');
    const ws = server.workspaceManager.get(request.params.id);
    if (!ws) {
      return reply.status(404).send({ error: 'Workspace not found' });
    }

    const costTracker = server.agentState.costTracker;
    const used = costTracker.getWorkspaceCost(request.params.id);
    const budget = ws.budget ?? null;
    const remaining = budget != null ? Math.max(0, budget - used) : null;

    // Budget status
    let budgetStatus: 'ok' | 'warning' | 'exceeded' = 'ok';
    if (budget != null && budget > 0) {
      const pct = (used / budget) * 100;
      if (pct >= 100) budgetStatus = 'exceeded';
      else if (pct >= 80) budgetStatus = 'warning';
    }

    // Usage history (last 7 days from cost tracker entries)
    const entries = costTracker.getUsageEntries();
    const wsEntries = entries.filter((e) => e.workspaceId === request.params.id);
    const dailyMap = new Map<string, number>();
    for (const e of wsEntries) {
      const day = e.timestamp?.slice(0, 10) ?? '';
      if (!day) continue;
      const cost = costTracker.calculateCost(e.input, e.output, e.model);
      dailyMap.set(day, (dailyMap.get(day) ?? 0) + cost);
    }
    const history = Array.from(dailyMap.entries())
      .map(([date, cost]) => ({ date, cost: Math.round(cost * 10000) / 10000 }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-7);

    return {
      used: Math.round(used * 10000) / 10000,
      budget,
      remaining: remaining != null ? Math.round(remaining * 10000) / 10000 : null,
      budgetStatus,
      turns: wsEntries.length,
      history,
    };
  });

  // ═══════════════════════════════════════════════════════════════════
  // Virtual workspace storage — file API endpoints
  // ═══════════════════════════════════════════════════════════════════

  // GET /api/workspaces/:id/storage — storage stats
  server.get<{ Params: { id: string } }>('/api/workspaces/:id/storage', async (request, reply) => {
    assertSafeSegment(request.params.id, 'id');
    const ws = server.workspaceManager.get(request.params.id);
    if (!ws) return reply.status(404).send({ error: 'Workspace not found' });

    const store = createFileStore(server.localConfig.dataDir, request.params.id, ws.directory);
    const info = await store.getStorageInfo();
    return {
      ...info,
      workspaceId: request.params.id,
      storageType: store.getStorageType(),
      directory: store.getStorageType() === 'linked' ? ws.directory : undefined,
      rootPath: store.getRootPath(),
    };
  });

  // GET /api/workspaces/:id/storage/files — list files (optionally in a subdirectory)
  server.get<{
    Params: { id: string };
    Querystring: { dir?: string };
  }>('/api/workspaces/:id/storage/files', async (request, reply) => {
    assertSafeSegment(request.params.id, 'id');
    const ws = server.workspaceManager.get(request.params.id);
    if (!ws) return reply.status(404).send({ error: 'Workspace not found' });

    const store = createFileStore(server.localConfig.dataDir, request.params.id, ws.directory);
    const files = await store.listFiles(request.query.dir);
    return { files, storageType: store.getStorageType() };
  });

  // GET /api/workspaces/:id/storage/read?path=relative/path — read file content
  // BUG-R3-04: Return JSON by default, raw content with ?raw=true
  server.get<{
    Params: { id: string };
    Querystring: { path: string; raw?: string };
  }>('/api/workspaces/:id/storage/read', async (request, reply) => {
    assertSafeSegment(request.params.id, 'id');
    const filePath = request.query.path;
    if (!filePath) return reply.status(400).send({ error: 'path query param is required' });

    const ws = server.workspaceManager.get(request.params.id);
    if (!ws) return reply.status(404).send({ error: 'Workspace not found' });

    const store = createFileStore(server.localConfig.dataDir, request.params.id, ws.directory);
    try {
      const content = await store.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const textExts = new Set(['.txt', '.md', '.json', '.ts', '.tsx', '.js', '.jsx', '.html', '.css', '.yml', '.yaml', '.toml', '.xml', '.csv', '.log', '.env', '.sh', '.bat', '.py', '.rs', '.go']);
      const isText = textExts.has(ext);

      // Raw mode: return content directly
      if (request.query.raw === 'true') {
        return reply.type(isText ? 'text/plain' : 'application/octet-stream').send(isText ? content.toString('utf-8') : content);
      }

      // Default: return JSON wrapper
      return {
        path: filePath,
        content: isText ? content.toString('utf-8') : content.toString('base64'),
        encoding: isText ? 'utf-8' : 'base64',
        size: content.length,
        mimeType: isText ? 'text/plain' : 'application/octet-stream',
      };
    } catch {
      return reply.status(404).send({ error: 'File not found' });
    }
  });

  // POST /api/workspaces/:id/storage/write?path=relative/path — write file
  server.post<{
    Params: { id: string };
    Querystring: { path: string };
    Body: { content: string };
  }>('/api/workspaces/:id/storage/write', async (request, reply) => {
    assertSafeSegment(request.params.id, 'id');
    const filePath = request.query.path;
    if (!filePath) return reply.status(400).send({ error: 'path query param is required' });

    const ws = server.workspaceManager.get(request.params.id);
    if (!ws) return reply.status(404).send({ error: 'Workspace not found' });

    const store = createFileStore(server.localConfig.dataDir, request.params.id, ws.directory);
    const content = request.body?.content ?? '';
    await store.writeFile(filePath, content);
    emitAuditEvent(server, { workspaceId: request.params.id, eventType: 'tool_call', toolName: 'file_write', input: JSON.stringify({ path: filePath }) });
    return reply.status(201).send({ written: true, path: filePath });
  });

  // DELETE /api/workspaces/:id/storage/delete?path=relative/path — delete file
  server.delete<{
    Params: { id: string };
    Querystring: { path: string };
  }>('/api/workspaces/:id/storage/delete', async (request, reply) => {
    assertSafeSegment(request.params.id, 'id');
    const filePath = request.query.path;
    if (!filePath) return reply.status(400).send({ error: 'path query param is required' });

    const ws = server.workspaceManager.get(request.params.id);
    if (!ws) return reply.status(404).send({ error: 'Workspace not found' });

    const store = createFileStore(server.localConfig.dataDir, request.params.id, ws.directory);
    try {
      await store.deleteFile(filePath);
      return reply.status(204).send();
    } catch {
      return reply.status(404).send({ error: 'File not found' });
    }
  });
};
