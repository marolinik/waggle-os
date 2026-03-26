import { describe, it, expect, beforeEach } from 'vitest';
import {
  backgroundTasks,
  cleanupStaleTasks,
  MAX_BACKGROUND_TASKS,
  STALE_TASK_THRESHOLD_MS,
} from '../src/system-tools.js';

describe('Background Task Cleanup (11B-6)', () => {
  beforeEach(() => {
    // Kill any running tasks before clearing
    for (const [, task] of backgroundTasks) {
      if (task.status === 'running') {
        try { task.process.kill(); } catch { /* ignore */ }
      }
    }
    backgroundTasks.clear();
  });

  it('MAX_BACKGROUND_TASKS is 100', () => {
    expect(MAX_BACKGROUND_TASKS).toBe(100);
  });

  it('STALE_TASK_THRESHOLD_MS is 30 minutes', () => {
    expect(STALE_TASK_THRESHOLD_MS).toBe(30 * 60 * 1000);
  });

  it('cleanupStaleTasks removes completed tasks older than 30 minutes', () => {
    const now = Date.now();
    const old = now - STALE_TASK_THRESHOLD_MS - 1000;
    const recent = now - 1000;

    backgroundTasks.set('old-1', {
      process: null as any,
      stdout: '',
      stderr: '',
      status: 'completed',
      exitCode: 0,
      createdAt: old,
    });

    backgroundTasks.set('old-2', {
      process: null as any,
      stdout: '',
      stderr: '',
      status: 'failed',
      exitCode: 1,
      createdAt: old - 5000,
    });

    backgroundTasks.set('recent-1', {
      process: null as any,
      stdout: '',
      stderr: '',
      status: 'completed',
      exitCode: 0,
      createdAt: recent,
    });

    const removed = cleanupStaleTasks();
    expect(removed).toBe(2);
    expect(backgroundTasks.size).toBe(1);
    expect(backgroundTasks.has('recent-1')).toBe(true);
  });

  it('cleanupStaleTasks does NOT remove running tasks even if old', () => {
    const old = Date.now() - STALE_TASK_THRESHOLD_MS - 10_000;

    backgroundTasks.set('running-old', {
      process: null as any,
      stdout: '',
      stderr: '',
      status: 'running',
      createdAt: old,
    });

    const removed = cleanupStaleTasks();
    expect(removed).toBe(0);
    expect(backgroundTasks.size).toBe(1);
  });

  it('cleanupStaleTasks returns 0 when nothing is stale', () => {
    backgroundTasks.set('fresh', {
      process: null as any,
      stdout: '',
      stderr: '',
      status: 'completed',
      exitCode: 0,
      createdAt: Date.now(),
    });

    expect(cleanupStaleTasks()).toBe(0);
  });

  it('background tasks have createdAt timestamp', () => {
    const before = Date.now();
    backgroundTasks.set('test', {
      process: null as any,
      stdout: '',
      stderr: '',
      status: 'completed',
      exitCode: 0,
      createdAt: before,
    });

    const task = backgroundTasks.get('test');
    expect(task).toBeDefined();
    expect(task!.createdAt).toBe(before);
  });
});
