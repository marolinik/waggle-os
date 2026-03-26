import type { MindDB } from './db.js';

export type SignalCategory = 'capability_gap' | 'correction' | 'workflow_pattern';

export interface ImprovementSignal {
  id: number;
  category: SignalCategory;
  pattern_key: string;
  detail: string;
  count: number;
  first_seen: string;
  last_seen: string;
  surfaced: number; // 0 or 1
  surfaced_at: string | null;
  metadata: string; // JSON
}

export interface ActionableSignal extends ImprovementSignal {
  parsedMetadata: Record<string, unknown>;
}

export interface ActionableThresholds {
  capability_gap?: number;
  correction?: number;
  workflow_pattern?: number;
}

const DEFAULT_THRESHOLDS: Required<ActionableThresholds> = {
  capability_gap: 2,
  correction: 3,
  workflow_pattern: 3,
};

const MAX_ACTIONABLE = 3;

export class ImprovementSignalStore {
  private db: MindDB;

  constructor(db: MindDB) {
    this.db = db;
    this.ensureTable();
  }

  /** Ensure improvement_signals table exists for databases created before this feature */
  private ensureTable(): void {
    const raw = this.db.getDatabase();
    const exists = raw.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='improvement_signals'",
    ).get();
    if (!exists) {
      raw.exec(`
        CREATE TABLE IF NOT EXISTS improvement_signals (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          category TEXT NOT NULL CHECK (category IN ('capability_gap', 'correction', 'workflow_pattern')),
          pattern_key TEXT NOT NULL,
          detail TEXT NOT NULL DEFAULT '',
          count INTEGER NOT NULL DEFAULT 1,
          first_seen TEXT NOT NULL DEFAULT (datetime('now')),
          last_seen TEXT NOT NULL DEFAULT (datetime('now')),
          surfaced INTEGER NOT NULL DEFAULT 0,
          surfaced_at TEXT,
          metadata TEXT NOT NULL DEFAULT '{}'
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_signals_category_key ON improvement_signals (category, pattern_key);
        CREATE INDEX IF NOT EXISTS idx_signals_category ON improvement_signals (category, count DESC);
      `);
    }
  }

  /**
   * Record an improvement signal. Upserts: increments count + updates last_seen
   * if a signal with the same (category, pattern_key) already exists.
   */
  record(
    category: SignalCategory,
    patternKey: string,
    detail?: string,
    metadata?: Record<string, unknown>,
  ): ImprovementSignal {
    const raw = this.db.getDatabase();
    const metadataJson = metadata ? JSON.stringify(metadata) : '{}';

    raw.prepare(`
      INSERT INTO improvement_signals (category, pattern_key, detail, metadata)
      VALUES (?, ?, ?, ?)
      ON CONFLICT (category, pattern_key) DO UPDATE SET
        count = count + 1,
        last_seen = datetime('now'),
        detail = CASE WHEN excluded.detail != '' THEN excluded.detail ELSE detail END,
        metadata = CASE WHEN excluded.metadata != '{}' THEN excluded.metadata ELSE metadata END
    `).run(category, patternKey, detail ?? '', metadataJson);

    return raw.prepare(
      'SELECT * FROM improvement_signals WHERE category = ? AND pattern_key = ?',
    ).get(category, patternKey) as ImprovementSignal;
  }

  /** Get all signals for a category, ordered by count descending. */
  getByCategory(category: SignalCategory): ImprovementSignal[] {
    return this.db.getDatabase().prepare(
      'SELECT * FROM improvement_signals WHERE category = ? ORDER BY count DESC',
    ).all(category) as ImprovementSignal[];
  }

  /**
   * Get actionable signals: count >= threshold AND not yet surfaced.
   * Returns at most MAX_ACTIONABLE (3) signals, highest count first.
   * Per correction #6: threshold-based, capped, non-repeating once surfaced.
   */
  getActionable(thresholds?: ActionableThresholds): ActionableSignal[] {
    const merged = { ...DEFAULT_THRESHOLDS, ...thresholds };
    const raw = this.db.getDatabase();

    // Build a union query across categories with their respective thresholds
    const results: ImprovementSignal[] = [];

    for (const [category, threshold] of Object.entries(merged)) {
      const rows = raw.prepare(`
        SELECT * FROM improvement_signals
        WHERE category = ? AND count >= ? AND surfaced = 0
        ORDER BY count DESC
      `).all(category, threshold) as ImprovementSignal[];
      results.push(...rows);
    }

    // Sort by count descending, cap at MAX_ACTIONABLE
    results.sort((a, b) => b.count - a.count);

    return results.slice(0, MAX_ACTIONABLE).map(signal => ({
      ...signal,
      parsedMetadata: parseMetadata(signal.metadata),
    }));
  }

  /** Mark a signal as surfaced so it won't be returned by getActionable again. */
  markSurfaced(id: number): void {
    this.db.getDatabase().prepare(
      "UPDATE improvement_signals SET surfaced = 1, surfaced_at = datetime('now') WHERE id = ?",
    ).run(id);
  }

  /** Get a single signal by id. */
  get(id: number): ImprovementSignal | undefined {
    return this.db.getDatabase().prepare(
      'SELECT * FROM improvement_signals WHERE id = ?',
    ).get(id) as ImprovementSignal | undefined;
  }

  /** Get a signal by its category + pattern_key pair. */
  getByKey(category: SignalCategory, patternKey: string): ImprovementSignal | undefined {
    return this.db.getDatabase().prepare(
      'SELECT * FROM improvement_signals WHERE category = ? AND pattern_key = ?',
    ).get(category, patternKey) as ImprovementSignal | undefined;
  }

  /** Clear all signals (for testing). */
  clear(): void {
    this.db.getDatabase().prepare('DELETE FROM improvement_signals').run();
  }
}

function parseMetadata(json: string): Record<string, unknown> {
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}
