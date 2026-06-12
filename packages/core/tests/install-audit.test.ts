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

  it("records an 'uninstalled' action (P5/D4 — capability removal trail)", () => {
    const entry = store.record(makeInput({ action: 'uninstalled', initiator: 'agent', detail: 'deleted by agent' }));
    expect(entry.action).toBe('uninstalled');
    expect(store.getByAction('uninstalled')).toHaveLength(1);
  });

  it("migrates a legacy-CHECK table to accept 'uninstalled' (P5/D4)", () => {
    const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-audit-legacy-'));
    const legacyDb = new MindDB(path.join(tmp2, 'legacy.mind'));
    const raw = legacyDb.getDatabase();
    // Simulate a pre-P5 install: drop the migrated table and recreate it with
    // the OLD narrower action CHECK (no 'uninstalled'), seeding one row.
    raw.exec('DROP TABLE IF EXISTS install_audit');
    raw.exec(`
      CREATE TABLE install_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        capability_name TEXT NOT NULL,
        capability_type TEXT NOT NULL CHECK (capability_type IN ('native','skill','plugin','mcp','connector','marketplace')),
        source TEXT NOT NULL,
        version TEXT,
        risk_level TEXT NOT NULL CHECK (risk_level IN ('low','medium','high','critical')),
        trust_source TEXT NOT NULL,
        approval_class TEXT NOT NULL CHECK (approval_class IN ('standard','elevated','critical','blocked')),
        action TEXT NOT NULL CHECK (action IN ('proposed','approved','installed','rejected','failed','blocked')),
        initiator TEXT NOT NULL CHECK (initiator IN ('agent','user','system')),
        detail TEXT NOT NULL DEFAULT ''
      );
    `);
    raw.prepare(`INSERT INTO install_audit
      (capability_name, capability_type, source, risk_level, trust_source, approval_class, action, initiator, detail)
      VALUES ('legacy-skill','skill','starter-pack','low','starter_pack','standard','installed','user','pre-migration row')`).run();

    // Constructing the store triggers ensureTable() → rebuild migration.
    const migrated = new InstallAuditStore(legacyDb);
    // Pre-existing row survives the rebuild.
    expect(migrated.getByCapability('legacy-skill')).toHaveLength(1);
    // The widened CHECK now accepts 'uninstalled' (would throw on a stale table).
    const entry = migrated.record(makeInput({ capabilityName: 'legacy-skill', action: 'uninstalled', detail: 'removed' }));
    expect(entry.action).toBe('uninstalled');
    // Review #1: the rebuild must NOT drop the declared indexes (SQLite RENAME
    // carries index names to the legacy table; without an explicit DROP INDEX
    // they get destroyed with it, leaving the audit table index-less).
    const idx = raw.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='install_audit' AND name LIKE 'idx_audit_%'",
    ).all() as Array<{ name: string }>;
    expect(idx.map(i => i.name).sort()).toEqual(['idx_audit_capability', 'idx_audit_timestamp']);

    // #15: the rebuild also added the trust_source CHECK (the legacy table had
    // trust_source unconstrained). The migrated DDL now carries it, and the
    // pre-migration row (trust_source 'starter_pack') survived because every
    // historical value is in the canonical 7-set.
    const ddl = raw.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='install_audit'",
    ).get() as { sql: string };
    expect(ddl.sql).toContain('CHECK (trust_source IN');
    // A bogus trust_source is now rejected at the DB (was previously accepted).
    expect(() => raw.prepare(
      `INSERT INTO install_audit
        (capability_name, capability_type, source, risk_level, trust_source, approval_class, action, initiator, detail)
        VALUES ('x','skill','s','low','BOGUS_SOURCE','standard','installed','user','')`,
    ).run()).toThrow();

    legacyDb.close();
    fs.rmSync(tmp2, { recursive: true, force: true });
  });

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

  // M2 (UX-Refactor Phase 4 / C15): risk_level CHECK lacked 'critical' while
  // the TS union had it — marketplace.ts's CRITICAL-block audit write was
  // silently rejected (throw swallowed by `catch {}`). This locks the widened
  // CHECK on fresh databases.
  it("records riskLevel 'critical' (M2: risk_level CHECK widened)", () => {
    const entry = store.record(makeInput({
      riskLevel: 'critical',
      approvalClass: 'blocked',
      action: 'blocked',
      trustSource: 'security-gate',
      detail: 'SecurityGate blocked: CRITICAL findings',
    }));
    expect(entry.risk_level).toBe('critical');
    expect(entry.action).toBe('blocked');
  });

  // C18: type-filtered read backing GET /api/extend/audit?type=
  it('getRecentByType filters by capability_type, most recent first', () => {
    store.record(makeInput({ capabilityName: 'a-skill', capabilityType: 'skill' }));
    store.record(makeInput({ capabilityName: 'a-server', capabilityType: 'mcp' }));
    store.record(makeInput({ capabilityName: 'b-server', capabilityType: 'mcp' }));
    store.record(makeInput({ capabilityName: 'a-conn', capabilityType: 'connector' }));

    const mcps = store.getRecentByType('mcp');
    expect(mcps).toHaveLength(2);
    expect(mcps[0].capability_name).toBe('b-server');
    expect(mcps[1].capability_name).toBe('a-server');
    expect(store.getRecentByType('mcp', 1)).toHaveLength(1);
    expect(store.getRecentByType('native')).toHaveLength(0);
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

  // M2 (UX-Refactor Phase 4 / C15): the FIX-3-era DDL had every list widened
  // EXCEPT risk_level — the exact shape real .minds created between FIX-3
  // (2026-05-17) and Phase 4 are in. Only the new "'low', 'medium', 'high',
  // 'critical'" sentinel triggers this rebuild ('critical' alone appears in
  // approval_class, so it is NOT the key).
  const FIX3_ERA_DDL = `CREATE TABLE install_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    capability_name TEXT NOT NULL,
    capability_type TEXT NOT NULL CHECK (capability_type IN ('native', 'skill', 'plugin', 'mcp', 'connector', 'marketplace')),
    source TEXT NOT NULL,
    version TEXT,
    risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
    trust_source TEXT NOT NULL,
    approval_class TEXT NOT NULL CHECK (approval_class IN ('standard', 'elevated', 'critical', 'blocked')),
    action TEXT NOT NULL CHECK (action IN ('proposed', 'approved', 'installed', 'rejected', 'failed', 'blocked')),
    initiator TEXT NOT NULL CHECK (initiator IN ('agent', 'user', 'system')),
    detail TEXT NOT NULL DEFAULT ''
  )`;

  it("M2: rebuilds a FIX-3-era table (risk_level missing 'critical') and preserves rows", () => {
    {
      const seed = new MindDB(dbPath);
      const raw = seed.getDatabase();
      raw.prepare('DROP TABLE IF EXISTS install_audit').run();
      raw.prepare(FIX3_ERA_DDL).run();
      raw.prepare(`INSERT INTO install_audit
        (capability_name, capability_type, source, risk_level, trust_source, approval_class, action, initiator, detail)
        VALUES ('legacy-mcp','mcp','marketplace','high','security-gate','blocked','blocked','system','pre-M2 row')`).run();
      // Sanity: the legacy CHECK really rejects 'critical' (the live bug)
      expect(() => raw.prepare(`INSERT INTO install_audit
        (capability_name, capability_type, source, risk_level, trust_source, approval_class, action, initiator, detail)
        VALUES ('x','mcp','marketplace','critical','security-gate','blocked','blocked','system','')`).run()
      ).toThrow(/CHECK/);
      seed.close();
    }

    // Reopen — runMigrations() must rebuild keyed on the M2 sentinel.
    const db = new MindDB(dbPath);
    const store = new InstallAuditStore(db);

    const legacy = store.getByCapability('legacy-mcp');
    expect(legacy).toHaveLength(1);
    expect(legacy[0].detail).toBe('pre-M2 row');
    expect(legacy[0].risk_level).toBe('high');

    const critical = store.record({
      capabilityName: 'evil-pkg', capabilityType: 'marketplace', source: 'marketplace',
      riskLevel: 'critical', trustSource: 'security-gate', approvalClass: 'blocked',
      action: 'blocked', initiator: 'system', detail: 'SecurityGate blocked: CRITICAL',
    });
    expect(critical.risk_level).toBe('critical');
    db.close();

    // Idempotence: a second reopen must NOT rebuild again (rows + ids stable).
    const db2 = new MindDB(dbPath);
    const store2 = new InstallAuditStore(db2);
    const all = store2.getAll();
    expect(all).toHaveLength(2);
    expect(all.map((e) => e.capability_name)).toEqual(['legacy-mcp', 'evil-pkg']);
    // The rebuilt DDL carries the sentinel, so a third store write still works.
    expect(() => store2.record({
      capabilityName: 'again', capabilityType: 'mcp', source: 'mcp',
      riskLevel: 'critical', trustSource: 'security-gate', approvalClass: 'blocked',
      action: 'blocked', initiator: 'system',
    })).not.toThrow();
    db2.close();
  });

  // The rebuild now runs in ONE transaction, so a crash mid-rebuild rolls
  // back — but DBs damaged by a PRE-transactional crashed rebuild exist in the
  // wild with all rows stranded in install_audit__mig_old. These lock the
  // recovery the FIX-3 comment always promised but never performed.
  const LEGACY_ROW_INSERT = (table: string) => `INSERT INTO ${table}
    (capability_name, capability_type, source, risk_level, trust_source, approval_class, action, initiator, detail)
    VALUES ('stranded','mcp','marketplace','high','security-gate','blocked','blocked','system','pre-crash row')`;

  it('recovers rows stranded by a crash between RENAME and recreate (install_audit missing)', () => {
    {
      const seed = new MindDB(dbPath);
      const raw = seed.getDatabase();
      raw.prepare('DROP TABLE IF EXISTS install_audit').run();
      raw.prepare(FIX3_ERA_DDL).run();
      raw.prepare(LEGACY_ROW_INSERT('install_audit')).run();
      // Simulate the pre-transactional crash: renamed aside, then process died
      // before SCHEMA_SQL recreated install_audit.
      raw.prepare('ALTER TABLE install_audit RENAME TO install_audit__mig_old').run();
      seed.close();
    }

    const db = new MindDB(dbPath);
    const store = new InstallAuditStore(db);
    // Rows restored AND the rebuild completed (the restored table had the
    // FIX-3-era DDL, so the M2 sentinel re-triggered the rebuild)
    const rows = store.getByCapability('stranded');
    expect(rows).toHaveLength(1);
    expect(rows[0].detail).toBe('pre-crash row');
    expect(() => store.record({
      capabilityName: 'post-recovery', capabilityType: 'mcp', source: 'mcp',
      riskLevel: 'critical', trustSource: 'security-gate', approvalClass: 'blocked',
      action: 'blocked', initiator: 'system',
    })).not.toThrow();
    // No stale __mig_old left to be destroyed by a future rebuild
    const leftover = db.getDatabase().prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='install_audit__mig_old'",
    ).get();
    expect(leftover).toBeUndefined();
    db.close();
  });

  it('recovers rows stranded by a crash between recreate and copy-back (fresh empty install_audit)', () => {
    {
      const seed = new MindDB(dbPath); // creates the CURRENT empty install_audit
      const raw = seed.getDatabase();
      raw.prepare(FIX3_ERA_DDL.replace('CREATE TABLE install_audit', 'CREATE TABLE install_audit__mig_old')).run();
      raw.prepare(LEGACY_ROW_INSERT('install_audit__mig_old')).run();
      seed.close();
    }

    const db = new MindDB(dbPath);
    const store = new InstallAuditStore(db);
    const rows = store.getByCapability('stranded');
    expect(rows).toHaveLength(1);
    expect(rows[0].detail).toBe('pre-crash row');
    const leftover = db.getDatabase().prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='install_audit__mig_old'",
    ).get();
    expect(leftover).toBeUndefined();
    db.close();
  });
});
