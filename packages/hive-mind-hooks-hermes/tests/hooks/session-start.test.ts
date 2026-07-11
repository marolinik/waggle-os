import { describe, expect, it } from 'vitest';
import { runSessionStart } from '../../src/hooks/session-start.js';
import { makeHookCaptures, makeMockBridge } from './_test-helpers.js';
import type { MemoryHit } from '@waggle/hive-mind-shim-core';

const HIT_FIXTURE: MemoryHit = {
  id: 1,
  content: '[hm src:hermes event:stop] past observation',
  importance: 'important',
  source: 'system',
  score: 0.87,
  created_at: '2026-04-28T10:00:00.000Z',
  from: 'personal',
};

describe('hermes session-start handler (split: on_session_start observer + pre_llm_call inject)', () => {
  it('INJECT path: recalls personal-scoped frames and emits { context } (hermes rename) when is_first_turn is absent', async () => {
    // The on_session_start observer payload omits is_first_turn → absence ⇒ inject.
    const bridge = makeMockBridge({ recallMemoryHits: [HIT_FIXTURE] });
    const cap = makeHookCaptures();
    await runSessionStart({
      readStdin: async () => JSON.stringify({ extra: { cwd: '/proj/x' }, recall_limit: 1 }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    expect(bridge.recallMemory).toHaveBeenCalledWith('', { limit: 1, scope: 'personal', workspace: null });
    expect(cap.stdout).toHaveLength(1);
    const parsed = JSON.parse(cap.stdout[0]) as Record<string, unknown>;
    // Hermes appends pre_llm_call stdout { context } to the USER message (not the
    // system prompt — preserves the prefix cache). Assert the rename + that the
    // default CC hookSpecificOutput envelope is NOT used.
    expect(parsed['hookSpecificOutput']).toBeUndefined();
    expect(typeof parsed['context']).toBe('string');
    expect(parsed['context'] as string).toContain('past observation');
    expect(cap.exits).toEqual([0]);
  });

  it('INJECT path: explicit is_first_turn=true still injects { context }', async () => {
    const bridge = makeMockBridge({ recallMemoryHits: [HIT_FIXTURE] });
    const cap = makeHookCaptures();
    await runSessionStart({
      readStdin: async () => JSON.stringify({ extra: { is_first_turn: true } }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    expect(bridge.recallMemory).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(cap.stdout[0]) as Record<string, unknown>;
    expect(typeof parsed['context']).toBe('string');
    expect(cap.exits).toEqual([0]);
  });

  it('GATING: is_first_turn=false → emits NO output, exits 0, never recalls', async () => {
    // On a non-first pre_llm_call the per-turn save is owned by user-prompt-submit;
    // session-start must do nothing (drain the pipe + exit 0).
    const bridge = makeMockBridge({ recallMemoryHits: [HIT_FIXTURE] });
    const cap = makeHookCaptures();
    await runSessionStart({
      readStdin: async () => JSON.stringify({ extra: { is_first_turn: false, user_message: 'turn 2' } }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    expect(bridge.recallMemory).not.toHaveBeenCalled();
    expect(cap.stdout).toHaveLength(0);
    expect(cap.exits).toEqual([0]);
  });

  it('handles an empty recall result gracefully (still { context })', async () => {
    const bridge = makeMockBridge({ recallMemoryHits: [] });
    const cap = makeHookCaptures();
    await runSessionStart({
      readStdin: async () => '{}',
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    const parsed = JSON.parse(cap.stdout[0]) as { context: string };
    expect(parsed.context).toContain('no recalled frames');
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
    const parsed = JSON.parse(cap.stdout[0]) as { context: string };
    expect(parsed.context).toContain('workspace:team-foo');
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

  it('FAIL-OPEN: malformed stdin → no recall, exits 0', async () => {
    // safeJsonParse turns garbage into {} → absence of is_first_turn ⇒ inject path,
    // but the recall still runs against the empty payload and must exit 0.
    const bridge = makeMockBridge({ recallMemoryHits: [] });
    const cap = makeHookCaptures();
    await runSessionStart({
      readStdin: async () => 'not json at all {{{',
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    expect(cap.exits).toEqual([0]);
  });

  it('FAIL-OPEN: a throwing stdin reader on the pre-gate path still exits 0', async () => {
    // The is_first_turn gate reads stdin BEFORE runHook; a rejecting reader
    // must not escape to the host (it would otherwise block the session).
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    await runSessionStart({
      readStdin: async () => { throw new Error('stdin exploded'); },
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    expect(cap.exits).toEqual([0]);
    expect(bridge.recallMemory).not.toHaveBeenCalled();
  });
});
