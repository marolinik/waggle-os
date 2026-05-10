/**
 * PreCompact hook — fired just before Claude Code truncates context.
 * Triggers `compact_memory` so superseded P/B frames merge before the
 * native compaction step.
 */

import {
  pickStringFromObject,
  runHook,
  type HookHandler,
  type HookRunOptions,
} from './_shared.js';

interface PreCompactPayload {
  scope: string | undefined;
}

export const preCompactHandler: HookHandler<PreCompactPayload, undefined> = {
  parse(raw): PreCompactPayload {
    const obj = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
    const scope = pickStringFromObject(obj, 'session_id')
      ?? pickStringFromObject(obj, 'sessionId')
      ?? pickStringFromObject(obj, 'scope');
    return { scope };
  },

  async run(payload, { bridge, logger }): Promise<undefined> {
    // Commit 1.4: scope param is unused at the upstream level (cleanup_frames
    // operates on the active workspace). We retain payload.scope on the
    // parsed payload for future use (workspace-id selection in Wave 2).
    const result = await bridge.cleanupFrames();
    logger.debug('cleanup_frames done', { pruned: result.pruned, scope: payload.scope });
    return undefined;
  },
};

export async function runPreCompact(opts: Partial<HookRunOptions> = {}): Promise<void> {
  return runHook(preCompactHandler, { name: 'pre-compact', ...opts });
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
  void runPreCompact();
}
