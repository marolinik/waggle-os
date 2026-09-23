/**
 * GDPR Art.17 pseudonymization of the ai_interactions trail (D-1): the one
 * update the append-only guard permits, and everything it still refuses.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { MindDB } from '@waggle/hive-mind-core';
import { InteractionStore } from '../src/compliance/interaction-store.js';
import { VaultStore } from '../src/vault.js';
import {
  GOVERNANCE_PSEUDONYM_KEY_VAULT_NAME, governancePseudonymKey, pseudonymizeInteractions,
} from '../src/governance/pseudonymize.js';
import { AI_INTERACTIONS_PSEUDONYMIZED_TEXT } from '../src/governance/schema.js';

const KEY = Buffer.alloc(32, 7);
const OTHER_KEY = Buffer.alloc(32, 9);
const KEPT = [
  'id', 'timestamp', 'model', 'provider', 'input_tokens', 'output_tokens', 'cost_usd',
  'tools_called', 'human_action', 'imported_from', 'persona',
] as const;

type Row = Record<string, unknown>;

describe('pseudonymizeInteractions', () => {
  let tmpDir: string;
  let db: MindDB;
  let store: InteractionStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-pseudonymize-'));
    db = new MindDB(path.join(tmpDir, 'personal.mind'));
    store = new InteractionStore(db);
  });

  afterEach(() => {
    db.close();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on Windows */ }
  });

  function record(workspaceId: string | undefined, sessionId: string | undefined): number {
    return store.record({
      workspaceId, sessionId, model: 'model-a', provider: 'provider-a',
      inputTokens: 3, outputTokens: 5, costUsd: 0.01, toolsCalled: ['search_memory', 'read_file'],
      humanAction: 'approved', riskContext: 'quoted: Ana is pregnant', persona: 'writer',
      inputText: 'Ana told me she is pregnant', outputText: 'Congratulations to Ana.',
    }).id;
  }

  const row = (id: number): Row => db.getDatabase().prepare('SELECT * FROM ai_interactions WHERE id = ?').get(id) as Row;
  const update = (sql: string, ...params: unknown[]) => () => db.getDatabase().prepare(sql).run(...params);

  it('replaces the text, clears risk_context and pseudonymizes the session, keeping every audit column', () => {
    const id = record('ws-1', 'session-1');
    const before = row(id);
    expect(pseudonymizeInteractions(db, { sessionId: 'session-1', workspaceId: 'ws-1' }, KEY)).toBe(1);
    const after = row(id);
    expect(after.input_text).toBe(AI_INTERACTIONS_PSEUDONYMIZED_TEXT);
    expect(after.output_text).toBe(AI_INTERACTIONS_PSEUDONYMIZED_TEXT);
    expect(after.risk_context).toBeNull();
    expect(after.session_id).toMatch(/^pseud:[0-9a-f]{64}$/);
    expect(after.workspace_id).toBe('ws-1');
    expect(after.pseudonymized_at).toEqual(expect.any(String));
    for (const column of KEPT) expect(after[column]).toEqual(before[column]);
    expect(JSON.parse(after.tools_called as string)).toEqual(['search_memory', 'read_file']);
  });

  it('gives one session one pseudonym, which depends on the key', () => {
    const a = record('ws-1', 'session-1');
    const b = record('ws-1', 'session-1');
    pseudonymizeInteractions(db, { sessionId: 'session-1' }, KEY);
    expect(row(a).session_id).toBe(row(b).session_id);

    const c = record('ws-1', 'session-1');
    pseudonymizeInteractions(db, { sessionId: 'session-1' }, OTHER_KEY);
    expect(row(c).session_id).not.toBe(row(a).session_id);
  });

  it('is a no-op the second time', () => {
    const id = record('ws-1', 'session-1');
    pseudonymizeInteractions(db, { sessionId: 'session-1' }, KEY);
    const once = row(id);
    expect(pseudonymizeInteractions(db, { sessionId: 'session-1' }, KEY)).toBe(0);
    expect(row(id)).toEqual(once);
  });

  it('matches a session only within its workspace or no workspace', () => {
    const own = record('ws-1', 'default');
    const unscoped = record(undefined, 'default');
    const other = record('ws-2', 'default');
    expect(pseudonymizeInteractions(db, { sessionId: 'default', workspaceId: 'ws-1' }, KEY)).toBe(2);
    expect(row(own).pseudonymized_at).not.toBeNull();
    expect(row(unscoped).pseudonymized_at).not.toBeNull();
    expect(row(other).pseudonymized_at).toBeNull();
  });

  it('pseudonymizes a whole workspace, including rows a session erase already covered', () => {
    const earlier = record('ws-1', 'session-1');
    pseudonymizeInteractions(db, { sessionId: 'session-1' }, KEY);
    const earlierSession = row(earlier).session_id;
    const later = record('ws-1', 'session-2');
    const noSession = record('ws-1', undefined);
    const elsewhere = record('ws-2', 'session-3');

    expect(pseudonymizeInteractions(db, { workspaceId: 'ws-1' }, KEY)).toBe(3);
    const workspacePseudonym = row(later).workspace_id;
    expect(workspacePseudonym).toMatch(/^pseud:/);
    expect(row(earlier).workspace_id).toBe(workspacePseudonym);
    expect(row(earlier).session_id).toBe(earlierSession);
    expect(row(later).session_id).toMatch(/^pseud:/);
    expect(row(noSession).session_id).toBeNull();
    expect(row(noSession).input_text).toBe(AI_INTERACTIONS_PSEUDONYMIZED_TEXT);
    expect(row(elsewhere).workspace_id).toBe('ws-2');
    expect(pseudonymizeInteractions(db, { workspaceId: 'ws-1' }, KEY)).toBe(0);
  });

  it('still refuses every other UPDATE and every DELETE', () => {
    const id = record('ws-1', 'session-1');
    const refused = /append-only/;
    expect(update("UPDATE ai_interactions SET model = 'x' WHERE id = ?", id)).toThrow(refused);
    expect(update("UPDATE ai_interactions SET pseudonymized_at = 'now' WHERE id = ?", id)).toThrow(refused);
    // A pseudonymization that also changes a kept column.
    expect(update(
      `UPDATE ai_interactions SET input_text = ?, output_text = ?, risk_context = NULL,
         session_id = 'pseud:x', pseudonymized_at = 'now', cost_usd = 0 WHERE id = ?`,
      AI_INTERACTIONS_PSEUDONYMIZED_TEXT, AI_INTERACTIONS_PSEUDONYMIZED_TEXT, id,
    )).toThrow(refused);
    // A pseudonymization that keeps the raw session id.
    expect(update(
      `UPDATE ai_interactions SET input_text = ?, output_text = ?, risk_context = NULL,
         pseudonymized_at = 'now' WHERE id = ?`,
      AI_INTERACTIONS_PSEUDONYMIZED_TEXT, AI_INTERACTIONS_PSEUDONYMIZED_TEXT, id,
    )).toThrow(refused);

    pseudonymizeInteractions(db, { sessionId: 'session-1' }, KEY);
    expect(update("UPDATE ai_interactions SET input_text = 'restored' WHERE id = ?", id)).toThrow(refused);
    expect(update("UPDATE ai_interactions SET pseudonymized_at = 'later' WHERE id = ?", id)).toThrow(refused);
    expect(update("UPDATE ai_interactions SET session_id = 'session-1' WHERE id = ?", id)).toThrow(refused);
    expect(update('DELETE FROM ai_interactions WHERE id = ?', id)).toThrow(refused);
  });
});

