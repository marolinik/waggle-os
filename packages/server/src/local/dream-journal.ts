/**
 * Dream Journal — "what I consolidated last night" (docs/plans/DREAM-DIARY-2026-07-09.md).
 *
 * The nightly memory_consolidation cron branches already do real curation
 * (compaction, harvest sync, index repair, lane extraction) but report it
 * only to log.info. This journal records those runs as structured events —
 * one JSON file per local day under <dataDir>/dreams/ — and composes an
 * honest deterministic summary from the counters. An optional LLM
 * "narrative" polish is layered on top by the /api/dreams route; when the
 * LLM is unavailable the summary stands. The diary NEVER invents work: every
 * sentence traces to a recorded counter.
 *
 * Product layer on purpose — lives in packages/server, not hive-mind-core,
 * so it carries no OSS-mirror port obligation (§7.5).
 */

import fs from 'node:fs';
import path from 'node:path';

export type DreamAction =
  | 'memory_compact'
  | 'harvest_sync'
  | 'index_reconcile'
  | 'memory_lane_extract';

export interface DreamEvent {
  action: DreamAction;
  /** ISO timestamp of the run. */
  at: string;
  /** Raw counters exactly as the cron branch computed them. */
  stats: Record<string, number>;
}

export interface DreamDay {
  /** Local date, YYYY-MM-DD. */
  date: string;
  events: DreamEvent[];
  /** Deterministic sentence(s) composed from aggregated counters. */
  summary: string;
  /** Optional LLM polish — absent until generated; absent forever if LLM is down. */
  narrative?: string;
}

export const QUIET_NIGHT_SUMMARY = 'A quiet night — your memory was already tidy.';

/** Local calendar date (not UTC): "last night" must match the user's clock. */
export function localDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Aggregate one counter across all events of an action. */
function sum(events: DreamEvent[], action: DreamAction, key: string): number {
  return events
    .filter(e => e.action === action)
    .reduce((acc, e) => acc + (e.stats[key] ?? 0), 0);
}

function plural(n: number, noun: string): string {
  if (n === 1) return `1 ${noun}`;
  // consonant+y → ies ("memory" → "memories", "entry" → "entries")
  const plu = /[^aeiou]y$/.test(noun) ? `${noun.slice(0, -1)}ies` : `${noun}s`;
  return `${n} ${plu}`;
}

/**
 * Compose the deterministic summary. Every clause is backed by a non-zero
 * aggregated counter; zero-activity days get the quiet-night line.
 */
export function composeSummary(events: DreamEvent[]): string {
  const clauses: string[] = [];

  const merged = sum(events, 'memory_compact', 'pframesMerged');
  const pruned = sum(events, 'memory_compact', 'temporaryPruned');
  const deprecated = sum(events, 'memory_compact', 'deprecatedPruned');
  if (merged > 0) clauses.push(`merged ${plural(merged, 'related memory fragment')}`);
  if (pruned + deprecated > 0) {
    clauses.push(`cleared ${plural(pruned + deprecated, 'stale memory')}`);
  }

  const imported = sum(events, 'harvest_sync', 'framesSaved');
  const sources = sum(events, 'harvest_sync', 'sourcesScanned');
  if (imported > 0) {
    clauses.push(`imported ${plural(imported, 'new memory')} from ${plural(Math.max(sources, 1), 'source')}`);
  }
  const unverifiable = sum(events, 'harvest_sync', 'couldNotVerify');
  if (unverifiable > 0) {
    clauses.push(`left ${plural(unverifiable, 'item')} out (could not verify against your erasure list)`);
  }

  const facts = sum(events, 'memory_lane_extract', 'factsWritten');
  const laneEvents = sum(events, 'memory_lane_extract', 'eventsWritten');
  const profiles = sum(events, 'memory_lane_extract', 'profilesWritten');
  const distilled = facts + laneEvents + profiles;
  if (distilled > 0) clauses.push(`distilled ${plural(distilled, 'quick-recall note')}`);

  const repaired = sum(events, 'index_reconcile', 'ftsFixed')
    + sum(events, 'index_reconcile', 'vecFixed');
  if (repaired > 0) clauses.push(`repaired ${plural(repaired, 'search-index entry')}`);

  if (clauses.length === 0) return QUIET_NIGHT_SUMMARY;

  const body = clauses.length === 1
    ? clauses[0]
    : `${clauses.slice(0, -1).join(', ')} and ${clauses[clauses.length - 1]}`;
  return `Overnight I ${body}.`;
}

export class DreamJournal {
  private readonly dir: string;

  constructor(dataDir: string) {
    this.dir = path.join(dataDir, 'dreams');
  }

  /** Record one curation run into today's entry and refresh its summary. */
  record(action: DreamAction, stats: Record<string, number>, now: Date = new Date()): DreamDay {
    const date = localDateString(now);
    const day = this.read(date) ?? { date, events: [], summary: QUIET_NIGHT_SUMMARY };
    const events = [...day.events, { action, at: now.toISOString(), stats }];
    const next: DreamDay = {
      ...day,
      events,
      summary: composeSummary(events),
      // Counters changed → any previously generated narrative is stale.
      narrative: undefined,
    };
    this.write(next);
    return next;
  }

  /** Persist an LLM narrative for a day (no-op if the day vanished). */
  setNarrative(date: string, narrative: string): void {
    const day = this.read(date);
    if (!day) return;
    this.write({ ...day, narrative });
  }

  /** Newest-first entries for the last `days` calendar days that have files. */
  list(days: number): DreamDay[] {
    let files: string[];
    try {
      files = fs.readdirSync(this.dir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
    } catch {
      return []; // dir doesn't exist yet — no dreams recorded
    }
    return files
      .map(f => f.slice(0, 10))
      .sort()
      .reverse()
      .slice(0, Math.max(1, days))
      .map(date => this.read(date))
      .filter((d): d is DreamDay => d !== null);
  }

  read(date: string): DreamDay | null {
    try {
      const raw = fs.readFileSync(path.join(this.dir, `${date}.json`), 'utf8');
      const parsed = JSON.parse(raw) as DreamDay;
      if (parsed?.date && Array.isArray(parsed.events)) return parsed;
    } catch {
      /* missing or corrupt file → treated as absent */
    }
    return null;
  }

  private write(day: DreamDay): void {
    fs.mkdirSync(this.dir, { recursive: true });
    const target = path.join(this.dir, `${day.date}.json`);
    const tmp = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(day, null, 2), 'utf8');
    fs.renameSync(tmp, target);
  }
}
