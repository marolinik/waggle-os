import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { writeSseEvent } from '../../src/local/routes/chat-sse.js';

/** A stream whose reader never reads: the first write never completes. */
function stalledStream(): Writable {
  return new Writable({ write() { /* never calls back */ } });
}

describe('writeSseEvent', () => {
  it('frames an event as SSE', () => {
    const chunks: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _encoding, callback) { chunks.push(chunk.toString()); callback(); },
    });
    writeSseEvent(stream, 'token', { content: 'hi ' });
    expect(chunks).toEqual(['event: token\ndata: {"content":"hi "}\n\n']);
  });

  it('QUIRK: buffers without bound when the reader stops reading (TD-REL-1)', () => {
    const stream = stalledStream();
    const token = { content: 'x'.repeat(64 * 1024) };
    for (let i = 0; i < 256; i += 1) writeSseEvent(stream, 'token', token);
    expect(stream.writableLength).toBeGreaterThan(16 * 1024 * 1024);
    expect(stream.destroyed).toBe(false);
  });
});
