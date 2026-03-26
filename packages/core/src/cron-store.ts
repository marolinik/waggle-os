/**
 * Cron Store — SQLite persistence for solo cron schedules.
 *
 * Stores cron job definitions with expression validation via cron-parser,
 * due-job queries, and run tracking. Follows the same pattern as
 * InstallAuditStore — operates on the .mind DB with lazy table creation.
 */

import cronParser from 'cron-parser';
const { parseExpression } = cronParser;
import type { MindDB } from './mind/db.js';

// ── Types ──────────────────────────────────────────────────────────────

export type CronJobType = 'agent_task' | 'memory_consolidation' | 'workspace_health' | 'proactive' | 'prompt_optimization' | 'monthly_assessment';

export const VALID_JOB_TYPES: Set<string> = new Set([
  'agent_task',
  'memory_consolidation',
  'workspace_health',
  'proactive',
  'prompt_optimization',
  'monthly_assessment',
]);

export interface CronSchedule {
  id: number;
  name: string;
  cron_expr: string;
  job_type: CronJobType;
  job_config: string;
  workspace_id: string | null;
  enabled: number;          // SQLite integer boolean
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
}

export interface CreateScheduleInput {
  name: string;
  cronExpr: string;
  jobType: CronJobType;
  jobConfig?: Record<string, unknown>;
  workspaceId?: string;
  enabled?: boolean;
}

// ── Table DDL ──────────────────────────────────────────────────────────

export const CRON_SCHEDULES_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS cron_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  cron_expr TEXT NOT NULL,
  job_type TEXT NOT NULL,
  job_config TEXT NOT NULL DEFAULT '{}',
  workspace_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  next_run_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cron_enabled_next ON cron_schedules (enabled, next_run_at);
`;

// W5.12: Cron execution history table
export const CRON_HISTORY_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS cron_execution_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id INTEGER NOT NULL,
  schedule_name TEXT NOT NULL,
  executed_at TEXT NOT NULL DEFAULT (datetime('now')),
  duration_ms INTEGER,
  success INTEGER NOT NULL DEFAULT 1,
  result_summary TEXT,
  error TEXT,
  FOREIGN KEY (schedule_id) REFERENCES cron_schedules(id)
);
CREATE INDEX IF NOT EXISTS idx_cron_history_schedule ON cron_execution_history (schedule_id, executed_at);
`;

// W5.10: Notification persistence table
export const NOTIFICATIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'system',
  action_url TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications (created_at);
