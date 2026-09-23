/**
 * Characterization pins for the governance tables (`install_audit`,
 * `ai_interactions`) before their DDL moves out of the Mind schema (D-1).
 *
 * Every mind is opened the way the server opens `personal.mind`: a `MindDB`
 * plus both governance stores. The pins must hold unchanged on both sides of
 * the move, which is what proves the extraction neither loses nor duplicates a
 * schema object. Crash recovery and the CHECK-widening rebuilds are pinned in
 * `install-audit.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { MindDB } from '@waggle/hive-mind-core';
import { InstallAuditStore } from '../src/install-audit.js';
import { InteractionStore } from '../src/compliance/interaction-store.js';

/** `type:name` of every schema object a server-opened mind carries. */
const SERVER_MIND_SCHEMA_OBJECTS = [
  'index:idx_audit_capability', 'index:idx_audit_timestamp', 'index:idx_chunks_frame',
  'index:idx_entities_name', 'index:idx_entities_type', 'index:idx_erased_subjects_lookup',
  'index:idx_evo_runs_created', 'index:idx_evo_runs_status', 'index:idx_evo_runs_target',
  'index:idx_frames_base', 'index:idx_frames_gop_t', 'index:idx_frames_importance',
  'index:idx_frames_type', 'index:idx_interactions_model', 'index:idx_interactions_timestamp',
  'index:idx_interactions_workspace', 'index:idx_kg_entity_frames_entity',
  'index:idx_kg_entity_frames_frame', 'index:idx_procedures_name_model',
  'index:idx_raw_archive_created', 'index:idx_raw_archive_source_ref',
  'index:idx_relations_source', 'index:idx_relations_target', 'index:idx_sessions_project',
  'index:idx_signals_category', 'index:idx_signals_category_key', 'index:idx_traces_outcome',
  'index:idx_traces_persona', 'index:idx_traces_session', 'index:idx_traces_workspace',
  'table:ai_interactions', 'table:awareness', 'table:erased_subjects', 'table:evolution_runs',
  'table:execution_traces', 'table:harvest_sources', 'table:identity', 'table:improvement_signals',
  'table:install_audit', 'table:kg_entity_frames', 'table:knowledge_entities',
  'table:knowledge_relations', 'table:memory_frame_chunks', 'table:memory_frame_chunks_vec',
  'table:memory_frame_chunks_vec_chunks', 'table:memory_frame_chunks_vec_info',
  'table:memory_frame_chunks_vec_rowids', 'table:memory_frame_chunks_vec_vector_chunks00',
  'table:memory_frames', 'table:memory_frames_fts', 'table:memory_frames_fts_config',
  'table:memory_frames_fts_content', 'table:memory_frames_fts_data',
  'table:memory_frames_fts_docsize', 'table:memory_frames_fts_idx', 'table:memory_frames_vec',
  'table:memory_frames_vec_chunks', 'table:memory_frames_vec_info',
  'table:memory_frames_vec_rowids', 'table:memory_frames_vec_vector_chunks00', 'table:meta',
  'table:procedures', 'table:raw_archive', 'table:row_counts', 'table:sessions',
  'trigger:ai_interactions_no_delete', 'trigger:ai_interactions_no_update',
  'trigger:knowledge_entities_count_delete', 'trigger:knowledge_entities_count_insert',
  'trigger:memory_frames_count_delete', 'trigger:memory_frames_count_insert',
  'trigger:raw_archive_no_delete', 'trigger:raw_archive_no_update',
  'trigger:sessions_count_delete', 'trigger:sessions_count_insert',
];

const GOVERNANCE_OBJECTS = [
  'index:idx_audit_capability', 'index:idx_audit_timestamp', 'index:idx_interactions_model',
  'index:idx_interactions_timestamp', 'index:idx_interactions_workspace',
  'table:ai_interactions', 'table:install_audit',
  'trigger:ai_interactions_no_delete', 'trigger:ai_interactions_no_update',
];

function openLikeServer(dbPath: string): MindDB {
  const db = new MindDB(dbPath);
  new InstallAuditStore(db);
  new InteractionStore(db);
  return db;
}

