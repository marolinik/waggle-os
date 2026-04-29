/**
 * SessionStart hook — recalls the top-N most relevant frames from
 * personal memory and injects them as additional context for the new
 * Claude Code session.
 *
 * IMPORTANT (Commit 1.4): there is no `switch_workspace` MCP tool,
 * so this hook no longer attempts to switch the active workspace.
 * Workspace targeting will arrive in Wave 2 via per-call `workspace`
 * parameters once project-level workspace discovery is wired up.
 *
 * Output format follows Claude Code's hookSpecificOutput convention:
 *   { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: <text> } }
 *
 * If hive-mind-cli is unreachable, the hook logs and exits 0 with no
 * output — the session starts as it would have without the shim.
 */

import type { MemoryHit } from '@waggle/hive-mind-shim-core';
import {
  pickStringFromObject,
  runHook,
  type HookHandler,
  type HookRunOptions,
} from './_shared.js';

interface SessionStartPayload {
  cwd: string;
  sessionId?: string;
  recallLimit: number;
}

interface SessionStartOutput {
  hookSpecificOutput: {
    hookEventName: 'SessionStart';
    additionalContext: string;
  };
}

const DEFAULT_RECALL_LIMIT = 20;
const PER_HIT_CONTENT_BUDGET = 240;

function formatHitsForContext(hits: readonly MemoryHit[]): string {
  if (hits.length === 0) {
    return 'hive-mind: no recalled frames for this workspace yet.';
  }
  const lines: string[] = [`hive-mind: top ${hits.length} recalled frames`];
  for (const h of hits) {
    const ts = h.created_at;
    const importance = h.importance;
    const from = h.from && h.from !== 'personal' ? ` [${h.from}]` : '';
    const content = h.content.length > PER_HIT_CONTENT_BUDGET
      ? h.content.slice(0, PER_HIT_CONTENT_BUDGET) + '…'
      : h.content;
    lines.push(`- (${importance})${from} ${ts}: ${content}`);
  }
  return lines.join('\n');
}

export const sessionStartHandler: HookHandler<SessionStartPayload, SessionStartOutput> = {
  parse(raw): SessionStartPayload {
    const obj = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
    const cwd = pickStringFromObject(obj, 'cwd') ?? process.cwd();
    const sessionId = pickStringFromObject(obj, 'session_id')
      ?? pickStringFromObject(obj, 'sessionId');
    const limitVal = obj['recall_limit'] ?? obj['recallLimit'];
    const recallLimit = typeof limitVal === 'number' && limitVal > 0
      ? Math.floor(limitVal)
      : DEFAULT_RECALL_LIMIT;
    const result: SessionStartPayload = { cwd, recallLimit };
    if (sessionId !== undefined) result.sessionId = sessionId;
    return result;
  },

  async run(payload, { bridge, logger }): Promise<SessionStartOutput | undefined> {
    logger.debug('recall starting', { limit: payload.recallLimit });
    const hits = await bridge.recallMemory('', { limit: payload.recallLimit, scope: 'personal' });
    logger.debug('recall complete', { hits: hits.length });
    return {
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: formatHitsForContext(hits),
      },
    };
  },
};

export async function runSessionStart(opts: Partial<HookRunOptions> = {}): Promise<void> {
  return runHook(sessionStartHandler, { name: 'session-start', ...opts });
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
  void runSessionStart();
}
