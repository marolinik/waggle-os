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
`;

export const VEC_TABLE_SQL = `
CREATE VIRTUAL TABLE IF NOT EXISTS memory_frames_vec USING vec0(
  embedding float[1024]
);
`;
