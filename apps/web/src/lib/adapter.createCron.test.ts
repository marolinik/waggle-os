/**
 * M-44 / P26 — guard the POST /api/cron contract from the client side.
 *
 * Prior shape sent `{ name, schedule, workspaceId, enabled }` which the
 * server (`cron.ts:47-49`) rejected with 400 because both `cronExpr`
 * and `jobType` are required. This test pins the corrected payload so
 * a regression shows up in CI, not in a user's "why won't my job
 * create" moment.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import LocalAdapter from './adapter';

describe('LocalAdapter.createCronJob', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 42,
          name: 'Nightly consolidation',
          cronExpr: '0 9 * * *',
          jobType: 'memory_consolidation',
          workspaceId: '',
          enabled: true,
          lastRunAt: null,
          nextRunAt: '2026-04-20T09:00:00Z',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('POSTs cronExpr + jobType to /api/cron (not legacy `schedule`)', async () => {
    const adapter = new LocalAdapter('http://test:1');
    await adapter.createCronJob({
      name: 'Nightly consolidation',
      cronExpr: '0 9 * * *',
      jobType: 'memory_consolidation',
      enabled: true,
    });

    const [url, init] = fetchSpy.mock.calls[0] as [string | URL, RequestInit];
    expect(String(url)).toBe('http://test:1/api/cron');
    expect(init.method).toBe('POST');

    const body = JSON.parse(init.body as string);
    expect(body.name).toBe('Nightly consolidation');
    expect(body.cronExpr).toBe('0 9 * * *');
    expect(body.jobType).toBe('memory_consolidation');
    // Legacy `schedule` must NOT be sent — server schema no longer
    // accepts it and including it would fail strict-mode validators.
    expect(body).not.toHaveProperty('schedule');
  });

  it('normalizes the server response back to the legacy client shape', async () => {
    // Server emits cronExpr / lastRunAt / nextRunAt; UI consumers still
    // read schedule / lastRun / nextRun. Ensure the remap hides that.
    const adapter = new LocalAdapter('http://test:1');
    const job = await adapter.createCronJob({
      name: 'Nightly',
      cronExpr: '0 9 * * *',
      jobType: 'memory_consolidation',
    });
    expect(job.schedule).toBe('0 9 * * *');
    expect(job.nextRun).toBe('2026-04-20T09:00:00Z');
    expect(job.enabled).toBe(true);
  });

  it('forwards jobConfig + workspaceId when provided', async () => {
    const adapter = new LocalAdapter('http://test:1');
    await adapter.createCronJob({
      name: 'Scoped',
      cronExpr: '*/5 * * * *',
      jobType: 'agent_task',
      workspaceId: 'ws-42',
      jobConfig: { prompt: 'hi' },
    });

    const [, init] = fetchSpy.mock.calls[0] as [string | URL, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.workspaceId).toBe('ws-42');
    expect(body.jobConfig).toEqual({ prompt: 'hi' });
  });
});
