/**
 * GDPR Art.17 pseudonymization of the `ai_interactions` trail (D-1).
 *
 * An erase keeps the governance trail (EU AI Act Art. 12 and Art. 19 need the
 * counts, models, costs and oversight actions) and pseudonymizes its subject:
 * - the prompt and answer text become a fixed marker;
 * - `risk_context`, which may quote the input, is cleared;
 * - the session id, and the workspace id when the erase targets the
 *   workspace, become keyed-HMAC pseudonyms.
 * `tools_called` holds tool names only and is kept (founder, 2026-09-23).
 *
 * Pseudonyms are deterministic, so every row of one erased session stays
 * linkable to the others and a repeated erase is a no-op. No mapping is stored,
 * and the key lives in the vault, so a pseudonym cannot be reversed. Deleting
 * the key turns pseudonyms into anonymous ids.
 */
import { createHmac, randomBytes } from 'node:crypto';
import type { MindDB } from '@waggle/hive-mind-core';
import type { VaultStore } from '../vault.js';
import { ensureGovernanceSchema } from './ensure-schema.js';
import { AI_INTERACTIONS_PSEUDONYMIZED_TEXT, PSEUDONYM_PREFIX } from './schema.js';

export const GOVERNANCE_PSEUDONYM_KEY_VAULT_NAME = 'governance:pseudonym-key';
const PSEUDONYM_KEY_BYTES = 32;

/** Reads the pseudonym key from the vault, creating it on first use. */
export function governancePseudonymKey(vault: Pick<VaultStore, 'get' | 'set'>): Buffer {
  const stored = vault.get(GOVERNANCE_PSEUDONYM_KEY_VAULT_NAME)?.value;
  if (stored && /^[0-9a-f]{64}$/.test(stored)) return Buffer.from(stored, 'hex');
  const key = randomBytes(PSEUDONYM_KEY_BYTES);
  vault.set(GOVERNANCE_PSEUDONYM_KEY_VAULT_NAME, key.toString('hex'), {
    credentialType: 'internal',
    purpose: 'Pseudonymizes the AI interaction log on erase (GDPR Art.17)',
  });
  return key;
}

function pseudonym(key: Buffer, kind: 'session' | 'workspace', id: string): string {
  return PSEUDONYM_PREFIX + createHmac('sha256', key).update(`${kind}:${id}`).digest('hex');
}

/**
 * Which rows an erase covers:
 * - `{ sessionId, workspaceId? }` is one conversation. With a workspace, rows
 *   recorded under it or under no workspace match.
 * - `{ workspaceId }` is everything recorded under a workspace.
 */
export type PseudonymizationScope =
  | { sessionId: string; workspaceId?: string }
  | { workspaceId: string; sessionId?: undefined };

interface InteractionRow {
  id: number;
  session_id: string | null;
  workspace_id: string | null;
  pseudonymized_at: string | null;
}

/**
 * Pseudonymizes every matching `ai_interactions` row in one transaction and
 * returns how many rows changed. Rows already pseudonymized are left alone,
 * except that a workspace erase also pseudonymizes their workspace id.
 */
export function pseudonymizeInteractions(db: MindDB, scope: PseudonymizationScope, key: Buffer): number {
  ensureGovernanceSchema(db);
  const raw = db.getDatabase();
  const rows = scope.sessionId !== undefined
    ? raw.prepare(
      `SELECT id, session_id, workspace_id, pseudonymized_at FROM ai_interactions
       WHERE session_id = ? AND pseudonymized_at IS NULL
         AND (? IS NULL OR workspace_id = ? OR workspace_id IS NULL)`,
    ).all(scope.sessionId, scope.workspaceId ?? null, scope.workspaceId ?? null) as InteractionRow[]
    : raw.prepare(
      'SELECT id, session_id, workspace_id, pseudonymized_at FROM ai_interactions WHERE workspace_id = ?',
    ).all(scope.workspaceId) as InteractionRow[];
  if (rows.length === 0) return 0;

  const erasesWorkspace = scope.sessionId === undefined;
  const now = new Date().toISOString();
  const pseudonymize = raw.prepare(
    `UPDATE ai_interactions
       SET input_text = ?, output_text = ?, risk_context = NULL,
           session_id = ?, workspace_id = ?, pseudonymized_at = ?
     WHERE id = ?`,
  );
  const pseudonymizeWorkspaceOnly = raw.prepare('UPDATE ai_interactions SET workspace_id = ? WHERE id = ?');

  raw.transaction(() => {
    for (const row of rows) {
      const workspaceId = erasesWorkspace && row.workspace_id !== null
        ? pseudonym(key, 'workspace', row.workspace_id)
        : row.workspace_id;
      if (row.pseudonymized_at !== null) {
        pseudonymizeWorkspaceOnly.run(workspaceId, row.id);
        continue;
      }
      const sessionId = row.session_id === null ? null : pseudonym(key, 'session', row.session_id);
      pseudonymize.run(
        AI_INTERACTIONS_PSEUDONYMIZED_TEXT, AI_INTERACTIONS_PSEUDONYMIZED_TEXT,
        sessionId, workspaceId, now, row.id,
      );
    }
  })();
  return rows.length;
}
