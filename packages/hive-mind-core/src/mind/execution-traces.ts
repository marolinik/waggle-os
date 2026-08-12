import type { MindDB } from './db.js';

/**
 * Execution Traces — persistent log of what agents actually did.
 *
 * The foundation for eval dataset construction (Phase 1.2) and
 * fitness scoring in the evolution loop (Phase 2+).
 *
 * One trace row per "unit of agent work" — typically a single user turn,
 * a single workflow phase, or a single subagent run. Tool calls, reasoning,
 * and the final output are packed into `trace_json`.
 *
 * Outcome labels:
 * - `success`    — user accepted the result, no correction follow-up
 * - `corrected`  — user corrected/refined the output (weak negative signal)
 * - `abandoned`  — user left the thread / switched contexts (ambiguous)
 * - `verified`  — passed a verifier gate or harness checkpoint
 */

export type TraceOutcome = 'success' | 'corrected' | 'abandoned' | 'verified' | 'pending';

/** A single tool call captured during execution. */
export interface TraceToolCall {
  /** Tool name */
  tool: string;
  /** Arguments passed to the tool (already scrubbed of secrets by caller) */
  args: Record<string, unknown>;
  /** Result as a string (may be truncated) */
  result: string;
  /** Whether the tool call succeeded */
  ok: boolean;
  /** Duration in milliseconds */
  durationMs: number;
  /** ISO timestamp */
  timestamp: string;
}

/** Reasoning step — free-form agent thought recorded before/between tool calls. */
export interface TraceReasoningStep {
  content: string;
  timestamp: string;
}

/**
 * The structured payload stored in trace_json.
 * Kept separate so callers can evolve the shape without schema migrations.
 */
export interface TracePayload {
  /** Original user instruction (may be truncated) */
  input: string;
  /** Final agent output */
  output: string;
  /** Reasoning steps interleaved with tool calls */
  reasoning: TraceReasoningStep[];
  /** Tool calls in order */
  toolCalls: TraceToolCall[];
  /** Files created or modified */
  artifacts: string[];
  /** Tokens consumed */
  tokens: { input: number; output: number };
  /** Optional workflow harness context */
  harness?: {
    harnessId: string;
    phaseId: string;
    phaseName: string;
    gateResults?: Array<{ name: string; passed: boolean; reason: string }>;
  };
  /** Free-form correction text if outcome === 'corrected' */
  correctionFeedback?: string;
  /** Arbitrary tags for later filtering in eval-dataset */
  tags?: string[];
}

/** Row shape returned by queries. */
export interface ExecutionTrace {
  id: number;
  session_id: string | null;
  persona_id: string | null;
  workspace_id: string | null;
  model: string | null;
  task_shape: string | null;
  outcome: TraceOutcome;
  trace_json: string;
  cost_usd: number;
  duration_ms: number;
  created_at: string;
  finalized_at: string | null;
}

/** With the trace_json pre-parsed. */
export interface ParsedExecutionTrace extends Omit<ExecutionTrace, 'trace_json'> {
  payload: TracePayload;
}

/** Input to start a new trace. */
export interface StartTraceInput {
  sessionId?: string | null;
  personaId?: string | null;
  workspaceId?: string | null;
  model?: string | null;
  taskShape?: string | null;
  /** Initial user input captured immediately. */
  input: string;
  /** Optional tags for later filtering. */
  tags?: string[];
}

/** Input to finalize a trace (update outcome + payload). */
export interface FinalizeTraceInput {
  outcome: TraceOutcome;
  output: string;
  model?: string | null;
  reasoning?: TraceReasoningStep[];
  toolCalls?: TraceToolCall[];
  artifacts?: string[];
  tokens?: { input: number; output: number };
  costUsd?: number;
  harness?: TracePayload['harness'];
  correctionFeedback?: string;
  tags?: string[];
}

