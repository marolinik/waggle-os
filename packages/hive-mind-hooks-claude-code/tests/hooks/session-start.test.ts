import { describe, expect, it } from 'vitest';
import { sessionStartHandler, runSessionStart } from '../../src/hooks/session-start.js';
import { makeHookCaptures, makeMockBridge } from './_test-helpers.js';
import type { MemoryHit } from '@waggle/hive-mind-shim-core';

const HIT_FIXTURE: MemoryHit = {
  id: 1,
  content: '[hm src:claude-code event:stop] past observation',
  importance: 'important',
  source: 'system',
  score: 0.87,
  created_at: '2026-04-28T10:00:00.000Z',
  from: 'personal',
};

describe('session-start handler', () => {
  it('parses cwd from payload and falls back to process.cwd()', () => {
    expect(sessionStartHandler.parse({ cwd: '/proj/x' }).cwd).toBe('/proj/x');
    expect(sessionStartHandler.parse({}).cwd).toBe(process.cwd());
  });

  it('parses recallLimit number with default 20', () => {
    expect(sessionStartHandler.parse({}).recallLimit).toBe(20);
    expect(sessionStartHandler.parse({ recall_limit: 5 }).recallLimit).toBe(5);
    expect(sessionStartHandler.parse({ recallLimit: 'not-a-number' }).recallLimit).toBe(20);
  });

  it('calls recallMemory with personal scope and formats hits into context', async () => {
    const bridge = makeMockBridge({ recallMemoryHits: [HIT_FIXTURE] });
    const cap = makeHookCaptures();
    await runSessionStart({
      readStdin: async () => JSON.stringify({ cwd: '/proj/x', recall_limit: 1 }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    // Commit 1.4: switchWorkspace removed — only recallMemory should fire.
    expect(bridge.recallMemory).toHaveBeenCalledWith('', { limit: 1, scope: 'personal' });
    expect(cap.stdout).toHaveLength(1);
    const parsed = JSON.parse(cap.stdout[0]) as { hookSpecificOutput: { additionalContext: string } };
    expect(parsed.hookSpecificOutput.additionalContext).toContain('past observation');
    expect(cap.exits).toEqual([0]);
  });

  it('handles empty recall result gracefully', async () => {
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

  it('exits 0 even when bridge throws (fail-open)', async () => {
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
});
