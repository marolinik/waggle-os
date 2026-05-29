/**
 * R5-001 — context-menu action indexing.
 *
 * The ContextMenu keyboard handler activates from the list of *action* items —
 * `items.filter(i => !i.separator && !i.disabled)` — indexed by `focusIndex`.
 * The render loop must highlight using the SAME indexing, otherwise the
 * highlighted row and the row Enter activates disagree whenever a disabled
 * (non-separator) item precedes the focused one.
 *
 * These pure helpers are the single source of truth so highlight and
 * activation always agree and disabled rows are never highlightable.
 */

export interface ContextMenuActionItem {
  separator?: boolean;
  disabled?: boolean;
}

/** True when an item participates in keyboard navigation/activation. */
export function isActionItem(item: ContextMenuActionItem): boolean {
  return !item.separator && !item.disabled;
}

/**
 * Action index for the item rendered at position `i`, or null when that item
 * is a separator or disabled (i.e. not focusable). The returned index lines up
 * exactly with `items.filter(isActionItem)` — the same list the Enter handler
 * activates from.
 */
export function actionIndexForRenderItem(items: ReadonlyArray<ContextMenuActionItem>, i: number): number | null {
  const item = items[i];
  if (!item || !isActionItem(item)) return null;
  let actionIndex = 0;
  for (let n = 0; n < i; n++) {
    if (isActionItem(items[n])) actionIndex++;
  }
  return actionIndex;
}
