import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { MindDB } from '@waggle/hive-mind-core';
import { CronStore, type CreateScheduleInput, type SavePendingActionInput } from '../src/cron-store.js';

describe('CronStore', () => {
  let tmpDir: string;
  let db: MindDB;
  let store: CronStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-cron-'));
    db = new MindDB(path.join(tmpDir, 'test.mind'));
    store = new CronStore(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeInput(overrides?: Partial<CreateScheduleInput>): CreateScheduleInput {
    return {
      name: 'Daily backup',
      cronExpr: '0 9 * * *',       // every day at 9am
      jobType: 'memory_consolidation',
      ...overrides,
    };
  }

  it('create with valid cron computes next_run_at in the future', () => {
    const schedule = store.create(makeInput());
    expect(schedule.id).toBeGreaterThan(0);
    expect(schedule.name).toBe('Daily backup');
    expect(schedule.cron_expr).toBe('0 9 * * *');
    expect(schedule.job_type).toBe('memory_consolidation');
    expect(schedule.enabled).toBe(1);
    expect(schedule.next_run_at).toBeTruthy();
    // next_run_at should be in the future
    expect(new Date(schedule.next_run_at!).getTime()).toBeGreaterThan(Date.now());
  });

  it('create with invalid cron expression throws', () => {
    expect(() => store.create(makeInput({ cronExpr: 'not a cron' }))).toThrow();
  });

  it('create agent_task without workspaceId throws', () => {
    expect(() =>
      store.create(makeInput({ jobType: 'agent_task' })),
    ).toThrow(/workspace/i);
  });

  it('create loop job type round-trips with its job_config', () => {
    const schedule = store.create(makeInput({
      jobType: 'loop',
      jobConfig: { prompt: 'Summarize what changed in this workspace.' },
    }));
    expect(schedule.job_type).toBe('loop');
    expect(JSON.parse(schedule.job_config).prompt).toBe('Summarize what changed in this workspace.');
  });

  it('create loop without workspaceId succeeds (loops can run on the personal mind)', () => {
    const schedule = store.create(makeInput({ jobType: 'loop' }));
    expect(schedule.job_type).toBe('loop');
    expect(schedule.workspace_id).toBeNull();
  });

  it('create agent_task with workspaceId succeeds', () => {
    const schedule = store.create(makeInput({
      jobType: 'agent_task',
      workspaceId: 'ws-123',
    }));
    expect(schedule.job_type).toBe('agent_task');
    expect(schedule.workspace_id).toBe('ws-123');
  });

  it('list returns schedules ordered by name', () => {
    store.create(makeInput({ name: 'Zebra task' }));
    store.create(makeInput({ name: 'Alpha task' }));
    store.create(makeInput({ name: 'Middle task' }));

    const list = store.list();
    expect(list).toHaveLength(3);
    expect(list[0].name).toBe('Alpha task');
    expect(list[1].name).toBe('Middle task');
    expect(list[2].name).toBe('Zebra task');
  });

  it('getById returns the schedule when found', () => {
    const created = store.create(makeInput({ name: 'Findable' }));
    const found = store.getById(created.id);
    expect(found).toBeDefined();
    expect(found!.name).toBe('Findable');
  });

  it('getById returns undefined when not found', () => {
    const found = store.getById(99999);
    expect(found).toBeUndefined();
  });

  it('update changes name and enabled', () => {
    const created = store.create(makeInput());
    store.update(created.id, { name: 'Renamed', enabled: false });

    const updated = store.getById(created.id)!;
    expect(updated.name).toBe('Renamed');
    expect(updated.enabled).toBe(0);
  });

  it('update cronExpr recomputes next_run_at', () => {
    const created = store.create(makeInput({ cronExpr: '0 9 * * *' }));
    const originalNext = created.next_run_at;

    // Change to every minute — next_run_at should change
    store.update(created.id, { cronExpr: '*/1 * * * *' });
    const updated = store.getById(created.id)!;
    expect(updated.cron_expr).toBe('*/1 * * * *');
    expect(updated.next_run_at).toBeTruthy();
    // The new next_run_at should differ (different schedule)
    // Both should be valid ISO dates
    expect(new Date(updated.next_run_at!).getTime()).toBeGreaterThan(0);
  });

  it('delete removes the schedule', () => {
    const created = store.create(makeInput());
    store.delete(created.id);
    expect(store.getById(created.id)).toBeUndefined();
  });

  it('getDue returns only enabled past-due schedules', () => {
    const raw = db.getDatabase();

    // Create two schedules: one past-due, one future
    store.create(makeInput({ name: 'Future job' }));

    // Manually insert a past-due schedule
    raw.prepare(`
      INSERT INTO cron_schedules (name, cron_expr, job_type, job_config, enabled, next_run_at, created_at)
      VALUES (?, ?, ?, ?, 1, datetime('now', '-1 hour'), datetime('now'))
    `).run('Past due job', '0 9 * * *', 'memory_consolidation', '{}');

    const due = store.getDue();
    expect(due).toHaveLength(1);
    expect(due[0].name).toBe('Past due job');
  });

  it('getDue excludes disabled schedules', () => {
    const raw = db.getDatabase();

    // Insert a past-due but disabled schedule
    raw.prepare(`
      INSERT INTO cron_schedules (name, cron_expr, job_type, job_config, enabled, next_run_at, created_at)
      VALUES (?, ?, ?, ?, 0, datetime('now', '-1 hour'), datetime('now'))
    `).run('Disabled job', '0 9 * * *', 'memory_consolidation', '{}');

    const due = store.getDue();
    expect(due).toHaveLength(0);
  });

  it('markRun updates last_run_at and recomputes next_run_at', () => {
    const created = store.create(makeInput({ cronExpr: '0 9 * * *' }));
    expect(created.last_run_at).toBeNull();

    store.markRun(created.id);
    const updated = store.getById(created.id)!;
    expect(updated.last_run_at).toBeTruthy();
    expect(updated.next_run_at).toBeTruthy();
    // next_run_at should be in the future
    expect(new Date(updated.next_run_at!).getTime()).toBeGreaterThan(Date.now());
  });

  it('pruneExecutionHistory deletes only rows older than the cutoff', () => {
    const created = store.create(makeInput());
    // A fresh row (executed_at = now) must survive the prune.
    store.recordExecution(created.id, created.name, { success: true });
    // A back-dated row beyond the 30-day retention must go.
    db.getDatabase().prepare(`
      INSERT INTO cron_execution_history (schedule_id, schedule_name, executed_at, success)
      VALUES (?, ?, datetime('now', '-40 days'), 1)
    `).run(created.id, created.name);
    expect(store.getExecutionHistory(created.id)).toHaveLength(2);

    const deleted = store.pruneExecutionHistory(30);
    expect(deleted).toBe(1);

    const remaining = store.getExecutionHistory(created.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].success).toBe(1);
  });

  describe('pending_actions (L2 held-action queue)', () => {
    function held(over?: Partial<SavePendingActionInput>): SavePendingActionInput {
      return {
        id: 'pa-1', workspaceId: null, source: 'loop:1', toolName: 'send_email',
        argsJson: JSON.stringify({ to: 'x@y.z', subject: 'hi' }), summary: 'Send follow-up',
        riskLevel: 'medium', approvalClass: 'elevated', ...over,
      };
    }

    it('saves and lists held actions, filtered by status', () => {
      store.savePendingAction(held());
      store.savePendingAction(held({ id: 'pa-2', toolName: 'write_file' }));
      const heldRows = store.listPendingActions('held');
      expect(heldRows).toHaveLength(2);
      expect(heldRows.map(r => r.tool_name).sort()).toEqual(['send_email', 'write_file']);
      expect(store.listPendingActions('executed')).toHaveLength(0);
    });

    it('claimPendingAction is an atomic idempotency gate (double-claim no-ops)', () => {
      store.savePendingAction(held());
      const first = store.claimPendingAction('pa-1', 'approved', '2026-06-29T10:00:00Z');
      expect(first?.status).toBe('approved');
      expect(first?.decided_at).toBe('2026-06-29T10:00:00Z');
      // A second claim (double-approve / approve-after-deny) wins nothing.
      expect(store.claimPendingAction('pa-1', 'approved', '2026-06-29T10:05:00Z')).toBeUndefined();
      expect(store.claimPendingAction('pa-1', 'denied', '2026-06-29T10:05:00Z')).toBeUndefined();
      // Unknown id → undefined.
      expect(store.claimPendingAction('nope', 'approved', '2026-06-29T10:00:00Z')).toBeUndefined();
    });

    it('updatePendingActionResult records the terminal outcome after a claim', () => {
      store.savePendingAction(held());
      store.claimPendingAction('pa-1', 'approved', '2026-06-29T10:00:00Z');
      store.updatePendingActionResult('pa-1', { status: 'executed', resultSummary: 'sent', executedAt: '2026-06-29T10:01:00Z' });
      const row = store.getPendingAction('pa-1');
      expect(row?.status).toBe('executed');
      expect(row?.result_summary).toBe('sent');
      expect(row?.executed_at).toBe('2026-06-29T10:01:00Z');
    });

    it('persists held actions across a DB reopen (durable queue)', () => {
      store.savePendingAction(held());
      db.close();
      db = new MindDB(path.join(tmpDir, 'test.mind'));
      store = new CronStore(db);
      const rows = store.listPendingActions('held');
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe('pa-1');
    });

    it('expireStalePendingActions flips past-due held rows to expired', () => {
      store.savePendingAction(held({ expiresAt: '2000-01-01T00:00:00Z' }));        // long past
      store.savePendingAction(held({ id: 'pa-2', expiresAt: '2999-01-01T00:00:00Z' })); // future
      expect(store.expireStalePendingActions()).toBe(1);
      expect(store.listPendingActions('held').map(r => r.id)).toEqual(['pa-2']);
      expect(store.listPendingActions('expired').map(r => r.id)).toEqual(['pa-1']);
    });
  });
});
