/**
 * HarvestRunStore unit tests (M-08 — resumable harvest)
 *
 * Covers the full state machine: start → heartbeat → terminal
 * (complete | fail | abandon), plus getLatestInterrupted filtering.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB } from '../../src/mind/db.js';
import { HarvestRunStore } from '../../src/harvest/run-store.js';

describe('HarvestRunStore', () => {
  let db: MindDB;
  let store: HarvestRunStore;

  beforeEach(() => {
    db = new MindDB(':memory:');
    store = new HarvestRunStore(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('start', () => {
    it('creates a running row with the supplied source + totals + cache path', () => {
      const run = store.start('chatgpt', 100, '/tmp/foo.json');
      expect(run.id).toBeGreaterThan(0);
      expect(run.source).toBe('chatgpt');
      expect(run.status).toBe('running');
      expect(run.totalItems).toBe(100);
      expect(run.itemsSaved).toBe(0);
      expect(run.inputCachePath).toBe('/tmp/foo.json');
      expect(run.startedAt).toBeTruthy();
      expect(run.updatedAt).toBeTruthy();
      expect(run.finishedAt).toBeNull();
      expect(run.errorMessage).toBeNull();
    });

    it('defaults input_cache_path to null when omitted', () => {
      const run = store.start('claude-code', 50);
      expect(run.inputCachePath).toBeNull();
    });
  });

  describe('heartbeat', () => {
    it('updates items_saved on a running row', () => {
      const run = store.start('chatgpt', 100, '/tmp/x');
      store.heartbeat(run.id, 20);
      const after = store.getById(run.id);
      expect(after?.itemsSaved).toBe(20);
      expect(after?.status).toBe('running');
    });

    it('is a no-op on a terminal row', () => {
      const run = store.start('chatgpt', 100, '/tmp/x');
      store.complete(run.id, 100);
      store.heartbeat(run.id, 500); // should NOT take
      expect(store.getById(run.id)?.itemsSaved).toBe(100);
    });
  });

  describe('complete', () => {
    it('transitions running → completed with final items_saved + finished_at', () => {
      const run = store.start('chatgpt', 100, '/tmp/x');
      store.complete(run.id, 100);
      const after = store.getById(run.id);
      expect(after?.status).toBe('completed');
      expect(after?.itemsSaved).toBe(100);
      expect(after?.finishedAt).toBeTruthy();
    });

    it('is idempotent on already-completed rows', () => {
      const run = store.start('chatgpt', 100, '/tmp/x');
      store.complete(run.id, 100);
      const firstFinish = store.getById(run.id)?.finishedAt;
      store.complete(run.id, 9999); // no-op
      const second = store.getById(run.id);
      expect(second?.itemsSaved).toBe(100);
      expect(second?.finishedAt).toBe(firstFinish);
    });
  });

  describe('fail', () => {
    it('transitions running → failed with error message + items_saved', () => {
      const run = store.start('chatgpt', 100, '/tmp/x');
      store.heartbeat(run.id, 40);
      store.fail(run.id, 'LLM timeout', 42);
      const after = store.getById(run.id);
      expect(after?.status).toBe('failed');
      expect(after?.itemsSaved).toBe(42);
      expect(after?.errorMessage).toBe('LLM timeout');
      expect(after?.finishedAt).toBeTruthy();
    });

    it('preserves prior items_saved if none supplied', () => {
      const run = store.start('chatgpt', 100, '/tmp/x');
      store.heartbeat(run.id, 40);
      store.fail(run.id, 'boom');
      expect(store.getById(run.id)?.itemsSaved).toBe(40);
    });

    it('truncates very long error messages', () => {
      const run = store.start('chatgpt', 100, '/tmp/x');
      const long = 'x'.repeat(5000);
      store.fail(run.id, long);
      const msg = store.getById(run.id)?.errorMessage ?? '';
      expect(msg.length).toBe(2000);
    });

    it('is a no-op on a completed row', () => {
      const run = store.start('chatgpt', 100, '/tmp/x');
      store.complete(run.id, 100);
      store.fail(run.id, 'too late');
      const after = store.getById(run.id);
      expect(after?.status).toBe('completed');
      expect(after?.errorMessage).toBeNull();
    });
  });

  describe('abandon', () => {
    it('transitions running → abandoned', () => {
      const run = store.start('chatgpt', 100, '/tmp/x');
      store.abandon(run.id);
      expect(store.getById(run.id)?.status).toBe('abandoned');
    });

    it('transitions failed → abandoned', () => {
      const run = store.start('chatgpt', 100, '/tmp/x');
      store.fail(run.id, 'err');
      store.abandon(run.id);
      expect(store.getById(run.id)?.status).toBe('abandoned');
    });

    it('is a no-op on completed rows', () => {
      const run = store.start('chatgpt', 100, '/tmp/x');
      store.complete(run.id, 100);
      store.abandon(run.id);
      expect(store.getById(run.id)?.status).toBe('completed');
    });
  });

  describe('getLatestInterrupted', () => {
    it('returns null when there are no runs', () => {
      expect(store.getLatestInterrupted()).toBeNull();
    });

    it('returns null when all runs are terminal', () => {
      const a = store.start('chatgpt', 10, '/tmp/a');
      store.complete(a.id, 10);
      const b = store.start('claude', 20, '/tmp/b');
      store.abandon(b.id);
      expect(store.getLatestInterrupted()).toBeNull();
    });

    it('surfaces a running row', () => {
      const run = store.start('chatgpt', 10, '/tmp/a');
      const found = store.getLatestInterrupted();
      expect(found?.id).toBe(run.id);
    });

    it('surfaces a failed row with a cache path', () => {
      const run = store.start('chatgpt', 10, '/tmp/a');
      store.fail(run.id, 'broke');
      expect(store.getLatestInterrupted()?.id).toBe(run.id);
    });

    it('skips failed rows without a cache path', () => {
      const run = store.start('chatgpt', 10, null); // scan mode or cache-write failure
      store.fail(run.id, 'broke');
      expect(store.getLatestInterrupted()).toBeNull();
    });

    it('returns the latest of multiple interrupted rows', async () => {
      const first = store.start('chatgpt', 10, '/tmp/1');
      // Small delay so started_at differs (SQLite datetime('now') is second-resolution).
      await new Promise(resolve => setTimeout(resolve, 1100));
      const second = store.start('claude', 20, '/tmp/2');
      const found = store.getLatestInterrupted();
      expect(found?.id).toBe(second.id);
      expect(found?.id).not.toBe(first.id);
    });
  });

  describe('getAll', () => {
    it('returns runs newest-first with the given limit', async () => {
      store.start('chatgpt', 10, '/tmp/1');
      await new Promise(resolve => setTimeout(resolve, 1100));
      store.start('claude', 20, '/tmp/2');
      const all = store.getAll(10);
      expect(all).toHaveLength(2);
      expect(all[0].source).toBe('claude'); // newest
      expect(all[1].source).toBe('chatgpt');
    });
  });
});