`;

// ── Helpers ────────────────────────────────────────────────────────────

/** Parse a cron expression and return the next run time as ISO string. Throws on invalid expr. */
function computeNextRun(cronExpr: string): string {
  const interval = parseExpression(cronExpr);
  return interval.next().toISOString();
}

// ── Store ──────────────────────────────────────────────────────────────

export class CronStore {
  private db: MindDB;

  constructor(db: MindDB) {
    this.db = db;
    this.ensureTable();
  }

  private ensureTable(): void {
    const raw = this.db.getDatabase();
    const exists = raw.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='cron_schedules'",
    ).get();
    if (!exists) {
      raw.exec(CRON_SCHEDULES_TABLE_SQL);
    }
    // W5.12: Ensure cron execution history table
    const histExists = raw.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='cron_execution_history'",
    ).get();
    if (!histExists) {
      raw.exec(CRON_HISTORY_TABLE_SQL);
    }
    // W5.10: Ensure notifications table
    const notifExists = raw.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='notifications'",
    ).get();
    if (!notifExists) {
      raw.exec(NOTIFICATIONS_TABLE_SQL);
    }
  }

  /** Create a new cron schedule. Validates cron expression and job type. */
  create(input: CreateScheduleInput): CronSchedule {
    // Validate job type
    if (!VALID_JOB_TYPES.has(input.jobType)) {
      throw new Error(`Invalid job type: "${input.jobType}". Must be one of: ${[...VALID_JOB_TYPES].join(', ')}`);
    }

    // agent_task requires workspaceId
    if (input.jobType === 'agent_task' && !input.workspaceId) {
      throw new Error('agent_task jobs require a workspace ID');
    }

    // Validate cron expression (throws on invalid)
    const nextRun = computeNextRun(input.cronExpr);

    const raw = this.db.getDatabase();
    const enabled = input.enabled === false ? 0 : 1;

    const result = raw.prepare(`
      INSERT INTO cron_schedules (name, cron_expr, job_type, job_config, workspace_id, enabled, next_run_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.name,
      input.cronExpr,
      input.jobType,
      JSON.stringify(input.jobConfig ?? {}),
      input.workspaceId ?? null,
      enabled,
      nextRun,
    );

    return raw.prepare(
      'SELECT * FROM cron_schedules WHERE id = ?',
    ).get(result.lastInsertRowid) as CronSchedule;
  }

  /** List all schedules ordered by name. */
  list(): CronSchedule[] {
    return this.db.getDatabase().prepare(
      'SELECT * FROM cron_schedules ORDER BY name ASC',
    ).all() as CronSchedule[];
  }

  /** Get a schedule by ID. Returns undefined if not found. */
  getById(id: number): CronSchedule | undefined {
    return this.db.getDatabase().prepare(
      'SELECT * FROM cron_schedules WHERE id = ?',
    ).get(id) as CronSchedule | undefined;
  }

  /** Update a schedule. Recomputes next_run_at if cronExpr changes. Returns updated schedule. */
  update(id: number, changes: Partial<Pick<CreateScheduleInput, 'name' | 'cronExpr' | 'jobConfig' | 'workspaceId' | 'enabled'>>): CronSchedule {
    const setClauses: string[] = [];
    const values: unknown[] = [];

    if (changes.name !== undefined) {
      setClauses.push('name = ?');
      values.push(changes.name);
    }
    if (changes.cronExpr !== undefined) {
      const nextRun = computeNextRun(changes.cronExpr);
      setClauses.push('cron_expr = ?');
      values.push(changes.cronExpr);
      setClauses.push('next_run_at = ?');
      values.push(nextRun);
    }
    if (changes.jobConfig !== undefined) {
      setClauses.push('job_config = ?');
      values.push(JSON.stringify(changes.jobConfig));
    }
    if (changes.workspaceId !== undefined) {
      setClauses.push('workspace_id = ?');
      values.push(changes.workspaceId);
    }
    if (changes.enabled !== undefined) {
      setClauses.push('enabled = ?');
      values.push(changes.enabled ? 1 : 0);
    }

    if (setClauses.length > 0) {
      values.push(id);
      this.db.getDatabase().prepare(
        `UPDATE cron_schedules SET ${setClauses.join(', ')} WHERE id = ?`,
      ).run(...values);
    }

    return this.getById(id)!;
  }

  /** Delete a schedule by ID. */
  delete(id: number): void {
    this.db.getDatabase().prepare(
      'DELETE FROM cron_schedules WHERE id = ?',
    ).run(id);
  }

  /** Get all enabled schedules whose next_run_at is in the past. */
  getDue(): CronSchedule[] {
    return this.db.getDatabase().prepare(
      "SELECT * FROM cron_schedules WHERE enabled = 1 AND next_run_at <= datetime('now')",
    ).all() as CronSchedule[];
  }

  /** Mark a schedule as having just run. Updates last_run_at and recomputes next_run_at. */
  markRun(id: number): void {
    const schedule = this.getById(id);
    if (!schedule) return;

    const nextRun = computeNextRun(schedule.cron_expr);
    this.db.getDatabase().prepare(
      "UPDATE cron_schedules SET last_run_at = datetime('now'), next_run_at = ? WHERE id = ?",
    ).run(nextRun, id);
  }

  /** Clear all schedules (for testing). */
  clear(): void {
    this.db.getDatabase().prepare('DELETE FROM cron_schedules').run();
  }

  // ── W5.12: Cron Execution History ──────────────────────────────────

  /** Record a cron job execution result. */
  recordExecution(scheduleId: number, scheduleName: string, opts: {
    durationMs?: number;
    success: boolean;
    resultSummary?: string;
    error?: string;
  }): void {
    this.db.getDatabase().prepare(
      `INSERT INTO cron_execution_history (schedule_id, schedule_name, duration_ms, success, result_summary, error)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(scheduleId, scheduleName, opts.durationMs ?? null, opts.success ? 1 : 0, opts.resultSummary ?? null, opts.error ?? null);
  }

  /** Get execution history for a schedule (most recent first). */
  getExecutionHistory(scheduleId: number, limit = 20): Array<{
    id: number; schedule_id: number; schedule_name: string; executed_at: string;
    duration_ms: number | null; success: number; result_summary: string | null; error: string | null;
  }> {
    return this.db.getDatabase().prepare(
      'SELECT * FROM cron_execution_history WHERE schedule_id = ? ORDER BY executed_at DESC LIMIT ?',
    ).all(scheduleId, limit) as any[];
  }

  // ── W5.10: Notification Persistence ────────────────────────────────

  /** Save a notification. */
  saveNotification(title: string, body: string, category = 'system', actionUrl?: string): number {
    const result = this.db.getDatabase().prepare(
      'INSERT INTO notifications (title, body, category, action_url) VALUES (?, ?, ?, ?)',
    ).run(title, body, category, actionUrl ?? null);
    return Number(result.lastInsertRowid);
  }

  /** Get recent notifications (newest first). */
  getNotifications(opts?: { since?: string; limit?: number; unreadOnly?: boolean }): Array<{
    id: number; title: string; body: string; category: string;
    action_url: string | null; read: number; created_at: string;
  }> {
    const limit = opts?.limit ?? 50;
    let sql = 'SELECT * FROM notifications';
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (opts?.since) { conditions.push('created_at > ?'); params.push(opts.since); }
    if (opts?.unreadOnly) { conditions.push('read = 0'); }
    if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);
    return this.db.getDatabase().prepare(sql).all(...params) as any[];
  }

  /** Mark a notification as read. */
  markNotificationRead(id: number): void {
    this.db.getDatabase().prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(id);
  }

  /** Mark all notifications as read. Returns the number of rows updated. */
  markAllRead(): number {
    const result = this.db.getDatabase().prepare('UPDATE notifications SET read = 1 WHERE read = 0').run();
    return result.changes;
  }

  /** Count unread notifications. */
  countUnread(): number {
    const row = this.db.getDatabase().prepare('SELECT COUNT(*) as cnt FROM notifications WHERE read = 0').get() as { cnt: number };
    return row.cnt;
  }
}
