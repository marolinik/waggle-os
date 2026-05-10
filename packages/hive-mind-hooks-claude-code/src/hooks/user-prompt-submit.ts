/**
 * UserPromptSubmit hook — captures the user prompt as a temporary
 * frame scoped to the current Claude Code session.
 *
 * No stdout output: this hook is purely a side-effect on the .mind file.
 */

import { encodeFrame, type HookEvent } from '@waggle/hive-mind-shim-core';
import {
  pickStringFromObject,
  runHook,
  type HookHandler,
  type HookRunOptions,
} from './_shared.js';

interface UserPromptSubmitPayload {
  prompt: string;
  cwd: string;
  sessionId: string;
}

export const userPromptSubmitHandler: HookHandler<UserPromptSubmitPayload, undefined> = {
  parse(raw): UserPromptSubmitPayload {
    const obj = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
    const prompt = pickStringFromObject(obj, 'prompt')
      ?? pickStringFromObject(obj, 'user_message')
      ?? '';
    const cwd = pickStringFromObject(obj, 'cwd') ?? process.cwd();
    const sessionId = pickStringFromObject(obj, 'session_id')
      ?? pickStringFromObject(obj, 'sessionId')
      ?? 'default';
    return { prompt, cwd, sessionId };
  },

  async run(payload, { bridge, logger }): Promise<undefined> {
    if (!payload.prompt) {
      logger.debug('no prompt in payload, skipping save');
      return undefined;
    }
    const event: HookEvent = {
      eventType: 'user-prompt-submit',
      source: 'claude-code',
      cwd: payload.cwd,
      timestamp_iso: new Date().toISOString(),
      payload: {
        content: payload.prompt,
        session_id: payload.sessionId,
      },
    };
    const frame = encodeFrame(event, { importance: 'temporary' });
    const result = await bridge.saveMemory(frame);
    logger.debug('prompt frame saved', { id: result.id, scope: frame.scope });
    return undefined;
  },
};

export async function runUserPromptSubmit(opts: Partial<HookRunOptions> = {}): Promise<void> {
  return runHook(userPromptSubmitHandler, { name: 'user-prompt-submit', ...opts });
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
  void runUserPromptSubmit();
}
