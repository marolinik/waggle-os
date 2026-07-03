// INFORMATIONAL ONLY. Written once to meta.schema_version on first init (db.ts)
// and exposed on the public barrel, but migrations are PRESENCE-based (they probe
// for missing tables/columns/triggers), not gated on this value — nothing reads it
// back to branch. It documents "this is v1 of the on-disk shape"; bump it (and add
// a migration branch in MindDB.runMigrations()) only if you ever need version-gated
// migration logic. Kept, not deleted: it is a re-exported public constant and the
// meta row is asserted by schema.test.ts.
export const SCHEMA_VERSION = '1';

export const SCHEMA_SQL = `
-- Meta table for schema versioning
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Layer 0: Identity (single row, <500 tokens)
CREATE TABLE IF NOT EXISTS identity (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  department TEXT NOT NULL DEFAULT '',
  personality TEXT NOT NULL DEFAULT '',
  capabilities TEXT NOT NULL DEFAULT '',
  system_prompt TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Layer 1: Awareness (<=10 active items)
CREATE TABLE IF NOT EXISTS awareness (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL CHECK (category IN ('task', 'action', 'pending', 'flag')),
  content TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT
);

-- Sessions: map GOPs to projects
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gop_id TEXT NOT NULL UNIQUE,
  project_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'archived')),
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT,
  summary TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions (project_id, started_at);

-- Layer 2: Memory Frames (I/P/B with GOP organization)
CREATE TABLE IF NOT EXISTS memory_frames (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  frame_type TEXT NOT NULL CHECK (frame_type IN ('I', 'P', 'B')),
  gop_id TEXT NOT NULL,
  t INTEGER NOT NULL DEFAULT 0,
  base_frame_id INTEGER REFERENCES memory_frames(id),
  content TEXT NOT NULL,
  importance TEXT NOT NULL DEFAULT 'normal'
    CHECK (importance IN ('critical', 'important', 'normal', 'temporary', 'deprecated')),
  source TEXT NOT NULL DEFAULT 'user_stated'
    CHECK (source IN ('user_stated', 'tool_verified', 'agent_inferred', 'import', 'system')),
  access_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_accessed TEXT NOT NULL DEFAULT (datetime('now')),
  -- UX-Refactor Phase 2B: JSON blob for Memory Center provenance/classification
  -- (kind/confidence/scope/status/sourceId/sourceUrl/tags/evidence/related*).
  -- See PRD §15.4 + docs/ux-refactor/deltas/shared-types-delta.md §3a. Existing
  -- DBs get this via the idempotent ADD COLUMN in db.ts runMigrations().
  metadata TEXT NOT NULL DEFAULT '{}',
  -- oss-drift D3 (2026-06-11): canonical dedup hash — sha256 over the
  -- stripHmPrefix-stripped + trimmed content (mind/content-hash.ts; mono
  -- semantics, NOT the OSS trim-only hash). Indexed so FrameStore.findDuplicate
  -- is an O(1) lookup with no recency window. Existing DBs get this via the
  -- idempotent ADD COLUMN + backfill in db.ts runMigrations().
  content_hash TEXT,
  FOREIGN KEY (gop_id) REFERENCES sessions(gop_id)
);
CREATE INDEX IF NOT EXISTS idx_frames_gop_t ON memory_frames (gop_id, t);
CREATE INDEX IF NOT EXISTS idx_frames_type ON memory_frames (frame_type, gop_id);
CREATE INDEX IF NOT EXISTS idx_frames_base ON memory_frames (base_frame_id);
-- idx_frames_content_hash is created ONLY in db.ts runMigrations(), AFTER the
-- guarded ADD COLUMN. It must NOT live here: on a pre-D3 database the CREATE
-- TABLE above no-ops (table exists without content_hash), so an index here
-- referenced a missing column and SCHEMA_SQL threw BEFORE the ALTER could run
-- — every existing install failed to boot (2026-06-12 regression).

-- FTS5 for keyword search on frame content
CREATE VIRTUAL TABLE IF NOT EXISTS memory_frames_fts USING fts5(
  content,
  content_rowid='id',
  tokenize='porter unicode61'
);

-- Layer 3: Knowledge Graph - Entities
CREATE TABLE IF NOT EXISTS knowledge_entities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  name TEXT NOT NULL,
  properties TEXT NOT NULL DEFAULT '{}',
  valid_from TEXT NOT NULL DEFAULT (datetime('now')),
  valid_to TEXT,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_entities_type ON knowledge_entities (entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_name ON knowledge_entities (name);

-- Layer 3: Knowledge Graph - Relations
CREATE TABLE IF NOT EXISTS knowledge_relations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES knowledge_entities(id),
  target_id INTEGER NOT NULL REFERENCES knowledge_entities(id),
  relation_type TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1.0,
  properties TEXT NOT NULL DEFAULT '{}',
  valid_from TEXT NOT NULL DEFAULT (datetime('now')),
  valid_to TEXT,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_relations_source ON knowledge_relations (source_id, relation_type);
CREATE INDEX IF NOT EXISTS idx_relations_target ON knowledge_relations (target_id, relation_type);

-- Layer 3: Knowledge Graph - Entity↔Frame bridge.
-- Records which frames an entity was extracted from, so the 'contextual'
-- scoring signal (scoring.ts) can map query-seeded graph distances back onto
-- frames. ON DELETE CASCADE keeps it consistent when a frame or entity is removed.
CREATE TABLE IF NOT EXISTS kg_entity_frames (
  entity_id INTEGER NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
  frame_id INTEGER NOT NULL REFERENCES memory_frames(id) ON DELETE CASCADE,
  PRIMARY KEY (entity_id, frame_id)
);
CREATE INDEX IF NOT EXISTS idx_kg_entity_frames_frame ON kg_entity_frames (frame_id);
CREATE INDEX IF NOT EXISTS idx_kg_entity_frames_entity ON kg_entity_frames (entity_id);

-- Layer 5: Improvement Signals (recurring patterns that should change behavior)
CREATE TABLE IF NOT EXISTS improvement_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL CHECK (category IN ('capability_gap', 'correction', 'workflow_pattern', 'skill_promotion')),
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

-- Layer 6: Install Audit (capability install trust trail)
CREATE TABLE IF NOT EXISTS install_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  capability_name TEXT NOT NULL,
  -- CHECK lists MUST stay in sync with AuditCapabilityType / AuditApprovalClass
  -- / AuditAction in packages/core/src/install-audit.ts. They drifted once
  -- (connector/marketplace/blocked missing) and crashed acquire_capability the
  -- moment marketplace search started returning candidates — see runMigrations().
  capability_type TEXT NOT NULL CHECK (capability_type IN ('native', 'skill', 'plugin', 'mcp', 'connector', 'marketplace')),
  source TEXT NOT NULL,
  version TEXT,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  trust_source TEXT NOT NULL CHECK (trust_source IN ('builtin', 'starter_pack', 'local_user', 'third_party_verified', 'third_party_unverified', 'unknown', 'security-gate')),
  approval_class TEXT NOT NULL CHECK (approval_class IN ('standard', 'elevated', 'critical', 'blocked')),
  action TEXT NOT NULL CHECK (action IN ('proposed', 'approved', 'installed', 'rejected', 'failed', 'blocked', 'uninstalled')),
  initiator TEXT NOT NULL CHECK (initiator IN ('agent', 'user', 'system')),
  detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_audit_capability ON install_audit (capability_name, action);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON install_audit (timestamp DESC);

-- Layer 4: Procedures (GEPA-optimized prompt templates)
CREATE TABLE IF NOT EXISTS procedures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  model TEXT NOT NULL,
  template TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  success_rate REAL NOT NULL DEFAULT 0.0,
  avg_cost REAL NOT NULL DEFAULT 0.0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_procedures_name_model ON procedures (name, model);

-- Layer 7: AI Interactions (EU AI Act Art. 12 — automatic event logging)
CREATE TABLE IF NOT EXISTS ai_interactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  workspace_id TEXT,
  session_id TEXT,
  model TEXT NOT NULL,
  provider TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  tools_called TEXT NOT NULL DEFAULT '[]',
  human_action TEXT CHECK (human_action IN ('approved', 'denied', 'modified', 'none')),
  risk_context TEXT,
  imported_from TEXT,
  persona TEXT,
  -- Review Critical #3 (compliance): EU AI Act Art. 12.1(a) requires recording
  -- the actual INPUTS and OUTPUTS of the system, not just token counts. Added
  -- 2026-04-15; migration for pre-existing DBs in MindDB.runMigrations().
  input_text TEXT,
  output_text TEXT
);
CREATE INDEX IF NOT EXISTS idx_interactions_workspace ON ai_interactions (workspace_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_interactions_timestamp ON ai_interactions (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_interactions_model ON ai_interactions (model);

-- Review Critical #1 (compliance): append-only enforcement for the audit log.
-- DDL-level triggers make the database itself refuse UPDATE / DELETE so a motivated
-- auditor's first question ('can rows be silently mutated?') has a concrete 'no'
-- answer. GDPR Art. 17 erasure is handled via a separate pseudonymize_and_tombstone
-- flow that's not yet implemented — when it is, it will replace inputText/outputText
-- with tombstone markers via a fresh INSERT + status flag, NOT by bypassing these
-- triggers.
CREATE TRIGGER IF NOT EXISTS ai_interactions_no_delete
BEFORE DELETE ON ai_interactions
BEGIN
  SELECT RAISE(ABORT, 'ai_interactions is append-only (EU AI Act Art. 12 audit log)');
END;
CREATE TRIGGER IF NOT EXISTS ai_interactions_no_update
BEFORE UPDATE ON ai_interactions
BEGIN
  SELECT RAISE(ABORT, 'ai_interactions is append-only (EU AI Act Art. 12 audit log)');
END;

-- Layer 9: Execution Traces (agent run history — foundation for self-evolution)
CREATE TABLE IF NOT EXISTS execution_traces (
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
);
CREATE INDEX IF NOT EXISTS idx_traces_session ON execution_traces (session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_traces_persona ON execution_traces (persona_id, outcome);
CREATE INDEX IF NOT EXISTS idx_traces_outcome ON execution_traces (outcome, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_traces_workspace ON execution_traces (workspace_id, created_at DESC);

-- Layer 10: Evolution Runs (proposed/accepted/rejected self-evolution runs)
CREATE TABLE IF NOT EXISTS evolution_runs (
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
);
CREATE INDEX IF NOT EXISTS idx_evo_runs_status ON evolution_runs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_evo_runs_target ON evolution_runs (target_kind, target_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_evo_runs_created ON evolution_runs (created_at DESC);

-- Layer 8: Harvest Sources (Memory Harvest sync tracking)
CREATE TABLE IF NOT EXISTS harvest_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  source_path TEXT,
  last_synced_at TEXT,
  items_imported INTEGER NOT NULL DEFAULT 0,
  frames_created INTEGER NOT NULL DEFAULT 0,
  auto_sync INTEGER NOT NULL DEFAULT 0,
  sync_interval_hours INTEGER NOT NULL DEFAULT 24,
  last_content_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Reverse-ported from OSS hive-mind chunker (oss-drift triage D1, 2026-06-11).
-- Memory frame chunks: paragraph-level subdivisions of memory_frames for
-- semantic-search precision. One frame produces N chunks (N=1 for short
-- frames). Each chunk gets its own embedding in memory_frame_chunks_vec.
-- Recall maps top-K chunks back to parent frames via frame_id.
CREATE TABLE IF NOT EXISTS memory_frame_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  frame_id INTEGER NOT NULL REFERENCES memory_frames(id) ON DELETE CASCADE,
  chunk_idx INTEGER NOT NULL,
  content TEXT NOT NULL,
  char_start INTEGER NOT NULL,
  char_end INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(frame_id, chunk_idx)
);
CREATE INDEX IF NOT EXISTS idx_chunks_frame ON memory_frame_chunks (frame_id);

-- Verbatim Provenance Archive (#7, 2026-06-30): append-only, immutable, full-fidelity
-- copy of each harvested source item. Distilled/imported frames link back via
-- memory_frames.metadata.archiveUid. NOT part of the retrieval corpus (no FTS/vec) —
-- audit/reconstruction only. Append-only triggers mirror ai_interactions (Layer 7),
-- with ONE exception: a one-time GDPR Art.17 redaction (see raw_archive_no_update).
CREATE TABLE IF NOT EXISTS raw_archive (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  archive_uid TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,
  source_ref TEXT,
  title TEXT,
  content TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  injection_flagged INTEGER NOT NULL DEFAULT 0,
  injection_flags TEXT NOT NULL DEFAULT '',
  source_timestamp TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- Size guard: a single item's content is truncated to
  -- RAW_ARCHIVE_MAX_CONTENT_CHARS (raw-archive.ts) before storage so one giant
  -- harvested export can't blow the append-only store. truncated=1 marks a capped
  -- row; original_length is the pre-truncation character count (NULL when not
  -- truncated). archive_uid + content_sha256 still derive from the FULL content, so
  -- idempotency + the integrity anchor are unaffected. Not referenced by the
  -- append-only trigger below, so an erasure UPDATE that leaves them untouched
  -- passes unchanged. Pre-guard DBs get these via the idempotent ADD COLUMN in db.ts.
  truncated INTEGER NOT NULL DEFAULT 0,
  original_length INTEGER,
  -- GDPR Art.17 erasure: NULL until a data-subject erasure request. When set, the
  -- audit skeleton (id/source/refs/timestamps) is frozen as the audit record while
  -- content/content_sha256/title are redacted AND archive_uid is ROTATED to an opaque
  -- id (the old content-derived uid was a re-identification vector — see the trigger).
  erased_at TEXT,
  erased_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_raw_archive_source_ref ON raw_archive (source, source_ref);
CREATE INDEX IF NOT EXISTS idx_raw_archive_created ON raw_archive (created_at DESC);
-- Append-only EXCEPT a single, one-directional GDPR Art.17 redaction. The trigger
-- pins the EXACT permitted outcome — not just the transition — so raw SQL cannot
-- abuse the erasure path to forge audit content: it is allowed ONLY when erased_at
-- goes NULL -> a non-empty value, every AUDIT column (id/source/refs/timestamps/
-- injection) is unchanged, the archive_uid is ROTATED to a new non-empty value
-- (content-derived uid must not survive — re-identification vector), AND the row
-- lands on the canonical redaction (content = marker, content_sha256 = '', title
-- NULL). erased_reason is the only free field. The content literal below MUST stay
-- byte-identical to RAW_ARCHIVE_REDACTION_MARKER in raw-archive.ts, and this whole
-- WHEN clause byte-identical to the db.ts runMigrations() recreation.
CREATE TRIGGER IF NOT EXISTS raw_archive_no_update
BEFORE UPDATE ON raw_archive
WHEN NOT (
  OLD.erased_at IS NULL AND NEW.erased_at IS NOT NULL AND NEW.erased_at <> ''
  AND NEW.content = '[REDACTED — GDPR Art.17 erasure]'
  AND NEW.content_sha256 = ''
  AND NEW.title IS NULL
  AND NEW.id IS OLD.id
  AND NEW.archive_uid <> OLD.archive_uid
  AND NEW.archive_uid <> ''
  AND NEW.source IS OLD.source
  AND NEW.source_ref IS OLD.source_ref
  AND NEW.created_at IS OLD.created_at
  AND NEW.source_timestamp IS OLD.source_timestamp
  AND NEW.injection_flagged IS OLD.injection_flagged
  AND NEW.injection_flags IS OLD.injection_flags
)
BEGIN SELECT RAISE(ABORT, 'raw_archive is append-only; only a one-time canonical GDPR Art.17 redaction is permitted'); END;
CREATE TRIGGER IF NOT EXISTS raw_archive_no_delete
BEFORE DELETE ON raw_archive
BEGIN SELECT RAISE(ABORT, 'raw_archive is append-only (verbatim provenance archive)'); END;

-- Erased-subject suppression list (#7 Art.17 "sticky erasure", 2026-07-02). When a
-- data subject is erased (MindErasure.eraseBySourceRef), its (source, source_ref) is
-- recorded here; every re-import write seam consults it and SKIPS re-materialization,
-- so an exercised right-to-erasure survives a later re-export/re-sync of the source.
-- Keyed on the SUBJECT pair ONLY — deliberately NO content / content_sha256 (a
-- content-keyed tombstone would reintroduce the re-identification vector the
-- raw_archive archive_uid rotation removed). Rows are DELETABLE (unlike raw_archive):
-- deletion is the deliberate re-consent / "allow re-import again" path — hence no
-- immutability trigger. Generic substrate (no governance/trust fields) → forward-ports
-- to the OSS mirror verbatim, the deliberate opposite of install_audit.
CREATE TABLE IF NOT EXISTS erased_subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  erased_at TEXT NOT NULL DEFAULT (datetime('now')),
  reason TEXT,
  UNIQUE(source, source_ref)
);
CREATE INDEX IF NOT EXISTS idx_erased_subjects_lookup ON erased_subjects (source, source_ref);
`;

