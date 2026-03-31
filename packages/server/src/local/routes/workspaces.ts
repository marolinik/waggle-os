import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import { MindDB, createFileStore } from '@waggle/core';
import { assertSafeSegment } from './validate.js';
import { extractProgressItems, type ProgressItem } from './sessions.js';
import { readFileRegistry, type FileRegistryEntry } from './ingest.js';
import { buildWorkspaceState, type WorkspaceState } from '../workspace-state.js';
import { buildTimeAwareGreeting, buildUpcomingSchedules } from './workspace-context.js';
import { emitAuditEvent } from './events.js';

// BUG-R3-03: Known model IDs for validation
/** Accept any reasonable model string — provider registry is the authority, not a hardcoded set */
function isValidModelId(model: string): boolean {
  if (!model || model.length < 2) return false;
  // Accept any model that follows naming conventions (alphanumeric, hyphens, dots, slashes)
  return /^[a-zA-Z0-9][\w./-]*$/.test(model);
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
    parts.push(`Active today with ${memoryCount} memories across ${sessionCount} session${sessionCount !== 1 ? 's' : ''}.`);
  } else if (daysSince === 1) {
    parts.push(`Last active yesterday. ${memoryCount} memories across ${sessionCount} session${sessionCount !== 1 ? 's' : ''}.`);
  } else if (daysSince <= 7) {
    parts.push(`Last active ${daysSince} days ago. ${memoryCount} memories across ${sessionCount} session${sessionCount !== 1 ? 's' : ''}.`);
  } else {
    parts.push(`Last active ${mostRecent}. ${memoryCount} memories across ${sessionCount} session${sessionCount !== 1 ? 's' : ''}.`);
  }

  // D1: Decisions and topics are rendered separately by the UI (ChatArea recentDecisions list),
  // so we omit them from the narrative summary to avoid duplication.

  return parts.join(' ');
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
      workspaces = workspaces.filter((ws: any) => ws.teamId === teamFilter || ws.team === teamFilter);
    }
    return workspaces;
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
  }>('/api/workspaces', async (request, reply) => {
    const { name, group, icon, model, personaId, directory, tone, teamId, teamServerUrl, teamRole, teamUserId, storageType, storagePath, storageConfig } = request.body;
    if (!name || !group) {
      return reply.status(400).send({ error: 'name and group are required' });
    }

    // Tier limit enforcement: check maxWorkspaces
    try {
      const configPath = path.join(server.localConfig.dataDir, 'config.json');
      const tierRaw = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf-8')).tier : 'solo';
      const tier = ['solo', 'teams', 'business', 'enterprise'].includes(tierRaw) ? tierRaw : 'solo';
      const maxWs = tier === 'solo' ? 5 : tier === 'teams' ? 25 : tier === 'business' ? 100 : -1;
      if (maxWs > 0) {
        const currentCount = server.workspaceManager.list().length;
        if (currentCount >= maxWs) {
          return reply.status(403).send({
            error: `Workspace limit reached for ${tier} tier (${maxWs} max). Upgrade to create more.`,
            tier,
            limit: maxWs,
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

    const ws = server.workspaceManager.create({
      name, group, icon, model, personaId, directory, tone,
      teamId, teamServerUrl, teamRole, teamUserId,
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
      if ('ensureStructure' in provider) {
        (provider as any).ensureStructure();
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

    // IMP-012: Fire-and-forget template skill pack installation
    const template = resolvedTemplateId;
    if (template && TEMPLATE_PACK_MAP[template]) {
      const packId = TEMPLATE_PACK_MAP[template];
      const port = (server.server.address() as any)?.port ?? 3333;
      fetch(`http://127.0.0.1:${port}/api/skills/capability-packs/${packId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => { /* pack install is best-effort */ });
    }

    // Register workspace on team server (fire-and-forget)
    if (teamId && teamServerUrl) {
      try {
        const { WaggleConfig } = await import('@waggle/core');
        const waggleConfig = new WaggleConfig(server.localConfig.dataDir);
        const teamServer = waggleConfig.getTeamServer();
        if (teamServer?.token) {
          fetch(`${teamServerUrl}/api/teams/${teamId}/entities`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${teamServer.token}`,
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
            console.warn(`[waggle] Team workspace registration failed:`, err.message);
          });
        }
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
    let recentMemories: Array<{ content: string; importance: string; date: string }> = [];
    let recentDecisions: Array<{ content: string; date: string }> = [];

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
          `SELECT content, importance, created_at FROM memory_frames
           WHERE importance != 'deprecated' AND importance != 'temporary'
           ORDER BY CASE importance
             WHEN 'critical' THEN 1 WHEN 'important' THEN 2
             WHEN 'normal' THEN 3 ELSE 4 END,
           id DESC LIMIT 8`
        ).all() as Array<{ content: string; importance: string; created_at: string }>;

        recentMemories = frames.map(f => ({
          content: f.content.slice(0, 200),
          importance: f.importance,
          date: f.created_at?.slice(0, 10) ?? 'unknown',
        }));

        // Extract decision-like memories (moved before summary so we can pass them)
        const decisionFrames = raw.prepare(
          `SELECT content, created_at FROM memory_frames
           WHERE importance != 'deprecated' AND importance != 'temporary'
             AND (content LIKE 'Decision%' OR content LIKE '%decided%'
               OR content LIKE '%decision made%' OR content LIKE '%chose %'
               OR content LIKE '%selected %' OR content LIKE '%agreed %'
               OR importance = 'critical')
           ORDER BY id DESC LIMIT 5`
        ).all() as Array<{ content: string; created_at: string }>;

        recentDecisions = decisionFrames.map(f => {
          const firstLine = f.content.split('\n')[0];
          const sentenceMatch = firstLine.match(/^(.+?\.\s)(?=[A-Z])/);
          const text = sentenceMatch
            ? sentenceMatch[1].trim()
            : (firstLine.length > 150 ? firstLine.slice(0, 147) + '...' : firstLine);
          return {
            content: text.replace(/\.\s*$/, ''),
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
    const lastActive = recentThreads[0]?.lastActive ?? ws.created;
    const greeting = buildTimeAwareGreeting(lastActive);

    const pendingTasks = progressItems
      .filter(p => p.type === 'task' || p.type === 'blocker')
      .map(p => p.content)
      .slice(0, 5);

    let upcomingSchedules: string[] = [];
    try {
      const cronSchedules = server.cronStore.list();
      upcomingSchedules = buildUpcomingSchedules(cronSchedules, id);
    } catch { /* non-blocking — cron store may not be available */ }

    // ── Wave 6.5: Lightweight cross-workspace relevance hints ──
    let crossWorkspaceHints: string[] = [];
    try {
      const allWorkspaces = server.workspaceManager.list();
      // Only check if there are 2+ workspaces (current + at least one other)
      if (allWorkspaces.length >= 2 && recentMemories.length > 0) {
        // Extract top 3 keywords from workspace name + recent memory content
        const keywordSource = [ws.name, ...recentMemories.slice(0, 3).map(m => m.content)].join(' ');
        const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'this', 'that', 'it', 'not', 'from', 'by', 'as', 'be', 'has', 'have', 'had', 'will', 'would', 'can', 'could', 'should', 'may', 'do', 'does']);
        const words = keywordSource.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3 && !stopWords.has(w));
        // Count word frequency
        const freq = new Map<string, number>();
        for (const w of words) {
          freq.set(w, (freq.get(w) ?? 0) + 1);
        }
        const topKeywords = Array.from(freq.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);

        // Search other workspace minds for those keywords (limit 1 result per workspace, max 3 hints)
        for (const otherWs of allWorkspaces) {
          if (otherWs.id === id || crossWorkspaceHints.length >= 3) break;
          const otherMindPath = server.workspaceManager.getMindPath(otherWs.id);
          if (!fs.existsSync(otherMindPath)) continue;
          let otherDb: MindDB | null = null;
          try {
            otherDb = new MindDB(otherMindPath);
            const raw = otherDb.getDatabase();
            for (const keyword of topKeywords) {
              if (crossWorkspaceHints.length >= 3) break;
              const match = raw.prepare(
                `SELECT content FROM memory_frames
                 WHERE importance != 'deprecated' AND importance != 'temporary'
                   AND content LIKE ?
                 LIMIT 1`
              ).get(`%${keyword}%`) as { content: string } | undefined;
              if (match) {
                const firstLine = match.content.split('\n')[0].slice(0, 80);
                crossWorkspaceHints.push(`Related: "${firstLine}" found in ${otherWs.name}`);
                break; // Only 1 hint per workspace
              }
            }
            otherDb.close();
            otherDb = null;
          } catch {
            if (otherDb) { try { otherDb.close(); } catch { /* */ } }
          }
        }
      }
    } catch { /* cross-workspace hints are non-blocking */ }

    return {
      workspace: { id: ws.id, name: ws.name, group: ws.group, model: ws.model, directory: ws.directory, templateId: ws.templateId, personaId: ws.personaId },
      summary: summary || `This is your ${ws.name} workspace. Everything you discuss here stays in context — decisions, research, and progress are remembered across sessions.`,
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

  // F2: GET /api/workspaces/:id/files — list ingested files
  server.get<{ Params: { id: string } }>('/api/workspaces/:id/files', async (request, reply) => {
    const { id } = request.params;
    assertSafeSegment(id, 'id');
    const ws = server.workspaceManager.get(id);
    if (!ws) {
      return reply.status(404).send({ error: 'Workspace not found' });
    }
    const files = readFileRegistry(server.localConfig.dataDir, id);
    // Return newest first
    files.reverse();
    return { files };
  });

  // PUT /api/workspaces/:id — update workspace
  server.put<{
    Params: { id: string };
    Body: { name?: string; group?: string; icon?: string; model?: string; personaId?: string | null; agentGroupId?: string | null; directory?: string; tone?: 'professional' | 'casual' | 'technical' | 'legal' | 'marketing'; budget?: number | null };
  }>('/api/workspaces/:id', async (request, reply) => {
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
    const { personaId, agentGroupId, ...rest } = request.body;
    server.workspaceManager.update(request.params.id, {
      ...rest,
      ...(personaId !== null ? { personaId } : {}),
      ...(agentGroupId !== undefined ? { agentGroupId: agentGroupId ?? undefined } : {}),
    });
    emitAuditEvent(server, { workspaceId: request.params.id, eventType: 'workspace_update', input: JSON.stringify(request.body) });
    return server.workspaceManager.get(request.params.id);
  });

  // PATCH /api/workspaces/:id — partial update (same as PUT but PATCH method)
  server.patch<{
    Params: { id: string };
    Body: { name?: string; group?: string; icon?: string; model?: string; personaId?: string | null; agentGroupId?: string | null; directory?: string; tone?: 'professional' | 'casual' | 'technical' | 'legal' | 'marketing'; budget?: number | null };
  }>('/api/workspaces/:id', async (request, reply) => {
    assertSafeSegment(request.params.id, 'id');
    const existing = server.workspaceManager.get(request.params.id);
    if (!existing) {
      return reply.status(404).send({ error: 'Workspace not found' });
    }
    if (request.body.model && !isValidModelId(request.body.model)) {
      return reply.status(400).send({ error: `Invalid model ID "${request.body.model}"` });
    }
    const { personaId, agentGroupId, ...rest } = request.body;
    server.workspaceManager.update(request.params.id, {
      ...rest,
      ...(personaId !== undefined ? { personaId: personaId ?? undefined } : {}),
      ...(agentGroupId !== undefined ? { agentGroupId: agentGroupId ?? undefined } : {}),
    });
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
    const budget = (ws as any).budget ?? null;
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
    const wsEntries = entries.filter((e: any) => e.workspaceId === request.params.id);
    const dailyMap = new Map<string, number>();
    for (const e of wsEntries) {
      const day = (e as any).timestamp?.slice(0, 10) ?? '';
      if (!day) continue;
      const cost = costTracker.calculateCost((e as any).input, (e as any).output, (e as any).model);
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
