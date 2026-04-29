/**
 * Stop hook — fired when an assistant turn completes. Summarizes the
 * turn deterministically (no LLM call) and writes it as an `important`
 * frame parented to the originating prompt frame when known.
 */

import {
  classifyImportance,
  encodeFrame,
  summarizeTurn,
  type HookEvent,
} from '@waggle/hive-mind-shim-core';
import {
  pickStringFromObject,
  runHook,
  type HookHandler,
  type HookRunOptions,
} from './_shared.js';

interface StopPayload {
  cwd: string;
  sessionId: string;
  response: string;
  parent: string | undefined;
}

const SUMMARY_BUDGET_CHARS = 400;

export const stopHandler: HookHandler<StopPayload, undefined> = {
  parse(raw): StopPayload {
    const obj = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
    const cwd = pickStringFromObject(obj, 'cwd') ?? process.cwd();
    const sessionId = pickStringFromObject(obj, 'session_id')
      ?? pickStringFromObject(obj, 'sessionId')
      ?? 'default';
    const response = pickStringFromObject(obj, 'response')
      ?? pickStringFromObject(obj, 'assistant_message')
      ?? pickStringFromObject(obj, 'transcript')
      ?? '';
    const parent = pickStringFromObject(obj, 'parent_frame_id')
      ?? pickStringFromObject(obj, 'prompt_frame_id');
    return { cwd, sessionId, response, parent };
  },

  async run(payload, { bridge, logger }): Promise<undefined> {
    if (!payload.response) {
      logger.debug('no response in payload, skipping save');
      return undefined;
    }
    const summary = summarizeTurn(payload.response, { maxChars: SUMMARY_BUDGET_CHARS });
    const importance = classifyImportance(summary, { eventType: 'stop' }) === 'critical'
      ? 'critical'
      : 'important';

    const event: HookEvent = {
      eventType: 'stop',
      source: 'claude-code',
      cwd: payload.cwd,
      timestamp_iso: new Date().toISOString(),
      payload: {
        content: summary,
        session_id: payload.sessionId,
      },
    };
    const encodeOpts: { importance: typeof importance; parent?: string } = { importance };
    if (payload.parent !== undefined) encodeOpts.parent = payload.parent;
    const frame = encodeFrame(event, encodeOpts);
    const result = await bridge.saveMemory(frame);
    logger.debug('stop frame saved', {
      id: result.id,
      importance: frame.importance,
      bytes: summary.length,
    });
    return undefined;
  },
};

export async function runStop(opts: Partial<HookRunOptions> = {}): Promise<void> {
  return runHook(stopHandler, { name: 'stop', ...opts });
}

const isMain = (() => {
  try {
    if (typeof process.argv[1] !== 'string') return false;
    const url = new URL(`file://${process.argv[1].replace(/\\/g, '/')}`);
    return url.href === import.meta.url;
  } catch {
    return false;
  }
})();
if (isMain) {
  void runStop();
}
