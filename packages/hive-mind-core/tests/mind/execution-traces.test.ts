import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB } from '../../src/mind/db.js';
import {
  ExecutionTraceStore,
  type TraceToolCall,
  type TraceReasoningStep,
} from '../../src/mind/execution-traces.js';

describe('ExecutionTraceStore', () => {
  let db: MindDB;
  let store: ExecutionTraceStore;

  beforeEach(() => {
    db = new MindDB(':memory:');
    store = new ExecutionTraceStore(db);
  });

  afterEach(() => {
    db.close();
  });

  // ── start ─────────────────────────────────────────────────

  describe('start', () => {
    it('creates a new trace in pending outcome', () => {
      const id = store.start({
        sessionId: 'sess-1',
        personaId: 'coder',
        input: 'Write a fibonacci function',
      });

      expect(id).toBeGreaterThan(0);
      const trace = store.get(id);
      expect(trace?.outcome).toBe('pending');
      expect(trace?.session_id).toBe('sess-1');
      expect(trace?.persona_id).toBe('coder');
      expect(trace?.finalized_at).toBeNull();
    });

    it('captures the initial user input in payload', () => {
      const id = store.start({ input: 'Summarize the quarterly report' });
      const parsed = store.getParsed(id);
      expect(parsed?.payload.input).toBe('Summarize the quarterly report');
      expect(parsed?.payload.output).toBe('');
      expect(parsed?.payload.toolCalls).toEqual([]);
    });

    it('persists optional fields (model, workspaceId, taskShape, tags)', () => {
      const id = store.start({
        input: 'x',
        model: 'haiku-4.5',
        workspaceId: 'ws-1',
        taskShape: 'research',
        tags: ['benchmark', 'qa'],
      });
      const parsed = store.getParsed(id);
      expect(parsed?.model).toBe('haiku-4.5');
      expect(parsed?.workspace_id).toBe('ws-1');
      expect(parsed?.task_shape).toBe('research');
      expect(parsed?.payload.tags).toEqual(['benchmark', 'qa']);
    });

    it('allows nullable metadata', () => {
      const id = store.start({ input: 'x' });
      const trace = store.get(id);
      expect(trace?.session_id).toBeNull();
      expect(trace?.persona_id).toBeNull();
    });
  });

  // ── append ────────────────────────────────────────────────

  describe('append', () => {
    it('accumulates tool calls in order', () => {
      const id = store.start({ input: 'x' });
      const call1: TraceToolCall = {
        tool: 'read_file', args: { path: '/a' }, result: 'ok',
        ok: true, durationMs: 10, timestamp: '2026-04-14T10:00:00Z',
      };
      const call2: TraceToolCall = {
        tool: 'edit_file', args: { path: '/a' }, result: 'done',
        ok: true, durationMs: 20, timestamp: '2026-04-14T10:00:01Z',
      };

      store.append(id, { toolCalls: [call1] });
      store.append(id, { toolCalls: [call2] });

      const parsed = store.getParsed(id);
      expect(parsed?.payload.toolCalls).toHaveLength(2);
      expect(parsed?.payload.toolCalls[0].tool).toBe('read_file');
      expect(parsed?.payload.toolCalls[1].tool).toBe('edit_file');
    });

    it('accumulates reasoning steps', () => {
      const id = store.start({ input: 'x' });
      const step1: TraceReasoningStep = {
        content: 'Let me read the file first',
        timestamp: '2026-04-14T10:00:00Z',
      };
      store.append(id, { reasoning: [step1] });
      store.append(id, { reasoning: [{ content: 'Now edit', timestamp: '2026-04-14T10:00:01Z' }] });

      const parsed = store.getParsed(id);
      expect(parsed?.payload.reasoning).toHaveLength(2);
    });

    it('deduplicates artifacts', () => {
      const id = store.start({ input: 'x' });
      store.append(id, { artifacts: ['/a.ts'] });
      store.append(id, { artifacts: ['/a.ts', '/b.ts'] });
      store.append(id, { artifacts: ['/b.ts', '/c.ts'] });

      const parsed = store.getParsed(id);
      expect(parsed?.payload.artifacts).toEqual(['/a.ts', '/b.ts', '/c.ts']);
    });

    it('is a no-op for non-existent id', () => {
      expect(() => store.append(999, { toolCalls: [] })).not.toThrow();
    });
  });

  // ── finalize ──────────────────────────────────────────────

  describe('finalize', () => {
    it('sets outcome and output', () => {
      const id = store.start({ input: 'x' });
      store.finalize(id, { outcome: 'success', output: 'Done!' });

      const parsed = store.getParsed(id);
      expect(parsed?.outcome).toBe('success');
      expect(parsed?.payload.output).toBe('Done!');
      expect(parsed?.finalized_at).not.toBeNull();
    });

    it('preserves the starting model unless finalization supplies the actual model', () => {
      const unchangedId = store.start({ input: 'x', model: 'primary-model' });
      const unchanged = store.finalize(unchangedId, { outcome: 'success', output: 'primary result' });
      expect(unchanged?.model).toBe('primary-model');
      expect(store.get(unchangedId)?.model).toBe('primary-model');

      const fallbackId = store.start({ input: 'x', model: 'primary-model' });
      const fallback = store.finalize(fallbackId, {
        outcome: 'success',
        output: 'fallback result',
        model: 'fallback-model',
      });
      expect(fallback?.model).toBe('fallback-model');
      expect(store.get(fallbackId)?.model).toBe('fallback-model');
    });

    it('preserves appended events when not passed explicitly', () => {
      const id = store.start({ input: 'x' });
      const call: TraceToolCall = {
        tool: 'read_file', args: {}, result: 'ok',
        ok: true, durationMs: 1, timestamp: '2026-04-14T10:00:00Z',
      };
      store.append(id, { toolCalls: [call] });

      store.finalize(id, { outcome: 'success', output: 'Done' });

      const parsed = store.getParsed(id);
      expect(parsed?.payload.toolCalls).toHaveLength(1);
    });

    it('overwrites events when passed explicitly', () => {
      const id = store.start({ input: 'x' });
      store.append(id, {
        toolCalls: [{ tool: 'a', args: {}, result: '', ok: true, durationMs: 0, timestamp: '' }],
      });

      store.finalize(id, {
        outcome: 'success',
        output: 'Done',
        toolCalls: [],
      });

      const parsed = store.getParsed(id);
      expect(parsed?.payload.toolCalls).toEqual([]);
    });

    it('records cost and computes duration', () => {
      const id = store.start({ input: 'x' });
      const result = store.finalize(id, {
        outcome: 'verified',
        output: 'ok',
        costUsd: 0.0123,
      });
      expect(result?.cost_usd).toBeCloseTo(0.0123);
      expect(result?.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('stores harness context', () => {
      const id = store.start({ input: 'x' });
      store.finalize(id, {
        outcome: 'verified',
        output: 'phase done',
        harness: {
          harnessId: 'research-verify',
          phaseId: 'gather',
          phaseName: 'Gather sources',
          gateResults: [{ name: 'has citations', passed: true, reason: '3 urls found' }],
        },
      });

      const parsed = store.getParsed(id);
      expect(parsed?.payload.harness?.harnessId).toBe('research-verify');
      expect(parsed?.payload.harness?.gateResults?.[0].passed).toBe(true);
    });

    it('returns undefined when finalizing non-existent id', () => {
      expect(store.finalize(999, { outcome: 'success', output: '' })).toBeUndefined();
    });
  });

  // ── markCorrected ─────────────────────────────────────────

  describe('markCorrected', () => {
    it('updates outcome to corrected and stores feedback', () => {
      const id = store.start({ input: 'x' });
      store.finalize(id, { outcome: 'success', output: 'v1' });

      store.markCorrected(id, 'Wrong tone — too formal');

      const parsed = store.getParsed(id);
      expect(parsed?.outcome).toBe('corrected');
      expect(parsed?.payload.correctionFeedback).toBe('Wrong tone — too formal');
    });

    it('is a no-op for non-existent id', () => {
      expect(() => store.markCorrected(999, 'anything')).not.toThrow();
    });
  });

  // ── query ─────────────────────────────────────────────────

  describe('durable cost reservations', () => {
    it('counts a pending estimate across store restart until it is settled', () => {
      const id = store.start({ input: 'provider request' });
      const since = '2000-01-01T00:00:00.000Z';
      const reservationId = store.reserveCost(id, 0.08);
      expect(reservationId).toBeGreaterThan(0);
      expect(store.getTotalCostSince(since)).toBeCloseTo(0.08);

      const restarted = new ExecutionTraceStore(db);
      expect(restarted.getTotalCostSince(since)).toBeCloseTo(0.08);
      expect(restarted.settleReservedCost(reservationId, 0.012)).toBe(true);
      expect(restarted.get(id)?.cost_usd).toBeCloseTo(0.012);
      expect(restarted.getTotalCostSince(since)).toBeCloseTo(0.012);
    });

    it('releases a definitely pre-inference reservation', () => {
      const id = store.start({ input: 'rejected provider request' });
      const since = '2000-01-01T00:00:00.000Z';
      const reservationId = store.reserveCost(id, 0.08);
      expect(store.releaseReservedCost(reservationId)).toBe(true);
      expect(store.get(id)?.cost_usd).toBe(0);
      expect(store.getTotalCostSince(since)).toBe(0);
    });

    it('settles and releases each reservation at most once', () => {
      const settledTraceId = store.start({ input: 'settle once' });
      const settledId = store.reserveCost(settledTraceId, 0.08);
      expect(store.settleReservedCost(settledId, 0.012)).toBe(true);
      expect(store.settleReservedCost(settledId, 0.012)).toBe(false);
      expect(() => store.settleReservedCost(settledId, 0.02)).toThrow(/already settled/);
      expect(() => store.releaseReservedCost(settledId)).toThrow(/already settled/);

      const releasedTraceId = store.start({ input: 'release once' });
      const releasedId = store.reserveCost(releasedTraceId, 0.08);
      expect(store.releaseReservedCost(releasedId)).toBe(true);
      expect(store.releaseReservedCost(releasedId)).toBe(false);
      expect(() => store.settleReservedCost(releasedId, 0.01)).toThrow(/already released/);
      expect(() => store.releaseReservedCost(999)).toThrow(/does not exist/);
    });

    it('rejects invalid costs without changing the trace', () => {
      const id = store.start({ input: 'invalid cost' });
      expect(() => store.reserveCost(id, 0)).toThrow(RangeError);
      expect(() => store.settleReservedCost(id, -1)).toThrow(RangeError);
      expect(() => store.settleReservedCost(id, 1, 'not-a-date')).toThrow(RangeError);
      expect(store.get(id)?.cost_usd).toBe(0);
    });

    it('supports concurrent reservations on one trace without double counting', () => {
      const traceId = store.start({ input: 'two provider calls' });
      const first = store.reserveCost(traceId, 0.08);
      const second = store.reserveCost(traceId, 0.04);
      const since = '2000-01-01T00:00:00.000Z';

      expect(store.getTotalCostSince(since)).toBeCloseTo(0.12);
      expect(store.settleReservedCost(first, 0.012)).toBe(true);
      expect(store.getTotalCostSince(since)).toBeCloseTo(0.052);
      expect(store.releaseReservedCost(second)).toBe(true);
      expect(store.get(traceId)?.cost_usd).toBeCloseTo(0.012);
      expect(store.getTotalCostSince(since)).toBeCloseTo(0.012);
    });

    it('attributes pending reservations by reservation time rather than trace creation', () => {
      const traceId = store.start({ input: 'old trace' });
      db.getDatabase().prepare(`
        UPDATE execution_traces SET created_at = '2020-01-01 00:00:00' WHERE id = ?
      `).run(traceId);

      store.reserveCost(traceId, 0.03, '2026-08-12T12:00:00.000Z');
      expect(store.getTotalCostSince('2026-08-12T00:00:00.000Z')).toBeCloseTo(0.03);
    });

    it('rolls a failed settlement transaction back to the pending estimate', () => {
      const traceId = store.start({ input: 'atomic settlement' });
      const reservationId = store.reserveCost(traceId, 0.08);
      db.getDatabase().prepare(`
        CREATE TRIGGER fail_reserved_spend_insert
        BEFORE INSERT ON execution_trace_spend
        BEGIN SELECT RAISE(ABORT, 'simulated settlement failure'); END
      `).run();

      expect(() => store.settleReservedCost(reservationId, 0.012))
        .toThrow('simulated settlement failure');
      expect(store.getTotalCostSince('2000-01-01T00:00:00.000Z')).toBeCloseTo(0.08);
      expect(db.getDatabase().prepare(`
        SELECT state FROM execution_trace_spend_reservations WHERE id = ?
      `).get(reservationId)).toEqual({ state: 'pending' });
    });

    it('rolls a failed release transaction back to pending', () => {
      const traceId = store.start({ input: 'atomic release' });
      const reservationId = store.reserveCost(traceId, 0.08);
      db.getDatabase().prepare(`
        CREATE TRIGGER fail_reserved_spend_release
        BEFORE UPDATE ON execution_trace_spend_reservations
        WHEN NEW.state = 'released'
        BEGIN SELECT RAISE(ABORT, 'simulated release failure'); END
      `).run();

      expect(() => store.releaseReservedCost(reservationId))
        .toThrow('simulated release failure');
      expect(store.getTotalCostSince('2000-01-01T00:00:00.000Z')).toBeCloseTo(0.08);
      expect(db.getDatabase().prepare(`
        SELECT state FROM execution_trace_spend_reservations WHERE id = ?
      `).get(reservationId)).toEqual({ state: 'pending' });
    });

    it('preserves legacy and provisional spend without double counting', () => {
      const traceId = store.start({ input: 'mixed ledger' });
      store.recordCost(traceId, 0.01, '2026-08-12T10:00:00.000Z');
      const reservationId = store.reserveCost(traceId, 0.08, '2026-08-12T11:00:00.000Z');
      const since = '2026-08-12T00:00:00.000Z';

      expect(store.getTotalCostSince(since)).toBeCloseTo(0.09);
      expect(store.settleReservedCost(reservationId, 0.012)).toBe(true);
      expect(store.getTotalCostSince(since)).toBeCloseTo(0.022);
      expect(store.get(traceId)?.cost_usd).toBeCloseTo(0.022);
    });

    it('fails closed for missing traces and invalid reservation timestamps', () => {
      expect(() => store.reserveCost(999, 0.08)).toThrow(/does not exist/);
      const traceId = store.start({ input: 'invalid timestamp' });
      expect(() => store.reserveCost(traceId, 0.08, 'not-a-date')).toThrow(RangeError);
      expect(store.getTotalCostSince('2000-01-01T00:00:00.000Z')).toBe(0);
    });

    it('preserves later legacy cost after a released reservation tombstone', () => {
      const traceId = store.start({ input: 'released then finalized' });
      const reservationId = store.reserveCost(traceId, 0.08);
      expect(store.releaseReservedCost(reservationId)).toBe(true);
      store.finalize(traceId, { outcome: 'success', output: 'done', costUsd: 0.02 });
      expect(store.getTotalCostSince('2000-01-01T00:00:00.000Z')).toBeCloseTo(0.02);
    });

    it('does not attach a new reservation to a finalized trace', () => {
      const traceId = store.start({ input: 'already complete' });
      store.finalize(traceId, { outcome: 'success', output: 'done' });
      expect(() => store.reserveCost(traceId, 0.08)).toThrow(/does not exist/);
    });
  });

  describe('query', () => {
    beforeEach(() => {
      store.start({ sessionId: 's1', personaId: 'coder', input: 'a', taskShape: 'code' });
      store.start({ sessionId: 's1', personaId: 'writer', input: 'b', taskShape: 'draft' });
      store.start({ sessionId: 's2', personaId: 'coder', input: 'c', taskShape: 'code' });
    });

    it('filters by sessionId', () => {
      const rows = store.query({ sessionId: 's1' });
      expect(rows).toHaveLength(2);
    });

    it('filters by personaId', () => {
      const rows = store.query({ personaId: 'coder' });
      expect(rows).toHaveLength(2);
    });

    it('filters by taskShape', () => {
      const rows = store.query({ taskShape: 'code' });
      expect(rows).toHaveLength(2);
    });

    it('filters by single outcome', () => {
      const id = store.start({ input: 'd' });
      store.finalize(id, { outcome: 'success', output: '' });

      const rows = store.query({ outcome: 'success' });
      expect(rows).toHaveLength(1);
    });

    it('filters by multiple outcomes', () => {
      const id1 = store.start({ input: 'd' });
      store.finalize(id1, { outcome: 'success', output: '' });
      const id2 = store.start({ input: 'e' });
      store.finalize(id2, { outcome: 'verified', output: '' });

      const rows = store.query({ outcome: ['success', 'verified'] });
      expect(rows).toHaveLength(2);
    });

    it('respects limit', () => {
      expect(store.query({ limit: 2 })).toHaveLength(2);
    });

    it('returns rows in created_at DESC order', () => {
      const rows = store.query();
      expect(rows[0].id).toBeGreaterThan(rows[rows.length - 1].id);
    });

    it('combines filters with AND', () => {
      const rows = store.query({ sessionId: 's1', personaId: 'coder' });
      expect(rows).toHaveLength(1);
    });
  });

  // ── outcomeCounts ─────────────────────────────────────────

  describe('outcomeCounts', () => {
    it('aggregates counts per outcome', () => {
      const id1 = store.start({ input: 'a' });
      store.finalize(id1, { outcome: 'success', output: '' });
      const id2 = store.start({ input: 'b' });
      store.finalize(id2, { outcome: 'success', output: '' });
      const id3 = store.start({ input: 'c' });
      store.finalize(id3, { outcome: 'corrected', output: '' });
      store.start({ input: 'd' }); // pending

      const counts = store.outcomeCounts();
      expect(counts.success).toBe(2);
      expect(counts.corrected).toBe(1);
      expect(counts.pending).toBe(1);
      expect(counts.verified).toBe(0);
      expect(counts.abandoned).toBe(0);
    });

    it('scopes counts by filter', () => {
      const id1 = store.start({ sessionId: 's1', input: 'a' });
      store.finalize(id1, { outcome: 'success', output: '' });
      const id2 = store.start({ sessionId: 's2', input: 'b' });
      store.finalize(id2, { outcome: 'success', output: '' });

      const counts = store.outcomeCounts({ sessionId: 's1' });
      expect(counts.success).toBe(1);
    });
  });

  // ── delete / clear / count ────────────────────────────────

  describe('delete / clear / count', () => {
    it('deletes a single trace', () => {
      const id = store.start({ input: 'x' });
      expect(store.get(id)).toBeDefined();
      store.delete(id);
      expect(store.get(id)).toBeUndefined();
    });

    it('clears all traces', () => {
      store.start({ input: 'a' });
      store.start({ input: 'b' });
      expect(store.count()).toBe(2);
      store.clear();
      expect(store.count()).toBe(0);
    });

    it('counts with filter', () => {
      store.start({ sessionId: 's1', input: 'a' });
      store.start({ sessionId: 's1', input: 'b' });
      store.start({ sessionId: 's2', input: 'c' });
      expect(store.count({ sessionId: 's1' })).toBe(2);
    });
  });

  // ── ensureTable ───────────────────────────────────────────

  describe('ensureTable', () => {
    it('is idempotent — re-constructing the store does not fail', () => {
      const store2 = new ExecutionTraceStore(db);
      const id = store2.start({ input: 'x' });
      expect(id).toBeGreaterThan(0);
    });
  });

  // ── malformed payload recovery ────────────────────────────

  describe('payload parsing', () => {
    it('returns empty payload when JSON is corrupt', () => {
      const id = store.start({ input: 'x' });
      db.getDatabase()
        .prepare('UPDATE execution_traces SET trace_json = ? WHERE id = ?')
        .run('{ this is not json', id);

      const parsed = store.getParsed(id);
      expect(parsed?.payload.input).toBe('');
      expect(parsed?.payload.toolCalls).toEqual([]);
    });
  });
});
