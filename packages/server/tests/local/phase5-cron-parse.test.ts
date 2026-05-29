/**
 * R1-008 regression — GET /api/cron must not 500 on a single corrupt job_config row.
 *
 * The list handler maps every stored row through toResponse(), which calls
 * JSON.parse(row.job_config). A single legacy/corrupt row with invalid JSON
 * must not throw and take down the entire schedule list — the user would lose
 * access to ALL their schedules. Bad rows should degrade gracefully.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import { MindDB, CronStore } from '@waggle/core';
import { cronRoutes } from '../../src/local/routes/cron.js';

function createTestServer(store: CronStore) {
  const server = Fastify({ logger: false });
  server.decorate('cronStore', store);
  server.register(cronRoutes);
  return server;
}

/** Insert a row with arbitrary (possibly corrupt) job_config directly. */
function seedRow(db: MindDB, name: string, jobConfig: string): number {
  const res = db.getDatabase().prepare(`
    INSERT INTO cron_schedules (name, cron_expr, job_type, job_config, workspace_id, enabled, next_run_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(name, '*/5 * * * *', 'memory_consolidation', jobConfig, null, 1, new Date().toISOString());
  return Number(res.lastInsertRowid);
}

describe('R1-008 — GET /api/cron corrupt job_config resilience', () => {
  let db: MindDB;
  let store: CronStore;
  let server: ReturnType<typeof Fastify>;

  beforeEach(() => {
    db = new MindDB(':memory:');
    store = new CronStore(db);
    server = createTestServer(store);
  });

  afterEach(async () => {
    await server.close();
    db.close();
  });

  it('returns 200 with good rows present when one row has invalid JSON job_config', async () => {
    // Two healthy rows (valid JSON), one corrupt legacy row in the middle.
    seedRow(db, 'AAA good', '{"foo":"bar"}');
    seedRow(db, 'BBB corrupt', '{not valid json'); // <-- would throw in JSON.parse
    seedRow(db, 'CCC good', '{}');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const res = await server.inject({ method: 'GET', url: '/api/cron' });

    // The whole list must NOT 500 because of one bad row.
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.count).toBe(3);
    expect(Array.isArray(body.schedules)).toBe(true);
    expect(body.schedules).toHaveLength(3);

    const byName = Object.fromEntries(
      body.schedules.map((s: { name: string }) => [s.name, s]),
    );

    // Good rows keep their parsed config.
    expect(byName['AAA good'].jobConfig).toEqual({ foo: 'bar' });
    expect(byName['CCC good'].jobConfig).toEqual({});

    // The corrupt row is still present (not dropped) and degraded to {}.
    expect(byName['BBB corrupt']).toBeDefined();
    expect(byName['BBB corrupt'].jobConfig).toEqual({});

    // A warning should be logged for the bad row (never silently swallowed).
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('returns 200 with empty list when there are no schedules', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/cron' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.count).toBe(0);
    expect(body.schedules).toEqual([]);
  });
});
