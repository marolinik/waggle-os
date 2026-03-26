/**
 * Audit Events REST API Routes — full audit trail for tool calls, memory
 * operations, workspace changes, approvals, and exports.
 *
 * Endpoints:
 *   GET  /api/events          — paginated, filterable event listing
 *   GET  /api/events/stats    — aggregate stats by type and day
 *   GET  /api/events/stream   — SSE stream of live events (for Cockpit)
 *
 * Storage: separate audit.db SQLite database in dataDir (not in .mind)
 * Retention: configurable, default 90 days, auto-cleanup via cron
 */

import path from 'node:path';
import type { FastifyPluginAsync, FastifyInstance } from 'fastify';
import Database from 'better-sqlite3';
import { validateOrigin } from '../cors-config.js';

// ── Event types ─────────────────────────────────────────────────────

export type AuditEventType =
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
  | 'export'
  | 'cron_trigger';

export interface AuditEvent {
  id?: number;
  timestamp: string;
  workspaceId: string;
  userId?: string;
  eventType: AuditEventType;
  toolName?: string;
  input?: string;   // JSON
  output?: string;  // JSON
  model?: string;
  tokensUsed?: number;
  cost?: number;
  sessionId?: string;
  approved?: boolean;
}

// ── Database initialization ─────────────────────────────────────────

let auditDb: Database.Database | null = null;

export function getAuditDb(dataDir: string): Database.Database {
  if (auditDb) return auditDb;

  const dbPath = path.join(dataDir, 'audit.db');
  auditDb = new Database(dbPath);
  auditDb.pragma('journal_mode = WAL');
  auditDb.pragma('synchronous = NORMAL');

  auditDb.exec(`
    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      workspace_id TEXT NOT NULL DEFAULT 'default',
      user_id TEXT,
      event_type TEXT NOT NULL,
      tool_name TEXT,
      input TEXT,
      output TEXT,
      model TEXT,
      tokens_used INTEGER,
      cost REAL,
      session_id TEXT,
      approved INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_audit_workspace_ts
      ON audit_events (workspace_id, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_type_ts
      ON audit_events (event_type, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_session
      ON audit_events (session_id, timestamp DESC);
  `);

  return auditDb;
}

// ── Public API: emit events from other routes ───────────────────────

export function emitAuditEvent(
  server: FastifyInstance,
  event: Omit<AuditEvent, 'id' | 'timestamp'>,
): void {
  try {
    const dataDir = (server as any).localConfig?.dataDir;
    if (!dataDir) return;

    const db = getAuditDb(dataDir);
    db.prepare(`
      INSERT INTO audit_events (
        workspace_id, user_id, event_type, tool_name,
        input, output, model, tokens_used, cost, session_id, approved
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.workspaceId ?? 'default',
      event.userId ?? null,
      event.eventType,
      event.toolName ?? null,
      event.input ?? null,
      event.output ?? null,
      event.model ?? null,
      event.tokensUsed ?? null,
      event.cost ?? null,
      event.sessionId ?? null,
      event.approved != null ? (event.approved ? 1 : 0) : null,
    );

    // Emit on eventBus for SSE stream
    const fullEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };
    (server as any).eventBus?.emit('audit_event', fullEvent);

    // TeamSync: Push audit event to team server (fire-and-forget)
    try {
      const wsConfig = (server as any).workspaceManager?.get(event.workspaceId);
      if (wsConfig?.teamId && wsConfig?.teamServerUrl) {
        (async () => {
          try {
            const { WaggleConfig } = await import('@waggle/core');
            const waggleConfig = new WaggleConfig(dataDir);
            const teamServer = waggleConfig.getTeamServer();
            if (teamServer?.token) {
              fetch(`${wsConfig.teamServerUrl}/api/teams/${wsConfig.teamId}/audit`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${teamServer.token}`,
                },
                body: JSON.stringify({
                  ...event,
                  timestamp: new Date().toISOString(),
                  source: 'local-agent',
                }),
                signal: AbortSignal.timeout(3000),
              }).catch(() => { /* non-blocking */ });
            }
          } catch { /* team push is best-effort */ }
        })();
      }
    } catch { /* team push is best-effort */ }
  } catch {
    // Non-blocking — audit logging must never crash the main flow
  }
}

/** Cleanup events older than retentionDays. Called by cron. */
export function cleanupAuditEvents(dataDir: string, retentionDays = 90): number {
  try {
    const db = getAuditDb(dataDir);
    const cutoff = new Date(Date.now() - retentionDays * 86400000).toISOString();
    const result = db.prepare('DELETE FROM audit_events WHERE timestamp < ?').run(cutoff);
    return result.changes;
  } catch {
    return 0;
  }
}

/** Close the audit database (call on server shutdown). */
export function closeAuditDb(): void {
  if (auditDb) {
    try { auditDb.close(); } catch { /* ignore */ }
    auditDb = null;
  }
}

// ── Route handlers ──────────────────────────────────────────────────

