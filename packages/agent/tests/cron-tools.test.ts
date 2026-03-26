import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCronTools } from '../src/cron-tools.js';
import type { ToolDefinition } from '../src/tools.js';

describe('Cron Tools', () => {
  let tools: ToolDefinition[];
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  function getTool(name: string): ToolDefinition {
    const tool = tools.find(t => t.name === name);
    if (!tool) throw new Error(`Tool "${name}" not found`);
    return tool;
  }

  beforeEach(() => {
    tools = createCronTools();
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // ── Tool registration ─────────────────────────────────────────────────

  it('creates 4 cron tools', () => {
    expect(tools).toHaveLength(4);
    const names = tools.map(t => t.name);
    expect(names).toContain('create_schedule');
    expect(names).toContain('list_schedules');
    expect(names).toContain('delete_schedule');
    expect(names).toContain('trigger_schedule');
  });

  // ── create_schedule ───────────────────────────────────────────────────

  describe('create_schedule', () => {
    it('validates cron expression — rejects invalid', async () => {
      const tool = getTool('create_schedule');
      const result = await tool.execute({
        name: 'Test Schedule',
        cron_expression: 'not a cron',
      });

      expect(result).toContain('Error');
      expect(result).toContain('Invalid cron expression');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('validates cron expression — accepts standard 5-field', async () => {
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
        id: 1,
        name: 'Daily cleanup',
        cronExpr: '0 3 * * *',
        jobType: 'agent_task',
        enabled: true,
        nextRunAt: '2026-03-19T03:00:00.000Z',
      }), { status: 200 }));

      const tool = getTool('create_schedule');
      const result = await tool.execute({
        name: 'Daily cleanup',
        cron_expression: '0 3 * * *',
        job_type: 'agent_task',
        workspace_id: 'ws-1',
      });

      expect(result).toContain('Schedule created successfully');
      expect(result).toContain('Daily cleanup');
      expect(result).toContain('0 3 * * *');
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/cron'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"cronExpr":"0 3 * * *"'),
        }),
      );
    });

    it('validates cron expression — accepts @daily shorthand', async () => {
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
        id: 2,
        name: 'Daily task',
        cronExpr: '@daily',
        jobType: 'memory_consolidation',
        enabled: true,
        nextRunAt: '2026-03-19T00:00:00.000Z',
      }), { status: 200 }));

      const tool = getTool('create_schedule');
      const result = await tool.execute({
        name: 'Daily task',
        cron_expression: '@daily',
      });

      expect(result).toContain('Schedule created successfully');
    });

    it('validates cron expression — rejects too few fields', async () => {
      const tool = getTool('create_schedule');
      const result = await tool.execute({
        name: 'Bad',
        cron_expression: '0 3 *',
      });

      expect(result).toContain('Invalid cron expression');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('validates job_data JSON', async () => {
      const tool = getTool('create_schedule');
      const result = await tool.execute({
        name: 'Bad JSON',
        cron_expression: '0 3 * * *',
        job_data: '{not valid json}',
      });

      expect(result).toContain('Invalid JSON');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('handles API error on create', async () => {
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
        error: 'agent_task jobs require a workspace ID',
      }), { status: 400 }));

      const tool = getTool('create_schedule');
      const result = await tool.execute({
        name: 'Task without workspace',
        cron_expression: '0 3 * * *',
        job_type: 'agent_task',
      });

      expect(result).toContain('Failed to create schedule');
      expect(result).toContain('workspace ID');
    });
  });

  // ── list_schedules ────────────────────────────────────────────────────

  describe('list_schedules', () => {
    it('formats response correctly', async () => {
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
        schedules: [
          { id: 1, name: 'Memory consolidation', cronExpr: '0 3 * * *', jobType: 'memory_consolidation', enabled: true, lastRunAt: null, nextRunAt: '2026-03-19T03:00:00.000Z' },
          { id: 2, name: 'Health check', cronExpr: '0 8 * * 1', jobType: 'workspace_health', enabled: true, lastRunAt: null, nextRunAt: '2026-03-24T08:00:00.000Z' },
        ],
        count: 2,
      }), { status: 200 }));

      const tool = getTool('list_schedules');
      const result = await tool.execute({});

      expect(result).toContain('Cron Schedules (2)');
      expect(result).toContain('Memory consolidation');
      expect(result).toContain('Health check');
      expect(result).toContain('0 3 * * *');
      expect(result).toContain('0 8 * * 1');
      expect(result).toContain('memory_consolidation');
      expect(result).toContain('workspace_health');
      expect(result).toContain('yes');
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/cron'),
      );
    });

    it('handles empty list', async () => {
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
        schedules: [],
        count: 0,
      }), { status: 200 }));

      const tool = getTool('list_schedules');
      const result = await tool.execute({});

      expect(result).toContain('No cron schedules configured');
    });

    it('handles disabled schedules', async () => {
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
        schedules: [
          { id: 1, name: 'Disabled task', cronExpr: '0 0 * * *', jobType: 'agent_task', enabled: false, lastRunAt: null, nextRunAt: null },
        ],
        count: 1,
      }), { status: 200 }));

      const tool = getTool('list_schedules');
      const result = await tool.execute({});

      expect(result).toContain('Disabled task');
      expect(result).toContain('no');
    });
  });

  // ── delete_schedule ───────────────────────────────────────────────────

  describe('delete_schedule', () => {
    it('calls correct endpoint after finding by name', async () => {
      // Mock list response
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
        schedules: [
          { id: 5, name: 'Memory consolidation' },
          { id: 6, name: 'Health check' },
        ],
        count: 2,
      }), { status: 200 }));

      // Mock delete response
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true, id: 5,
      }), { status: 200 }));

      const tool = getTool('delete_schedule');
      const result = await tool.execute({ name: 'Memory consolidation' });

      expect(result).toContain('deleted successfully');
      expect(result).toContain('Memory consolidation');
      expect(result).toContain('ID: 5');

      // Verify the DELETE was to /api/cron/5
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const deleteCall = fetchSpy.mock.calls[1];
      expect(deleteCall[0]).toContain('/api/cron/5');
      expect(deleteCall[1]).toEqual(expect.objectContaining({ method: 'DELETE' }));
    });

    it('handles not-found schedule', async () => {
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
        schedules: [{ id: 1, name: 'Other schedule' }],
        count: 1,
      }), { status: 200 }));

      const tool = getTool('delete_schedule');
      const result = await tool.execute({ name: 'Nonexistent schedule' });

      expect(result).toContain('not found');
      expect(result).toContain('Nonexistent schedule');
      // Should only call list, not delete
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('case-insensitive name matching', async () => {
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
        schedules: [{ id: 3, name: 'Memory Consolidation' }],
        count: 1,
      }), { status: 200 }));

      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true, id: 3,
      }), { status: 200 }));

      const tool = getTool('delete_schedule');
      const result = await tool.execute({ name: 'memory consolidation' });

      expect(result).toContain('deleted successfully');
    });
  });

  // ── trigger_schedule ──────────────────────────────────────────────────

  describe('trigger_schedule', () => {
    it('calls correct endpoint after finding by name', async () => {
      // Mock list response
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
        schedules: [
          { id: 7, name: 'Daily cleanup' },
        ],
        count: 1,
      }), { status: 200 }));

      // Mock trigger response
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
        triggered: true,
        id: 7,
        nextRunAt: '2026-03-19T03:00:00.000Z',
      }), { status: 200 }));

      const tool = getTool('trigger_schedule');
      const result = await tool.execute({ name: 'Daily cleanup' });

      expect(result).toContain('triggered successfully');
      expect(result).toContain('Daily cleanup');
      expect(result).toContain('Next run');

      // Verify the POST was to /api/cron/7/trigger
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const triggerCall = fetchSpy.mock.calls[1];
      expect(triggerCall[0]).toContain('/api/cron/7/trigger');
      expect(triggerCall[1]).toEqual(expect.objectContaining({ method: 'POST' }));
    });

    it('handles not-found schedule', async () => {
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
        schedules: [],
        count: 0,
      }), { status: 200 }));

      const tool = getTool('trigger_schedule');
      const result = await tool.execute({ name: 'ghost-schedule' });

      expect(result).toContain('not found');
      expect(result).toContain('ghost-schedule');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('handles trigger API failure', async () => {
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
        schedules: [{ id: 8, name: 'Failing task' }],
        count: 1,
      }), { status: 200 }));

      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
        error: 'Trigger failed',
      }), { status: 500 }));

      const tool = getTool('trigger_schedule');
      const result = await tool.execute({ name: 'Failing task' });

      expect(result).toContain('Failed to trigger');
      expect(result).toContain('Trigger failed');
    });
  });

  // ── Network errors ────────────────────────────────────────────────────

  it('handles network errors gracefully in list_schedules', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const tool = getTool('list_schedules');
    const result = await tool.execute({});

    expect(result).toContain('Error listing schedules');
    expect(result).toContain('ECONNREFUSED');
  });

  it('handles network errors gracefully in create_schedule', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const tool = getTool('create_schedule');
    const result = await tool.execute({
      name: 'Test',
      cron_expression: '0 0 * * *',
    });

    expect(result).toContain('Error creating schedule');
    expect(result).toContain('ECONNREFUSED');
  });
});
