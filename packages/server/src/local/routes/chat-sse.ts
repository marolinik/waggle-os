/**
 * Server-sent event framing for the chat stream.
 *
 * Extract Method on the chat handler's `sendEvent` write (TD-REL-1), so the
 * write can be pinned against a stream whose reader has stopped reading.
 */
import type { Writable } from 'node:stream';

/** Writes one SSE event to `stream`. */
export function writeSseEvent(stream: Writable, event: string, data: unknown): void {
  stream.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
