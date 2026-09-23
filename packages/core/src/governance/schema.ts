/**
 * DDL of the `governance` context: the capability install trail
 * (`install_audit`) and the EU AI Act Art. 12 interaction log
 * (`ai_interactions`).
 *
 * Both tables live in `personal.mind`, but the Mind schema does not declare
 * them: their retention is legal, not behavioural, and they are excluded from
 * the OSS mirror. `ensureGovernanceSchema` applies this DDL and its migrations
 * (D-1, docs/ARCHITECTURE.md).
 */
import {
  sqlInList, RISK_LEVELS, APPROVAL_CLASSES, AUDIT_ACTIONS,
  AUDIT_CAPABILITY_TYPES, AUDIT_INITIATORS, TRUST_SOURCES,
} from '@waggle/shared';

/**
 * The CHECK lists of `install_audit`, generated from the canonical
 * `@waggle/shared` arrays so the SQLite constraint and the TS unions cannot
 * drift. A stored table whose DDL lacks any of these lists is rebuilt.
 */
export const INSTALL_AUDIT_CHECK_LISTS = [
  `capability_type IN (${sqlInList(AUDIT_CAPABILITY_TYPES)})`,
  `risk_level IN (${sqlInList(RISK_LEVELS)})`,
  `trust_source IN (${sqlInList(TRUST_SOURCES)})`,
  `approval_class IN (${sqlInList(APPROVAL_CLASSES)})`,
  `action IN (${sqlInList(AUDIT_ACTIONS)})`,
  `initiator IN (${sqlInList(AUDIT_INITIATORS)})`,
] as const;

export const INSTALL_AUDIT_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS install_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  capability_name TEXT NOT NULL,
  capability_type TEXT NOT NULL CHECK (${INSTALL_AUDIT_CHECK_LISTS[0]}),
  source TEXT NOT NULL,
  version TEXT,
  risk_level TEXT NOT NULL CHECK (${INSTALL_AUDIT_CHECK_LISTS[1]}),
  trust_source TEXT NOT NULL CHECK (${INSTALL_AUDIT_CHECK_LISTS[2]}),
  approval_class TEXT NOT NULL CHECK (${INSTALL_AUDIT_CHECK_LISTS[3]}),
  action TEXT NOT NULL CHECK (${INSTALL_AUDIT_CHECK_LISTS[4]}),
  initiator TEXT NOT NULL CHECK (${INSTALL_AUDIT_CHECK_LISTS[5]}),
  detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_audit_capability ON install_audit (capability_name, action);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON install_audit (timestamp DESC);
`;

/** The columns copied when `install_audit` is rebuilt or recovered. */
export const INSTALL_AUDIT_COLUMNS =
  'id, timestamp, capability_name, capability_type, source, version, '
  + 'risk_level, trust_source, approval_class, action, initiator, detail';

export const AI_INTERACTIONS_APPEND_ONLY_MESSAGE =
  'ai_interactions is append-only (EU AI Act Art. 12 audit log)';

export const AI_INTERACTIONS_TABLE_SQL = `
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
  -- EU AI Act Art. 12.1(a) records the actual inputs and outputs, not just
  -- token counts. Added 2026-04-15; ensureGovernanceSchema adds them to older DBs.
  input_text TEXT,
  output_text TEXT
);
CREATE INDEX IF NOT EXISTS idx_interactions_workspace ON ai_interactions (workspace_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_interactions_timestamp ON ai_interactions (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_interactions_model ON ai_interactions (model);
`;

/** Rows can never be deleted: an auditor's "can rows vanish?" has a concrete no. */
export const AI_INTERACTIONS_NO_DELETE_TRIGGER_SQL =
  'CREATE TRIGGER IF NOT EXISTS ai_interactions_no_delete BEFORE DELETE ON ai_interactions '
  + `BEGIN SELECT RAISE(ABORT, '${AI_INTERACTIONS_APPEND_ONLY_MESSAGE}'); END`;

export const AI_INTERACTIONS_NO_UPDATE_TRIGGER_SQL =
  'CREATE TRIGGER IF NOT EXISTS ai_interactions_no_update BEFORE UPDATE ON ai_interactions '
  + `BEGIN SELECT RAISE(ABORT, '${AI_INTERACTIONS_APPEND_ONLY_MESSAGE}'); END`;
