import { describe, expect, it } from 'vitest';
import { checkReadiness } from '../src/readiness.js';

describe('checkReadiness', () => {
  it('is ready when every dependency answers', async () => {
    const { report, errors } = await checkReadiness([
      { name: 'database', check: async () => 1 },
      { name: 'redis', check: async () => 'PONG' },
    ]);
    expect(report.status).toBe('ready');
    expect(report.checks).toEqual({ database: { ok: true }, redis: { ok: true } });
    expect(errors).toEqual({});
  });

  it('reports a failing dependency with a coarse reason and keeps the error for the log', async () => {
    const failure = new Error('connect ECONNREFUSED postgres://admin:secret@db.internal:5432');
    const { report, errors } = await checkReadiness([
      { name: 'database', check: async () => { throw failure; } },
      { name: 'redis', check: async () => 'PONG' },
    ]);
    expect(report.status).toBe('not_ready');
    expect(report.checks.database).toEqual({ ok: false, reason: 'unavailable' });
    expect(report.checks.redis).toEqual({ ok: true });
    // The public report never carries the error text, which can hold credentials.
    expect(JSON.stringify(report)).not.toContain('secret');
    expect(errors.database).toBe(failure);
  });

  it('times out a dependency that never answers', async () => {
    const { report } = await checkReadiness([
      { name: 'redis', check: () => new Promise(() => {}) },
    ], 20);
    expect(report.status).toBe('not_ready');
    expect(report.checks.redis).toEqual({ ok: false, reason: 'timeout' });
  });
});
