/**
 * Predictable diagonal-cascade positioning for new app windows (FR #8).
 *
 * Each unsaved window opens at a viewport-centered base + (offset * step, offset * step).
 * When the next slot would push the window off-screen, the offset wraps back to 0
 * so the cascade stays inside the viewport on small displays too.
 */

export interface ViewportSize {
  width: number;
  height: number;
}

export interface CascadeInput {
  /** Per-window cascade index (already monotonic from the window manager). */
  cascadeOffset: number;
  /** Current viewport size, in CSS pixels. */
  viewport: ViewportSize;
  /**
   * Assumed window size used for centering + viewport-wrap. Real apps may have
   * different sizes; using one shared typical size keeps the cascade pattern
   * stable across app types — which is the whole point of FR #8.
   */
  typicalSize?: { width: number; height: number };
  /** Diagonal step between consecutive cascade slots. */
  step?: number;
  /** Minimum gap from the top-left edge — leaves room for the StatusBar. */
  minMargin?: number;
}

export interface Position {
  x: number;
  y: number;
}

const DEFAULT_TYPICAL = { width: 600, height: 480 };
const DEFAULT_STEP = 30;
const DEFAULT_MIN_MARGIN = 60;

export function computeCascadePosition(input: CascadeInput): Position {
  const {
    cascadeOffset,
    viewport,
    typicalSize = DEFAULT_TYPICAL,
    step = DEFAULT_STEP,
    minMargin = DEFAULT_MIN_MARGIN,
  } = input;

  const baseX = Math.max(minMargin, Math.floor(viewport.width / 2 - typicalSize.width / 2));
  const baseY = Math.max(minMargin, Math.floor(viewport.height / 2 - typicalSize.height / 2));

  // How many full diagonal slots fit before the bottom-right window edge would
  // exit the viewport. Always at least 1 so the cascade never collapses to a
  // zero-step pile on tiny viewports.
  const slotsX = Math.max(1, Math.floor((viewport.width - baseX - typicalSize.width) / step));
  const slotsY = Math.max(1, Math.floor((viewport.height - baseY - typicalSize.height) / step));
  const slots = Math.max(1, Math.min(slotsX, slotsY));

  // Safe positive modulo so a negative cascadeOffset still resolves into the slot range.
  const safeOffset = ((cascadeOffset % slots) + slots) % slots;

  return {
    x: baseX + safeOffset * step,
    y: baseY + safeOffset * step,
  };
}
