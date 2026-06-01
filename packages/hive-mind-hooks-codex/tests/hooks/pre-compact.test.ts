import { describe, expect, it } from 'vitest';
import { runPreCompact } from '../../src/hooks/pre-compact.js';
import { makeHookCaptures, makeMockBridge } from './_test-helpers.js';

describe('codex pre-compact handler', () => {
  it('calls cleanupFrames to merge superseded frames before host compaction', async () => {
    const bridge = makeMockBridge({ cleanupFramesResult: { pruned: 4 } });
    const cap = makeHookCaptures();
    await runPreCompact({
      readStdin: async () => JSON.stringify({ session_id: 'sess-3', trigger: 'auto' }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    expect(bridge.cleanupFrames).toHaveBeenCalledTimes(1);
    expect(cap.exits).toEqual([0]);
  });

  it('still calls cleanupFrames even when no scope/session present', async () => {
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    await runPreCompact({
      readStdin: async () => JSON.stringify({ trigger: 'manual' }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    expect(bridge.cleanupFrames).toHaveBeenCalled();
    expect(cap.exits).toEqual([0]);
  });

  it('FAIL-OPEN: exits 0 when cleanupFrames rejects', async () => {
    const bridge = makeMockBridge();
    bridge.cleanupFrames.mockRejectedValueOnce(new Error('cli unreachable'));
    const cap = makeHookCaptures();
    await runPreCompact({
      readStdin: async () => '{}',
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    expect(cap.exits).toEqual([0]);
  });
});
