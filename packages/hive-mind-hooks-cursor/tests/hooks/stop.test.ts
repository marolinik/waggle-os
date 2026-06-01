import { describe, expect, it, afterEach, vi } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runStop } from '../../src/hooks/stop.js';
import { cursorAdapter } from '../../src/adapter.js';
import { makeHookCaptures, makeMockBridge } from './_test-helpers.js';
import type { HookFrame } from '@waggle/hive-mind-shim-core';

describe('cursor stop handler (turn read via transcript_path)', () => {
  const dirs: string[] = [];
  afterEach(async () => {
    vi.unstubAllEnvs();
    for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
  });

  async function writeTranscript(text: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'hmcur-stop-'));
    dirs.push(dir);
    const file = join(dir, 'transcript.txt');
    await writeFile(file, text, 'utf-8');
    return file;
  }

  it('reads the completed turn off transcript_path and saves an important frame', async () => {
    const transcriptPath = await writeTranscript(
      'Here is the answer to your question about X. It depends on the config.',
    );
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    await runStop({
      readStdin: async () => JSON.stringify({
        transcript_path: transcriptPath,
        cwd: '/proj/foo',
        conversation_id: 'conv-9',
      }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    expect(bridge.saveMemory).toHaveBeenCalledTimes(1);
    const frame = bridge.saveMemory.mock.calls[0][0] as HookFrame;
    expect(frame.source).toBe('cursor');
    expect(frame.scope).toBe('conv-9');
    expect(['important', 'critical']).toContain(frame.importance);
    expect(frame.content.length).toBeGreaterThan(0);
    expect(cap.exits).toEqual([0]);
  });

  it('TOLERATE-NULL: a missing transcript_path file → no save, NO throw, exits 0 (fail open)', async () => {
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    await runStop({
      readStdin: async () => JSON.stringify({
        transcript_path: join(tmpdir(), 'does-not-exist-hmcur', 'nope.txt'),
        conversation_id: 'conv-1',
      }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    // No readable response → shared body skips the save; the hook still exits 0.
    expect(bridge.saveMemory).not.toHaveBeenCalled();
    expect(cap.exits).toEqual([0]);
  });

  it('TOLERATE-NULL: no transcript_path at all (transcripts disabled) → no save, exits 0', async () => {
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    await runStop({
      readStdin: async () => JSON.stringify({ conversation_id: 'conv-2' }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    expect(bridge.saveMemory).not.toHaveBeenCalled();
    expect(cap.exits).toEqual([0]);
  });

  it('prefers an inline response key over the transcript file (forward-compat)', async () => {
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    await runStop({
      readStdin: async () => JSON.stringify({
        response: 'inline assistant message wins',
        transcript_path: '/should/not/be/read.txt',
        conversation_id: 's',
      }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    expect(bridge.saveMemory).toHaveBeenCalledTimes(1);
    const frame = bridge.saveMemory.mock.calls[0][0] as HookFrame;
    expect(frame.content.length).toBeGreaterThan(0);
  });

  it('links the Stop frame to its parent prompt frame when known', async () => {
    const transcriptPath = await writeTranscript('done with the task');
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    await runStop({
      readStdin: async () => JSON.stringify({
        transcript_path: transcriptPath,
        parent_frame_id: 'frame-prompt-1',
        conversation_id: 's',
      }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    const frame = bridge.saveMemory.mock.calls[0][0] as HookFrame;
    expect(frame.parent).toBe('frame-prompt-1');
  });

  it('does NOT emit a discovery signal by default (WAGGLE_SIGNAL_EMIT off)', async () => {
    vi.stubEnv('WAGGLE_SIGNAL_EMIT', '');
    const transcriptPath = await writeTranscript('hi there');
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    await runStop({
      readStdin: async () => JSON.stringify({ transcript_path: transcriptPath, conversation_id: 's' }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    expect(bridge.callMcpTool).not.toHaveBeenCalled();
    expect(cap.exits).toEqual([0]);
  });

  it('FAIL-OPEN: exits 0 even when saveMemory rejects', async () => {
    const transcriptPath = await writeTranscript('some answer');
    const bridge = makeMockBridge({ saveMemoryThrows: new Error('cli unreachable') });
    const cap = makeHookCaptures();
    await runStop({
      readStdin: async () => JSON.stringify({ transcript_path: transcriptPath, conversation_id: 's' }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    expect(cap.exits).toEqual([0]);
  });
});

// Direct unit coverage of the async transcript reader, including the
// ctx.readFile preference path (which the runHook drive path never supplies).
describe('cursorAdapter.extractResponse (transcript reader)', () => {
  it('prefers ctx.readFile over node fs when supplied', async () => {
    const readFile = vi.fn(async () => '  injected transcript text  ');
    const out = await cursorAdapter.extractResponse(
      { transcript_path: '/whatever/path.jsonl' },
      { readFile },
    );
    expect(readFile).toHaveBeenCalledWith('/whatever/path.jsonl');
    expect(out).toBe('injected transcript text'); // trimmed
  });

  it('returns the inline response key without touching the file reader', async () => {
    const readFile = vi.fn(async () => 'should not be read');
    const out = await cursorAdapter.extractResponse(
      { response: 'inline wins', transcript_path: '/x.txt' },
      { readFile },
    );
    expect(out).toBe('inline wins');
    expect(readFile).not.toHaveBeenCalled();
  });

  it('returns undefined when there is no transcript_path and no inline response', async () => {
    const out = await cursorAdapter.extractResponse({ conversation_id: 's' }, {});
    expect(out).toBeUndefined();
  });

  it('FAILS OPEN: a throwing reader yields undefined, never rejects', async () => {
    const readFile = vi.fn(async () => { throw new Error('EACCES'); });
    const out = await cursorAdapter.extractResponse(
      { transcript_path: '/locked.txt' },
      { readFile },
    );
    expect(out).toBeUndefined();
  });

  it('treats an empty/whitespace transcript as undefined (not an empty save)', async () => {
    const readFile = vi.fn(async () => '   \n  ');
    const out = await cursorAdapter.extractResponse(
      { transcript_path: '/empty.txt' },
      { readFile },
    );
    expect(out).toBeUndefined();
  });
});
