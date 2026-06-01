import { describe, expect, it } from 'vitest';
import { runUserPromptSubmit } from '../../src/hooks/user-prompt-submit.js';
import { makeHookCaptures, makeMockBridge } from './_test-helpers.js';
import type { HookFrame } from '@waggle/hive-mind-shim-core';

describe('cursor user-prompt-submit handler (SAVE-ONLY — beforeSubmitPrompt)', () => {
  it('saves a temporary, cursor-sourced frame containing the prompt', async () => {
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    await runUserPromptSubmit({
      readStdin: async () => JSON.stringify({
        prompt: 'How do I X?',
        cwd: '/proj/foo',
        conversation_id: 'conv-7',
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
      source: 'cursor',
    });
    expect(cap.exits).toEqual([0]);
  });

  it('SAVE-ONLY: emits NO stdout (beforeSubmitPrompt cannot inject)', async () => {
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    await runUserPromptSubmit({
      readStdin: async () => JSON.stringify({ prompt: 'hi', conversation_id: 'c1' }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    // The shared UserPromptSubmit body returns undefined → runHook writes nothing.
    expect(cap.stdout).toHaveLength(0);
    expect(cap.exits).toEqual([0]);
  });

  it('reads the cursor user_message fallback when prompt is absent', async () => {
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    await runUserPromptSubmit({
      readStdin: async () => JSON.stringify({ user_message: 'hello from cursor', conversation_id: 's1' }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    const frame = bridge.saveMemory.mock.calls[0][0] as HookFrame;
    expect(frame.content).toBe('hello from cursor');
    expect(frame.source).toBe('cursor');
  });

  it('skips the save when no prompt is present', async () => {
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    await runUserPromptSubmit({
      readStdin: async () => '{}',
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
      readStdin: async () => JSON.stringify({ prompt: 'x' }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    expect(cap.exits).toEqual([0]);
  });
});
