/**
 * Stop hook — fired when an assistant turn completes. Summarizes the
 * turn deterministically (no LLM call) and writes it as an `important`
 * frame parented to the originating prompt frame when known.
 */

import {
  classifyImportance,
  encodeFrame,
  isDirectExecution,
  maybeEmitDiscovery,
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
    const rawImportance = classifyImportance(summary, { eventType: 'stop' });
    const importance = rawImportance === 'critical' ? 'critical' : 'important';

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

    // AI-OS Phase 1E — opt-in v2 signal emission. Off by default so
    // OSS consumers see no behavior change; flip WAGGLE_SIGNAL_EMIT=1
    // (or any truthy value) to broadcast high/critical-importance
    // stops to the local Waggle sidecar. Fails open (sidecar offline
    // → null returned + stderr warning); never throws.
    const emitFlag = process.env.WAGGLE_SIGNAL_EMIT;
    if (emitFlag && emitFlag !== '0' && emitFlag.toLowerCase() !== 'false') {
      // Map shim-core's Importance to maybeEmitDiscovery's emission
      // scale. 'important' is the shim-core label for the
      // emission-worthy threshold; the policy helper only fires on
      // 'high' / 'critical'. 'temporary' / 'normal' do not emit.
      const emitImportance =
        rawImportance === 'critical' ? 'critical'
        : rawImportance === 'important' ? 'high'
        : rawImportance === 'normal' ? 'normal'
        : 'low';
      const emitted = await maybeEmitDiscovery(
        'stop',
        emitImportance,
        {
          tool: 'claude-code',
          sessionId: payload.sessionId,
          topic: summary.slice(0, 160),
          summary,
          frameId: result.id,
          memoryWorkspace: result.workspace,
          cwd: payload.cwd,
        },
        { senderId: 'claude-code-hook' },
      );
      if (emitted) {
        logger.debug('stop signal emitted', { id: emitted.id });
      }
    }

    return undefined;
  },
};

export async function runStop(opts: Partial<HookRunOptions> = {}): Promise<void> {
  return runHook(stopHandler, { name: 'stop', ...opts });
}

if (isDirectExecution(import.meta.url)) {
  void runStop();
}
