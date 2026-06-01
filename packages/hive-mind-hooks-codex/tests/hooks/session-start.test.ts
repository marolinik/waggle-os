import { describe, expect, it } from 'vitest';
import { runSessionStart } from '../../src/hooks/session-start.js';
import { makeHookCaptures, makeMockBridge } from './_test-helpers.js';
import type { MemoryHit } from '@waggle/hive-mind-shim-core';

const HIT_FIXTURE: MemoryHit = {
  id: 1,
  content: '[hm src:codex event:stop] past observation',
  importance: 'important',
  source: 'system',
  score: 0.87,
  created_at: '2026-04-28T10:00:00.000Z',
  from: 'personal',
};

describe('codex session-start handler', () => {
  it('recalls personal-scoped frames and injects them as additionalContext', async () => {
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
    const parsed = JSON.parse(cap.stdout[0]) as {
      hookSpecificOutput: { source: string; additionalContext: string };
    };
    // Codex has no custom formatInject ⇒ the default CC hookSpecificOutput shape,
    // stamped with source 'codex'.
    expect(parsed.hookSpecificOutput.source).toBe('codex');
    expect(parsed.hookSpecificOutput.additionalContext).toContain('past observation');
    expect(cap.exits).toEqual([0]);
  });

  it('handles an empty recall result gracefully', async () => {
    const bridge = makeMockBridge({ recallMemoryHits: [] });
    const cap = makeHookCaptures();
    await runSessionStart({
      readStdin: async () => '{}',
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    const parsed = JSON.parse(cap.stdout[0]) as { hookSpecificOutput: { additionalContext: string } };
    expect(parsed.hookSpecificOutput.additionalContext).toContain('no recalled frames');
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
    const parsed = JSON.parse(cap.stdout[0]) as { hookSpecificOutput: { additionalContext: string } };
    expect(parsed.hookSpecificOutput.additionalContext).toContain('workspace:team-foo');
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
