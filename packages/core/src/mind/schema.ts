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
  FOREIGN KEY (gop_id) REFERENCES sessions(gop_id)
);
CREATE INDEX IF NOT EXISTS idx_frames_gop_t ON memory_frames (gop_id, t);
CREATE INDEX IF NOT EXISTS idx_frames_type ON memory_frames (frame_type, gop_id);
CREATE INDEX IF NOT EXISTS idx_frames_base ON memory_frames (base_frame_id);

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

-- Layer 5: Improvement Signals (recurring patterns that should change behavior)
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

-- Layer 6: Install Audit (capability install trust trail)
CREATE TABLE IF NOT EXISTS install_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  capability_name TEXT NOT NULL,
  capability_type TEXT NOT NULL CHECK (capability_type IN ('native', 'skill', 'plugin', 'mcp')),
  source TEXT NOT NULL,
  version TEXT,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
  trust_source TEXT NOT NULL,
  approval_class TEXT NOT NULL CHECK (approval_class IN ('standard', 'elevated', 'critical')),
  action TEXT NOT NULL CHECK (action IN ('proposed', 'approved', 'installed', 'rejected', 'failed')),
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
  persona TEXT
);
CREATE INDEX IF NOT EXISTS idx_interactions_workspace ON ai_interactions (workspace_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_interactions_timestamp ON ai_interactions (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_interactions_model ON ai_interactions (model);

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
`;

export const VEC_TABLE_SQL = `
CREATE VIRTUAL TABLE IF NOT EXISTS memory_frames_vec USING vec0(
  embedding float[1024]
);
`;
