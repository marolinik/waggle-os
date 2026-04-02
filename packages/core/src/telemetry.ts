/**
 * TelemetryStore — local, privacy-first event tracking.
 *
 * All data stays in ~/.waggle/telemetry.db (SQLite).
 * Default: OFF. User opts in via Settings toggle.
 * No cloud reporting in M2 — data is queryable via local API only.
 *
 * NEVER tracked: message content, memory content, file paths,
 * API keys, personal info, IP addresses, device IDs.
 */

import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

/* ── Schema ── */
const TELEMETRY_SCHEMA = `
CREATE TABLE IF NOT EXISTS telemetry_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event TEXT NOT NULL,
  properties TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_telemetry_event ON telemetry_events (event, created_at);
CREATE INDEX IF NOT EXISTS idx_telemetry_date ON telemetry_events (created_at);
`;

/* ── Event constants ── */
export const TELEMETRY_EVENTS = {
  // Onboarding funnel
  ONBOARDING_START: 'onboarding_start',
  ONBOARDING_STEP: 'onboarding_step',
  ONBOARDING_COMPLETE: 'onboarding_complete',
  ONBOARDING_SKIP: 'onboarding_skip',

  // Session engagement
  SESSION_START: 'session_start',
  SESSION_END: 'session_end',

  // Infrastructure
  EMBEDDING_PROVIDER: 'embedding_provider',
  LLM_PROVIDER: 'llm_provider',

  // Feature usage
  TEMPLATE_SELECTED: 'template_selected',
  WORKSPACE_CREATED: 'workspace_created',
  FIRST_AGENT_RESPONSE: 'first_agent_response',
  SLASH_COMMAND_USED: 'slash_command_used',

  // App lifecycle
  APP_START: 'app_start',
  APP_ERROR: 'app_error',
} as const;

/* ── Types ── */
export interface TelemetryEvent {
  id: number;
  event: string;
  properties: Record<string, unknown>;
  created_at: string;
}

export interface TelemetrySummary {
  enabled: boolean;
  totalEvents: number;
  firstEvent: string | null;
  lastEvent: string | null;
  onboardingCompleted: boolean;
  totalSessions: number;
  embeddingProvider: string | null;
  templatesUsed: string[];
  eventBreakdown: Record<string, number>;
}

/* ── Store ── */
export class TelemetryStore {
  private db: DatabaseType;
  private enabled: boolean;

  constructor(dataDir: string, enabled = false) {
    this.enabled = enabled;
    const dbPath = path.join(dataDir, 'telemetry.db');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(TELEMETRY_SCHEMA);
  }

  /** Track an event. No-op if telemetry is disabled. */
  track(event: string, properties?: Record<string, unknown>): void {
    if (!this.enabled) return;
    this.db.prepare(
      'INSERT INTO telemetry_events (event, properties) VALUES (?, ?)'
    ).run(event, JSON.stringify(properties ?? {}));
  }

  /** Enable/disable telemetry at runtime. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /** Whether telemetry is currently enabled. */
  isEnabled(): boolean {
    return this.enabled;
  }

  /** Get aggregated summary. */
  getSummary(): TelemetrySummary {
    const total = (this.db.prepare(
      'SELECT COUNT(*) as cnt FROM telemetry_events'
    ).get() as { cnt: number }).cnt;

    const first = this.db.prepare(
      'SELECT MIN(created_at) as d FROM telemetry_events'
    ).get() as { d: string | null };

    const last = this.db.prepare(
      'SELECT MAX(created_at) as d FROM telemetry_events'
    ).get() as { d: string | null };

    const onboarded = (this.db.prepare(
      "SELECT COUNT(*) as cnt FROM telemetry_events WHERE event = 'onboarding_complete'"
    ).get() as { cnt: number }).cnt > 0;

    const sessions = (this.db.prepare(
      "SELECT COUNT(*) as cnt FROM telemetry_events WHERE event = 'session_start'"
    ).get() as { cnt: number }).cnt;

    const embRow = this.db.prepare(
      "SELECT properties FROM telemetry_events WHERE event = 'embedding_provider' ORDER BY created_at DESC LIMIT 1"
    ).get() as { properties: string } | undefined;
    const embProvider = embRow
      ? (JSON.parse(embRow.properties) as Record<string, unknown>).provider as string ?? null
      : null;

    const tplRows = this.db.prepare(
      "SELECT DISTINCT json_extract(properties, '$.templateId') as tid FROM telemetry_events WHERE event IN ('template_selected', 'workspace_created') AND json_extract(properties, '$.templateId') IS NOT NULL"
    ).all() as Array<{ tid: string }>;

    const breakdownRows = this.db.prepare(
      'SELECT event, COUNT(*) as cnt FROM telemetry_events GROUP BY event ORDER BY cnt DESC'
    ).all() as Array<{ event: string; cnt: number }>;
    const breakdown: Record<string, number> = {};
    for (const row of breakdownRows) {
      breakdown[row.event] = row.cnt;
    }

    return {
      enabled: this.enabled,
      totalEvents: total,
      firstEvent: first.d,
      lastEvent: last.d,
      onboardingCompleted: onboarded,
      totalSessions: sessions,
      embeddingProvider: embProvider,
      templatesUsed: tplRows.map(r => r.tid),
      eventBreakdown: breakdown,
    };
  }

