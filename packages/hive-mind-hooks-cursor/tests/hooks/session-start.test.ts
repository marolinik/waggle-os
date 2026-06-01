import { describe, expect, it } from 'vitest';
import { runSessionStart } from '../../src/hooks/session-start.js';
import { makeHookCaptures, makeMockBridge } from './_test-helpers.js';
import type { MemoryHit } from '@waggle/hive-mind-shim-core';

const HIT_FIXTURE: MemoryHit = {
  id: 1,
  content: '[hm src:cursor event:stop] past observation',
  importance: 'important',
  source: 'system',
  score: 0.87,
  created_at: '2026-04-28T10:00:00.000Z',
  from: 'personal',
};

describe('cursor session-start handler', () => {
  it('recalls personal-scoped frames and injects them as { additional_context } (cursor rename)', async () => {
    const bridge = makeMockBridge({ recallMemoryHits: [HIT_FIXTURE] });
    const cap = makeHookCaptures();
    await runSessionStart({
      readStdin: async () => JSON.stringify({ cwd: '/proj/x', recall_limit: 1 }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    expect(bridge.recallMemory).toHaveBeenCalledWith('', { limit: 1, scope: 'personal' });
    expect(cap.stdout).toHaveLength(1);
    const parsed = JSON.parse(cap.stdout[0]) as Record<string, unknown>;
    // Cursor's sessionStart inject shape is { additional_context }, a rename of
    // CC's hookSpecificOutput.additionalContext — assert the rename, and that
    // the default CC envelope is NOT used.
    expect(parsed['hookSpecificOutput']).toBeUndefined();
    expect(typeof parsed['additional_context']).toBe('string');
    expect(parsed['additional_context'] as string).toContain('past observation');
    expect(cap.exits).toEqual([0]);
  });

  it('handles an empty recall result gracefully (still { additional_context })', async () => {
    const bridge = makeMockBridge({ recallMemoryHits: [] });
    const cap = makeHookCaptures();
    await runSessionStart({
      readStdin: async () => '{}',
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    const parsed = JSON.parse(cap.stdout[0]) as { additional_context: string };
    expect(parsed.additional_context).toContain('no recalled frames');
    expect(cap.exits).toEqual([0]);
  });

  it('annotates hits with their workspace origin when from != personal', async () => {
    const bridge = makeMockBridge({ recallMemoryHits: [{ ...HIT_FIXTURE, from: 'workspace:team-foo' }] });
    const cap = makeHookCaptures();
    await runSessionStart({
      readStdin: async () => '{}',
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    const parsed = JSON.parse(cap.stdout[0]) as { additional_context: string };
    expect(parsed.additional_context).toContain('workspace:team-foo');
  });

  it('FAIL-OPEN: exits 0 even when the bridge throws', async () => {
    const bridge = makeMockBridge();
    bridge.recallMemory.mockRejectedValueOnce(new Error('cli unreachable'));
    const cap = makeHookCaptures();
    await runSessionStart({
      readStdin: async () => '{}',
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    expect(cap.exits).toEqual([0]);
  });
});
