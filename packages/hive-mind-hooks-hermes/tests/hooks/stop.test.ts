import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runStop } from '../../src/hooks/stop.js';
import { makeHookCaptures, makeMockBridge } from './_test-helpers.js';
import type { HookFrame } from '@waggle/hive-mind-shim-core';

describe('hermes stop handler (post_llm_call — assistant_response in extra)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('summarizes the completed turn off extra.assistant_response and saves an important frame', async () => {
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    await runStop({
      readStdin: async () => JSON.stringify({
        extra: {
          assistant_response: 'Here is the answer to your question about X. It depends on the config.',
          cwd: '/proj/foo',
          conversation_id: 'conv-9',
        },
      }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    expect(bridge.saveMemory).toHaveBeenCalledTimes(1);
    const frame = bridge.saveMemory.mock.calls[0][0] as HookFrame;
    expect(frame.source).toBe('hermes');
    expect(frame.scope).toBe('conv-9');
    expect(['important', 'critical']).toContain(frame.importance);
    expect(frame.content.length).toBeGreaterThan(0);
    expect(cap.exits).toEqual([0]);
  });

  it('SAVE-ONLY: emits NO stdout (Hermes block/inject is stdout JSON, not exit codes)', async () => {
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    await runStop({
      readStdin: async () => JSON.stringify({ extra: { assistant_response: 'done', session_id: 's' } }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    expect(cap.stdout).toHaveLength(0);
    expect(cap.exits).toEqual([0]);
  });

  it('TOLERATE-NULL: no assistant_response → no save, NO throw, exits 0', async () => {
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    await runStop({
      readStdin: async () => JSON.stringify({ extra: { session_id: 'conv-2' } }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    expect(bridge.saveMemory).not.toHaveBeenCalled();
    expect(cap.exits).toEqual([0]);
  });

  it('reads the top-level response fallback when extra.assistant_response is absent', async () => {
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    await runStop({
      readStdin: async () => JSON.stringify({ response: 'inline assistant message', session_id: 's' }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    expect(bridge.saveMemory).toHaveBeenCalledTimes(1);
    const frame = bridge.saveMemory.mock.calls[0][0] as HookFrame;
    expect(frame.content.length).toBeGreaterThan(0);
  });

  it('links the Stop frame to its parent prompt frame when known (extra.parent_frame_id)', async () => {
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    await runStop({
      readStdin: async () => JSON.stringify({
        extra: {
          assistant_response: 'done with the task',
          parent_frame_id: 'frame-prompt-1',
          session_id: 's',
        },
      }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    const frame = bridge.saveMemory.mock.calls[0][0] as HookFrame;
    expect(frame.parent).toBe('frame-prompt-1');
  });

  it('does NOT emit a discovery signal by default (WAGGLE_SIGNAL_EMIT off)', async () => {
    vi.stubEnv('WAGGLE_SIGNAL_EMIT', '');
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    await runStop({
      readStdin: async () => JSON.stringify({ extra: { assistant_response: 'hi there', session_id: 's' } }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    expect(bridge.callMcpTool).not.toHaveBeenCalled();
    expect(cap.exits).toEqual([0]);
  });

  it('FAIL-OPEN: exits 0 even when saveMemory rejects', async () => {
    const bridge = makeMockBridge({ saveMemoryThrows: new Error('cli unreachable') });
    const cap = makeHookCaptures();
    await runStop({
      readStdin: async () => JSON.stringify({ extra: { assistant_response: 'some answer', session_id: 's' } }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    expect(cap.exits).toEqual([0]);
  });

  it('FAIL-OPEN: malformed stdin → no save, exits 0', async () => {
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    await runStop({
      readStdin: async () => '%%% not json %%%',
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    expect(bridge.saveMemory).not.toHaveBeenCalled();
    expect(cap.exits).toEqual([0]);
  });
});

describe('hermes stop handler — opt-in compact-on-stop (OQ-4)', () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'hmher-stop-compact-'));
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(home, { recursive: true, force: true });
  });

  // case 9
  it('DEFAULT-OFF: flag unset → save happens AND cleanupFrames NOT called', async () => {
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    await runStop({
      readStdin: async () => JSON.stringify({ extra: { assistant_response: 'an answer', session_id: 's' } }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
      now: () => 1_000_000,
      home,
    });
    expect(bridge.saveMemory).toHaveBeenCalledTimes(1);
    expect(bridge.cleanupFrames).not.toHaveBeenCalled();
    expect(cap.exits).toEqual([0]);
  });

  // case 10
  it('flag on, eligible → save happens AND cleanupFrames called, save BEFORE cleanup', async () => {
    vi.stubEnv('WAGGLE_HERMES_COMPACT_ON_STOP', '1');
    const order: string[] = [];
    const bridge = makeMockBridge();
    bridge.saveMemory.mockImplementation(async () => {
      order.push('save');
      return { id: 'frame-1', success: true, workspace: 'personal' };
    });
    bridge.cleanupFrames.mockImplementation(async () => {
      order.push('cleanup');
      return { pruned: 0 };
    });
    const cap = makeHookCaptures();
    await runStop({
      readStdin: async () => JSON.stringify({ extra: { assistant_response: 'an answer', session_id: 's' } }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
      now: () => 2_000_000,
      home,
    });
    expect(bridge.saveMemory).toHaveBeenCalledTimes(1);
    expect(bridge.cleanupFrames).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['save', 'cleanup']);
    expect(cap.exits).toEqual([0]);
  });

  // case 11
  it('flag on, eligible, cleanupFrames rejects → exits 0 and saveMemory still called once', async () => {
    vi.stubEnv('WAGGLE_HERMES_COMPACT_ON_STOP', '1');
    const bridge = makeMockBridge();
    bridge.cleanupFrames.mockRejectedValueOnce(new Error('cli unreachable'));
    const cap = makeHookCaptures();
    await runStop({
      readStdin: async () => JSON.stringify({ extra: { assistant_response: 'an answer', session_id: 's' } }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
      now: () => 3_000_000,
      home,
    });
    expect(cap.exits).toEqual([0]);
    expect(bridge.saveMemory).toHaveBeenCalledTimes(1);
  });

  // case 12
  it('flag on, no assistant_response (no save) → cleanupFrames still gate-eligible and runs, exits 0', async () => {
    vi.stubEnv('WAGGLE_HERMES_COMPACT_ON_STOP', '1');
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    await runStop({
      readStdin: async () => JSON.stringify({ extra: { session_id: 's' } }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
      now: () => 4_000_000,
      home,
    });
    expect(bridge.saveMemory).not.toHaveBeenCalled();
    expect(bridge.cleanupFrames).toHaveBeenCalledTimes(1);
    expect(cap.exits).toEqual([0]);
  });

  // case 13 — save-before-compact ordering lock (flag ON)
  it('SAVE-FIRST: flag on but saveMemory rejects → cleanupFrames NOT called, exits 0', async () => {
    vi.stubEnv('WAGGLE_HERMES_COMPACT_ON_STOP', '1');
    const bridge = makeMockBridge({ saveMemoryThrows: new Error('cli fail') });
    const cap = makeHookCaptures();
    await runStop({
      readStdin: async () => JSON.stringify({ extra: { assistant_response: 'an answer', session_id: 's' } }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
      now: () => 5_000_000,
      home,
    });
    expect(bridge.cleanupFrames).not.toHaveBeenCalled();
    expect(cap.exits).toEqual([0]);
  });
});
