/**
 * InteractionStore — CRUD for ai_interactions table (EU AI Act Art. 12).
 *
 * Records every AI interaction with model, tokens, cost, tools, and human oversight.
 * Operates on the .mind DB alongside FrameStore and InstallAuditStore.
 */

import type { MindDB } from '../mind/db.js';
import type { AIInteraction, RecordInteractionInput, HumanAction, ModelInventoryEntry, OversightLogEntry } from './types.js';

export class InteractionStore {
  private db: MindDB;

  constructor(db: MindDB) {
    this.db = db;
    // Review Major #8: previously ensureTable() duplicated the DDL from schema.ts and
    // drifted whenever the canonical schema changed. Now schema.ts + MindDB.runMigrations()
    // own the table definition, including the input_text/output_text columns and the
    // append-only triggers (Critical #1, #3).
  }

  /** Record an AI interaction event. */
  record(input: RecordInteractionInput): AIInteraction {
    const raw = this.db.getDatabase();

    // Review Major #4: use lastInsertRowid from .run() instead of reading back
    // ORDER BY id DESC LIMIT 1 — under concurrent writes (WaggleDance multi-agent),
    // the LIMIT 1 row may belong to a different writer.
    const result = raw.prepare(`
      INSERT INTO ai_interactions (
        workspace_id, session_id, model, provider,
        input_tokens, output_tokens, cost_usd,
        tools_called, human_action, risk_context, imported_from, persona,
        input_text, output_text
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.workspaceId ?? null,
      input.sessionId ?? null,
      input.model,
      input.provider,
      input.inputTokens,
      input.outputTokens,
      input.costUsd,
      JSON.stringify(input.toolsCalled ?? []),
      input.humanAction ?? 'none',
      input.riskContext ?? null,
      input.importedFrom ?? null,
      input.persona ?? null,
      input.inputText ?? null,
      input.outputText ?? null,
    );

    const row = raw.prepare('SELECT * FROM ai_interactions WHERE id = ?').get(result.lastInsertRowid) as Record<string, unknown>;
    return this.rowToInteraction(row);
  }

  /** Get interactions for a workspace within a date range. */
  getByWorkspace(workspaceId: string, from?: string, to?: string): AIInteraction[] {
    const raw = this.db.getDatabase();
    let sql = 'SELECT * FROM ai_interactions WHERE workspace_id = ?';
    const params: unknown[] = [workspaceId];

    if (from) { sql += ' AND timestamp >= ?'; params.push(from); }
    if (to) { sql += ' AND timestamp <= ?'; params.push(to); }
    sql += ' ORDER BY timestamp DESC';

    return (raw.prepare(sql).all(...params) as Record<string, unknown>[]).map(r => this.rowToInteraction(r));
  }

  /** Get all interactions within a date range. */
  getByDateRange(from: string, to: string, workspaceId?: string): AIInteraction[] {
    const raw = this.db.getDatabase();
    let sql = 'SELECT * FROM ai_interactions WHERE timestamp >= ? AND timestamp <= ?';
    const params: unknown[] = [from, to];

    if (workspaceId) { sql += ' AND workspace_id = ?'; params.push(workspaceId); }
    sql += ' ORDER BY timestamp DESC';

    return (raw.prepare(sql).all(...params) as Record<string, unknown>[]).map(r => this.rowToInteraction(r));
  }

  /** Get total interaction count. */
  count(workspaceId?: string): number {
    const raw = this.db.getDatabase();
    if (workspaceId) {
      const row = raw.prepare('SELECT COUNT(*) as cnt FROM ai_interactions WHERE workspace_id = ?').get(workspaceId) as { cnt: number };
      return row.cnt;
    }
    const row = raw.prepare('SELECT COUNT(*) as cnt FROM ai_interactions').get() as { cnt: number };
    return row.cnt;
  }

  /** Get the oldest log timestamp (Art. 19 retention check). */
  getOldestTimestamp(): string | null {
    const raw = this.db.getDatabase();
    const row = raw.prepare('SELECT MIN(timestamp) as oldest FROM ai_interactions').get() as { oldest: string | null };
    return row.oldest;
  }

  /**
   * Returns the `first_run_at` timestamp from the MindDB's `meta` table — set on
   * schema initialization and backfilled for pre-existing DBs. Used by the Art. 19
   * retention checker to distinguish 'new system' from 'pruned logs'.
   */
  getFirstRunAt(): string | null {
    return this.db.getFirstRunAt();
  }

  /** Get model inventory (aggregated usage per model). */
  getModelInventory(from?: string, to?: string, workspaceId?: string): ModelInventoryEntry[] {
    const raw = this.db.getDatabase();
    let sql = `
      SELECT model, provider,
        COUNT(*) as calls,
        SUM(input_tokens) as input_tokens,
        SUM(output_tokens) as output_tokens,
        SUM(cost_usd) as cost_usd
      FROM ai_interactions WHERE 1=1
    `;
    const params: unknown[] = [];

    if (from) { sql += ' AND timestamp >= ?'; params.push(from); }
    if (to) { sql += ' AND timestamp <= ?'; params.push(to); }
    if (workspaceId) { sql += ' AND workspace_id = ?'; params.push(workspaceId); }
    sql += ' GROUP BY model, provider ORDER BY calls DESC';

    return (raw.prepare(sql).all(...params) as Record<string, unknown>[]).map(r => ({
      model: r.model as string,
      provider: r.provider as string,
      calls: r.calls as number,
      inputTokens: r.input_tokens as number,
      outputTokens: r.output_tokens as number,
      costUsd: r.cost_usd as number,
    }));
  }

  /** Get human oversight actions (Art. 14). */
  getOversightLog(from?: string, to?: string, workspaceId?: string): OversightLogEntry[] {
    const raw = this.db.getDatabase();
    let sql = "SELECT * FROM ai_interactions WHERE human_action != 'none' AND human_action IS NOT NULL";
    const params: unknown[] = [];

    if (from) { sql += ' AND timestamp >= ?'; params.push(from); }
    if (to) { sql += ' AND timestamp <= ?'; params.push(to); }
    if (workspaceId) { sql += ' AND workspace_id = ?'; params.push(workspaceId); }
    sql += ' ORDER BY timestamp DESC';

    return (raw.prepare(sql).all(...params) as Record<string, unknown>[]).map(r => ({
      timestamp: r.timestamp as string,
      action: r.human_action as HumanAction,
      tool: (JSON.parse(r.tools_called as string) as string[])[0] ?? 'unknown',
      detail: r.persona ? `Persona: ${r.persona}` : '',
    }));
  }

  /** Get human oversight counts for compliance check. */
  getOversightCounts(workspaceId?: string): { total: number; approved: number; denied: number; modified: number } {
    const raw = this.db.getDatabase();
    let sql = "SELECT human_action, COUNT(*) as cnt FROM ai_interactions WHERE human_action != 'none' AND human_action IS NOT NULL";
    const params: unknown[] = [];
    if (workspaceId) { sql += ' AND workspace_id = ?'; params.push(workspaceId); }
    sql += ' GROUP BY human_action';

    const rows = raw.prepare(sql).all(...params) as { human_action: string; cnt: number }[];
    const counts = { total: 0, approved: 0, denied: 0, modified: 0 };
    for (const row of rows) {
      counts.total += row.cnt;
      if (row.human_action === 'approved') counts.approved = row.cnt;
      if (row.human_action === 'denied') counts.denied = row.cnt;
      if (row.human_action === 'modified') counts.modified = row.cnt;
    }
    return counts;
  }

  /** Get recent interactions. */
  getRecent(limit: number = 20): AIInteraction[] {
    const raw = this.db.getDatabase();
    return (raw.prepare('SELECT * FROM ai_interactions ORDER BY id DESC LIMIT ?').all(limit) as Record<string, unknown>[])
      .map(r => this.rowToInteraction(r));
  }

  private rowToInteraction(row: Record<string, unknown>): AIInteraction {
    return {
      id: row.id as number,
      timestamp: row.timestamp as string,
      workspaceId: row.workspace_id as string | null,
      sessionId: row.session_id as string | null,
      model: row.model as string,
      provider: row.provider as string,
      inputTokens: row.input_tokens as number,
      outputTokens: row.output_tokens as number,
      costUsd: row.cost_usd as number,
      toolsCalled: JSON.parse(row.tools_called as string) as string[],
      humanAction: (row.human_action as HumanAction) ?? 'none',
      riskContext: row.risk_context as string | null,
      importedFrom: row.imported_from as string | null,
      persona: row.persona as string | null,
      inputText: (row.input_text as string | null | undefined) ?? null,
      outputText: (row.output_text as string | null | undefined) ?? null,
    };
  }
}
