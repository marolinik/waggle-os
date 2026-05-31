/**
 * EventAdapter — the per-tool seam that lets the four tool-agnostic
 * lifecycle handler bodies (handlers-core.ts) read fields out of an
 * opaque host payload without hardcoding key names.
 *
 * This generalizes what the frozen Wave 1 claude-code handlers do inline
 * via `pickStringFromObject` multi-key fallbacks (e.g. stop.ts reads
 * `response | assistant_message | transcript`). A tool package supplies
 * one `EventAdapter`; the shared handler factories consume it.
 */

import type { ShimSource } from '@waggle/hive-mind-shim-core';

/** Canonical lifecycle actions, tool-agnostic. */
export type Lifecycle = 'session-start' | 'user-prompt-submit' | 'stop' | 'pre-compact';

/**
 * Context handed to async field extractors. Cursor delivers the completed
 * turn via a `transcript_path` to read off disk rather than inline, so
 * `extractResponse` may need a file reader.
 */
export interface ExtractContext {
  readFile?: (path: string) => Promise<string>;
}

export interface EventAdapter {
  /** Tool id used for HookEvent.source + logger names. */
  readonly source: ShimSource;
  /**
   * Map each canonical lifecycle name to the tool's native event key.
   * `undefined` ⇒ the tool has no native event for that lifecycle
   * (degraded; documented per spec §6.1).
   */
  readonly eventName: Record<Lifecycle, string | undefined>;
  /** Extract the working directory from the opaque payload. */
  extractCwd(payload: unknown): string | undefined;
  /** Extract the session/conversation id from the opaque payload. */
  extractSessionId(payload: unknown): string | undefined;
  /** Extract the user prompt text (UserPromptSubmit). */
  extractPrompt(payload: unknown): string | undefined;
  /**
   * Extract the completed assistant turn (Stop). Async because some tools
   * (cursor) deliver it via a `transcript_path` read off disk rather than
   * inline. Must fail open — return undefined rather than throw.
   */
  extractResponse(
    payload: unknown,
    ctx: ExtractContext,
  ): Promise<string | undefined> | string | undefined;
  /** Extract a parent frame id to link a Stop frame to its prompt, if any. */
  extractParent(payload: unknown): string | undefined;
  /**
   * Per-tool shape of the SessionStart inject response. `undefined` ⇒ the
   * tool cannot inject context (save-only); the handler then emits nothing.
   */
  formatInject?(additionalContext: string): unknown;
}