  /** Get raw events with optional filters. */
  getEvents(options?: { event?: string; since?: string; until?: string; limit?: number }): TelemetryEvent[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options?.event) {
      conditions.push('event = ?');
      params.push(options.event);
    }
    if (options?.since) {
      conditions.push('created_at >= ?');
      params.push(options.since);
    }
    if (options?.until) {
      conditions.push('created_at <= ?');
      params.push(options.until);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options?.limit ?? 100;

    const rows = this.db.prepare(
      `SELECT id, event, properties, created_at FROM telemetry_events ${where} ORDER BY created_at DESC LIMIT ?`
    ).all(...params, limit) as Array<{ id: number; event: string; properties: string; created_at: string }>;

    return rows.map(r => ({
      id: r.id,
      event: r.event,
      properties: JSON.parse(r.properties) as Record<string, unknown>,
      created_at: r.created_at,
    }));
  }

  /** Delete all telemetry data (user right-to-delete). */
  clear(): { deleted: number } {
    const result = this.db.prepare('DELETE FROM telemetry_events').run();
    return { deleted: result.changes };
  }

  /** Close the database connection. */
  close(): void {
    this.db.close();
  }
}

/* ── Collector ── */

const COLLECTOR_SCHEMA = `
CREATE TABLE IF NOT EXISTS collector_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_collector_date ON collector_events (date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_collector_name_date ON collector_events (name, date);
`;

/**
 * TelemetryCollector — higher-level daily-aggregated event tracker.
 *
 * Records tool usage, commands, errors, and capability gaps by day.
 * Privacy-safe: only category + name + count, no content or PII.
 */
export class TelemetryCollector {
  private db: DatabaseType;
  private enabled: boolean;
  private dataDir: string;

  constructor(dataDir: string, enabled = false) {
    this.dataDir = dataDir;
    this.enabled = enabled;
    const dbPath = path.join(dataDir, 'telemetry.db');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(COLLECTOR_SCHEMA);
  }

  recordToolUse(toolName: string): void {
    if (!this.enabled) return;
    this.upsertEvent('tool', toolName);
  }

  recordCommand(command: string): void {
    if (!this.enabled) return;
    this.upsertEvent('command', command);
  }

  recordError(errorName: string): void {
    if (!this.enabled) return;
    this.upsertEvent('error', errorName);
  }

  recordCapabilityGap(capability: string): void {
    if (!this.enabled) return;
    this.upsertEvent('capability_gap', capability);
  }

  recordSession(durationMs: number, interactionCount: number): void {
    if (!this.enabled) return;
    const today = new Date().toISOString().split('T')[0];
    this.db.prepare(
      `INSERT INTO collector_events (category, name, count, date) VALUES ('session', 'duration_total_ms', ?, ?)
       ON CONFLICT(name, date) DO UPDATE SET count = count + excluded.count`
    ).run(durationMs, today);
    this.db.prepare(
      `INSERT INTO collector_events (category, name, count, date) VALUES ('session', 'interaction_count', ?, ?)
       ON CONFLICT(name, date) DO UPDATE SET count = count + excluded.count`
    ).run(interactionCount, today);
    this.db.prepare(
      `INSERT INTO collector_events (category, name, count, date) VALUES ('session', 'session_count', 1, ?)
       ON CONFLICT(name, date) DO UPDATE SET count = count + 1`
    ).run(today);
  }

  private upsertEvent(category: string, name: string): void {
    const today = new Date().toISOString().split('T')[0];
    this.db.prepare(
      `INSERT INTO collector_events (category, name, count, date) VALUES (?, ?, 1, ?)
       ON CONFLICT(name, date) DO UPDATE SET count = count + 1`
    ).run(category, name, today);
  }

  getReport(days = 7): {
    totalEvents: number;
    events: Array<{ name: string; count: number; category: string; date: string }>;
    dateRange: { from: string | null };
  } {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().split('T')[0];

    const rows = this.db.prepare(
      `SELECT name, SUM(count) as total_count, category, date
       FROM collector_events WHERE date >= ?
       GROUP BY name, category, date ORDER BY date DESC, name`
    ).all(sinceStr) as Array<{ name: string; total_count: number; category: string; date: string }>;

    const totalEvents = rows.reduce((sum, r) => sum + r.total_count, 0);
    const events = rows.map(r => ({ name: r.name, count: r.total_count, category: r.category, date: r.date }));
    const firstRow = this.db.prepare(
      'SELECT MIN(date) as first_date FROM collector_events'
    ).get() as { first_date: string | null };

    return { totalEvents, events, dateRange: { from: firstRow.first_date } };
  }

  /** Write events to telemetry.json for external consumption. */
  flush(): void {
    const rows = this.db.prepare(
      'SELECT name, count, category, date FROM collector_events ORDER BY date DESC, name'
    ).all() as Array<{ name: string; count: number; category: string; date: string }>;
    fs.writeFileSync(
      path.join(this.dataDir, 'telemetry.json'),
      JSON.stringify(rows, null, 2),
    );
  }

  setEnabled(enabled: boolean): void { this.enabled = enabled; }
  isEnabled(): boolean { return this.enabled; }
  close(): void { this.db.close(); }
}