describe('governance on a mind from before D-1', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-pseudonymize-old-'));
    dbPath = path.join(tmpDir, 'personal.mind');
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on Windows */ }
  });

  it('adds pseudonymized_at, swaps in the guarded trigger and keeps the rows', () => {
    {
      // The pre-D-1 shape: no pseudonymized_at, the absolute no-update trigger.
      const seed = new MindDB(dbPath);
      const raw = seed.getDatabase();
      raw.exec(`CREATE TABLE ai_interactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        workspace_id TEXT, session_id TEXT,
        model TEXT NOT NULL, provider TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL NOT NULL DEFAULT 0, tools_called TEXT NOT NULL DEFAULT '[]',
        human_action TEXT CHECK (human_action IN ('approved', 'denied', 'modified', 'none')),
        risk_context TEXT, imported_from TEXT, persona TEXT, input_text TEXT, output_text TEXT
      )`);
      raw.exec("CREATE TRIGGER ai_interactions_no_update BEFORE UPDATE ON ai_interactions BEGIN SELECT RAISE(ABORT, 'ai_interactions is append-only (EU AI Act Art. 12 audit log)'); END");
      raw.prepare("INSERT INTO ai_interactions (session_id, model, provider, input_text) VALUES ('s-old', 'm', 'p', 'old prompt')").run();
      seed.close();
    }

    const db = new MindDB(dbPath);
    new InteractionStore(db);
    expect(pseudonymizeInteractions(db, { sessionId: 's-old' }, KEY)).toBe(1);
    const after = db.getDatabase().prepare("SELECT input_text, pseudonymized_at FROM ai_interactions").get() as Row;
    expect(after.input_text).toBe(AI_INTERACTIONS_PSEUDONYMIZED_TEXT);
    expect(after.pseudonymized_at).not.toBeNull();
    db.close();
  });
});

describe('governancePseudonymKey', () => {
  it('creates a 32-byte key in the vault once, then reuses it', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-pseudonym-key-'));
    try {
      const vault = new VaultStore(dir);
      expect(vault.get(GOVERNANCE_PSEUDONYM_KEY_VAULT_NAME)).toBeNull();
      const first = governancePseudonymKey(vault);
      expect(first).toHaveLength(32);
      expect(governancePseudonymKey(new VaultStore(dir)).equals(first)).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
