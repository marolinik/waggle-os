import { describe, expect, it } from 'vitest';
import { runUserPromptSubmit } from '../../src/hooks/user-prompt-submit.js';
import { makeHookCaptures, makeMockBridge } from './_test-helpers.js';
import type { HookFrame } from '@waggle/hive-mind-shim-core';

describe('hermes user-prompt-submit handler (SAVE-ONLY — pre_llm_call)', () => {
  it('saves a temporary, hermes-sourced frame containing the prompt from extra.user_message', async () => {
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    await runUserPromptSubmit({
      readStdin: async () => JSON.stringify({
        extra: {
          user_message: 'How do I X?',
          cwd: '/proj/foo',
          conversation_id: 'conv-7',
        },
      }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    expect(bridge.saveMemory).toHaveBeenCalledTimes(1);
    const frame = bridge.saveMemory.mock.calls[0][0] as HookFrame;
    expect(frame).toMatchObject({
      content: 'How do I X?',
      importance: 'temporary',
      scope: 'conv-7',
      source: 'hermes',
    });
    expect(cap.exits).toEqual([0]);
  });

  it('SAVE-ONLY: emits NO stdout (this hook cannot inject)', async () => {
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    await runUserPromptSubmit({
      readStdin: async () => JSON.stringify({ extra: { user_message: 'hi', session_id: 's1' } }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    // The shared UserPromptSubmit body returns undefined → runHook writes nothing.
    expect(cap.stdout).toHaveLength(0);
    expect(cap.exits).toEqual([0]);
  });

  it('reads the top-level prompt fallback when extra.user_message is absent', async () => {
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    await runUserPromptSubmit({
      readStdin: async () => JSON.stringify({ prompt: 'top-level prompt', session_id: 's2' }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    const frame = bridge.saveMemory.mock.calls[0][0] as HookFrame;
    expect(frame.content).toBe('top-level prompt');
    expect(frame.source).toBe('hermes');
  });

  it('skips the save when no prompt is present', async () => {
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    await runUserPromptSubmit({
      readStdin: async () => JSON.stringify({ extra: { session_id: 's3' } }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    expect(bridge.saveMemory).not.toHaveBeenCalled();
    expect(cap.exits).toEqual([0]);
  });

  it('FAIL-OPEN: exits 0 even if saveMemory rejects', async () => {
    const bridge = makeMockBridge({ saveMemoryThrows: new Error('cli down') });
    const cap = makeHookCaptures();
    await runUserPromptSubmit({
      readStdin: async () => JSON.stringify({ extra: { user_message: 'x' } }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    expect(cap.exits).toEqual([0]);
  });

  it('FAIL-OPEN: malformed stdin → no save, exits 0', async () => {
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    await runUserPromptSubmit({
      readStdin: async () => '<<<not json>>>',
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    expect(bridge.saveMemory).not.toHaveBeenCalled();
    expect(cap.exits).toEqual([0]);
  });
});