export const eventRoutes: FastifyPluginAsync = async (server) => {
  const dataDir = server.localConfig.dataDir;
  getAuditDb(dataDir);

  // GET /api/events — paginated, filterable event listing
  server.get<{
    Querystring: {
      workspaceId?: string;
      workspace?: string;
      type?: string;
      eventType?: string;
      from?: string;
      to?: string;
      sessionId?: string;
      limit?: string;
      offset?: string;
    };
  }>('/api/events', async (request) => {
    const db = getAuditDb(dataDir);
    const q = request.query;
    const wsId = q.workspaceId ?? q.workspace;
    // BUG-R3-01: Accept both 'type' and 'eventType' query params
    const eventType = q.eventType ?? q.type;
    const from = q.from;
    const to = q.to;
    const sessionId = q.sessionId;
    const limit = Math.min(parseInt(q.limit ?? '100', 10) || 100, 1000);
    const offset = parseInt(q.offset ?? '0', 10) || 0;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (wsId) {
      conditions.push('workspace_id = ?');
      params.push(wsId);
    }
    if (eventType) {
      conditions.push('event_type = ?');
      params.push(eventType);
    }
    if (from) {
      conditions.push('timestamp >= ?');
      params.push(from);
    }
    if (to) {
      conditions.push('timestamp <= ?');
      params.push(to);
    }
    if (sessionId) {
      conditions.push('session_id = ?');
      params.push(sessionId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRow = db.prepare(
      `SELECT COUNT(*) as total FROM audit_events ${where}`,
    ).get(...params) as { total: number };

    const events = db.prepare(
      `SELECT * FROM audit_events ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
    ).all(...params, limit, offset);

    return {
      events: (events as Record<string, unknown>[]).map(normalizeEvent),
      total: countRow.total,
      limit,
      offset,
      // IMP-10: Pagination support
      hasMore: offset + limit < countRow.total,
      page: Math.floor(offset / limit) + 1,
      totalPages: Math.ceil(countRow.total / limit),
    };
  });

  // GET /api/events/stats — aggregate stats
  server.get<{
    Querystring: {
      workspaceId?: string;
      workspace?: string;
      days?: string;
    };
  }>('/api/events/stats', async (request) => {
    const db = getAuditDb(dataDir);
    const wsId = request.query.workspaceId ?? request.query.workspace;
    const days = Math.min(parseInt(request.query.days ?? '30', 10) || 30, 365);
    const since = new Date(Date.now() - days * 86400000).toISOString();

    const wsFilter = wsId ? 'AND workspace_id = ?' : '';
    const wsParams = wsId ? [since, wsId] : [since];

    const totalRow = db.prepare(
      `SELECT COUNT(*) as total FROM audit_events WHERE timestamp >= ? ${wsFilter}`,
    ).get(...wsParams) as { total: number };

    const byType = db.prepare(
      `SELECT event_type, COUNT(*) as count
       FROM audit_events WHERE timestamp >= ? ${wsFilter}
       GROUP BY event_type ORDER BY count DESC`,
    ).all(...wsParams) as Array<{ event_type: string; count: number }>;

    const byDay = db.prepare(
      `SELECT date(timestamp) as day, COUNT(*) as count
       FROM audit_events WHERE timestamp >= ? ${wsFilter}
       GROUP BY date(timestamp) ORDER BY day ASC`,
    ).all(...wsParams) as Array<{ day: string; count: number }>;

    const topTools = db.prepare(
      `SELECT tool_name, COUNT(*) as count
       FROM audit_events
       WHERE timestamp >= ? AND event_type = 'tool_call' AND tool_name IS NOT NULL ${wsFilter}
       GROUP BY tool_name ORDER BY count DESC LIMIT 10`,
    ).all(...wsParams) as Array<{ tool_name: string; count: number }>;

    return {
      totalEvents: totalRow.total,
      period: { days, since },
      byType: Object.fromEntries(byType.map(r => [r.event_type, r.count])),
      byDay,
      topTools: topTools.map(t => ({ name: t.tool_name, count: t.count })),
    };
  });

  // GET /api/events/stream — SSE stream of live audit events
  server.get('/api/events/stream', async (request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': validateOrigin(request.headers.origin as string | undefined),
    });

    reply.raw.write('data: {"type":"connected"}\n\n');

    const handler = (event: AuditEvent) => {
      try {
        reply.raw.write(`event: audit\ndata: ${JSON.stringify(event)}\n\n`);
      } catch { /* Client disconnected */ }
    };

    (server as any).eventBus.on('audit_event', handler);

    request.raw.on('close', () => {
      (server as any).eventBus.removeListener('audit_event', handler);
    });

    const keepAlive = setInterval(() => {
      try {
        reply.raw.write(': keepalive\n\n');
      } catch {
        clearInterval(keepAlive);
      }
    }, 30_000);

    request.raw.on('close', () => clearInterval(keepAlive));
  });
};

// ── Helpers ─────────────────────────────────────────────────────────

function normalizeEvent(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    id: raw.id,
    timestamp: raw.timestamp,
    workspaceId: raw.workspace_id,
    userId: raw.user_id,
    eventType: raw.event_type,
    toolName: raw.tool_name,
    input: raw.input ? tryParse(raw.input as string) : undefined,
    output: raw.output ? tryParse(raw.output as string) : undefined,
    model: raw.model,
    tokensUsed: raw.tokens_used,
    cost: raw.cost,
    sessionId: raw.session_id,
    approved: raw.approved != null ? raw.approved === 1 : undefined,
  };
}

function tryParse(json: string): unknown {
  try { return JSON.parse(json); } catch { return json; }
}