// Reverse-ported from OSS hive-mind (oss-drift triage R7, 2026-06-11).
/** Vec-table DDL parameterized by embedding dimension. vec0 columns can't be
 *  ALTERed, so changing dimension means DROP + CREATE (see MindDB.recreateVecTables). */
export function vecTableSqlForDim(dim: number): string {
  const d = Math.trunc(dim);
  return `
CREATE VIRTUAL TABLE IF NOT EXISTS memory_frames_vec USING vec0(
  embedding float[${d}]
);
`;
}

/** Default vec schema at the canonical 1024-dim (used on first init + migrations). */
export const VEC_TABLE_SQL = vecTableSqlForDim(1024);

// Reverse-ported from OSS hive-mind chunker (oss-drift triage D1, 2026-06-11).
/** Chunk-level vec-table DDL parameterized by embedding dimension. Separate from
 *  vecTableSqlForDim so callers can create/recreate the chunk index independently;
 *  MindDB.recreateVecTables(dim) recreates BOTH (frames + chunks) together. */
export function chunksVecTableSqlForDim(dim: number): string {
  const d = Math.trunc(dim);
  return `
CREATE VIRTUAL TABLE IF NOT EXISTS memory_frame_chunks_vec USING vec0(
  embedding float[${d}]
);
`;
}

/** Default chunk-vec schema at the canonical 1024-dim (first init + migrations). */
export const CHUNKS_VEC_TABLE_SQL = chunksVecTableSqlForDim(1024);
