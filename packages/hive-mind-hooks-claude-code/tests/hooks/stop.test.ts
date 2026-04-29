import { describe, expect, it } from 'vitest';
import { runStop, stopHandler } from '../../src/hooks/stop.js';
import { makeHookCaptures, makeMockBridge } from './_test-helpers.js';

describe('stop handler', () => {
  it('extracts response from payload.response or payload.assistant_message', () => {
    expect(stopHandler.parse({ response: 'r' }).response).toBe('r');
    expect(stopHandler.parse({ assistant_message: 'a' }).response).toBe('a');
    expect(stopHandler.parse({}).response).toBe('');
  });

  it('summarizes long responses and saves an important frame', async () => {
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    const longResp = 'First sentence. ' + 'X'.repeat(2000) + '.';
    await runStop({
      readStdin: async () => JSON.stringify({
        response: longResp,
        cwd: '/proj',
        session_id: 'sess-2',
      }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    expect(bridge.saveMemory).toHaveBeenCalledTimes(1);
    const arg = bridge.saveMemory.mock.calls[0][0];
    expect(['important', 'critical']).toContain(arg.importance);
    expect(typeof arg.content).toBe('string');
    expect(arg.content.length).toBeLessThanOrEqual(401); // budget + ellipsis
    expect(cap.exits).toEqual([0]);
  });

  it('promotes to critical when response contains a "never" directive', async () => {
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    await runStop({
      readStdin: async () => JSON.stringify({
        response: 'never commit secrets to the public repo.',
        cwd: '/proj',
      }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    const arg = bridge.saveMemory.mock.calls[0][0];
    expect(arg.importance).toBe('critical');
  });

  it('attaches parent frame id when supplied', async () => {
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    await runStop({
      readStdin: async () => JSON.stringify({
        response: 'something happened.',
        parent_frame_id: 'frame-99',
      }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    const arg = bridge.saveMemory.mock.calls[0][0];
    expect(arg.parent).toBe('frame-99');
  });

  it('skips save when response is empty', async () => {
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    await runStop({
      readStdin: async () => '{}',
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    expect(bridge.saveMemory).not.toHaveBeenCalled();
    expect(cap.exits).toEqual([0]);
  });
});
