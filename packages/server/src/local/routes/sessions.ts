import type { FastifyPluginAsync } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { assertSafeSegment } from './validate.js';

import {
  readSessionMeta,
  findUndistilledSessions,
  extractProgressItems,
  markSessionDistilled,
  extractSessionOutcome,
  persistSessionOutcome,
  extractOpenQuestions,
  classifyThreads,
  searchSessions,
  exportSessionToMarkdown,
  parseSessionTimeline,
  TOOL_CONTENT_PATTERNS,
  type SessionInfo,
  type DistillableSession,
  type ProgressItem,
  type SessionOutcome,
  type OpenQuestion,
  type ThreadFreshness,
  type ThreadInfo,
  type SessionSearchResult,
  type TimelineEvent,
} from './session-utils.js';

// ── Re-exports for backwards compatibility ────────────────────────────
// All consumers that import from './sessions.js' continue to work unchanged.
export {
  readSessionMeta,
  findUndistilledSessions,
  extractProgressItems,
  markSessionDistilled,
  extractSessionOutcome,
  persistSessionOutcome,
  extractOpenQuestions,
  classifyThreads,
  searchSessions,
  exportSessionToMarkdown,
  parseSessionTimeline,
};
export type {
  SessionInfo,
  DistillableSession,
  ProgressItem,
  SessionOutcome,
  OpenQuestion,
  ThreadFreshness,
  ThreadInfo,
  SessionSearchResult,
  TimelineEvent,
};

// ── Route handler ─────────────────────────────────────────────────────

