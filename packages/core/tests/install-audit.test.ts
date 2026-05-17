/**
 * InstallAuditStore tests.
 *
 * Relocated here from packages/hive-mind-core/tests/mind/ — commit 05c9ec3
 * ("relocate substrate tests") moved this test to hive-mind-core, but the
 * source (`install-audit.ts`) stayed in @waggle/core and imports MindDB FROM
 * @waggle/hive-mind-core. hive-mind-core cannot depend back on @waggle/core
 * (dependency inversion + breaks the OSS parity model), so the relocated test
 * imported a non-existent `../../src/install-audit.js` and the entire suite
 * silently failed at collection — masking the FIX-3 CHECK-drift regression.
 * Its correct home is alongside the source, in @waggle/core.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { MindDB } from '@waggle/hive-mind-core';
import { InstallAuditStore, type RecordAuditInput } from '../src/install-audit.js';

describe('InstallAuditStore', () => {
  let tmpDir: string;
  let db: MindDB;
  let store: InstallAuditStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-audit-'));
    db = new MindDB(path.join(tmpDir, 'test.mind'));
    store = new InstallAuditStore(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeInput(overrides?: Partial<RecordAuditInput>): RecordAuditInput {
    return {
      capabilityName: 'risk-assessment',
      capabilityType: 'skill',
      source: 'starter-pack',
      riskLevel: 'low',
      trustSource: 'starter_pack',
      approvalClass: 'standard',
      action: 'installed',
      initiator: 'agent',
      detail: 'Installed successfully',
      ...overrides,
    };
  }

  it('records and retrieves an audit entry', () => {
    const entry = store.record(makeInput());
    expect(entry.id).toBeGreaterThan(0);
    expect(entry.capability_name).toBe('risk-assessment');
    expect(entry.action).toBe('installed');
    expect(entry.risk_level).toBe('low');
    expect(entry.trust_source).toBe('starter_pack');
    expect(entry.timestamp).toBeTruthy();
  });

  it('records multiple events for same capability', () => {
    store.record(makeInput({ action: 'proposed' }));
    store.record(makeInput({ action: 'approved' }));
    store.record(makeInput({ action: 'installed' }));

    const history = store.getByCapability('risk-assessment');
    expect(history).toHaveLength(3);
    expect(history[0].action).toBe('installed');
    expect(history[2].action).toBe('proposed');
  });

  it('queries by action type', () => {
    store.record(makeInput({ capabilityName: 'draft-memo', action: 'installed' }));
    store.record(makeInput({ capabilityName: 'code-review', action: 'proposed' }));
    store.record(makeInput({ capabilityName: 'brainstorm', action: 'installed' }));

    const installed = store.getByAction('installed');
    expect(installed).toHaveLength(2);
    expect(installed.map(e => e.capability_name).sort()).toEqual(['brainstorm', 'draft-memo']);
  });

  it('retrieves recent entries in descending order', () => {
    store.record(makeInput({ capabilityName: 'first', action: 'proposed' }));
    store.record(makeInput({ capabilityName: 'second', action: 'installed' }));
    store.record(makeInput({ capabilityName: 'third', action: 'failed' }));

    const recent = store.getRecent(2);
    expect(recent).toHaveLength(2);
    expect(recent[0].capability_name).toBe('third');
    expect(recent[1].capability_name).toBe('second');
  });

  it('preserves all fields round-trip', () => {
    const entry = store.record(makeInput({
      capabilityName: 'test-skill',
      capabilityType: 'plugin',
      source: 'third-party',
      version: '1.2.3',
      riskLevel: 'high',
      trustSource: 'third_party_unverified',
      approvalClass: 'critical',
      action: 'failed',
      initiator: 'user',
      detail: 'Permission denied by user',
    }));

    expect(entry.capability_name).toBe('test-skill');
    expect(entry.capability_type).toBe('plugin');
    expect(entry.source).toBe('third-party');
    expect(entry.version).toBe('1.2.3');
    expect(entry.risk_level).toBe('high');
    expect(entry.trust_source).toBe('third_party_unverified');
    expect(entry.approval_class).toBe('critical');
    expect(entry.action).toBe('failed');
    expect(entry.initiator).toBe('user');
    expect(entry.detail).toBe('Permission denied by user');
  });

  it('handles null version', () => {
    const entry = store.record(makeInput({ version: null }));
    expect(entry.version).toBeNull();
  });

  it('handles empty detail', () => {
    const entry = store.record(makeInput({ detail: undefined }));
    expect(entry.detail).toBe('');
  });

  it('getAll returns entries in insertion order', () => {
    store.record(makeInput({ capabilityName: 'a' }));
    store.record(makeInput({ capabilityName: 'b' }));
    store.record(makeInput({ capabilityName: 'c' }));

    const all = store.getAll();
    expect(all).toHaveLength(3);
    expect(all[0].capability_name).toBe('a');
    expect(all[2].capability_name).toBe('c');
  });

  it('clear removes all entries', () => {
    store.record(makeInput({ capabilityName: 'a' }));
    store.record(makeInput({ capabilityName: 'b' }));
    expect(store.getAll()).toHaveLength(2);

    store.clear();
    expect(store.getAll()).toHaveLength(0);
  });

  it('creates table lazily on pre-existing databases', () => {
    const store2 = new InstallAuditStore(db);
    const entry = store2.record(makeInput({ capabilityName: 'from-second-store' }));
    expect(entry.capability_name).toBe('from-second-store');
  });

  it('records failed validation as audit event', () => {
    const entry = store.record(makeInput({
      action: 'failed',
      riskLevel: 'low',
      trustSource: 'unknown',
      detail: 'Skill "nonexistent" not found in the starter pack.',
    }));
    expect(entry.action).toBe('failed');
    expect(entry.detail).toContain('not found');
  });

  // P0-005/FIX-3: install_audit CHECK constraints drifted behind their TS
  // type unions. Once marketplace FTS search returned candidates,
  // acquire_capability recommended a `type:'marketplace'` capability and
  // auditStore.record() crashed with "CHECK constraint failed: capability_type
  // IN ('native','skill','plugin','mcp')", throwing the whole tool and
  // dead-ending the agent. These lock the CHECK <-> type-union alignment.
  it('records a marketplace-type capability (capability_type CHECK widened)', () => {
    const entry = store.record(makeInput({ capabilityType: 'marketplace', source: 'marketplace' }));
    expect(entry.capability_type).toBe('marketplace');
  });

  it('records a connector-type capability', () => {
    const entry = store.record(makeInput({ capabilityType: 'connector', source: 'connector' }));
    expect(entry.capability_type).toBe('connector');
  });

  it("records the 'blocked' action and 'blocked' approval_class (sibling CHECK drift)", () => {
    const entry = store.record(makeInput({ action: 'blocked', approvalClass: 'blocked' }));
    expect(entry.action).toBe('blocked');
    expect(entry.approval_class).toBe('blocked');
  });
});

describe('InstallAuditStore — legacy CHECK migration', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-audit-mig-'));
    dbPath = path.join(tmpDir, 'legacy.mind');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const OLD_DDL = `CREATE TABLE install_audit (
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
  )`;

  it('rebuilds a legacy install_audit table (narrow CHECK) and preserves rows', () => {
    // 1. Create the mind DB, then forcibly downgrade install_audit to the
    //    historical 4-value CHECK with one legacy row — simulating a real
    //    user .mind created before connector/marketplace existed.
    {
      const seed = new MindDB(dbPath);
      const raw = seed.getDatabase();
      raw.prepare('DROP TABLE IF EXISTS install_audit').run();
      raw.prepare(OLD_DDL).run();
      raw.prepare(`INSERT INTO install_audit
        (capability_name, capability_type, source, risk_level, trust_source, approval_class, action, initiator, detail)
        VALUES ('legacy-skill','skill','starter-pack','low','starter_pack','standard','installed','agent','pre-migration row')`).run();
      seed.close();
    }

    // 2. Reopen — runMigrations() must rebuild install_audit with the widened CHECK.
    const db = new MindDB(dbPath);
    const store = new InstallAuditStore(db);

    const legacy = store.getByCapability('legacy-skill');
    expect(legacy).toHaveLength(1);
    expect(legacy[0].detail).toBe('pre-migration row');

    expect(() => store.record({
      capabilityName: 'filesystem', capabilityType: 'marketplace', source: 'marketplace',
      riskLevel: 'medium', trustSource: 'unknown', approvalClass: 'standard',
      action: 'proposed', initiator: 'agent', detail: 'Proposed for need: read external files',
    })).not.toThrow();
    const fs2 = store.getByCapability('filesystem');
    expect(fs2[0].capability_type).toBe('marketplace');

    db.close();
  });
});
