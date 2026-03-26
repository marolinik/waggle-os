/**
 * Team routes for the local server.
 *
 * These routes handle team server connection from the desktop app:
 * - POST /api/team/connect — connect to team server (validate token, store config)
 * - POST /api/team/disconnect — disconnect from team server
 * - GET /api/team/status — get current team connection status
 */

import path from 'node:path';
import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import Database from 'better-sqlite3';
import { WaggleConfig } from '@waggle/core';
import { emitNotification } from './notifications.js';
import { emitAuditEvent } from './events.js';

// ── Local team DB ────────────────────────────────────────────────────

type TeamRole = 'owner' | 'admin' | 'member' | 'viewer';

interface TeamRow {
  id: string;
  name: string;
  description: string;
  owner_id: string;
  created: string;
  updated: string;
}

interface MemberRow {
  team_id: string;
  user_id: string;
  role: TeamRole;
  display_name: string;
  email: string | null;
  joined: string;
}

let teamsDb: Database.Database | null = null;

function getTeamsDb(dataDir: string): Database.Database {
  if (teamsDb) return teamsDb;

  const dbPath = path.join(dataDir, 'teams.db');
  teamsDb = new Database(dbPath);
  teamsDb.pragma('journal_mode = WAL');
  teamsDb.pragma('synchronous = NORMAL');

  teamsDb.exec(`
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      owner_id TEXT NOT NULL,
      created TEXT NOT NULL DEFAULT (datetime('now')),
      updated TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS team_members (
      team_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
      display_name TEXT NOT NULL DEFAULT '',
      email TEXT,
      joined TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (team_id, user_id),
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members (user_id);
  `);

  return teamsDb;
}

export function closeTeamsDb(): void {
  if (teamsDb) {
    try { teamsDb.close(); } catch { /* ignore */ }
    teamsDb = null;
  }
}

function getLocalUserId(dataDir: string): string {
  try {
    const waggleConfig = new WaggleConfig(dataDir);
    const teamServer = waggleConfig.getTeamServer();
    if (teamServer?.userId && teamServer.userId !== 'unknown') return teamServer.userId;
  } catch { /* ignore */ }
  return 'local-user';
}

function getLocalDisplayName(dataDir: string): string {
  try {
    const waggleConfig = new WaggleConfig(dataDir);
    const teamServer = waggleConfig.getTeamServer();
    if (teamServer?.displayName) return teamServer.displayName;
  } catch { /* ignore */ }
  return 'You';
}

