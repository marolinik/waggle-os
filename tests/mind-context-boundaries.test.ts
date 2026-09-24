/**
 * Bounded-context guard for the Mind schema (Phase 8, domain-driven-design).
 *
 * One `MindDB` owns 18 tables. That is defensible as a PERSISTENCE boundary —
 * a desktop app wants one portable, atomically-backed-up SQLite file — but it
 * has quietly become the MODEL boundary too, and those are not the same thing.
 * Five bounded contexts share the schema, and nothing in the code says so.
 *
 * The proof that the split is real, not theoretical: `CLAUDE.md` §7.5 excludes
 * `evolution_runs`, `execution_traces`, `improvement_signals` and the
 * `install_audit` DDL from the public OSS mirror. The mirror therefore already
 * ships a DIFFERENT SUBSET of this schema — a context boundary discovered by
 * necessity and never drawn as one. This test draws it.
 *
 * It is a manifest, not a refactor. Splitting an 18-table schema is a
 * multi-session arc that would break the OSS forward-port, and Evans is explicit
 * that premature extraction is the bigger risk. What this buys instead is that
 * a NEW table cannot appear without someone deciding which context owns it, and
 * that the OSS exclusion list stops being prose that can silently drift from the
 * schema it describes.
 *
 * Deliberately placed in the root suite rather than in
 * `packages/hive-mind-core`: naming the Waggle-only governance tables inside the
 * mirrored package would add one more thing the curated forward-port has to
 * strip (see CLAUDE.md §7.5).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'packages',
  'hive-mind-core',
  'src',
  'mind',
  'schema.ts',
);

/** The governance context's own DDL, extracted from the Mind schema (D-1). */
const GOVERNANCE_SCHEMA = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'packages',
  'core',
  'src',
  'governance',
  'schema.ts',
);

/**
 * The contexts sharing one Mind schema, and the tables each owns.
 *
 * `memory` is the Core Domain — the moat, per the strategy documents. The rest
 * are supporting, and `governance` is the one that is Waggle-proprietary.
 */
const CONTEXT_TABLES: Record<string, readonly string[]> = {
  /** Core Domain: the frame substrate itself. */
  memory: [
    'memory_frames',
    'memory_frame_chunks',
    'sessions',
    'raw_archive',
    'procedures',
    'meta',
    // Derived infrastructure rather than domain data, assigned here beside
    // `meta` for the same reason. Worth being honest about: `row_counts` holds
    // a row for `knowledge_entities` too, so it is the one table whose CONTENT
    // spans two contexts. It is a count, not a model of anything, so it does
    // not move the boundary — but a reader comparing this map to the schema
    // should see the exception named rather than discover it.
    'row_counts',
  ],
  /** Entities and relations distilled FROM memory; a different model of it. */
  knowledge: ['knowledge_entities', 'knowledge_relations', 'kg_entity_frames'],
  /** Who the user is and what they are currently doing. */
  presence: ['identity', 'awareness'],
  /** Ingestion of foreign corpora, and the GDPR erasure that survives re-import. */
  harvest: ['harvest_sources', 'erased_subjects'],
  /** Self-improvement telemetry. OSS-excluded — see CLAUDE.md §7.5. */
  evolution: ['evolution_runs', 'execution_traces', 'improvement_signals'],
  /** Capability-install trust trail / EU-AI-Act. OSS-excluded, Waggle-only. */
  governance: ['install_audit', 'ai_interactions'],
};

/** Contexts whose tables must NOT reach the public OSS mirror (CLAUDE.md §7.5). */
const OSS_EXCLUDED_CONTEXTS = ['evolution', 'governance'] as const;

function tablesDeclaredIn(file: string): string[] {
  const source = fs.readFileSync(file, 'utf8');
  return [...source.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z_]+)/g)]
    .map(match => match[1])
    .sort();
}

/** Every table a Waggle personal.mind carries: the Mind schema plus governance. */
function declaredTables(): string[] {
  return [...tablesDeclaredIn(SCHEMA), ...tablesDeclaredIn(GOVERNANCE_SCHEMA)].sort();
}

function assignedTables(): string[] {
  return Object.values(CONTEXT_TABLES).flat().slice().sort();
}

describe('Mind schema bounded contexts', () => {
  it('assigns every table in the schema to exactly one context', () => {
    // The point of the guard: a new table cannot be added without someone
    // deciding which model owns it. An unassigned table shows up here as a
    // difference, named, rather than as a silent widening of the aggregate.
    expect(declaredTables()).toEqual(assignedTables());
  });

  it('never assigns one table to two contexts', () => {
    const all = Object.values(CONTEXT_TABLES).flat();
    expect(all.length).toBe(new Set(all).size);
  });

  it('keeps the OSS exclusion list in step with the schema', () => {
    // CLAUDE.md §7.5 names these as must-not-export. Today that is prose, and
    // prose drifts from the schema it describes. This pins the correspondence:
    // if one of them is renamed or dropped, the sync policy has to be revisited
    // rather than quietly becoming wrong.
    const excluded = OSS_EXCLUDED_CONTEXTS.flatMap(context => CONTEXT_TABLES[context]);
    const declared = declaredTables();
    for (const table of excluded) {
      expect(declared).toContain(table);
    }
    expect(excluded.sort()).toEqual([
      'ai_interactions',
      'evolution_runs',
      'execution_traces',
      'improvement_signals',
      'install_audit',
    ]);
  });

  it('declares the governance tables in core/src/governance, never in the Mind schema (D-1)', () => {
    // Extracting the context turned the curated forward-port's interleaved
    // hand-strip of the install_audit DDL into a file boundary: the mirrored
    // schema.ts must never declare a governance table again.
    expect(tablesDeclaredIn(GOVERNANCE_SCHEMA)).toEqual([...CONTEXT_TABLES.governance].sort());
    for (const table of CONTEXT_TABLES.governance) {
      expect(tablesDeclaredIn(SCHEMA)).not.toContain(table);
    }
  });

  it('keeps the Core Domain the largest single context', () => {
    // Not a rule of nature — a check on attention. If another context outgrows
    // memory, either the model drifted or the Core Domain moved, and both are
    // worth a conversation rather than a surprise.
    const sizes = Object.entries(CONTEXT_TABLES)
      .map(([context, tables]) => [context, tables.length] as const)
      .sort((a, b) => b[1] - a[1]);
    expect(sizes[0][0]).toBe('memory');
  });
});
