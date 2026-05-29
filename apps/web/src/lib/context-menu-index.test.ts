/**
 * R5-001 — context-menu action indexing regression test.
 *
 * Locks the invariant that the render-side highlight index agrees with the
 * filtered list the Enter handler activates from, even when disabled
 * (non-separator) items precede the focused row.
 */
import { describe, it, expect } from 'vitest';
import { isActionItem, actionIndexForRenderItem, type ContextMenuActionItem } from './context-menu-index';

describe('isActionItem', () => {
  it('treats a plain item as an action item', () => {
    expect(isActionItem({})).toBe(true);
  });
  it('excludes separators', () => {
    expect(isActionItem({ separator: true })).toBe(false);
  });
  it('excludes disabled items', () => {
    expect(isActionItem({ disabled: true })).toBe(false);
  });
});

describe('actionIndexForRenderItem', () => {
  it('maps positions one-to-one when every item is an action item', () => {
    const items: ContextMenuActionItem[] = [{}, {}, {}];
    expect(actionIndexForRenderItem(items, 0)).toBe(0);
    expect(actionIndexForRenderItem(items, 1)).toBe(1);
    expect(actionIndexForRenderItem(items, 2)).toBe(2);
  });

  it('returns null for separator and disabled rows', () => {
    const items: ContextMenuActionItem[] = [{}, { separator: true }, { disabled: true }, {}];
    expect(actionIndexForRenderItem(items, 1)).toBeNull();
    expect(actionIndexForRenderItem(items, 2)).toBeNull();
  });

  it('does NOT consume an index for a disabled row (highlight matches activation)', () => {
    // [A(enabled), B(disabled), C(enabled)] — Enter handler list is [A, C].
    // Arrowing once gives focusIndex=1 → activates C. The render index for C
    // must therefore also be 1, NOT 2, so the highlight lands on C, not B.
    const items: ContextMenuActionItem[] = [{}, { disabled: true }, {}];
    expect(actionIndexForRenderItem(items, 0)).toBe(0); // A
    expect(actionIndexForRenderItem(items, 1)).toBeNull(); // B (disabled, never highlightable)
    expect(actionIndexForRenderItem(items, 2)).toBe(1); // C — agrees with actionItems[1]
  });

  it('stays aligned with the filtered actionItems list the Enter handler uses', () => {
    const items: ContextMenuActionItem[] = [
      { separator: true },
      {}, // action 0
      { disabled: true },
      {}, // action 1
      { separator: true },
      { disabled: true },
      {}, // action 2
    ];
    const actionItems = items.filter(isActionItem);
    items.forEach((_, i) => {
      const idx = actionIndexForRenderItem(items, i);
      if (idx !== null) {
        // The row mapped to action index `idx` must be the SAME object the
        // Enter handler would activate at actionItems[idx].
        expect(items[i]).toBe(actionItems[idx]);
      }
    });
    expect(actionItems.length).toBe(3);
  });

  it('returns null for an out-of-range index', () => {
    const items: ContextMenuActionItem[] = [{}];
    expect(actionIndexForRenderItem(items, 5)).toBeNull();
  });
});