export const sessionRoutes: FastifyPluginAsync = async (server) => {
  // GET /api/workspaces/:workspaceId/sessions — list sessions for a workspace
  server.get<{
    Params: { workspaceId: string };
  }>('/api/workspaces/:workspaceId/sessions', async (request, reply) => {
    const { workspaceId } = request.params;
    assertSafeSegment(workspaceId, 'workspaceId');

    // Gracefully return empty for non-existent workspaces (e.g. 'default' on startup)
    const ws = server.workspaceManager.get(workspaceId);
    if (!ws) {
      return [];
    }

    const sessionsDir = path.join(
      server.localConfig.dataDir, 'workspaces', workspaceId, 'sessions'
    );

    if (!fs.existsSync(sessionsDir)) {
      return [];
    }

    const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl'));
    const sessions: SessionInfo[] = [];

    for (const file of files) {
      const sessionId = file.replace('.jsonl', '');
      const filePath = path.join(sessionsDir, file);
      try {
        sessions.push(readSessionMeta(filePath, sessionId));
      } catch {
        // Skip unreadable files
      }
    }

    // L6: Filter out empty auto-sessions (0 messages) when ?hideEmpty=true
    const hideEmpty = (request.query as Record<string, string>)?.hideEmpty === 'true';
    const filtered = hideEmpty ? sessions.filter(s => s.messageCount > 0) : sessions;

    // Sort by lastActive descending
    filtered.sort((a, b) => b.lastActive.localeCompare(a.lastActive));

    return filtered;
  });

  // GET /api/workspaces/:workspaceId/sessions/search — search across sessions
  server.get<{
    Params: { workspaceId: string };
    Querystring: { q: string; limit?: string };
  }>('/api/workspaces/:workspaceId/sessions/search', async (request, reply) => {
    const { workspaceId } = request.params;
    assertSafeSegment(workspaceId, 'workspaceId');

    const ws = server.workspaceManager.get(workspaceId);
    if (!ws) {
      return reply.status(404).send({ error: 'Workspace not found' });
    }

    const query = request.query.q;
    if (!query || query.length < 2) {
      return reply.status(400).send({ error: 'Query must be at least 2 characters' });
    }

    const maxResults = Math.min(parseInt(request.query.limit ?? '20', 10) || 20, 50);
    const sessionsDir = path.join(
      server.localConfig.dataDir, 'workspaces', workspaceId, 'sessions'
    );

    return searchSessions(sessionsDir, query, maxResults);
  });

  // F3: GET /api/workspaces/:workspaceId/sessions/:sessionId/export — export session as markdown
  server.get<{
    Params: { workspaceId: string; sessionId: string };
  }>('/api/workspaces/:workspaceId/sessions/:sessionId/export', async (request, reply) => {
    const { workspaceId, sessionId } = request.params;
    assertSafeSegment(workspaceId, 'workspaceId');
    assertSafeSegment(sessionId, 'sessionId');

    const ws = server.workspaceManager.get(workspaceId);
    if (!ws) {
      return reply.status(404).send({ error: 'Workspace not found' });
    }

    const filePath = path.join(
      server.localConfig.dataDir, 'workspaces', workspaceId, 'sessions', `${sessionId}.jsonl`
    );
    if (!fs.existsSync(filePath)) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    const markdown = exportSessionToMarkdown(filePath, sessionId);
    return reply
      .header('Content-Type', 'text/markdown; charset=utf-8')
      .send(markdown);
  });

  // PM-3: GET /api/workspaces/:workspaceId/sessions/:sessionId/timeline — tool event timeline
  server.get<{
    Params: { workspaceId: string; sessionId: string };
  }>('/api/workspaces/:workspaceId/sessions/:sessionId/timeline', async (request, reply) => {
    const { workspaceId, sessionId } = request.params;
    assertSafeSegment(workspaceId, 'workspaceId');
    assertSafeSegment(sessionId, 'sessionId');

    const ws = server.workspaceManager.get(workspaceId);
    if (!ws) {
      return reply.status(404).send({ error: 'Workspace not found' });
    }

    const filePath = path.join(
      server.localConfig.dataDir, 'workspaces', workspaceId, 'sessions', `${sessionId}.jsonl`
    );
    if (!fs.existsSync(filePath)) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    const timeline = parseSessionTimeline(filePath);
    return timeline;
  });

  // POST /api/workspaces/:workspaceId/sessions — create a new session
  server.post<{
    Params: { workspaceId: string };
    Body: { title?: string };
  }>('/api/workspaces/:workspaceId/sessions', async (request, reply) => {
    const { workspaceId } = request.params;
    assertSafeSegment(workspaceId, 'workspaceId');

    // Verify workspace exists
    const ws = server.workspaceManager.get(workspaceId);
    if (!ws) {
      return reply.status(404).send({ error: 'Workspace not found' });
    }

    const sessionsDir = path.join(
      server.localConfig.dataDir, 'workspaces', workspaceId, 'sessions'
    );

    if (!fs.existsSync(sessionsDir)) {
      fs.mkdirSync(sessionsDir, { recursive: true });
    }

    const sessionId = `session-${randomUUID()}`;
    const filePath = path.join(sessionsDir, `${sessionId}.jsonl`);

    // Write metadata line as first entry (type: "meta" distinguishes from messages)
    const meta = JSON.stringify({ type: 'meta', title: request.body?.title ?? null, created: new Date().toISOString() });
    fs.writeFileSync(filePath, meta + '\n', 'utf-8');

    const now = new Date().toISOString();
    const title = request.body?.title ?? sessionId;

    const session: SessionInfo = {
      id: sessionId,
      title,
      summary: null,
      messageCount: 0,
      lastActive: now,
      created: now,
    };

    return reply.status(201).send(session);
  });

  // PATCH /api/sessions/:sessionId — rename/update a session
  server.patch<{
    Params: { sessionId: string };
    Body: { title?: string };
    Querystring: { workspace?: string };
  }>('/api/sessions/:sessionId', async (request, reply) => {
    const { sessionId } = request.params;
    assertSafeSegment(sessionId, 'sessionId');
    const workspaceId = request.query.workspace;
    if (workspaceId) assertSafeSegment(workspaceId, 'workspace');
    const newTitle = request.body?.title;

    if (!newTitle) {
      return reply.status(400).send({ error: 'title is required' });
    }

    // Find session file
    let filePath: string | null = null;

    if (workspaceId) {
      const candidate = path.join(
        server.localConfig.dataDir, 'workspaces', workspaceId, 'sessions', `${sessionId}.jsonl`
      );
      if (fs.existsSync(candidate)) filePath = candidate;
    } else {
      const workspacesDir = path.join(server.localConfig.dataDir, 'workspaces');
      if (fs.existsSync(workspacesDir)) {
        const entries = fs.readdirSync(workspacesDir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const candidate = path.join(workspacesDir, entry.name, 'sessions', `${sessionId}.jsonl`);
          if (fs.existsSync(candidate)) {
            filePath = candidate;
            break;
          }
        }
      }
    }

    if (!filePath) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    // Read existing content, update meta line
    const content = fs.readFileSync(filePath, 'utf-8').trim();
    const lines = content ? content.split('\n') : [];

    if (lines.length > 0) {
      try {
        const first = JSON.parse(lines[0]);
        if (first.type === 'meta') {
          first.title = newTitle;
          lines[0] = JSON.stringify(first);
        } else {
          // No meta line — prepend one
          lines.unshift(JSON.stringify({ type: 'meta', title: newTitle, created: new Date().toISOString() }));
        }
      } catch {
        lines.unshift(JSON.stringify({ type: 'meta', title: newTitle, created: new Date().toISOString() }));
      }
    } else {
      lines.push(JSON.stringify({ type: 'meta', title: newTitle, created: new Date().toISOString() }));
    }

    fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf-8');

    return { id: sessionId, title: newTitle };
  });

  // DELETE /api/sessions/:sessionId — delete a session
  // Need to find the session file across workspaces
  server.delete<{
    Params: { sessionId: string };
    Querystring: { workspace?: string };
  }>('/api/sessions/:sessionId', async (request, reply) => {
    const { sessionId } = request.params;
    assertSafeSegment(sessionId, 'sessionId');
    const workspaceId = request.query.workspace;
    if (workspaceId) assertSafeSegment(workspaceId, 'workspace');

    // If workspace is provided, look there directly
    if (workspaceId) {
      const filePath = path.join(
        server.localConfig.dataDir, 'workspaces', workspaceId, 'sessions', `${sessionId}.jsonl`
      );

      if (!fs.existsSync(filePath)) {
        return reply.status(404).send({ error: 'Session not found' });
      }

      fs.unlinkSync(filePath);
      return { deleted: true };
    }

    // Without workspace, search all workspaces for the session file
    const workspacesDir = path.join(server.localConfig.dataDir, 'workspaces');
    if (!fs.existsSync(workspacesDir)) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    const entries = fs.readdirSync(workspacesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const filePath = path.join(workspacesDir, entry.name, 'sessions', `${sessionId}.jsonl`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return { deleted: true };
      }
    }

    return reply.status(404).send({ error: 'Session not found' });
  });

  // IMP-005: GET /api/sessions/:sessionId/summary — structured post-session summary
  server.get<{
    Params: { sessionId: string };
    Querystring: { workspace?: string };
  }>('/api/sessions/:sessionId/summary', async (request, reply) => {
    const { sessionId } = request.params;
    assertSafeSegment(sessionId, 'sessionId');
    const workspaceId = request.query.workspace;
    if (workspaceId) assertSafeSegment(workspaceId, 'workspace');

    // Find session file — search across workspaces if workspace not provided
    let filePath: string | null = null;

    if (workspaceId) {
      const candidate = path.join(
        server.localConfig.dataDir, 'workspaces', workspaceId, 'sessions', `${sessionId}.jsonl`
      );
      if (fs.existsSync(candidate)) filePath = candidate;
    } else {
      const workspacesDir = path.join(server.localConfig.dataDir, 'workspaces');
      if (fs.existsSync(workspacesDir)) {
        const entries = fs.readdirSync(workspacesDir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const candidate = path.join(workspacesDir, entry.name, 'sessions', `${sessionId}.jsonl`);
          if (fs.existsSync(candidate)) {
            filePath = candidate;
            break;
          }
        }
      }
    }

    if (!filePath) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    // Read session metadata using existing readSessionMeta helper
    const meta = readSessionMeta(filePath, sessionId);

    // Count tool references and activity types from message content
    const content = fs.readFileSync(filePath, 'utf-8').trim();
    const lines = content ? content.split('\n').filter(l => l.trim()) : [];

    let toolCalls = 0;
    let memorySaves = 0;
    let documentsCreated = 0;
    let userMessages = 0;
    let assistantMessages = 0;

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === 'meta') continue;
        if (parsed.role === 'user') userMessages++;
        if (parsed.role === 'assistant') {
          assistantMessages++;
          // Detect tool usage heuristically from assistant content
          const text = parsed.content ?? '';
          for (const tp of TOOL_CONTENT_PATTERNS) {
            if (tp.pattern.test(text)) toolCalls++;
          }
          if (/Saving to memory/i.test(text)) memorySaves++;
          if (/Generating document/i.test(text)) documentsCreated++;
        }
      } catch {
        // skip malformed lines
      }
    }

    return {
      sessionId,
      title: meta.title,
      messageCount: meta.messageCount,
      userMessages,
      assistantMessages,
      toolsUsed: toolCalls,
      memoriesSaved: memorySaves,
      documentsCreated,
      summary: meta.summary ?? 'No summary available',
      lastActive: meta.lastActive,
      created: meta.created,
    };
  });
};
