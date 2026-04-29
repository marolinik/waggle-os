import type { MindDB } from './db.js';

/**
 * Evolution Runs — persistent audit of every evolution proposal.
 *
 * One row per ComposeEvolution execution. A run starts life as `proposed`
 * when the orchestrator finishes building it; the user then `accept`s or
 * `reject`s it from the UI. Accepted runs that successfully deploy move
 * to `deployed`; failed deploys move to `failed`.
 *
 * Every run stores:
 *   - baseline and winner text (prompts, specs, skill bodies)
 *   - winner schema when the evolution included a schema stage (JSON blob)
 *   - accuracy delta and gate verdict
 *   - rejection reason if rejected
 *   - timestamps for created, decided, deployed
 *
 * This is the source of truth for the Memory app → Evolution tab history
 * view, and the regression audit when a deployed change causes a user-
 * visible problem.
 */

export type EvolutionRunStatus =
  | 'proposed'
  | 'accepted'
  | 'rejected'
  | 'deployed'
  | 'failed';

export type EvolutionRunTarget =
  | 'persona-system-prompt'
  | 'behavioral-spec-section'
  | 'tool-description'
  | 'skill-body'
  | 'generic';

export interface EvolutionRun {
  id: number;
  run_uuid: string;
  target_kind: EvolutionRunTarget;
  /** User-visible name of what was evolved (e.g. persona id, spec section) */
  target_name: string | null;
  baseline_text: string;
  winner_text: string;
  /** JSON-encoded Schema when evolution included structure, else null */
  winner_schema_json: string | null;
  delta_accuracy: number;
  gate_verdict: 'pass' | 'fail';
  /** JSON array of {gate, verdict, reason} objects */
  gate_reasons_json: string;
  status: EvolutionRunStatus;
  /** Optional JSON blob with per-gen history, scores, Pareto front, etc */
  artifacts_json: string | null;
  user_note: string | null;
  failure_reason: string | null;
  created_at: string;
  decided_at: string | null;
  deployed_at: string | null;
}

export interface CreateEvolutionRunInput {
  runUuid?: string;
  targetKind: EvolutionRunTarget;
  targetName?: string | null;
  baselineText: string;
  winnerText: string;
  winnerSchema?: unknown;
  deltaAccuracy: number;
  gateVerdict: 'pass' | 'fail';
  gateReasons: Array<{ gate: string; verdict: 'pass' | 'fail'; reason: string }>;
  artifacts?: unknown;
}

export interface EvolutionRunFilter {
  status?: EvolutionRunStatus | EvolutionRunStatus[];
  targetKind?: EvolutionRunTarget;
  targetName?: string;
  since?: string;
  limit?: number;
}

const DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS evolution_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_uuid TEXT NOT NULL UNIQUE,
    target_kind TEXT NOT NULL,
    target_name TEXT,
    baseline_text TEXT NOT NULL,
    winner_text TEXT NOT NULL,
    winner_schema_json TEXT,
    delta_accuracy REAL NOT NULL DEFAULT 0,
    gate_verdict TEXT NOT NULL DEFAULT 'pass'
      CHECK (gate_verdict IN ('pass', 'fail')),
    gate_reasons_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'proposed'
      CHECK (status IN ('proposed', 'accepted', 'rejected', 'deployed', 'failed')),
    artifacts_json TEXT,
    user_note TEXT,
    failure_reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    decided_at TEXT,
    deployed_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_evo_runs_status ON evolution_runs (status, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_evo_runs_target ON evolution_runs (target_kind, target_name, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_evo_runs_created ON evolution_runs (created_at DESC)`,
];

export const EVOLUTION_RUNS_TABLE_SQL = DDL.join(';\n') + ';';

export class EvolutionRunStore {
  private db: MindDB;

  constructor(db: MindDB) {
    this.db = db;
    this.ensureTable();
  }

  private ensureTable(): void {
    try {
      const raw = this.db.getDatabase();
      const exists = raw.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='evolution_runs'",
      ).get();
      if (exists) return;
      for (const stmt of DDL) {
        raw.prepare(stmt).run();
      }
    } catch {
      // DB may be closed during teardown — safe to skip.
    }
  }

  /** Insert a new proposed run. Generates a UUID if the caller omits one. */
  create(input: CreateEvolutionRunInput): EvolutionRun {
    const uuid = input.runUuid ?? generateUuid();
    const raw = this.db.getDatabase();

    raw.prepare(`
      INSERT INTO evolution_runs (
        run_uuid, target_kind, target_name,
        baseline_text, winner_text, winner_schema_json,
        delta_accuracy, gate_verdict, gate_reasons_json,
        status, artifacts_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'proposed', ?)
    `).run(
      uuid,
      input.targetKind,
      input.targetName ?? null,
      input.baselineText,
      input.winnerText,
      input.winnerSchema !== undefined ? JSON.stringify(input.winnerSchema) : null,
      input.deltaAccuracy,
      input.gateVerdict,
      JSON.stringify(input.gateReasons ?? []),
      input.artifacts !== undefined ? JSON.stringify(input.artifacts) : null,
    );

    const row = raw.prepare(
      'SELECT * FROM evolution_runs WHERE run_uuid = ?',
    ).get(uuid) as EvolutionRun;
    return row;
  }

  /** Mark a proposed run as accepted. */
  accept(uuid: string, userNote?: string): EvolutionRun | undefined {
    const raw = this.db.getDatabase();
    raw.prepare(`
      UPDATE evolution_runs
      SET status = 'accepted',
          user_note = COALESCE(?, user_note),
          decided_at = datetime('now')
      WHERE run_uuid = ? AND status = 'proposed'
    `).run(userNote ?? null, uuid);
    return this.getByUuid(uuid);
  }

  /** Mark a proposed run as rejected with an optional reason. */
  reject(uuid: string, reason?: string): EvolutionRun | undefined {
    const raw = this.db.getDatabase();
    raw.prepare(`
      UPDATE evolution_runs
      SET status = 'rejected',
          user_note = COALESCE(?, user_note),
          decided_at = datetime('now')
      WHERE run_uuid = ? AND status = 'proposed'
    `).run(reason ?? null, uuid);
    return this.getByUuid(uuid);
  }

  /** Mark an accepted run as successfully deployed. */
  markDeployed(uuid: string): EvolutionRun | undefined {
    const raw = this.db.getDatabase();
    raw.prepare(`
      UPDATE evolution_runs
      SET status = 'deployed',
          deployed_at = datetime('now')
      WHERE run_uuid = ? AND status = 'accepted'
    `).run(uuid);
    return this.getByUuid(uuid);
  }

  /** Mark an accepted run as failed to deploy with the given reason. */
  markFailed(uuid: string, reason: string): EvolutionRun | undefined {
    const raw = this.db.getDatabase();
    raw.prepare(`
      UPDATE evolution_runs
      SET status = 'failed',
          failure_reason = ?,
          deployed_at = datetime('now')
      WHERE run_uuid = ? AND status = 'accepted'
    `).run(reason, uuid);
    return this.getByUuid(uuid);
  }

  getByUuid(uuid: string): EvolutionRun | undefined {
    return this.db.getDatabase()
      .prepare('SELECT * FROM evolution_runs WHERE run_uuid = ?')
      .get(uuid) as EvolutionRun | undefined;
  }

  get(id: number): EvolutionRun | undefined {
    return this.db.getDatabase()
      .prepare('SELECT * FROM evolution_runs WHERE id = ?')
      .get(id) as EvolutionRun | undefined;
  }

  list(filter: EvolutionRunFilter = {}): EvolutionRun[] {
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (filter.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      clauses.push(`status IN (${statuses.map(() => '?').join(',')})`);
      params.push(...statuses);
    }
    if (filter.targetKind) {
      clauses.push('target_kind = ?');
      params.push(filter.targetKind);
    }
    if (filter.targetName) {
      clauses.push('target_name = ?');
      params.push(filter.targetName);
    }
    if (filter.since) {
      clauses.push('created_at >= ?');
      params.push(filter.since);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const limit = filter.limit ?? 50;

    return this.db.getDatabase().prepare(
      `SELECT * FROM evolution_runs ${where} ORDER BY created_at DESC, id DESC LIMIT ?`,
    ).all(...params, limit) as EvolutionRun[];
  }

  /** Aggregate counts per status for stats/UI. */
  statusCounts(
    filter: Omit<EvolutionRunFilter, 'status' | 'limit'> = {},
  ): Record<EvolutionRunStatus, number> {
    const counts: Record<EvolutionRunStatus, number> = {
      proposed: 0, accepted: 0, rejected: 0, deployed: 0, failed: 0,
    };
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filter.targetKind) { clauses.push('target_kind = ?'); params.push(filter.targetKind); }
    if (filter.targetName) { clauses.push('target_name = ?'); params.push(filter.targetName); }
    if (filter.since) { clauses.push('created_at >= ?'); params.push(filter.since); }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

    const rows = this.db.getDatabase().prepare(
      `SELECT status, COUNT(*) as cnt FROM evolution_runs ${where} GROUP BY status`,
    ).all(...params) as Array<{ status: EvolutionRunStatus; cnt: number }>;

    for (const row of rows) {
      counts[row.status] = row.cnt;
    }
    return counts;
  }

  /** Delete a run by uuid (testing / cleanup). */
  delete(uuid: string): void {
    this.db.getDatabase()
      .prepare('DELETE FROM evolution_runs WHERE run_uuid = ?')
      .run(uuid);
  }

  /** Delete all runs (tests only). */
  clear(): void {
    this.db.getDatabase().prepare('DELETE FROM evolution_runs').run();
  }
}

/** Minimal UUID v4-ish generator — enough to uniquely tag rows, no crypto needed. */
function generateUuid(): string {
  const rand = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `${rand()}${rand()}-${rand()}-4${rand().slice(1)}-${rand()}-${rand()}${rand()}${rand()}`;
}
