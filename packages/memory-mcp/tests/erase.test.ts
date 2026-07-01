/**
 * erase_memory tool — the safety gate + mode validation.
 *
 * These guard paths return BEFORE any db access (getPersonalDb / MindErasure), so
 * they exercise the injection-defense confirm gate + the frame-XOR-subject
 * validation without initializing the memory engine. The actual erasure paths are
 * covered by the substrate (hive-mind-core erasure.test.ts) and the route
 * (server memory-erase-endpoint.test.ts), which call the same MindErasure
 * primitives this tool delegates to.
 */

import { describe, it, expect } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerEraseTools } from '../src/tools/erase.js';

type ToolResult = { content: Array<{ type: string; text: string }>; isError?: boolean };
type Handler = (args: Record<string, unknown>) => Promise<ToolResult>;

/** Register the tool on a stub server and capture its handler (4th tool() arg). */
function captureHandler(): Handler {
  let handler: Handler | undefined;
  const server = {
    tool: (_name: string, _desc: string, _schema: unknown, h: Handler) => { handler = h; },
  } as unknown as McpServer;
  registerEraseTools(server);
  if (!handler) throw new Error('erase_memory handler was not registered');
  return handler;
}

describe('erase_memory — safety gate + mode validation', () => {
  const handler = captureHandler();

  it('refuses without confirm=true (deny-default injection defense)', async () => {
    const res = await handler({ frame_id: 1 });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/confirm=true/i);
  });

  it('refuses an explicit confirm=false', async () => {
    const res = await handler({ confirm: false, source: 'claude', source_ref: 'x' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/confirm=true/i);
  });

  it('refuses when NEITHER frame_id nor source/source_ref is given', async () => {
    const res = await handler({ confirm: true });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/exactly one target/i);
  });

  it('refuses when BOTH frame_id and a subject are given', async () => {
    const res = await handler({ confirm: true, frame_id: 1, source: 'claude', source_ref: 'x' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/not both/i);
  });
});
