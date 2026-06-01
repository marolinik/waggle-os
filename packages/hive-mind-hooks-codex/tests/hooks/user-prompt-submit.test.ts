import { describe, expect, it } from 'vitest';
import { runUserPromptSubmit } from '../../src/hooks/user-prompt-submit.js';
import { makeHookCaptures, makeMockBridge } from './_test-helpers.js';
import type { HookFrame } from '@waggle/hive-mind-shim-core';

describe('codex user-prompt-submit handler', () => {
  it('saves a temporary, codex-sourced frame containing the prompt', async () => {
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    await runUserPromptSubmit({
      readStdin: async () => JSON.stringify({
        prompt: 'How do I X?',
        cwd: '/proj/foo',
        session_id: 'sess-7',
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
      scope: 'sess-7',
      source: 'codex',
    });
    expect(cap.exits).toEqual([0]);
  });

  it('reads the codex user_message fallback when prompt is absent', async () => {
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    await runUserPromptSubmit({
      readStdin: async () => JSON.stringify({ user_message: 'hello from codex', session_id: 's1' }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    const frame = bridge.saveMemory.mock.calls[0][0] as HookFrame;
    expect(frame.content).toBe('hello from codex');
    expect(frame.source).toBe('codex');
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
