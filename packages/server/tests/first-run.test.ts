/**
 * First-run detection and startup progress event tests.
 */

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MindDB } from '@waggle/core';
import { startService, isFirstRun } from '../src/local/service.js';
import type { StartupEvent, StartupPhase } from '../src/local/service.js';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-firstrun-test-'));
}

function randomPort(): number {
  return 4500 + Math.floor(Math.random() * 1000);
}

// ── isFirstRun ─────────────────────────────────────────────────────

describe('isFirstRun', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  it('returns true for empty directory (fresh install)', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    expect(isFirstRun(dir)).toBe(true);
  });

  it('returns false when personal.mind exists', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    const mind = new MindDB(path.join(dir, 'personal.mind'));
    mind.close();
    expect(isFirstRun(dir)).toBe(false);
  });

  it('returns false when default.mind exists (needs migration)', () => {
    const dir = makeTmpDir();
    tmpDirs.push(dir);
    const mind = new MindDB(path.join(dir, 'default.mind'));
    mind.close();
    expect(isFirstRun(dir)).toBe(false);
  });

  it('returns true when directory does not exist yet', () => {
    const dir = path.join(os.tmpdir(), 'waggle-nonexistent-' + Date.now());
    // Don't create it
    expect(isFirstRun(dir)).toBe(true);
  });
});

// ── onProgress callback ────────────────────────────────────────────

describe('startService onProgress', () => {
  const cleanups: Array<() => Promise<void>> = [];
  const tmpDirs: string[] = [];

  afterEach(async () => {
    for (const cleanup of cleanups) {
      await cleanup();
    }
    cleanups.length = 0;
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  it('emits progress events during startup (fresh install)', async () => {
    const dataDir = makeTmpDir();
    tmpDirs.push(dataDir);
    const port = randomPort();
    const events: StartupEvent[] = [];

    const { server } = await startService({
      dataDir,
      port,
      skipLiteLLM: true,
      onProgress: (event) => events.push(event),
    });
    cleanups.push(async () => { await server.close(); });

    // Should have emitted at least init and ready
    const phases = events.map(e => e.phase);
    expect(phases).toContain('init');
    expect(phases).toContain('ready');

    // Should NOT have migration phase (fresh install, no default.mind)
    expect(phases).not.toContain('migration');

    // Should have creating-mind phase (fresh install)
    expect(phases).toContain('creating-mind');

    // Progress should go from 0 to 1
    expect(events[0].progress).toBeLessThanOrEqual(0.2);
    expect(events[events.length - 1].progress).toBe(1);

    // All events should have messages
    for (const event of events) {
      expect(event.message).toBeTruthy();
      expect(typeof event.progress).toBe('number');
    }
  });

  it('emits migration phase when default.mind exists', async () => {
    const dataDir = makeTmpDir();
    tmpDirs.push(dataDir);

    // Create default.mind to trigger migration
    const mind = new MindDB(path.join(dataDir, 'default.mind'));
    mind.close();

    const port = randomPort();
    const events: StartupEvent[] = [];

    const { server } = await startService({
      dataDir,
      port,
      skipLiteLLM: true,
      onProgress: (event) => events.push(event),
    });
    cleanups.push(async () => { await server.close(); });

    const phases = events.map(e => e.phase);
    expect(phases).toContain('migration');
    expect(phases).toContain('ready');
  });

  it('emits litellm phase when not skipped (but still skips in test)', async () => {
    const dataDir = makeTmpDir();
    tmpDirs.push(dataDir);
    const port = randomPort();
    const events: StartupEvent[] = [];

    const { server } = await startService({
      dataDir,
      port,
      skipLiteLLM: true,
      onProgress: (event) => events.push(event),
    });
    cleanups.push(async () => { await server.close(); });

    const phases = events.map(e => e.phase);
    // Even when skipped, the litellm phase should be emitted
    expect(phases).toContain('litellm');
  });

  it('emits server phase', async () => {
    const dataDir = makeTmpDir();
    tmpDirs.push(dataDir);
    const port = randomPort();
    const events: StartupEvent[] = [];

    const { server } = await startService({
      dataDir,
      port,
      skipLiteLLM: true,
      onProgress: (event) => events.push(event),
    });
    cleanups.push(async () => { await server.close(); });

    const phases = events.map(e => e.phase);
    expect(phases).toContain('server');
  });

  it('works without onProgress callback (backward compat)', async () => {
    const dataDir = makeTmpDir();
    tmpDirs.push(dataDir);
    const port = randomPort();

    // Should not throw when no callback
    const { server } = await startService({ dataDir, port, skipLiteLLM: true });
    cleanups.push(async () => { await server.close(); });

    expect(server.server.listening).toBe(true);
  });

  it('progress values are monotonically increasing', async () => {
    const dataDir = makeTmpDir();
    tmpDirs.push(dataDir);
    const port = randomPort();
    const events: StartupEvent[] = [];

    const { server } = await startService({
      dataDir,
      port,
      skipLiteLLM: true,
      onProgress: (event) => events.push(event),
    });
    cleanups.push(async () => { await server.close(); });

    for (let i = 1; i < events.length; i++) {
      expect(events[i].progress).toBeGreaterThanOrEqual(events[i - 1].progress);
    }
  });
});
