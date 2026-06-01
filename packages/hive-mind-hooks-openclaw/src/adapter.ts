/**
 * OpenClaw EventAdapter.
 *
 * OpenClaw (`openclaw/openclaw`) exposes IN-PROCESS internal hooks: a hook is
 * a directory `~/.openclaw/hooks/<name>/{HOOK.md, handler.js}` whose default
 * export is `(event: InternalHookEvent) => Promise<void> | void`, run inside
 * the gateway Node process. That is NOT the stdin-JSON / exit-0 subprocess
 * model the other tools use, so openclaw drives the shared handler bodies via
 * `makeOpenclawHandler` (hooks-core) rather than `runHook`.
 *
 * Event map — matched on the `(type, action)` PAIR, not a joined string
 * (spec §5.5, source-verified):
 *   - SessionStart   → `agent:bootstrap`   (mutate `context.bootstrapFiles`)
 *   - UserPromptSubmit → `message:received` (context {from, content, channelId})
 *   - Stop           → `message:sent`       (0..N per turn — DEBOUNCED; non-replyable)
 *   - PreCompact     → `session:compact:before`, BUT the runtime
 *     `event.action` is `'compact:before'` (the `session:` prefix is
 *     HOOK.md-only). `lifecycleForOpenclawEvent` in hooks-core matches the
 *     action suffix, so we declare the HOOK.md-style key here.
 *
 * `before_agent_finalize` is deliberately NOT used — it is a typed PLUGIN
 * hook (a different subsystem), not an internal `HOOK.md` event. Stop is
 * `message:sent` (debounced) instead.
 *
 * The `extract*` methods read OpenClaw's `event.context` shapes. Because the
 * openclaw handler pre-extracts `event.context` into the shared
 * extracted-payload shapes before calling the body, these extractors operate
 * on that already-unwrapped `context` object.
 */

import {
  pickStringField,
  type EventAdapter,
  type Lifecycle,
} from '@waggle/hive-mind-hooks-core';

/**
 * Canonical lifecycle → OpenClaw native `type:action` key. The values are the
 * joined keys; `makeOpenclawHandler` matches them against the runtime
 * `(type, action)` pair (and, for PreCompact, on the action suffix because
 * the runtime action drops the `session:` prefix).
 */
export const OPENCLAW_EVENT_NAME: Record<Lifecycle, string | undefined> = {
  'session-start': 'agent:bootstrap',
  'user-prompt-submit': 'message:received',
  'stop': 'message:sent',
  'pre-compact': 'session:compact:before',
};

/**
 * Provenance marker stamped on frames captured at the OpenClaw gateway layer.
 * OpenClaw can drive claude-code / codex as BACKENDS; if those backends also
 * have hive-mind hooks installed the same conversation is captured twice. We
 * stamp `openclaw-gateway` (+ the channel / session key, see the handler) so
 * gateway captures are attributable. Cross-process dedup of the
 * double-capture is a documented v0.1.0 limitation (README), deferred to a
 * fast-follow.
 */
export const OPENCLAW_PROVENANCE = 'openclaw-gateway';

/** The OpenClaw EventAdapter consumed by the shared lifecycle handler bodies. */
export const openclawAdapter: EventAdapter = {
  source: 'openclaw',
  eventName: OPENCLAW_EVENT_NAME,

  extractCwd(context): string | undefined {
    return pickStringField(context, 'cwd', 'workingDirectory', 'working_directory');
  },

  extractSessionId(context): string | undefined {
    // `channelId` is the most stable per-conversation key for gateway events;
    // fall back to sessionKey / explicit session ids.
    return pickStringField(
      context,
      'channelId',
      'channel_id',
      'sessionKey',
      'session_key',
      'sessionId',
      'session_id',
    );
  },

  extractPrompt(context): string | undefined {
    // message:received carries the inbound text at context.content.
    return pickStringField(context, 'content', 'message', 'text', 'prompt');
  },

  extractResponse(context): string | undefined {
    // message:sent carries the outbound text at context.content / .text.
    return pickStringField(context, 'content', 'text', 'response', 'message');
  },

  extractParent(context): string | undefined {
    return pickStringField(context, 'parentId', 'parent_id', 'replyTo', 'reply_to');
  },

  /**
   * SessionStart injects by MUTATING `event.context.bootstrapFiles` (handled
   * in the openclaw handler, not via stdout). The body still calls
   * `formatInject` to shape the recalled text; the handler reads the returned
   * value and pushes it onto the mutable array.
   */
  formatInject(additionalContext: string): unknown {
    return { additionalContext };
  },
};
