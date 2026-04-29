import { describe, expect, it } from 'vitest';
import { runUserPromptSubmit, userPromptSubmitHandler } from '../../src/hooks/user-prompt-submit.js';
import { makeHookCaptures, makeMockBridge } from './_test-helpers.js';

describe('user-prompt-submit handler', () => {
  it('extracts prompt from payload.prompt or payload.user_message', () => {
    expect(userPromptSubmitHandler.parse({ prompt: 'hi' }).prompt).toBe('hi');
    expect(userPromptSubmitHandler.parse({ user_message: 'hello' }).prompt).toBe('hello');
    expect(userPromptSubmitHandler.parse({}).prompt).toBe('');
  });

  it('saves a temporary frame containing the prompt', async () => {
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
    const arg = bridge.saveMemory.mock.calls[0][0];
    expect(arg).toMatchObject({
      content: 'How do I X?',
      importance: 'temporary',
      scope: 'sess-7',
      source: 'claude-code',
    });
    expect(cap.exits).toEqual([0]);
  });

  it('skips save when no prompt is present', async () => {
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

  it('exits 0 even if saveMemory rejects', async () => {
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
