/**
 * Optimization Log Store — SQLite persistence for GEPA prompt optimization data.
 *
 * Captures agent interaction metadata (system prompts, tools used, turn counts,
 * correction signals) for background analysis by the PromptOptimizer.
 *
 * Follows the same lazy-table pattern as CronStore and InstallAuditStore —
 * operates on the .mind DB with auto-table creation.
 */

import type { MindDB } from './mind/db.js';

// ── Types ──────────────────────────────────────────────────────────────

export interface OptimizationLogEntry {
  id: number;
  session_id: string;
  workspace_id: string;
  system_prompt: string;
  tools_used: string;    // JSON array
  turn_count: number;
  was_correction: number; // SQLite integer boolean
  input_tokens: number;
  output_tokens: number;
  timestamp: string;
}

export interface CreateOptimizationLogInput {
  sessionId: string;
  workspaceId: string;
  systemPrompt: string;
  toolsUsed: string[];
  turnCount: number;
  wasCorrection: boolean;
  inputTokens?: number;
  outputTokens?: number;
}

// ── Table DDL ──────────────────────────────────────────────────────────

export const OPTIMIZATION_LOG_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS optimization_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  tools_used TEXT NOT NULL DEFAULT '[]',
  turn_count INTEGER NOT NULL DEFAULT 0,
  was_correction INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_optlog_workspace ON optimization_log (workspace_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_optlog_timestamp ON optimization_log (timestamp DESC);
`;

// ── Store ──────────────────────────────────────────────────────────────

export class OptimizationLogStore {
  private db: MindDB;

  constructor(db: MindDB) {
    this.db = db;
    this.ensureTable();
  }

  private ensureTable(): void {
    const raw = this.db.getDatabase();
    const exists = raw.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='optimization_log'",
    ).get();
    if (!exists) {
      raw.exec(OPTIMIZATION_LOG_TABLE_SQL);
    }
  }

  /** Insert a new optimization log entry capturing an agent interaction. */
  insert(input: CreateOptimizationLogInput): OptimizationLogEntry {
    const raw = this.db.getDatabase();
    const result = raw.prepare(`
      INSERT INTO optimization_log (session_id, workspace_id, system_prompt, tools_used, turn_count, was_correction, input_tokens, output_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.sessionId,
      input.workspaceId,
      input.systemPrompt,
      JSON.stringify(input.toolsUsed),
      input.turnCount,
      input.wasCorrection ? 1 : 0,
      input.inputTokens ?? 0,
      input.outputTokens ?? 0,
    );

    return raw.prepare(
      'SELECT * FROM optimization_log WHERE id = ?',
    ).get(result.lastInsertRowid) as OptimizationLogEntry;
  }

  /** Get recent optimization log entries, ordered by most recent first. */
  getRecent(limit: number = 50): OptimizationLogEntry[] {
    return this.db.getDatabase().prepare(
      'SELECT * FROM optimization_log ORDER BY timestamp DESC, id DESC LIMIT ?',
    ).all(limit) as OptimizationLogEntry[];
  }

  /** Get log entries for a specific workspace. */
  getByWorkspace(workspaceId: string, limit: number = 50): OptimizationLogEntry[] {
    return this.db.getDatabase().prepare(
      'SELECT * FROM optimization_log WHERE workspace_id = ? ORDER BY timestamp DESC, id DESC LIMIT ?',
    ).all(workspaceId, limit) as OptimizationLogEntry[];
  }

  /** Get aggregate stats: total entries, correction rate, avg turn count, total tokens. */
  getStats(): { total: number; correctionRate: number; avgTurnCount: number; totalInputTokens: number; totalOutputTokens: number } {
    const raw = this.db.getDatabase();
    const row = raw.prepare(`
      SELECT
        COUNT(*) as total,
        COALESCE(AVG(was_correction * 1.0), 0) as correction_rate,
        COALESCE(AVG(turn_count), 0) as avg_turn_count,
        COALESCE(SUM(input_tokens), 0) as total_input_tokens,
        COALESCE(SUM(output_tokens), 0) as total_output_tokens
      FROM optimization_log
    `).get() as {
      total: number;
      correction_rate: number;
      avg_turn_count: number;
      total_input_tokens: number;
      total_output_tokens: number;
    };

    return {
      total: row.total,
      correctionRate: row.correction_rate,
      avgTurnCount: row.avg_turn_count,
      totalInputTokens: row.total_input_tokens,
      totalOutputTokens: row.total_output_tokens,
    };
  }

  /** Delete entries older than the given number of days. */
  pruneOlderThan(days: number): number {
    const result = this.db.getDatabase().prepare(
      `DELETE FROM optimization_log WHERE timestamp < datetime('now', '-' || ? || ' days')`,
    ).run(days);
    return result.changes;
  }

  /** Clear all entries (for testing). */
  clear(): void {
    this.db.getDatabase().prepare('DELETE FROM optimization_log').run();
  }
}
