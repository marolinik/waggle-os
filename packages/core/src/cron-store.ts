/**
 * Cron Store — SQLite persistence for solo cron schedules.
 *
 * Stores cron job definitions with expression validation via cron-parser,
 * due-job queries, and run tracking. Follows the same pattern as
 * InstallAuditStore — operates on the .mind DB with lazy table creation.
 */

import cronParser from 'cron-parser';
const { parseExpression } = cronParser;
import type { MindDB } from '@waggle/hive-mind-core';

// ── Types ──────────────────────────────────────────────────────────────

export type CronJobType = 'agent_task' | 'memory_consolidation' | 'workspace_health' | 'proactive' | 'prompt_optimization' | 'monthly_assessment' | 'connector_fetch' | 'loop';

export const VALID_JOB_TYPES: Set<string> = new Set([
  'agent_task',
  'memory_consolidation',
  'workspace_health',
  'proactive',
  'prompt_optimization',
  'monthly_assessment',
  'connector_fetch',
  // Loop v0: a stateful, memory-powered, report-only (L1) scheduled automation.
  // Composes recall + maker (toolless LLM) + checker (LLMJudge) + memory write.
  // job_type TEXT has no CHECK constraint, so this is additive — no migration.
  'loop',
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

export interface CronExecutionRow {
  id: number;
  schedule_id: number;
  schedule_name: string;
  executed_at: string;
  duration_ms: number | null;
  success: number;          // SQLite integer boolean
  result_summary: string | null;
  error: string | null;
}

export interface CronRunLeaseRow {
  id: number;
  schedule_id: number;
  schedule_name: string | null;
  started_at: string;
  pid: number | null;
}

export interface NotificationRow {
  id: number;
  title: string;
  body: string;
  category: string;
  action_url: string | null;
  read: number;             // SQLite integer boolean
  created_at: string;
}

// ── L2 assisted loops: durable "held action" approval queue ──────────────
// A held action is a self-contained proposed tool call drafted by a headless
// run (e.g. an assist-mode Loop) that needs a human's one-click approval before
// it executes. Durable so it survives a sidecar restart (the in-memory live
// approval Promise does not). Execute-on-approve, never mid-run suspend/resume.

export type PendingActionStatus = 'held' | 'approved' | 'denied' | 'executed' | 'failed' | 'expired';

export interface PendingActionRow {
  id: string;               // requestId (uuid)
  workspace_id: string | null;
  source: string;           // e.g. 'loop:<scheduleId>'
  tool_name: string;
  args_json: string;
  summary: string | null;   // the maker's plain-language rationale
  risk_level: string;       // low | medium | high | critical
  approval_class: string;
  status: PendingActionStatus;
  result_summary: string | null;
  error: string | null;
  created_at: string;
  decided_at: string | null;
  executed_at: string | null;
  expires_at: string | null;
}

export interface SavePendingActionInput {
  id: string;
  workspaceId: string | null;
  source: string;
  toolName: string;
  argsJson: string;
  summary?: string;
  riskLevel: string;
  approvalClass: string;
  expiresAt?: string;
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

export const CRON_RUN_LEASES_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS cron_run_leases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id INTEGER NOT NULL,
  schedule_name TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  pid INTEGER
);
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

// L2: durable held-action approval queue
export const PENDING_ACTIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS pending_actions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  source TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  args_json TEXT NOT NULL,
  summary TEXT,
  risk_level TEXT NOT NULL,
  approval_class TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'held',
  result_summary TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at TEXT,
  executed_at TEXT,
  expires_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_pending_actions_status ON pending_actions (status, created_at);
`;

// ── Helpers ────────────────────────────────────────────────────────────

/** Parse a cron expression and return the next run time as ISO string. Throws on invalid expr. */
function computeNextRun(cronExpr: string): string {
  const interval = parseExpression(cronExpr);
  return interval.next().toISOString();
}

/**
 * Validate a cron expression with the SAME parser create()/update() use.
 * Returns null when parseable, else the parser's error message. Lets route
 * layers (e.g. the automations /test preview) reject an expression the store
 * would refuse to persist, without duplicating the parser dependency.
 */
export function cronExprError(cronExpr: string): string | null {
  try {
    parseExpression(cronExpr);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
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
    const leaseExists = raw.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='cron_run_leases'",
    ).get();
    if (!leaseExists) {
      raw.exec(CRON_RUN_LEASES_TABLE_SQL);
    }
    // W5.10: Ensure notifications table
    const notifExists = raw.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='notifications'",
    ).get();
    if (!notifExists) {
      raw.exec(NOTIFICATIONS_TABLE_SQL);
    }
    // L2: Ensure pending_actions (held-action approval queue) table
    const pendingExists = raw.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='pending_actions'",
    ).get();
    if (!pendingExists) {
      raw.exec(PENDING_ACTIONS_TABLE_SQL);
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
    executedAt?: string;
    durationMs?: number;
    success: boolean;
    resultSummary?: string;
    error?: string;
  }): void {
    this.db.getDatabase().prepare(
      `INSERT INTO cron_execution_history (schedule_id, schedule_name, executed_at, duration_ms, success, result_summary, error)
       VALUES (?, ?, COALESCE(?, datetime('now')), ?, ?, ?, ?)`,
    ).run(scheduleId, scheduleName, opts.executedAt ?? null, opts.durationMs ?? null, opts.success ? 1 : 0, opts.resultSummary ?? null, opts.error ?? null);
  }

  /** #17: count today's (UTC) executions for a schedule — ai_task daily cap. */
  countExecutionsToday(scheduleId: number): number {
    const row = this.db.getDatabase().prepare(
      "SELECT COUNT(*) AS n FROM cron_execution_history WHERE schedule_id = ? AND executed_at >= date('now')",
    ).get(scheduleId) as { n: number };
    return row.n;
  }

  /** Get execution history for a schedule (most recent first). */
  getExecutionHistory(scheduleId: number, limit = 20): CronExecutionRow[] {
    return this.db.getDatabase().prepare(
      'SELECT * FROM cron_execution_history WHERE schedule_id = ? ORDER BY executed_at DESC LIMIT ?',
    ).all(scheduleId, limit) as CronExecutionRow[];
  }

  /** Get the most recent executions for boot-time failure-state recovery. */
  getRecentExecutions(scheduleId: number, limit = 5): CronExecutionRow[] {
    return this.db.getDatabase().prepare(
      'SELECT * FROM cron_execution_history WHERE schedule_id = ? ORDER BY executed_at DESC, id DESC LIMIT ?',
    ).all(scheduleId, limit) as CronExecutionRow[];
  }

  /** Prune execution-history rows older than N days. recordExecution writes a
   *  row per tick (UX-Refactor Phase 3, Journey 16), so without retention the
   *  table grows unbounded (a per-minute job ≈ 525k rows/year). Mirrors
   *  optStore.pruneOlderThan(30). Returns the number of rows deleted. */
  pruneExecutionHistory(olderThanDays: number): number {
    const days = Math.max(1, Math.floor(olderThanDays));
    const result = this.db.getDatabase().prepare(
      "DELETE FROM cron_execution_history WHERE executed_at < datetime('now', ?)",
    ).run(`-${days} days`);
    return result.changes;
  }

  // ── Interrupted-run leases ────────────────────────────────────────

  /** Acquire a durable lease before a scheduled job begins execution. */
  acquireRunLease(scheduleId: number, name: string, pid: number): number {
    const result = this.db.getDatabase().prepare(
      'INSERT INTO cron_run_leases (schedule_id, schedule_name, pid) VALUES (?, ?, ?)',
    ).run(scheduleId, name, pid);
    return Number(result.lastInsertRowid);
  }

  /** Release a run lease after its scheduled job finishes. */
  releaseRunLease(leaseId: number): void {
    this.db.getDatabase().prepare(
      'DELETE FROM cron_run_leases WHERE id = ?',
    ).run(leaseId);
  }

  /** List leases left behind by an interrupted process. */
  listStaleRunLeases(): CronRunLeaseRow[] {
    return this.db.getDatabase().prepare(
      'SELECT * FROM cron_run_leases ORDER BY started_at ASC, id ASC',
    ).all() as CronRunLeaseRow[];
  }

  /** Clear all interrupted-run leases after boot recovery. */
  clearRunLeases(): void {
    this.db.getDatabase().prepare('DELETE FROM cron_run_leases').run();
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
  getNotifications(opts?: { since?: string; limit?: number; unreadOnly?: boolean }): NotificationRow[] {
    const limit = opts?.limit ?? 50;
    let sql = 'SELECT * FROM notifications';
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (opts?.since) { conditions.push('created_at > ?'); params.push(opts.since); }
    if (opts?.unreadOnly) { conditions.push('read = 0'); }
    if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);
    return this.db.getDatabase().prepare(sql).all(...params) as NotificationRow[];
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

  // ── L2: Held-action approval queue ─────────────────────────────────

  /** Enqueue a held action (status 'held'). Returns the persisted row. */
  savePendingAction(input: SavePendingActionInput): PendingActionRow {
    this.db.getDatabase().prepare(`
      INSERT INTO pending_actions (id, workspace_id, source, tool_name, args_json, summary, risk_level, approval_class, status, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'held', ?)
    `).run(
      input.id,
      input.workspaceId,
      input.source,
      input.toolName,
      input.argsJson,
      input.summary ?? null,
      input.riskLevel,
      input.approvalClass,
      input.expiresAt ?? null,
    );
    return this.getPendingAction(input.id)!;
  }

  /** List held actions (newest first) — defaults to the 'held' queue. */
  listPendingActions(status: PendingActionStatus = 'held'): PendingActionRow[] {
    return this.db.getDatabase().prepare(
      'SELECT * FROM pending_actions WHERE status = ? ORDER BY created_at DESC',
    ).all(status) as PendingActionRow[];
  }

  /** Get one held action by id. */
  getPendingAction(id: string): PendingActionRow | undefined {
    return this.db.getDatabase().prepare(
      'SELECT * FROM pending_actions WHERE id = ?',
    ).get(id) as PendingActionRow | undefined;
  }

  /**
   * Atomically claim a held action — transition 'held' → 'approved' | 'denied'.
   * This is the idempotency gate: exactly ONE caller wins (the `WHERE status =
   * 'held'` makes it atomic in SQLite), so a double-approve / approve-after-deny
   * is a no-op. Returns the updated row if THIS call won the claim, else
   * undefined (already decided or missing).
   */
  claimPendingAction(id: string, status: 'approved' | 'denied', decidedAt: string): PendingActionRow | undefined {
    const result = this.db.getDatabase().prepare(
      "UPDATE pending_actions SET status = ?, decided_at = ? WHERE id = ? AND status = 'held'",
    ).run(status, decidedAt, id);
    if (result.changes === 0) return undefined;
    return this.getPendingAction(id);
  }

  /**
   * Record the terminal outcome of a claimed action ('approved' → 'executed' |
   * 'failed'). Unconditional — the caller already won claimPendingAction(), so
   * it owns the row and no further guard is needed.
   */
  updatePendingActionResult(id: string, changes: { status: 'executed' | 'failed'; resultSummary?: string; error?: string; executedAt?: string }): void {
    const sets: string[] = ['status = ?'];
    const vals: unknown[] = [changes.status];
    if (changes.resultSummary !== undefined) { sets.push('result_summary = ?'); vals.push(changes.resultSummary); }
    if (changes.error !== undefined) { sets.push('error = ?'); vals.push(changes.error); }
    if (changes.executedAt !== undefined) { sets.push('executed_at = ?'); vals.push(changes.executedAt); }
    vals.push(id);
    this.db.getDatabase().prepare(
      `UPDATE pending_actions SET ${sets.join(', ')} WHERE id = ?`,
    ).run(...vals);
  }

  /** Flip held actions past their expires_at to 'expired'. Returns rows changed. */
  expireStalePendingActions(): number {
    const result = this.db.getDatabase().prepare(
      "UPDATE pending_actions SET status = 'expired' WHERE status = 'held' AND expires_at IS NOT NULL AND expires_at < datetime('now')",
    ).run();
    return result.changes;
  }

  /** Clear all pending actions (for testing). */
  clearPendingActions(): void {
    this.db.getDatabase().prepare('DELETE FROM pending_actions').run();
  }
}
