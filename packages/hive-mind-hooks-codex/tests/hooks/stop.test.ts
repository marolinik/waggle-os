import { describe, expect, it, afterEach, vi } from 'vitest';
import { runStop } from '../../src/hooks/stop.js';
import { makeHookCaptures, makeMockBridge } from './_test-helpers.js';
import type { HookFrame } from '@waggle/hive-mind-shim-core';

describe('codex stop handler', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads the codex last_assistant_message and saves an important frame', async () => {
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    await runStop({
      readStdin: async () => JSON.stringify({
        last_assistant_message: 'Here is the answer to your question about X.',
        cwd: '/proj/foo',
        session_id: 'sess-9',
      }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    expect(bridge.saveMemory).toHaveBeenCalledTimes(1);
    const frame = bridge.saveMemory.mock.calls[0][0] as HookFrame;
    expect(frame.source).toBe('codex');
    expect(frame.scope).toBe('sess-9');
    expect(['important', 'critical']).toContain(frame.importance);
    expect(frame.content.length).toBeGreaterThan(0);
    expect(cap.exits).toEqual([0]);
  });

  it('links the Stop frame to its parent prompt frame when known', async () => {
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    await runStop({
      readStdin: async () => JSON.stringify({
        last_assistant_message: 'done',
        parent_frame_id: 'frame-prompt-1',
        session_id: 's',
      }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    const frame = bridge.saveMemory.mock.calls[0][0] as HookFrame;
    expect(frame.parent).toBe('frame-prompt-1');
  });

  it('still honours the CC response fallback keys (response / assistant_message)', async () => {
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    await runStop({
      readStdin: async () => JSON.stringify({ response: 'classic CC key', session_id: 's' }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    expect(bridge.saveMemory).toHaveBeenCalledTimes(1);
    const frame = bridge.saveMemory.mock.calls[0][0] as HookFrame;
    expect(frame.content.length).toBeGreaterThan(0);
  });

  it('skips the save when no response is present', async () => {
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    await runStop({
      readStdin: async () => '{}',
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    expect(bridge.saveMemory).not.toHaveBeenCalled();
    expect(cap.exits).toEqual([0]);
  });

  it('does NOT emit a discovery signal by default (WAGGLE_SIGNAL_EMIT off)', async () => {
    vi.stubEnv('WAGGLE_SIGNAL_EMIT', '');
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    await runStop({
      readStdin: async () => JSON.stringify({ last_assistant_message: 'hi', session_id: 's' }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    // callMcpTool is how the bridge would reach the sidecar; no emit by default.
    expect(bridge.callMcpTool).not.toHaveBeenCalled();
    expect(cap.exits).toEqual([0]);
  });

  it('FAIL-OPEN: exits 0 even when saveMemory rejects', async () => {
    const bridge = makeMockBridge({ saveMemoryThrows: new Error('cli unreachable') });
    const cap = makeHookCaptures();
    await runStop({
      readStdin: async () => JSON.stringify({ last_assistant_message: 'x', session_id: 's' }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    expect(cap.exits).toEqual([0]);
  });
});
