import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB } from '../../src/mind/db.js';
import {
  EvolutionRunStore,
  type EvolutionRunTarget,
} from '../../src/mind/evolution-runs.js';

describe('EvolutionRunStore', () => {
  let db: MindDB;
  let store: EvolutionRunStore;

  beforeEach(() => {
    db = new MindDB(':memory:');
    store = new EvolutionRunStore(db);
  });

  afterEach(() => {
    db.close();
  });

  function seed(overrides: Partial<Parameters<EvolutionRunStore['create']>[0]> = {}) {
    return store.create({
      targetKind: 'persona-system-prompt' as EvolutionRunTarget,
      targetName: 'researcher',
      baselineText: 'baseline prompt',
      winnerText: 'evolved prompt',
      deltaAccuracy: 0.07,
      gateVerdict: 'pass',
      gateReasons: [],
      ...overrides,
    });
  }

  // ── create ──

  describe('create', () => {
    it('inserts a new proposed run with a generated uuid', () => {
      const row = seed();
      expect(row.id).toBeGreaterThan(0);
      expect(row.run_uuid).toBeTruthy();
      expect(row.status).toBe('proposed');
      expect(row.created_at).toBeTruthy();
      expect(row.decided_at).toBeNull();
    });

    it('accepts a caller-supplied uuid', () => {
      const row = seed({ runUuid: 'custom-uuid-1234' });
      expect(row.run_uuid).toBe('custom-uuid-1234');
    });

    it('serializes winnerSchema as JSON', () => {
      const schema = { name: 'test', fields: [{ name: 'answer', type: 'string' }] };
      const row = seed({ winnerSchema: schema });
      expect(row.winner_schema_json).toBeTruthy();
      expect(JSON.parse(row.winner_schema_json!)).toEqual(schema);
    });

    it('serializes gateReasons as JSON', () => {
      const reasons = [
        { gate: 'size', verdict: 'pass' as const, reason: 'within limit' },
        { gate: 'growth', verdict: 'pass' as const, reason: '+5%' },
      ];
      const row = seed({ gateReasons: reasons });
      expect(JSON.parse(row.gate_reasons_json)).toEqual(reasons);
    });

    it('defaults artifacts_json to null when omitted', () => {
      const row = seed();
      expect(row.artifacts_json).toBeNull();
    });

    it('stores artifacts JSON when provided', () => {
      const artifacts = { generations: 3, pareto: 2, runSeed: 42 };
      const row = seed({ artifacts });
      expect(row.artifacts_json).toBeTruthy();
      expect(JSON.parse(row.artifacts_json!)).toEqual(artifacts);
    });
  });

  // ── accept / reject ──

  describe('accept', () => {
    it('moves a proposed run to accepted', () => {
      const created = seed();
      const updated = store.accept(created.run_uuid, 'LGTM');
      expect(updated?.status).toBe('accepted');
      expect(updated?.user_note).toBe('LGTM');
      expect(updated?.decided_at).not.toBeNull();
    });

    it('is a no-op for non-proposed runs', () => {
      const created = seed();
      store.reject(created.run_uuid, 'nope');
      const result = store.accept(created.run_uuid, 'actually yes');
      expect(result?.status).toBe('rejected');
    });

    it('returns undefined for unknown uuid', () => {
      expect(store.accept('does-not-exist')).toBeUndefined();
    });
  });

  describe('reject', () => {
    it('moves a proposed run to rejected and stores the reason', () => {
      const created = seed();
      const updated = store.reject(created.run_uuid, 'too verbose');
      expect(updated?.status).toBe('rejected');
      expect(updated?.user_note).toBe('too verbose');
    });

    it('is a no-op for non-proposed runs', () => {
      const created = seed();
      store.accept(created.run_uuid);
      const result = store.reject(created.run_uuid, 'changed my mind');
      expect(result?.status).toBe('accepted');
    });
  });

  // ── deployed / failed ──

  describe('markDeployed', () => {
    it('moves accepted → deployed and stamps deployed_at', () => {
      const created = seed();
      store.accept(created.run_uuid);
      const deployed = store.markDeployed(created.run_uuid);
      expect(deployed?.status).toBe('deployed');
      expect(deployed?.deployed_at).not.toBeNull();
    });

    it('does nothing if run is still proposed', () => {
      const created = seed();
      const result = store.markDeployed(created.run_uuid);
      expect(result?.status).toBe('proposed');
    });
  });

  describe('markFailed', () => {
    it('moves accepted → failed with a reason', () => {
      const created = seed();
      store.accept(created.run_uuid);
      const failed = store.markFailed(created.run_uuid, 'persona write error');
      expect(failed?.status).toBe('failed');
      expect(failed?.failure_reason).toBe('persona write error');
    });
  });

  // ── getters ──

  describe('get / getByUuid', () => {
    it('returns the row by numeric id', () => {
      const created = seed();
      const fetched = store.get(created.id);
      expect(fetched?.run_uuid).toBe(created.run_uuid);
    });

    it('returns undefined for unknown id', () => {
      expect(store.get(999)).toBeUndefined();
    });

    it('returns the row by uuid', () => {
      const created = seed();
      expect(store.getByUuid(created.run_uuid)?.id).toBe(created.id);
    });
  });

  // ── list ──

  describe('list', () => {
    beforeEach(() => {
      seed({ targetName: 'researcher', targetKind: 'persona-system-prompt' });
      seed({ targetName: 'coder', targetKind: 'persona-system-prompt' });
      seed({ targetName: 'coder', targetKind: 'tool-description' });
    });

    it('returns rows in created_at DESC order (with id tiebreaker)', () => {
      const rows = store.list();
      expect(rows.length).toBeGreaterThanOrEqual(3);
      expect(rows[0].id).toBeGreaterThan(rows[rows.length - 1].id);
    });

    it('filters by status', () => {
      const all = store.list({ status: 'proposed' });
      expect(all.every(r => r.status === 'proposed')).toBe(true);
    });

    it('filters by multiple statuses', () => {
      const created = seed();
      store.reject(created.run_uuid);
      const rows = store.list({ status: ['proposed', 'rejected'] });
      expect(rows.length).toBeGreaterThanOrEqual(4);
    });

    it('filters by targetKind', () => {
      const rows = store.list({ targetKind: 'persona-system-prompt' });
      expect(rows.every(r => r.target_kind === 'persona-system-prompt')).toBe(true);
    });

    it('filters by targetName', () => {
      const rows = store.list({ targetName: 'coder' });
      expect(rows.every(r => r.target_name === 'coder')).toBe(true);
    });

    it('respects limit', () => {
      expect(store.list({ limit: 2 })).toHaveLength(2);
    });
  });

  // ── statusCounts ──

  describe('statusCounts', () => {
    it('aggregates counts per status', () => {
      const a = seed();
      const b = seed();
      const c = seed();
      store.accept(a.run_uuid);
      store.accept(b.run_uuid);
      store.markDeployed(b.run_uuid);
      store.reject(c.run_uuid);

      const counts = store.statusCounts();
      expect(counts.proposed).toBe(0);
      expect(counts.accepted).toBe(1);
      expect(counts.deployed).toBe(1);
      expect(counts.rejected).toBe(1);
    });

    it('scopes counts by target filter', () => {
      seed({ targetName: 'a' });
      seed({ targetName: 'b' });
      expect(store.statusCounts({ targetName: 'a' }).proposed).toBe(1);
    });
  });

  // ── delete / clear ──

  describe('delete / clear', () => {
    it('deletes a single run', () => {
      const created = seed();
      store.delete(created.run_uuid);
      expect(store.getByUuid(created.run_uuid)).toBeUndefined();
    });

    it('clears all runs', () => {
      seed(); seed(); seed();
      store.clear();
      expect(store.list()).toHaveLength(0);
    });
  });

  // ── ensureTable (backward compat) ──

  describe('ensureTable', () => {
    it('is idempotent — constructing twice does not fail', () => {
      const another = new EvolutionRunStore(db);
      const row = another.create({
        targetKind: 'generic',
        baselineText: 'x',
        winnerText: 'y',
        deltaAccuracy: 0.1,
        gateVerdict: 'pass',
        gateReasons: [],
      });
      expect(row.id).toBeGreaterThan(0);
    });
  });
});
