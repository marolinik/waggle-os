import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { MindDB } from '../../src/mind/db.js';
import { InstallAuditStore, type RecordAuditInput } from '../../src/install-audit.js';

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
    // Most recent first
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
    // Create a second store on the same DB — table already exists, should not fail
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
});