function schemaObjects(db: MindDB, tables?: string[]): string[] {
  const rows = db.getDatabase().prepare(
    "SELECT type, name, tbl_name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
  ).all() as Array<{ type: string; name: string; tbl_name: string }>;
  return rows
    .filter((r) => !tables || tables.includes(r.tbl_name))
    .map((r) => `${r.type}:${r.name}`);
}

function recordInteraction(db: MindDB): number {
  return new InteractionStore(db).record({
    workspaceId: 'ws-1', sessionId: 'session-1', model: 'model-a', provider: 'provider-a',
    inputTokens: 3, outputTokens: 5, costUsd: 0.01, toolsCalled: ['search_memory'],
    inputText: 'what did I say about Ana?', outputText: 'You said Ana likes tea.',
  }).id;
}

describe('governance schema (characterization)', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-governance-'));
    dbPath = path.join(tmpDir, 'personal.mind');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('gives a fresh mind exactly the golden schema objects', () => {
    const db = openLikeServer(dbPath);
    expect(schemaObjects(db)).toEqual(SERVER_MIND_SCHEMA_OBJECTS);
    db.close();
  });

  it('gives a reopened (migrated) mind the same objects, plus the content-hash index', () => {
    openLikeServer(dbPath).close();
    const db = openLikeServer(dbPath);
    // Only the migration path creates idx_frames_content_hash; a fresh mind
    // lacks it. Unrelated to governance, pinned as it stands.
    expect(schemaObjects(db)).toEqual(
      [...SERVER_MIND_SCHEMA_OBJECTS, 'index:idx_frames_content_hash'].sort(),
    );
    expect(schemaObjects(db, ['install_audit', 'ai_interactions'])).toEqual(GOVERNANCE_OBJECTS);
    db.close();
  });

  it('adds input_text/output_text and the append-only triggers to a pre-2026-04-15 ai_interactions', () => {
    {
      const seed = new MindDB(dbPath);
      const raw = seed.getDatabase();
      raw.exec('DROP TRIGGER IF EXISTS ai_interactions_no_delete');
      raw.exec('DROP TRIGGER IF EXISTS ai_interactions_no_update');
      raw.exec('DROP TABLE IF EXISTS ai_interactions');
      raw.exec(`CREATE TABLE ai_interactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        workspace_id TEXT, session_id TEXT,
        model TEXT NOT NULL, provider TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL NOT NULL DEFAULT 0, tools_called TEXT NOT NULL DEFAULT '[]',
        human_action TEXT CHECK (human_action IN ('approved', 'denied', 'modified', 'none')),
        risk_context TEXT, imported_from TEXT, persona TEXT
      )`);
      raw.prepare("INSERT INTO ai_interactions (workspace_id, model, provider) VALUES ('ws-old', 'm', 'p')").run();
      seed.close();
    }

    const db = openLikeServer(dbPath);
    const raw = db.getDatabase();
    const columns = (raw.prepare("SELECT name FROM pragma_table_info('ai_interactions')").all() as Array<{ name: string }>)
      .map((c) => c.name);
    expect(columns).toEqual(expect.arrayContaining(['input_text', 'output_text']));
    expect(raw.prepare("SELECT workspace_id FROM ai_interactions").all()).toEqual([{ workspace_id: 'ws-old' }]);
    expect(schemaObjects(db, ['ai_interactions'])).toEqual(expect.arrayContaining([
      'trigger:ai_interactions_no_delete', 'trigger:ai_interactions_no_update',
    ]));
    db.close();
  });

  it('refuses any UPDATE of an ai_interactions row', () => {
    const db = openLikeServer(dbPath);
    const id = recordInteraction(db);
    expect(() => db.getDatabase().prepare("UPDATE ai_interactions SET input_text = 'x' WHERE id = ?").run(id))
      .toThrow(/append-only/);
    db.close();
  });

  it('refuses any DELETE of an ai_interactions row', () => {
    const db = openLikeServer(dbPath);
    const id = recordInteraction(db);
    expect(() => db.getDatabase().prepare('DELETE FROM ai_interactions WHERE id = ?').run(id))
      .toThrow(/append-only/);
    db.close();
  });
});
