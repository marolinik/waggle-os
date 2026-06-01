/**
 * Hermes EventAdapter.
 *
 * Hermes (`NousResearch/hermes-agent`) exposes a SHELL-HOOKS system — a
 * top-level `hooks:` block in `~/.hermes/config.yaml` whose entries spawn a
 * configured `command` as an OS subprocess, pipe the event JSON to stdin,
 * and read optional JSON back from stdout. That contract is structurally
 * identical to shim-core's `runHook` (stdin-JSON / exit-0), so the three
 * lifecycle handler bodies reuse `runHook` as-is.
 *
 * Hermes differs from claude-code in three source-verified ways (spec §5.4):
 *   - SessionStart is SPLIT across two native events — `on_session_start`
 *     (observer/no-op) AND `pre_llm_call` gated on `is_first_turn` (the
 *     inject seam). The register side wires BOTH keys (see yaml-merger.ts);
 *     the inject stdout shape is `{ "context": "..." }` (appended to the
 *     user message, NOT the system prompt, to preserve prefix cache), so
 *     `formatInject` returns `{ context: text }`.
 *   - UserPromptSubmit → `pre_llm_call`; the user text lives at
 *     `extra.user_message`.
 *   - Stop → `post_llm_call`; the assistant text lives at
 *     `extra.assistant_response`. (`on_session_finalize` is gateway-only —
 *     do NOT use it; `post_llm_call` is the dependable per-turn Stop signal.)
 *
 * There is NO PreCompact event — Hermes ships no compaction hook
 * (`eventName['pre-compact'] = undefined`); the gap is documented, never
 * approximated.
 *
 * Hermes events carry block/inject control purely via stdout JSON (no
 * exit-code-2 contract). Our hooks are capture-only, so they emit `{}` or
 * the SessionStart context and exit 0 — fully compatible with the shim.
 */

import {
  pickStringField,
  type EventAdapter,
  type Lifecycle,
} from '@waggle/hive-mind-hooks-core';

/**
 * Canonical lifecycle → Hermes native event key. SessionStart maps to
 * `pre_llm_call` for the inject side; the observer-only `on_session_start`
 * key is registered separately by the YAML merger (it cannot be expressed
 * in this 1:1 map). `pre-compact` is `undefined` — Hermes has no compaction
 * hook.
 */
export const HERMES_EVENT_NAME: Record<Lifecycle, string | undefined> = {
  'session-start': 'pre_llm_call',
  'user-prompt-submit': 'pre_llm_call',
  'stop': 'post_llm_call',
  'pre-compact': undefined,
};

/** Hermes observer-only SessionStart key, registered alongside `pre_llm_call`. */
export const HERMES_SESSION_START_OBSERVE_EVENT = 'on_session_start';

/**
 * Read a string field nested under the Hermes `extra` envelope, falling
 * back to top-level keys for forward-compat. Hermes delivers the turn
 * payload under `extra.{user_message,assistant_response,...}`.
 */
function pickFromExtra(payload: unknown, ...keys: string[]): string | undefined {
  if (payload && typeof payload === 'object') {
    const extra = (payload as Record<string, unknown>)['extra'];
    const fromExtra = pickStringField(extra, ...keys);
    if (fromExtra) return fromExtra;
  }
  return pickStringField(payload, ...keys);
}

/** The Hermes EventAdapter consumed by the shared lifecycle handler bodies. */
export const hermesAdapter: EventAdapter = {
  source: 'hermes',
  eventName: HERMES_EVENT_NAME,

  extractCwd(payload): string | undefined {
    return pickFromExtra(payload, 'cwd', 'working_directory', 'workingDirectory');
  },

  extractSessionId(payload): string | undefined {
    return pickFromExtra(payload, 'session_id', 'sessionId', 'conversation_id', 'conversationId');
  },

  extractPrompt(payload): string | undefined {
    // pre_llm_call carries the user text at extra.user_message.
    return pickFromExtra(payload, 'user_message', 'prompt');
  },

  extractResponse(payload): string | undefined {
    // post_llm_call carries the assistant text at extra.assistant_response.
    return pickFromExtra(payload, 'assistant_response', 'final_response', 'response');
  },

  extractParent(payload): string | undefined {
    return pickFromExtra(payload, 'parent_frame_id', 'prompt_frame_id');
  },

  /**
   * Hermes appends `pre_llm_call` stdout `{ "context": "..." }` to the
   * user message (NOT the system prompt — preserves the prefix cache).
   */
  formatInject(additionalContext: string): unknown {
    return { context: additionalContext };
  },
};
