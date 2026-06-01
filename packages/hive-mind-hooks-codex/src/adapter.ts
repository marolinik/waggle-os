/**
 * Codex EventAdapter + JsonRegisterSpec.
 *
 * Codex's hook event surface is effectively a clone of Claude Code's
 * (`SessionStart` / `UserPromptSubmit` / `Stop` / `PreCompact`), so the
 * adapter reuses CC's snake_case field keys (`prompt`, `session_id`,
 * `cwd`, `response`, …) and adds codex-specific fallbacks:
 *   - Stop reads `last_assistant_message` in the response fallback list.
 *   - PreCompact carries `trigger` (`manual|auto`) — surfaced as the scope.
 *
 * Field-name casing is confirmed from docs, not a live payload, so codex
 * additions are FALLBACKS layered after the CC keys rather than replacing
 * them (spec §5.1 blocker note).
 *
 * The register shape uses codex's `{ matcher, hooks: [...] }` group with a
 * `'startup|resume|clear|compact'` matcher for SessionStart; the marker is
 * carried for byte-identical reversible uninstall, not for correctness.
 */

import {
  pickStringField,
  HIVE_MIND_MARKER_BASE,
  type EventAdapter,
  type JsonRegisterSpec,
  type Lifecycle,
} from '@waggle/hive-mind-hooks-core';

/** Per-tool marker stamped on every group we add — used by uninstall/verify. */
export const HIVE_MIND_MARKER = `${HIVE_MIND_MARKER_BASE}/codex-hooks`;

/** SessionStart matcher — fires on Codex session lifecycle transitions. */
export const SESSION_START_MATCHER = 'startup|resume|clear|compact';

/** Canonical lifecycle → Codex native event key (CC clone). */
export const CODEX_EVENT_NAME: Record<Lifecycle, string | undefined> = {
  'session-start': 'SessionStart',
  'user-prompt-submit': 'UserPromptSubmit',
  'stop': 'Stop',
  'pre-compact': 'PreCompact',
};

function asObject(payload: unknown): Record<string, unknown> | undefined {
  return payload && typeof payload === 'object'
    ? (payload as Record<string, unknown>)
    : undefined;
}

/** The Codex EventAdapter consumed by the shared lifecycle handler bodies. */
export const codexAdapter: EventAdapter = {
  source: 'codex',
  eventName: CODEX_EVENT_NAME,

  extractCwd(payload): string | undefined {
    return pickStringField(payload, 'cwd');
  },

  extractSessionId(payload): string | undefined {
    return pickStringField(payload, 'session_id', 'sessionId');
  },

  extractPrompt(payload): string | undefined {
    return pickStringField(payload, 'prompt', 'user_message');
  },

  extractResponse(payload): string | undefined {
    // CC fallback list + codex addition `last_assistant_message`.
    return pickStringField(
      payload,
      'response',
      'assistant_message',
      'last_assistant_message',
      'transcript',
    );
  },

  extractParent(payload): string | undefined {
    return pickStringField(payload, 'parent_frame_id', 'prompt_frame_id');
  },
  // formatInject omitted ⇒ the shared SessionStart body uses CC's default
  // hookSpecificOutput shape (codex honors the CC inject convention).
};

/**
 * PreCompact `trigger` (`manual|auto`) accessor — codex surfaces the
 * compaction trigger here. Exposed so verify/diagnostics can read it; the
 * shared PreCompact body keys off the session scope, not the trigger.
 */
export function extractTrigger(payload: unknown): string | undefined {
  return pickStringField(payload, 'trigger');
}

// ── JsonRegisterSpec (codex `{ matcher, hooks: [...] }` group shape) ────

interface CodexGroup {
  matcher?: string;
  hooks: Array<{ type: 'command'; command: string; timeout?: number }>;
  _hiveMindShim?: string;
}

/**
 * The Codex register spec for `jsonRegister`/`jsonUnregister`. Groups live
 * under the top-level `hooks` key; SessionStart carries the lifecycle
 * matcher, the other events omit it.
 */
export const codexRegisterSpec: JsonRegisterSpec = {
  hooksKey: 'hooks',
  eventName: CODEX_EVENT_NAME,

  buildGroup(lifecycle: Lifecycle, command: string, timeout: number): Record<string, unknown> {
    const group: CodexGroup = {
      hooks: [{ type: 'command', command, timeout }],
      _hiveMindShim: HIVE_MIND_MARKER,
    };
    if (lifecycle === 'session-start') group.matcher = SESSION_START_MATCHER;
    return group as unknown as Record<string, unknown>;
  },

  isHiveGroup(group: unknown): boolean {
    const g = asObject(group);
    return !!g && g['_hiveMindShim'] === HIVE_MIND_MARKER;
  },

  groupCommand(group: unknown): string | undefined {
    const g = asObject(group);
    if (!g) return undefined;
    const hooks = g['hooks'];
    if (!Array.isArray(hooks) || hooks.length === 0) return undefined;
    const first = asObject(hooks[0]);
    const cmd = first?.['command'];
    return typeof cmd === 'string' ? cmd : undefined;
  },
};
