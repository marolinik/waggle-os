/**
 * Cursor EventAdapter + JsonRegisterSpec.
 *
 * Cursor's hook surface renames the four lifecycle events and degrades two
 * of them relative to claude-code (spec §5.3):
 *   - SessionStart → `sessionStart`. The inject response is shaped
 *     `{ additional_context: text }` (a rename of CC's
 *     `hookSpecificOutput.additionalContext`), so `formatInject` overrides
 *     the default.
 *   - UserPromptSubmit → `beforeSubmitPrompt`. SAVE-ONLY — it cannot inject
 *     context (stdout is only `{ continue, user_message }`). The shared
 *     UserPromptSubmit body never injects, so no adapter change is needed;
 *     the README documents the degradation.
 *   - Stop → `stop`. The completed turn is delivered via the base field
 *     `transcript_path` (NOT inline), so `extractResponse` is ASYNC and
 *     reads the file off disk. It is defensive: tolerates a missing/empty
 *     path (transcripts disabled), does NOT assume JSONL, and fails open
 *     (returns undefined rather than throwing).
 *   - PreCompact → `preCompact`. Observational only — it cannot block or
 *     reorder, so `compact_memory` runs best-effort / fire-and-forget.
 *
 * The register shape is FLAT (`{ command, type:'command', timeout }`) under
 * `hooks.<event>` arrays — unlike codex's `{ matcher, hooks:[...] }`
 * wrapper. The marker is carried for byte-identical reversible uninstall.
 */

import { readFile } from 'node:fs/promises';
import {
  pickStringField,
  HIVE_MIND_MARKER_BASE,
  type EventAdapter,
  type ExtractContext,
  type JsonRegisterSpec,
  type Lifecycle,
} from '@waggle/hive-mind-hooks-core';

/** Per-tool marker stamped on every group we add — used by uninstall/verify. */
export const HIVE_MIND_MARKER = `${HIVE_MIND_MARKER_BASE}/cursor-hooks`;

/** Canonical lifecycle → Cursor native event key (field renames). */
export const CURSOR_EVENT_NAME: Record<Lifecycle, string | undefined> = {
  'session-start': 'sessionStart',
  'user-prompt-submit': 'beforeSubmitPrompt',
  'stop': 'stop',
  'pre-compact': 'preCompact',
};

function asObject(payload: unknown): Record<string, unknown> | undefined {
  return payload && typeof payload === 'object'
    ? (payload as Record<string, unknown>)
    : undefined;
}

/**
 * Defensive transcript reader for Cursor's Stop event. Cursor writes the
 * completed turn to a file referenced by the base `transcript_path` field
 * rather than inlining it. We:
 *   - tolerate a missing/empty path (transcripts disabled) → undefined;
 *   - prefer the caller-supplied `ctx.readFile`, else use node fs;
 *   - do NOT assume a JSONL structure — the raw file text IS the response
 *     fallback (the shared summarizer is text-tolerant);
 *   - fail open: any read error returns undefined, never throws.
 */
async function readTranscript(
  transcriptPath: string,
  ctx: ExtractContext,
): Promise<string | undefined> {
  try {
    const text = ctx.readFile
      ? await ctx.readFile(transcriptPath)
      : await readFile(transcriptPath, 'utf-8');
    const trimmed = text.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

/** The Cursor EventAdapter consumed by the shared lifecycle handler bodies. */
export const cursorAdapter: EventAdapter = {
  source: 'cursor',
  eventName: CURSOR_EVENT_NAME,

  extractCwd(payload): string | undefined {
    return pickStringField(payload, 'cwd', 'workspace_root', 'workspaceRoot');
  },

  extractSessionId(payload): string | undefined {
    return pickStringField(payload, 'conversation_id', 'conversationId', 'session_id', 'sessionId');
  },

  extractPrompt(payload): string | undefined {
    return pickStringField(payload, 'prompt', 'user_message', 'text');
  },

  async extractResponse(payload, ctx): Promise<string | undefined> {
    // Cursor delivers the completed turn via the base `transcript_path`
    // field (read off disk), not inline. Fall back to any inline keys for
    // forward-compat, then to the transcript file.
    const inline = pickStringField(payload, 'response', 'assistant_message', 'transcript');
    if (inline) return inline;
    const transcriptPath = pickStringField(payload, 'transcript_path', 'transcriptPath');
    if (!transcriptPath) return undefined;
    return readTranscript(transcriptPath, ctx);
  },

  extractParent(payload): string | undefined {
    return pickStringField(payload, 'parent_frame_id', 'prompt_frame_id');
  },

  /**
   * Cursor's `sessionStart` inject response is `{ additional_context, env }`.
   * We supply only `additional_context` (a rename of CC's
   * `hookSpecificOutput.additionalContext`).
   */
  formatInject(additionalContext: string): unknown {
    return { additional_context: additionalContext };
  },
};

// ── JsonRegisterSpec (cursor FLAT `{ command, type, timeout }` group) ────

interface CursorGroup {
  command: string;
  type: 'command';
  timeout: number;
  _hiveMindShim?: string;
}

/**
 * The Cursor register spec for `jsonRegister`/`jsonUnregister`. Groups live
 * under `hooks.<event>` arrays as FLAT command objects (no `{matcher,hooks}`
 * wrapper). `ensureSkeleton` seeds `version: 1` on a fresh config.
 */
export const cursorRegisterSpec: JsonRegisterSpec = {
  hooksKey: 'hooks',
  eventName: CURSOR_EVENT_NAME,

  buildGroup(_lifecycle: Lifecycle, command: string, timeout: number): Record<string, unknown> {
    const group: CursorGroup = {
      command,
      type: 'command',
      timeout,
      _hiveMindShim: HIVE_MIND_MARKER,
    };
    return group as unknown as Record<string, unknown>;
  },

  isHiveGroup(group: unknown): boolean {
    const g = asObject(group);
    return !!g && g['_hiveMindShim'] === HIVE_MIND_MARKER;
  },

  groupCommand(group: unknown): string | undefined {
    const g = asObject(group);
    const cmd = g?.['command'];
    return typeof cmd === 'string' ? cmd : undefined;
  },

  ensureSkeleton(root: Record<string, unknown>): Record<string, unknown> {
    // Cursor's hooks.json skeleton is `{ version: 1, hooks: {} }`. Seed the
    // version only when absent; never clobber a user-set version.
    if (root['version'] === undefined) return { version: 1, ...root };
    return root;
  },
};