export async function teamRoutes(fastify: FastifyInstance) {
  const dataDir = fastify.localConfig.dataDir;

  /**
   * POST /api/team/connect
   * Connect to a team server by validating the token against the server's health endpoint.
   */
  fastify.post('/api/team/connect', async (request, reply) => {
    const { serverUrl, token } = request.body as { serverUrl: string; token: string };

    if (!serverUrl || !token) {
      return reply.code(400).send({ error: 'serverUrl and token are required' });
    }

    // Validate by calling the team server health endpoint
    try {
      const healthUrl = `${serverUrl.replace(/\/$/, '')}/health`;
      const healthRes = await fetch(healthUrl, {
        headers: { 'Authorization': `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      });

      if (!healthRes.ok) {
        return reply.code(502).send({ error: `Team server returned ${healthRes.status}` });
      }
    } catch (err: any) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        return reply.code(504).send({ error: 'Team server connection timed out' });
      }
      return reply.code(502).send({ error: `Cannot reach team server: ${err.message}` });
    }

    // Try to get user info from the team server
    let userId = 'unknown';
    let displayName = 'Unknown User';
    try {
      const teamsRes = await fetch(`${serverUrl.replace(/\/$/, '')}/api/teams`, {
        headers: { 'Authorization': `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      });
      if (teamsRes.ok) {
        // Token is valid and user has access — extract from response is not possible without user endpoint
        // For now, we know the connection works
        userId = 'authenticated';
        displayName = 'Team User';
      }
    } catch {
      // Non-critical — connection itself was validated by health check
    }

    // Store team server config
    const waggleConfig = new WaggleConfig(dataDir);
    waggleConfig.setTeamServer({
      url: serverUrl.replace(/\/$/, ''),
      token,
      userId,
      displayName,
    });
    waggleConfig.save();

    const connection = {
      serverUrl: serverUrl.replace(/\/$/, ''),
      token: '***', // Don't send token back
      userId,
      displayName,
    };

    return reply.code(200).send(connection);
  });

  /**
   * POST /api/team/disconnect
   * Disconnect from the team server.
   */
  fastify.post('/api/team/disconnect', async (_request, reply) => {
    const waggleConfig = new WaggleConfig(dataDir);
    waggleConfig.clearTeamServer();
    waggleConfig.save();

    return reply.code(200).send({ disconnected: true });
  });

  /**
   * GET /api/team/teams
   * List teams the connected user belongs to (proxied from team server).
   */
  fastify.get('/api/team/teams', async (_request, reply) => {
    const waggleConfig = new WaggleConfig(dataDir);
    const teamServer = waggleConfig.getTeamServer();

    if (!teamServer || !teamServer.token) {
      return reply.code(401).send({ error: 'Not connected to a team server' });
    }

    try {
      const teamsUrl = `${teamServer.url}/api/teams`;
      const res = await fetch(teamsUrl, {
        headers: { 'Authorization': `Bearer ${teamServer.token}` },
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        return reply.code(res.status).send({ error: `Team server returned ${res.status}` });
      }

      const teams = await res.json();
      return reply.code(200).send(teams);
    } catch (err: any) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        return reply.code(504).send({ error: 'Team server request timed out' });
      }
      return reply.code(502).send({ error: `Cannot reach team server: ${err.message}` });
    }
  });

  /**
   * GET /api/team/presence?workspaceId=X
   * Get team presence data for a workspace (proxied from team server, or mock if unavailable).
   */
  fastify.get<{
    Querystring: { workspaceId?: string };
  }>('/api/team/presence', async (request, reply) => {
    const waggleConfig = new WaggleConfig(dataDir);
    const teamServer = waggleConfig.getTeamServer();

    if (!teamServer || !teamServer.token) {
      return reply.code(200).send({ members: [] });
    }

    // Try to fetch real presence from team server
    try {
      const presenceUrl = `${teamServer.url}/api/presence`;
      const res = await fetch(presenceUrl, {
        headers: { 'Authorization': `Bearer ${teamServer.token}` },
        signal: AbortSignal.timeout(3000),
      });

      if (res.ok) {
        const data = await res.json();
        // Emit presence update for WebSocket subscribers
        fastify.eventBus.emit('presence_update', data);
        return reply.code(200).send(data);
      }
    } catch {
      // Team server unavailable — return self as online (local-only fallback)
    }

    // Fallback: return current user as online
    const fallbackData = {
      members: [{
        userId: teamServer.userId ?? 'self',
        displayName: teamServer.displayName ?? 'You',
        status: 'online',
        lastActivity: new Date().toISOString(),
      }],
    };
    // Emit presence update for WebSocket subscribers
    fastify.eventBus.emit('presence_update', fallbackData);
    return reply.code(200).send(fallbackData);
  });

  /**
   * GET /api/team/status
   * Get current team connection status.
   */
  fastify.get('/api/team/status', async (_request, reply) => {
    const waggleConfig = new WaggleConfig(dataDir);
    const teamServer = waggleConfig.getTeamServer();

    if (!teamServer) {
      return reply.code(200).send({ connected: false });
    }

    return reply.code(200).send({
      connected: true,
      serverUrl: teamServer.url,
      userId: teamServer.userId ?? 'unknown',
      displayName: teamServer.displayName ?? 'Team User',
    });
  });

  /**
   * GET /api/team/activity?workspaceId=X&limit=N
   * Get recent team activity for a workspace.
   * Proxies to team server or returns empty when disconnected.
   */
  fastify.get<{
    Querystring: { workspaceId?: string; limit?: string };
  }>('/api/team/activity', async (request, reply) => {
    const waggleConfig = new WaggleConfig(dataDir);
    const teamServer = waggleConfig.getTeamServer();
    const limit = Math.min(parseInt(request.query.limit ?? '20', 10) || 20, 50);

    if (!teamServer || !teamServer.token) {
      return reply.code(200).send({ items: [] });
    }

    // Try to fetch activity from team server's entities API
    // (synced frames = memory additions, which are our primary activity source)
    try {
      const workspaceId = request.query.workspaceId;
      const entitiesUrl = `${teamServer.url}/api/entities?type=memory_frame&limit=${limit}`;
      const res = await fetch(entitiesUrl, {
        headers: { 'Authorization': `Bearer ${teamServer.token}` },
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) {
        const data = await res.json() as { entities?: Array<{
          id: string;
          metadata?: { authorName?: string; authorId?: string; frameType?: string; content?: string };
          createdAt?: string;
        }> };

        const items = (data.entities ?? []).map((e) => ({
          id: e.id,
          type: 'memory' as const,
          authorName: e.metadata?.authorName ?? 'Unknown',
          authorId: e.metadata?.authorId,
          summary: e.metadata?.content
            ? (e.metadata.content.length > 120 ? e.metadata.content.slice(0, 120) + '...' : e.metadata.content)
            : `Added ${e.metadata?.frameType ?? 'frame'}`,
          timestamp: e.createdAt ?? new Date().toISOString(),
        }));

        return reply.code(200).send({ items });
      }
    } catch {
      // Team server unavailable — return empty
    }

    return reply.code(200).send({ items: [] });
  });

  /**
   * GET /api/team/messages?workspaceId=X&limit=N
   * Get recent Waggle Dance messages for a workspace.
   * Proxies to team server or returns empty when disconnected.
   */
  fastify.get<{
    Querystring: { workspaceId?: string; limit?: string };
  }>('/api/team/messages', async (request, reply) => {
    const waggleConfig = new WaggleConfig(dataDir);
    const teamServer = waggleConfig.getTeamServer();
    const limit = Math.min(parseInt(request.query.limit ?? '20', 10) || 20, 50);

    if (!teamServer || !teamServer.token) {
      return reply.code(200).send({ messages: [] });
    }

    try {
      const teamSlug = (teamServer as any).teamSlug ?? 'default';
      const messagesUrl = `${teamServer.url}/api/teams/${teamSlug}/messages?limit=${limit}`;
      const res = await fetch(messagesUrl, {
        headers: { 'Authorization': `Bearer ${teamServer.token}` },
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) {
        const data = await res.json() as any;
        const messages = data.messages ?? data ?? [];
        if (Array.isArray(messages) && messages.length > 0) {
          emitNotification(fastify, {
            title: 'Team message',
            body: 'New message from team',
            category: 'message',
          });
        }
        return reply.code(200).send({ messages });
      }
    } catch {
      // Team server unavailable — return empty
    }

    return reply.code(200).send({ messages: [] });
  });

  // --- Capability Governance Proxy ---

  // In-memory policy cache: teamId → { permissions, fetchedAt }
  const policyCache = new Map<string, { permissions: any; fetchedAt: number }>();
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  // Listen for policy update events to invalidate cache
  if ((fastify as any).eventBus) {
    (fastify as any).eventBus.on('capability_policy_update', (data: any) => {
      if (data?.teamId) policyCache.delete(data.teamId);
      else policyCache.clear(); // Clear all if no specific teamId
    });
  }

  // GET /api/team/governance/permissions — get effective permissions for current user
  fastify.get('/api/team/governance/permissions', async (request, reply) => {
    const { workspaceId } = request.query as { workspaceId?: string };
    const waggleConfig = new WaggleConfig(dataDir);
    const teamServer = waggleConfig.getTeamServer();
    if (!teamServer?.url || !teamServer?.token) {
      return { connected: false, permissions: null };
    }

    // Check cache
    const cacheKey = workspaceId ?? 'default';
    const cached = policyCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return { connected: true, permissions: cached.permissions };
    }

    try {
      const teamSlug = (teamServer as any).teamSlug ?? 'default';
      const url = `${teamServer.url.replace(/\/$/, '')}/api/teams/${teamSlug}/capability-policies`;
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${teamServer.token}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const policies = await res.json();

      policyCache.set(cacheKey, { permissions: policies, fetchedAt: Date.now() });
      return { connected: true, permissions: policies };
    } catch {
      // Return cached if available, otherwise null
      if (cached) return { connected: true, permissions: cached.permissions, stale: true };
      return { connected: true, permissions: null };
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // F3: Local team entity CRUD — works in solo mode with local userId
  // ═══════════════════════════════════════════════════════════════════

  const db = getTeamsDb(dataDir);
  const userId = getLocalUserId(dataDir);

  // POST /api/teams — create a team
  fastify.post<{
    Body: { name: string; description?: string };
  }>('/api/teams', async (request, reply) => {
    const { name, description } = request.body ?? {};
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return reply.code(400).send({ error: 'name is required' });
    }

    const id = `team-${crypto.randomUUID().slice(0, 8)}`;
    const uid = getLocalUserId(dataDir);
    const displayName = getLocalDisplayName(dataDir);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO teams (id, name, description, owner_id, created, updated)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, name.trim(), description?.trim() ?? '', uid, now, now);

    // Auto-add creator as owner member
    db.prepare(`
      INSERT INTO team_members (team_id, user_id, role, display_name, joined)
      VALUES (?, ?, 'owner', ?, ?)
    `).run(id, uid, displayName, now);

    emitAuditEvent(fastify, { workspaceId: 'global', eventType: 'workspace_create', input: JSON.stringify({ teamId: id, name }) });

    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(id) as TeamRow;
    const members = db.prepare('SELECT * FROM team_members WHERE team_id = ?').all(id) as MemberRow[];
    return reply.code(201).send({ ...normalizeTeam(team), members: members.map(normalizeMember) });
  });

  // GET /api/teams — list teams for current user
  fastify.get('/api/teams', async () => {
    const uid = getLocalUserId(dataDir);
    const rows = db.prepare(`
      SELECT t.* FROM teams t
      JOIN team_members m ON t.id = m.team_id
      WHERE m.user_id = ?
      ORDER BY t.created DESC
    `).all(uid) as TeamRow[];

    return { teams: rows.map(normalizeTeam) };
  });

  // GET /api/teams/:id — team detail with members
  fastify.get<{ Params: { id: string } }>('/api/teams/:id', async (request, reply) => {
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(request.params.id) as TeamRow | undefined;
    if (!team) return reply.code(404).send({ error: 'Team not found' });

    const members = db.prepare('SELECT * FROM team_members WHERE team_id = ?').all(team.id) as MemberRow[];

    // Team workspaces
    const allWorkspaces = fastify.workspaceManager.list();
    const teamWorkspaces = allWorkspaces.filter((ws: any) => ws.teamId === team.id || ws.team === team.id);

    return {
      ...normalizeTeam(team),
      members: members.map(normalizeMember),
      workspaces: teamWorkspaces,
    };
  });

  // PUT /api/teams/:id — update team
  fastify.put<{
    Params: { id: string };
    Body: { name?: string; description?: string };
  }>('/api/teams/:id', async (request, reply) => {
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(request.params.id) as TeamRow | undefined;
    if (!team) return reply.code(404).send({ error: 'Team not found' });

    const uid = getLocalUserId(dataDir);
    const member = db.prepare('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?').get(team.id, uid) as MemberRow | undefined;
    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      return reply.code(403).send({ error: 'Only owner or admin can update team' });
    }

    const { name, description } = request.body ?? {};
    const updates: string[] = [];
    const params: unknown[] = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name.trim()); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description.trim()); }

    if (updates.length > 0) {
      updates.push("updated = datetime('now')");
      params.push(team.id);
      db.prepare(`UPDATE teams SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    return db.prepare('SELECT * FROM teams WHERE id = ?').get(team.id);
  });

  // DELETE /api/teams/:id — delete team (owner only)
  fastify.delete<{ Params: { id: string } }>('/api/teams/:id', async (request, reply) => {
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(request.params.id) as TeamRow | undefined;
    if (!team) return reply.code(404).send({ error: 'Team not found' });

    const uid = getLocalUserId(dataDir);
    if (team.owner_id !== uid) {
      return reply.code(403).send({ error: 'Only the team owner can delete the team' });
    }

    // Remove all members first (CASCADE should handle this but be explicit)
    db.prepare('DELETE FROM team_members WHERE team_id = ?').run(team.id);
    db.prepare('DELETE FROM teams WHERE id = ?').run(team.id);

    // Unlink workspaces from this team
    const allWorkspaces = fastify.workspaceManager.list();
    for (const ws of allWorkspaces) {
      if ((ws as any).teamId === team.id || (ws as any).team === team.id) {
        fastify.workspaceManager.update(ws.id, { teamId: undefined, team: null } as any);
      }
    }

    emitAuditEvent(fastify, { workspaceId: 'global', eventType: 'workspace_delete', input: JSON.stringify({ teamId: team.id }) });
    return reply.code(204).send();
  });

  // ── Member management ────────────────────────────────────────────

  // POST /api/teams/:id/members — invite/add member
  fastify.post<{
    Params: { id: string };
    Body: { userId?: string; email?: string; displayName?: string; role?: TeamRole };
  }>('/api/teams/:id/members', async (request, reply) => {
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(request.params.id) as TeamRow | undefined;
    if (!team) return reply.code(404).send({ error: 'Team not found' });

    // Check permission: owner or admin can add members
    const uid = getLocalUserId(dataDir);
    const self = db.prepare('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?').get(team.id, uid) as MemberRow | undefined;
    if (!self || (self.role !== 'owner' && self.role !== 'admin')) {
      return reply.code(403).send({ error: 'Only owner or admin can add members' });
    }

    const { userId: newUserId, email, displayName, role } = request.body ?? {};
    const memberUserId = newUserId ?? email ?? `user-${crypto.randomUUID().slice(0, 8)}`;
    const memberRole: TeamRole = role && ['owner', 'admin', 'member', 'viewer'].includes(role) ? role : 'member';

    // Check if already a member
    const existing = db.prepare('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?').get(team.id, memberUserId);
    if (existing) {
      return reply.code(409).send({ error: 'User is already a team member' });
    }

    db.prepare(`
      INSERT INTO team_members (team_id, user_id, role, display_name, email, joined)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(team.id, memberUserId, memberRole, displayName ?? memberUserId, email ?? null);

    const member = db.prepare('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?').get(team.id, memberUserId) as MemberRow;
    return reply.code(201).send(normalizeMember(member));
  });

  // PUT /api/teams/:id/members/:userId — change member role
  fastify.put<{
    Params: { id: string; userId: string };
    Body: { role: TeamRole };
  }>('/api/teams/:id/members/:userId', async (request, reply) => {
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(request.params.id) as TeamRow | undefined;
    if (!team) return reply.code(404).send({ error: 'Team not found' });

    const uid = getLocalUserId(dataDir);
    const self = db.prepare('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?').get(team.id, uid) as MemberRow | undefined;
    if (!self || self.role !== 'owner') {
      return reply.code(403).send({ error: 'Only the team owner can change roles' });
    }

    const { role } = request.body ?? {};
    if (!role || !['owner', 'admin', 'member', 'viewer'].includes(role)) {
      return reply.code(400).send({ error: 'Invalid role. Must be: owner, admin, member, or viewer' });
    }

    const target = db.prepare('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?').get(team.id, request.params.userId) as MemberRow | undefined;
    if (!target) return reply.code(404).send({ error: 'Member not found' });

    db.prepare('UPDATE team_members SET role = ? WHERE team_id = ? AND user_id = ?').run(role, team.id, request.params.userId);
    const updated = db.prepare('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?').get(team.id, request.params.userId) as MemberRow;
    return normalizeMember(updated);
  });

  // PATCH /api/teams/:id/members/:userId — alias for PUT (common API convention)
  fastify.patch<{
    Params: { id: string; userId: string };
    Body: { role: TeamRole };
  }>('/api/teams/:id/members/:userId', async (request, reply) => {
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(request.params.id) as TeamRow | undefined;
    if (!team) return reply.code(404).send({ error: 'Team not found' });
    const uid = getLocalUserId(dataDir);
    const self = db.prepare('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?').get(team.id, uid) as MemberRow | undefined;
    if (!self || (self.role !== 'owner' && self.role !== 'admin')) {
      return reply.code(403).send({ error: 'Only owner or admin can change roles' });
    }
    const { role } = request.body ?? {};
    if (!role || !['owner', 'admin', 'member', 'viewer'].includes(role)) {
      return reply.code(400).send({ error: 'Invalid role. Must be: owner, admin, member, or viewer' });
    }
    const target = db.prepare('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?').get(team.id, request.params.userId) as MemberRow | undefined;
    if (!target) return reply.code(404).send({ error: 'Member not found' });
    db.prepare('UPDATE team_members SET role = ? WHERE team_id = ? AND user_id = ?').run(role, team.id, request.params.userId);
    const updated = db.prepare('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?').get(team.id, request.params.userId) as MemberRow;
    return normalizeMember(updated);
  });

  // DELETE /api/teams/:id/members/:userId — remove member
  fastify.delete<{
    Params: { id: string; userId: string };
  }>('/api/teams/:id/members/:userId', async (request, reply) => {
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(request.params.id) as TeamRow | undefined;
    if (!team) return reply.code(404).send({ error: 'Team not found' });

    const uid = getLocalUserId(dataDir);
    const self = db.prepare('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?').get(team.id, uid) as MemberRow | undefined;

    // Can remove: owner/admin can remove anyone, members can remove themselves
    const targetUserId = request.params.userId;
    const isSelf = targetUserId === uid;
    if (!isSelf && (!self || (self.role !== 'owner' && self.role !== 'admin'))) {
      return reply.code(403).send({ error: 'Insufficient permissions' });
    }

    // Can't remove the owner
    if (team.owner_id === targetUserId) {
      return reply.code(400).send({ error: 'Cannot remove the team owner. Transfer ownership first.' });
    }

    db.prepare('DELETE FROM team_members WHERE team_id = ? AND user_id = ?').run(team.id, targetUserId);
    return { deleted: true, userId: targetUserId, teamId: team.id };
  });

  // GET /api/teams/:id/activity — aggregated events from team workspaces (uses F2 audit trail)
  fastify.get<{
    Params: { id: string };
    Querystring: { limit?: string; from?: string };
  }>('/api/teams/:id/activity', async (request, reply) => {
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(request.params.id) as TeamRow | undefined;
    if (!team) return reply.code(404).send({ error: 'Team not found' });

    const limit = Math.min(parseInt(request.query.limit ?? '50', 10) || 50, 200);
    const from = request.query.from ?? new Date(Date.now() - 7 * 86400000).toISOString();

    // Find all workspaces linked to this team
    const allWorkspaces = fastify.workspaceManager.list();
    const teamWsIds = allWorkspaces
      .filter((ws: any) => ws.teamId === team.id || ws.team === team.id)
      .map((ws: any) => ws.id);

    if (teamWsIds.length === 0) {
      return { items: [], teamId: team.id };
    }

    // Query audit events for all team workspaces
    try {
      const { getAuditDb } = await import('./events.js');
      const auditDb = getAuditDb(dataDir);
      const placeholders = teamWsIds.map(() => '?').join(',');
      const events = auditDb.prepare(`
        SELECT * FROM audit_events
        WHERE workspace_id IN (${placeholders}) AND timestamp >= ?
        ORDER BY id DESC LIMIT ?
      `).all(...teamWsIds, from, limit) as Array<Record<string, unknown>>;

      const items = events.map(e => ({
        id: e.id,
        timestamp: e.timestamp,
        workspaceId: e.workspace_id,
        eventType: e.event_type,
        toolName: e.tool_name,
        sessionId: e.session_id,
      }));

      return { items, teamId: team.id };
    } catch {
      return { items: [], teamId: team.id };
    }
  });
}

// ── Helpers ─────────────────────────────────────────────────────────

function normalizeTeam(row: TeamRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ownerId: row.owner_id,
    created: row.created,
    updated: row.updated,
  };
}

function normalizeMember(row: MemberRow) {
  return {
    userId: row.user_id,
    role: row.role,
    displayName: row.display_name,
    email: row.email,
    joined: row.joined,
  };
}
