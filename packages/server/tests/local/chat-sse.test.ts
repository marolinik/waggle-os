import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { SSE_MAX_BUFFERED_BYTES, writeSseEvent } from '../../src/local/routes/chat-sse.js';

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

  // Until TD-REL-1 the backlog grew past 16 MiB and the stream stayed open.
  it('closes the stream once a stalled reader falls past the cap', () => {
    const stream = stalledStream();
    const token = { content: 'x'.repeat(64 * 1024) };
    let written = 0;
    while (writeSseEvent(stream, 'token', token)) written += 1;
    expect(stream.destroyed).toBe(true);
    expect(written).toBeLessThan(SSE_MAX_BUFFERED_BYTES / (64 * 1024));
    expect(written).toBeGreaterThan(SSE_MAX_BUFFERED_BYTES / (64 * 1024) - 2);
  });

  it('keeps the stream open while the backlog is within the cap', () => {
    const stream = stalledStream();
    expect(writeSseEvent(stream, 'token', { content: 'abcd' }, 1024)).toBe(true);
    expect(writeSseEvent(stream, 'token', { content: 'x'.repeat(2048) }, 1024)).toBe(false);
    expect(stream.destroyed).toBe(true);
  });
});