/** Filter for queries. */
export interface TraceQueryFilter {
  sessionId?: string;
  personaId?: string;
  workspaceId?: string;
  outcome?: TraceOutcome | TraceOutcome[];
  taskShape?: string;
  /** Lower bound (inclusive) on created_at — ISO string */
  since?: string;
  /** Substring pre-filter on trace_json (SQL LIKE), e.g. `"agent:` to scope
   *  the LIMIT to tagged traces instead of the global recency window. LIKE
   *  wildcards (%/_) in the value are NOT escaped — callers needing an exact
   *  match must still filter the parsed payload (tags array) in JS. */
  tagLike?: string;
  /** Max rows to return (default 100) */
  limit?: number;
}

/** DDL split into single statements to stay compatible with prepare().run(). */
const EXECUTION_TRACES_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS execution_traces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    persona_id TEXT,
    workspace_id TEXT,
    model TEXT,
    task_shape TEXT,
    outcome TEXT NOT NULL DEFAULT 'pending'
      CHECK (outcome IN ('success', 'corrected', 'abandoned', 'verified', 'pending')),
    trace_json TEXT NOT NULL DEFAULT '{}',
    cost_usd REAL NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    finalized_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_traces_session ON execution_traces (session_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_traces_persona ON execution_traces (persona_id, outcome)`,
  `CREATE INDEX IF NOT EXISTS idx_traces_outcome ON execution_traces (outcome, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_traces_workspace ON execution_traces (workspace_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS execution_trace_spend (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trace_id INTEGER NOT NULL REFERENCES execution_traces(id) ON DELETE CASCADE,
    cost_usd REAL NOT NULL CHECK (cost_usd > 0),
    settled_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_trace_spend_settled ON execution_trace_spend (settled_at, trace_id)`,
  `CREATE TABLE IF NOT EXISTS execution_trace_spend_reservations (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     trace_id INTEGER NOT NULL REFERENCES execution_traces(id) ON DELETE CASCADE,
     estimated_cost_usd REAL NOT NULL CHECK (estimated_cost_usd > 0),
     actual_cost_usd REAL CHECK (actual_cost_usd IS NULL OR actual_cost_usd >= 0),
     state TEXT NOT NULL DEFAULT 'pending'
       CHECK (state IN ('pending', 'settled', 'released')),
     reserved_at TEXT NOT NULL,
     resolved_at TEXT,
     CHECK (
       (state = 'pending' AND actual_cost_usd IS NULL AND resolved_at IS NULL) OR
       (state = 'settled' AND actual_cost_usd IS NOT NULL AND resolved_at IS NOT NULL) OR
       (state = 'released' AND actual_cost_usd IS NULL AND resolved_at IS NOT NULL)
     )
   )`,
  `CREATE INDEX IF NOT EXISTS idx_trace_spend_reservations_time
     ON execution_trace_spend_reservations (reserved_at, trace_id, state)`,
];

/** Exported DDL concatenated — kept for anyone who needs the full table SQL. */
export const EXECUTION_TRACES_TABLE_SQL = EXECUTION_TRACES_DDL.join(';\n') + ';';

export class ExecutionTraceStore {
  private db: MindDB;

  constructor(db: MindDB) {
    this.db = db;
    this.ensureTable();
  }

  /** Ensure execution_traces table exists for databases created before this feature. */
  private ensureTable(): void {
    try {
      const raw = this.db.getDatabase();
      for (const stmt of EXECUTION_TRACES_DDL) {
        raw.prepare(stmt).run();
      }
    } catch {
      // DB may be closed during teardown — safe to skip.
    }
  }

  /** Start a new trace in `pending` outcome. Returns row id. */
  start(input: StartTraceInput): number {
    const raw = this.db.getDatabase();
    const payload: TracePayload = {
      input: input.input,
      output: '',
      reasoning: [],
      toolCalls: [],
      artifacts: [],
      tokens: { input: 0, output: 0 },
      tags: input.tags ?? [],
    };

    const result = raw.prepare(`
      INSERT INTO execution_traces
        (session_id, persona_id, workspace_id, model, task_shape, outcome, trace_json)
      VALUES (?, ?, ?, ?, ?, 'pending', ?)
    `).run(
      input.sessionId ?? null,
      input.personaId ?? null,
      input.workspaceId ?? null,
      input.model ?? null,
      input.taskShape ?? null,
      JSON.stringify(payload),
    );

    return Number(result.lastInsertRowid);
  }

  /**
   * Append incremental events to a pending trace. Used during long runs
   * to avoid losing progress if the process crashes. Safe to call many times.
   */
  append(
    id: number,
    events: {
      reasoning?: TraceReasoningStep[];
      toolCalls?: TraceToolCall[];
      artifacts?: string[];
    },
  ): void {
    const current = this.get(id);
    if (!current) return;

    const payload = parsePayload(current.trace_json);
    payload.reasoning = [...payload.reasoning, ...(events.reasoning ?? [])];
    payload.toolCalls = [...payload.toolCalls, ...(events.toolCalls ?? [])];
    if (events.artifacts?.length) {
      const seen = new Set(payload.artifacts);
      for (const a of events.artifacts) {
        if (!seen.has(a)) {
          payload.artifacts.push(a);
          seen.add(a);
        }
      }
    }

    this.db.getDatabase()
      .prepare('UPDATE execution_traces SET trace_json = ? WHERE id = ?')
      .run(JSON.stringify(payload), id);
  }

  /** Persist one settled model charge while a long-running trace is pending. */
  recordCost(id: number, costUsd: number, timestamp = new Date().toISOString()): void {
    if (!Number.isFinite(costUsd) || costUsd <= 0) {
      throw new RangeError('Trace cost entry must be a positive finite number');
    }
    const settledMs = Date.parse(timestamp);
    if (!Number.isFinite(settledMs)) {
      throw new RangeError('Trace cost timestamp must be a valid ISO date');
    }
    const settledAt = new Date(settledMs).toISOString();
    const raw = this.db.getDatabase();
    raw.transaction(() => {
      const updated = raw.prepare(`
        UPDATE execution_traces SET cost_usd = cost_usd + ? WHERE id = ?
      `).run(costUsd, id);
      if (updated.changes === 0) return;
      raw.prepare(`
        INSERT INTO execution_trace_spend (trace_id, cost_usd, settled_at)
        VALUES (?, ?, ?)
      `).run(id, costUsd, settledAt);
    })();
  }

  /**
   * Persist a conservative model-spend reservation before provider dispatch.
   * Pending reservations intentionally have no settled-spend row, so restart
   * recovery counts the estimate through the reservation ledger.
   */
  reserveCost(
    id: number,
    estimatedCostUsd: number,
    timestamp = new Date().toISOString(),
  ): number {
    if (!Number.isFinite(estimatedCostUsd) || estimatedCostUsd <= 0) {
      throw new RangeError('Trace cost reservation must be positive and finite');
    }
    const reservedMs = Date.parse(timestamp);
    if (!Number.isFinite(reservedMs)) {
      throw new RangeError('Trace cost reservation timestamp must be valid ISO date');
    }
    const result = this.db.getDatabase().prepare(`
      INSERT INTO execution_trace_spend_reservations
        (trace_id, estimated_cost_usd, state, reserved_at)
      SELECT id, ?, 'pending', ?
      FROM execution_traces
      WHERE id = ? AND outcome = 'pending'
    `).run(estimatedCostUsd, new Date(reservedMs).toISOString(), id);
    if (result.changes !== 1) {
      throw new Error(`Pending execution trace ${id} does not exist`);
    }
    return Number(result.lastInsertRowid);
  }

  /** Replace a pending estimate with one authoritative settled charge. */
  settleReservedCost(
    reservationId: number,
    actualCostUsd: number,
    timestamp = new Date().toISOString(),
  ): boolean {
    if (!Number.isFinite(actualCostUsd) || actualCostUsd < 0) {
      throw new RangeError('Settled trace cost must be non-negative and finite');
    }
    const settledMs = Date.parse(timestamp);
    if (!Number.isFinite(settledMs)) {
      throw new RangeError('Trace cost timestamp must be valid ISO date');
    }
    const settledAt = new Date(settledMs).toISOString();
    const raw = this.db.getDatabase();
    return raw.transaction(() => {
      const current = raw.prepare(`
        SELECT trace_id AS traceId, reserved_at AS reservedAt,
               state, actual_cost_usd AS actualCostUsd
        FROM execution_trace_spend_reservations
        WHERE id = ?
      `).get(reservationId) as {
        traceId: number;
        reservedAt: string;
        state: 'pending' | 'settled' | 'released';
        actualCostUsd: number | null;
      } | undefined;
      if (!current) throw new Error(`Cost reservation ${reservationId} does not exist`);
      if (current.state === 'settled' && current.actualCostUsd === actualCostUsd) return false;
      if (current.state !== 'pending') {
        throw new Error(`Cost reservation ${reservationId} is already ${current.state}`);
      }
      const updated = raw.prepare(`
        UPDATE execution_trace_spend_reservations
        SET state = 'settled', actual_cost_usd = ?, resolved_at = ?
        WHERE id = ? AND state = 'pending'
      `).run(actualCostUsd, settledAt, reservationId);
      if (updated.changes !== 1) return false;
      if (actualCostUsd > 0) {
        raw.prepare(`
          INSERT INTO execution_trace_spend (trace_id, cost_usd, settled_at)
          VALUES (?, ?, ?)
        `).run(current.traceId, actualCostUsd, current.reservedAt);
        raw.prepare(`
          UPDATE execution_traces SET cost_usd = cost_usd + ? WHERE id = ?
        `).run(actualCostUsd, current.traceId);
      }
      return true;
    })();
  }

  /** Release a definitely pre-inference reservation without recording spend. */
  releaseReservedCost(reservationId: number, timestamp = new Date().toISOString()): boolean {
    const resolvedMs = Date.parse(timestamp);
    if (!Number.isFinite(resolvedMs)) {
      throw new RangeError('Trace cost timestamp must be valid ISO date');
    }
    const raw = this.db.getDatabase();
    return raw.transaction(() => {
      const current = raw.prepare(`
        SELECT id, state
        FROM execution_trace_spend_reservations
        WHERE id = ?
      `).get(reservationId) as {
        id: number;
        state: 'pending' | 'settled' | 'released';
      } | undefined;
      if (!current) throw new Error(`Cost reservation ${reservationId} does not exist`);
      if (current.state === 'released') return false;
      if (current.state !== 'pending') {
        throw new Error(`Cost reservation ${reservationId} is already ${current.state}`);
      }
      const result = raw.prepare(`
        UPDATE execution_trace_spend_reservations
        SET state = 'released', actual_cost_usd = NULL, resolved_at = ?
        WHERE id = ? AND state = 'pending'
      `).run(new Date(resolvedMs).toISOString(), reservationId);
      if (result.changes !== 1) return false;
      return true;
    })();
  }

  /** Finalize a trace — set outcome, merge payload, record cost + duration. */
  finalize(id: number, input: FinalizeTraceInput): ExecutionTrace | undefined {
    const current = this.get(id);
    if (!current) return undefined;

    const existing = parsePayload(current.trace_json);
    const merged: TracePayload = {
      ...existing,
      output: input.output,
      reasoning: input.reasoning ?? existing.reasoning,
      toolCalls: input.toolCalls ?? existing.toolCalls,
      artifacts: input.artifacts ?? existing.artifacts,
      tokens: input.tokens ?? existing.tokens,
      harness: input.harness ?? existing.harness,
      correctionFeedback: input.correctionFeedback ?? existing.correctionFeedback,
      tags: input.tags ?? existing.tags,
    };

    const createdMs = Date.parse(current.created_at + 'Z');
    const now = Date.now();
    const durationMs = Number.isFinite(createdMs) ? Math.max(0, now - createdMs) : 0;
    const finalModel = input.model === undefined ? current.model : input.model;

    const raw = this.db.getDatabase();
    raw.transaction(() => {
      const finalCost = Math.max(current.cost_usd, input.costUsd ?? current.cost_usd);
      if (input.costUsd !== undefined && finalCost > 0) {
        const ledger = raw.prepare(`
          SELECT COUNT(*) AS entries, COALESCE(SUM(cost_usd), 0) AS total
          FROM execution_trace_spend WHERE trace_id = ?
        `).get(id) as { entries: number; total: number | null };
        const missingCost = Math.max(0, finalCost - Number(ledger.total ?? 0));
        if (ledger.entries > 0 && missingCost > 0) {
          raw.prepare(`
            INSERT INTO execution_trace_spend (trace_id, cost_usd, settled_at)
            VALUES (?, ?, ?)
          `).run(id, missingCost, new Date().toISOString());
        }
      }
      raw.prepare(`
        UPDATE execution_traces
        SET outcome = ?,
            model = ?,
            trace_json = ?,
            cost_usd = ?,
            duration_ms = ?,
            finalized_at = datetime('now')
        WHERE id = ?
      `).run(
        input.outcome,
        finalModel,
        JSON.stringify(merged),
        finalCost,
        durationMs,
        id,
      );
    })();

    return this.get(id);
  }

  /**
   * Mark an already-finalized trace as corrected after the fact.
   * Used when a correction-detector picks up a user correction in a later turn.
   */
  markCorrected(id: number, feedback: string): void {
    const current = this.get(id);
    if (!current) return;

    const payload = parsePayload(current.trace_json);
    payload.correctionFeedback = feedback;

    this.db.getDatabase().prepare(`
      UPDATE execution_traces
      SET outcome = 'corrected',
          trace_json = ?
      WHERE id = ?
    `).run(JSON.stringify(payload), id);
  }

  get(id: number): ExecutionTrace | undefined {
    return this.db.getDatabase()
      .prepare('SELECT * FROM execution_traces WHERE id = ?')
      .get(id) as ExecutionTrace | undefined;
  }

  getParsed(id: number): ParsedExecutionTrace | undefined {
    const row = this.get(id);
    return row ? toParsed(row) : undefined;
  }

  /** Highest trace id present when a consumer starts its process-local ledger. */
  getLatestId(): number {
    const row = this.db.getDatabase().prepare(
      'SELECT COALESCE(MAX(id), 0) AS id FROM execution_traces',
    ).get() as { id: number | null };
    return Number(row.id ?? 0);
  }

  /** Sum persisted model cost from a timestamp through an inclusive trace-id boundary. */
  getTotalCostSince(since: string, throughId: number = Number.MAX_SAFE_INTEGER): number {
    const settledSince = new Date(since).toISOString();
    const raw = this.db.getDatabase();
    const ledger = raw.prepare(`
      SELECT COALESCE(SUM(s.cost_usd), 0) AS total
      FROM execution_trace_spend s
      JOIN execution_traces t ON t.id = s.trace_id
      WHERE s.settled_at >= ? AND t.id <= ?
    `).get(settledSince, throughId) as { total: number | null };
    const pending = raw.prepare(`
      SELECT COALESCE(SUM(estimated_cost_usd), 0) AS total
      FROM execution_trace_spend_reservations
      WHERE state = 'pending' AND reserved_at >= ? AND trace_id <= ?
    `).get(settledSince, throughId) as { total: number | null };
    const legacy = raw.prepare(`
      SELECT COALESCE(SUM(t.cost_usd), 0) AS total
      FROM execution_traces t
      WHERE t.created_at >= datetime(?) AND t.id <= ?
        AND NOT EXISTS (
          SELECT 1 FROM execution_trace_spend s WHERE s.trace_id = t.id
        )
    `).get(since, throughId) as { total: number | null };
    return Number(ledger.total ?? 0)
      + Number(pending.total ?? 0)
      + Number(legacy.total ?? 0);
  }

  /** Query traces with optional filters. */
  query(filter: TraceQueryFilter = {}): ExecutionTrace[] {
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (filter.sessionId) {
      clauses.push('session_id = ?');
      params.push(filter.sessionId);
    }
    if (filter.personaId) {
      clauses.push('persona_id = ?');
      params.push(filter.personaId);
    }
    if (filter.workspaceId) {
      clauses.push('workspace_id = ?');
      params.push(filter.workspaceId);
    }
    if (filter.taskShape) {
      clauses.push('task_shape = ?');
      params.push(filter.taskShape);
    }
    if (filter.outcome) {
      const outcomes = Array.isArray(filter.outcome) ? filter.outcome : [filter.outcome];
      clauses.push(`outcome IN (${outcomes.map(() => '?').join(',')})`);
      params.push(...outcomes);
    }
    if (filter.since) {
      clauses.push('created_at >= ?');
      params.push(filter.since);
    }
    if (filter.tagLike) {
      clauses.push('trace_json LIKE ?');
      params.push(`%${filter.tagLike}%`);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const limit = filter.limit ?? 100;

    return this.db.getDatabase().prepare(
      `SELECT * FROM execution_traces ${where} ORDER BY created_at DESC, id DESC LIMIT ?`,
    ).all(...params, limit) as ExecutionTrace[];
  }

  /** Parsed variant of query(). */
  queryParsed(filter: TraceQueryFilter = {}): ParsedExecutionTrace[] {
    return this.query(filter).map(toParsed);
  }

  /**
   * Aggregate outcome counts — useful for fitness scoring.
   * Returns: { success, corrected, abandoned, verified, pending }
   */
  outcomeCounts(filter: Omit<TraceQueryFilter, 'outcome' | 'limit'> = {}): Record<TraceOutcome, number> {
    const counts: Record<TraceOutcome, number> = {
      success: 0, corrected: 0, abandoned: 0, verified: 0, pending: 0,
    };

    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filter.sessionId) { clauses.push('session_id = ?'); params.push(filter.sessionId); }
    if (filter.personaId) { clauses.push('persona_id = ?'); params.push(filter.personaId); }
    if (filter.workspaceId) { clauses.push('workspace_id = ?'); params.push(filter.workspaceId); }
    if (filter.taskShape) { clauses.push('task_shape = ?'); params.push(filter.taskShape); }
    if (filter.since) { clauses.push('created_at >= ?'); params.push(filter.since); }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db.getDatabase().prepare(
      `SELECT outcome, COUNT(*) as cnt FROM execution_traces ${where} GROUP BY outcome`,
    ).all(...params) as Array<{ outcome: TraceOutcome; cnt: number }>;

    for (const row of rows) {
      counts[row.outcome] = row.cnt;
    }
    return counts;
  }

  /** Delete a trace by id. */
  delete(id: number): void {
    this.db.getDatabase().prepare('DELETE FROM execution_traces WHERE id = ?').run(id);
  }

  /** Delete all traces (tests only). */
  clear(): void {
    this.db.getDatabase().prepare('DELETE FROM execution_traces').run();
  }

  /** Count of all traces (for stats). */
  count(filter: Omit<TraceQueryFilter, 'limit'> = {}): number {
    const rows = this.query({ ...filter, limit: 1_000_000 });
    return rows.length;
  }
}

function parsePayload(json: string): TracePayload {
  try {
    const parsed = JSON.parse(json) as Partial<TracePayload>;
    return {
      input: parsed.input ?? '',
      output: parsed.output ?? '',
      reasoning: parsed.reasoning ?? [],
      toolCalls: parsed.toolCalls ?? [],
      artifacts: parsed.artifacts ?? [],
      tokens: parsed.tokens ?? { input: 0, output: 0 },
      harness: parsed.harness,
      correctionFeedback: parsed.correctionFeedback,
      tags: parsed.tags ?? [],
    };
  } catch {
    return {
      input: '',
      output: '',
      reasoning: [],
      toolCalls: [],
      artifacts: [],
      tokens: { input: 0, output: 0 },
      tags: [],
    };
  }
}

function toParsed(row: ExecutionTrace): ParsedExecutionTrace {
  const { trace_json, ...rest } = row;
  return { ...rest, payload: parsePayload(trace_json) };
}
