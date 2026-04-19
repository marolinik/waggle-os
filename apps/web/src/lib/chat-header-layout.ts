/**
 * Chat-header layout decision (M-21 / UX-6).
 *
 * The header crowds the persona picker + storage badge + team presence
 * + autonomy toggle + model picker into a single row. Below a narrow
 * threshold, the informational surfaces (storage badge, team presence)
 * move into a ⋯ overflow menu so the interactive controls (persona,
 * autonomy, model) stay reachable without the header wrapping or
 * truncating.
 *
 * This module holds the pure decision so a test can pin the threshold
 * and the classification of each control without booting React.
 */

/** Pixel width at which we switch to compact layout. */
export const CHAT_HEADER_COMPACT_THRESHOLD_PX = 480;

/**
 * Decide whether the header should render in compact mode.
 *
 * Returns `false` during the first render when the container width is
 * not yet known — rendering the full header briefly is preferable to
 * mounting with the compact layout and flashing into the full layout
 * when the observer fires.
 */
export function shouldCollapseChatHeader(containerWidth: number | null | undefined): boolean {
  if (containerWidth == null) return false;
  if (!Number.isFinite(containerWidth)) return false;
  return containerWidth < CHAT_HEADER_COMPACT_THRESHOLD_PX;
}

/**
 * Informational chips that move into the overflow menu when compact.
 * Listed here so tests can pin the set, and a future contributor
 * adding a new chip has to update both the UI and this list.
 */
export const CHAT_HEADER_OVERFLOW_CONTROLS = [
  'storage-type',
  'team-presence',
] as const;
export type ChatHeaderOverflowControl = (typeof CHAT_HEADER_OVERFLOW_CONTROLS)[number];

/**
 * Controls that MUST stay in the primary row regardless of width —
 * they're interactive and nesting them inside another dropdown would
 * produce a nested-popover UX.
 */
export const CHAT_HEADER_PRIMARY_CONTROLS = [
  'persona-picker',
  'autonomy-toggle',
  'model-picker',
] as const;
export type ChatHeaderPrimaryControl = (typeof CHAT_HEADER_PRIMARY_CONTROLS)[number];
