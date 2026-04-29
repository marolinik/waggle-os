import { describe, expect, it } from 'vitest';
import { preCompactHandler, runPreCompact } from '../../src/hooks/pre-compact.js';
import { makeHookCaptures, makeMockBridge } from './_test-helpers.js';

describe('pre-compact handler', () => {
  it('extracts scope from session_id, sessionId, or scope', () => {
    expect(preCompactHandler.parse({ session_id: 'a' }).scope).toBe('a');
    expect(preCompactHandler.parse({ sessionId: 'b' }).scope).toBe('b');
    expect(preCompactHandler.parse({ scope: 'c' }).scope).toBe('c');
    expect(preCompactHandler.parse({}).scope).toBeUndefined();
  });

  it('calls cleanupFrames (Commit 1.4 renamed from compactMemory)', async () => {
    const bridge = makeMockBridge({ cleanupFramesResult: { pruned: 4 } });
    const cap = makeHookCaptures();
    await runPreCompact({
      readStdin: async () => JSON.stringify({ session_id: 'sess-3' }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    expect(bridge.cleanupFrames).toHaveBeenCalledTimes(1);
    expect(cap.exits).toEqual([0]);
  });

  it('still calls cleanupFrames even when no scope present', async () => {
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    await runPreCompact({
      readStdin: async () => '{}',
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    expect(bridge.cleanupFrames).toHaveBeenCalled();
  });

  it('exits 0 when cleanupFrames rejects', async () => {
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
