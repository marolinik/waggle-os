import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { FastifyInstance } from 'fastify';
import { buildLocalServer } from '../../src/local/index.js';

/**
 * Integration test for the pre:memory-write lint handler registered in chat.ts.
 * Fires the real hook through the server's shared HookRegistry and asserts that
 * capability-failure symptoms are cancelled (and routed to the improvement-signal
 * path) while normal memories and dramatic-but-legitimate claims pass through.
 */
describe('pre:memory-write capability-symptom lint (handler integration)', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-memlint-test-'));
    server = await buildLocalServer({ dataDir: tmpDir });
  });

  afterAll(async () => {
    await server.close();
    await new Promise((r) => setTimeout(r, 100));
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors on Windows (EBUSY)
    }
  });

  it('cancels a capability-failure symptom write and records an improvement signal', async () => {
    const { hookRegistry, orchestrator } = server.agentState;
    const store = orchestrator.getImprovementSignals();
    const before = store.getByCategory('capability_gap').length;

    const result = await hookRegistry.fire('pre:memory-write', {
      toolName: 'save_memory',
      memoryContent: 'The Slack connector failed to authenticate.',
    });

    expect(result.cancelled).toBe(true);
    expect(result.reason).toMatch(/capability/i);
    expect(result.reason).toMatch(/acquire_capability/);

    const after = store.getByCategory('capability_gap');
    expect(after.length).toBe(before + 1);
  });

  it('allows a normal memory (tool preference) to pass', async () => {
    const { hookRegistry } = server.agentState;
    const result = await hookRegistry.fire('pre:memory-write', {
      toolName: 'save_memory',
      memoryContent: 'User prefers Slack over email for notifications.',
    });

    expect(result.cancelled).toBe(false);
  });

  it('does not block a dramatic-but-legitimate claim (warn-only behavior preserved)', async () => {
    const { hookRegistry } = server.agentState;
    const result = await hookRegistry.fire('pre:memory-write', {
      toolName: 'save_memory',
      memoryContent: 'The client wants to cancel the contract immediately, right now.',
    });

    expect(result.cancelled).toBe(false);
  });
});
