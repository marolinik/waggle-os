import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSystemTools, backgroundTasks } from '../src/system-tools.js';
import type { ToolDefinition } from '../src/tools.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('background bash, get_task_output, kill_task', () => {
  let workspace: string;
  let tools: ToolDefinition[];

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-bg-test-'));
    tools = createSystemTools(workspace);
    // Clear background tasks between tests
    backgroundTasks.clear();
  });

  afterEach(async () => {
    // Kill any remaining background tasks
    for (const [, task] of backgroundTasks) {
      if (task.status === 'running') {
        try { task.process.kill(); } catch { /* ignore */ }
      }
    }
    backgroundTasks.clear();

    for (let i = 0; i < 5; i++) {
      try {
        fs.rmSync(workspace, { recursive: true, force: true });
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  });

  function getTool(name: string): ToolDefinition {
    const tool = tools.find((t) => t.name === name);
    if (!tool) throw new Error(`Tool "${name}" not found`);
    return tool;
  }

  describe('bash default timeout change', () => {
    it('has 120s default timeout in description', () => {
      const bash = getTool('bash');
      const props = (bash.parameters as any).properties;
      expect(props.timeout.description).toContain('120000');
    });
  });

  describe('bash run_in_background', () => {
    it('returns a task ID immediately', async () => {
      const bash = getTool('bash');
      const result = await bash.execute({
        command: 'echo hello',
        run_in_background: true,
      });
      expect(result).toContain('Background task started');
      expect(result).toContain('Task ID:');
    });

    it('task completes with output', async () => {
      const bash = getTool('bash');
      const result = await bash.execute({
        command: 'echo background_output',
        run_in_background: true,
      });
      const taskId = result.split('Task ID: ')[1].trim();

      // Wait for task to complete
      await new Promise((r) => setTimeout(r, 2000));

      const getOutput = getTool('get_task_output');
      const output = await getOutput.execute({ task_id: taskId });
      expect(output).toContain('completed');
      expect(output).toContain('background_output');
    }, 10_000);

    it('foreground bash still works normally', async () => {
      const bash = getTool('bash');
      const result = await bash.execute({ command: 'echo sync_output' });
      expect(result.trim()).toBe('sync_output');
    });

    it('custom timeout works for foreground commands', async () => {
      const bash = getTool('bash');
      const isWindows = process.platform === 'win32';
      const sleepCmd = isWindows ? 'ping -n 30 127.0.0.1' : 'sleep 30';
      const result = await bash.execute({ command: sleepCmd, timeout: 1000 });
      expect(result.toLowerCase()).toContain('timeout');
    }, 10_000);
  });

  describe('get_task_output', () => {
    it('returns error for unknown task ID', async () => {
      const getOutput = getTool('get_task_output');
      const result = await getOutput.execute({ task_id: 'nonexistent-id' });
      expect(result).toContain('No background task found');
    });

    it('shows running status for long-running task', async () => {
      const bash = getTool('bash');
      const isWindows = process.platform === 'win32';
      const sleepCmd = isWindows ? 'ping -n 30 127.0.0.1' : 'sleep 30';
      const result = await bash.execute({
        command: sleepCmd,
        run_in_background: true,
      });
      const taskId = result.split('Task ID: ')[1].trim();

      const getOutput = getTool('get_task_output');
      const output = await getOutput.execute({ task_id: taskId });
      expect(output).toContain('Status: running');
    });

    it('shows exit code after completion', async () => {
      const bash = getTool('bash');
      const result = await bash.execute({
        command: 'echo done',
        run_in_background: true,
      });
      const taskId = result.split('Task ID: ')[1].trim();

      await new Promise((r) => setTimeout(r, 2000));

      const getOutput = getTool('get_task_output');
      const output = await getOutput.execute({ task_id: taskId });
      expect(output).toContain('Exit code: 0');
    }, 10_000);

    it('shows failed status for non-zero exit', async () => {
      const bash = getTool('bash');
      const isWindows = process.platform === 'win32';
      const failCmd = isWindows ? 'cmd /c exit 1' : 'exit 1';
      const result = await bash.execute({
        command: failCmd,
        run_in_background: true,
      });
      const taskId = result.split('Task ID: ')[1].trim();

      await new Promise((r) => setTimeout(r, 2000));

      const getOutput = getTool('get_task_output');
      const output = await getOutput.execute({ task_id: taskId });
      expect(output).toContain('failed');
    }, 10_000);
  });

  describe('kill_task', () => {
    it('kills a running background task', async () => {
      const bash = getTool('bash');
      const isWindows = process.platform === 'win32';
      const sleepCmd = isWindows ? 'ping -n 60 127.0.0.1' : 'sleep 60';
      const result = await bash.execute({
        command: sleepCmd,
        run_in_background: true,
      });
      const taskId = result.split('Task ID: ')[1].trim();

      // Give the process a moment to start
      await new Promise((r) => setTimeout(r, 500));

      const killTask = getTool('kill_task');
      const killResult = await killTask.execute({ task_id: taskId });
      expect(killResult).toContain('killed');

      // Verify status
      const getOutput = getTool('get_task_output');
      const output = await getOutput.execute({ task_id: taskId });
      expect(output).toContain('Status: killed');
    }, 10_000);

    it('returns error for unknown task ID', async () => {
      const killTask = getTool('kill_task');
      const result = await killTask.execute({ task_id: 'nonexistent' });
      expect(result).toContain('No background task found');
    });

    it('returns message for already completed task', async () => {
      const bash = getTool('bash');
      const result = await bash.execute({
        command: 'echo fast',
        run_in_background: true,
      });
      const taskId = result.split('Task ID: ')[1].trim();

      await new Promise((r) => setTimeout(r, 2000));

      const killTask = getTool('kill_task');
      const killResult = await killTask.execute({ task_id: taskId });
      expect(killResult).toContain('already');
    }, 10_000);
  });
});
