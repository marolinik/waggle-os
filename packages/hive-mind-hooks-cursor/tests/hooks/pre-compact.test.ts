import { describe, expect, it } from 'vitest';
import { runPreCompact } from '../../src/hooks/pre-compact.js';
import { makeHookCaptures, makeMockBridge } from './_test-helpers.js';

describe('cursor pre-compact handler (preCompact — observational, fire-and-forget)', () => {
  it('calls cleanupFrames to merge superseded frames before host compaction', async () => {
    const bridge = makeMockBridge({ cleanupFramesResult: { pruned: 4 } });
    const cap = makeHookCaptures();
    await runPreCompact({
      readStdin: async () => JSON.stringify({ conversation_id: 'conv-3' }),
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
      readStdin: async () => '{}',
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
