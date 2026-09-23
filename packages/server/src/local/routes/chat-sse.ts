/**
 * Server-sent event framing for the chat stream, with a bound on how far the
 * reader may fall behind (TD-REL-1).
 *
 * The chat handler emits events from synchronous agent-loop callbacks, so it
 * cannot wait for `drain`. Instead a reader that stops reading is cut off once
 * its unread backlog passes `SSE_MAX_BUFFERED_BYTES`: the stream is destroyed,
 * and the handler's `close` listener aborts the turn. Before, the backlog
 * grew for as long as the turn produced events, and an ended response kept
 * it until the reader resumed or disconnected. The route holds answer tokens
 * until an attempt completes, so the backlog peaks in that final write: the
 * cap only trips for a stalled reader facing a very large answer or a very
 * long stream of steps.
 */
import type { Writable } from 'node:stream';

/** Unread SSE bytes a reader may leave behind before the stream is closed. */
export const SSE_MAX_BUFFERED_BYTES = 8 * 1024 * 1024;

/**
 * Writes one SSE event to `stream`. Returns false, having destroyed the
 * stream, when the reader's backlog is past `maxBufferedBytes`.
 */
export function writeSseEvent(
  stream: Writable,
  event: string,
  data: unknown,
  maxBufferedBytes: number = SSE_MAX_BUFFERED_BYTES,
): boolean {
  stream.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  if (stream.writableLength <= maxBufferedBytes) return true;
  // No error argument: the reader went away, the stream did not fail, and an
  // 'error' event would need a listener on the response.
  stream.destroy();
  return false;
}
