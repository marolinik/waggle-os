/**
 * Tab utility functions for multi-conversation tab management.
 *
 * Pure functions — no React dependency, fully testable.
 */

export interface ConversationTab {
  id: string;
  sessionId: string;
  workspaceId: string;
  workspaceIcon?: string;
  title: string;
  scrollPosition?: number;
  inputDraft?: string;
  pendingApprovals?: number;
  order: number;
}

/** Maximum number of visible tabs before horizontal scroll. */
export const MAX_VISIBLE_TABS = 10;

let tabIdCounter = 0;

/**
 * Create a new conversation tab.
 */
export function createTab(
  sessionId: string,
  workspaceId: string,
  title: string,
  icon?: string,
): ConversationTab {
  return {
    id: `ctab-${Date.now()}-${++tabIdCounter}`,
    sessionId,
    workspaceId,
    workspaceIcon: icon,
    title,
    order: 0,
  };
}

/**
 * Reorder tabs by moving a tab from one index to another.
 * Returns a new array with renumbered order fields.
 */
export function reorderTabs(
  tabs: ConversationTab[],
  fromIndex: number,
  toIndex: number,
): ConversationTab[] {
  const result = [...tabs];
  const [moved] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, moved);
  return result.map((tab, i) => ({ ...tab, order: i }));
}

/**
 * Check if a new tab can be added (under the configured or default max).
 */
export function canAddTab(tabs: ConversationTab[], maxTabs: number = MAX_VISIBLE_TABS): boolean {
  return tabs.length < maxTabs;
}

/**
 * Find a tab by its linked session ID.
 */
export function findTabBySession(
  tabs: ConversationTab[],
  sessionId: string,
): ConversationTab | undefined {
  return tabs.find((t) => t.sessionId === sessionId);
}

/**
 * Remove a tab by ID and renumber remaining tabs.
 */
export function removeTab(tabs: ConversationTab[], tabId: string): ConversationTab[] {
  return tabs
    .filter((t) => t.id !== tabId)
    .map((tab, i) => ({ ...tab, order: i }));
}

/**
 * Determine which tab to activate after closing one.
 *
 * - If the closed tab is not the active tab, keep the current active.
 * - If the closed tab is active, prefer the tab to the right, then left.
 * - If it was the only tab, return null.
 */
export function getNextActiveTab(
  tabs: ConversationTab[],
  closedTabId: string,
  currentActiveId: string,
): string | null {
  // If closing a non-active tab, keep current active
  if (closedTabId !== currentActiveId) {
    return currentActiveId;
  }

  const index = tabs.findIndex((t) => t.id === closedTabId);
  if (index === -1) return null;

  // Only tab
  if (tabs.length <= 1) return null;

  // Prefer right neighbor, fall back to left
  if (index < tabs.length - 1) {
    return tabs[index + 1].id;
  }
  return tabs[index - 1].id;
}

/**
 * Update mutable state fields on a tab (scroll, draft, approvals).
 * Returns a new tab object — does not mutate the original.
 */
export function updateTabState(
  tab: ConversationTab,
  state: Partial<Pick<ConversationTab, 'scrollPosition' | 'inputDraft' | 'pendingApprovals'>>,
): ConversationTab {
  return { ...tab, ...state };
}

/**
 * Pure composite: add a tab (with dedup and max-limit enforcement).
 * Returns the new tabs array and the new tab ID (or null if rejected).
 */
export function addTab(
  tabs: ConversationTab[],
  sessionId: string,
  workspaceId: string,
  title: string,
  icon?: string,
  maxTabs: number = MAX_VISIBLE_TABS,
): { tabs: ConversationTab[]; newTabId: string | null } {
  const existing = findTabBySession(tabs, sessionId);
  if (existing) {
    return { tabs, newTabId: existing.id };
  }
  if (tabs.length >= maxTabs) {
    return { tabs, newTabId: null };
  }
  const tab = createTab(sessionId, workspaceId, title, icon);
  tab.order = tabs.length;
  return { tabs: [...tabs, tab], newTabId: tab.id };
}

/**
 * Pure composite: close a tab and compute the next active tab ID.
 * Returns the remaining tabs and the next active ID.
 */
export function closeTabAndGetNext(
  tabs: ConversationTab[],
  tabId: string,
  activeTabId: string | null,
): { tabs: ConversationTab[]; nextActiveId: string | null } {
  const nextActiveId = getNextActiveTab(tabs, tabId, activeTabId ?? '');
  const remaining = removeTab(tabs, tabId);
  return { tabs: remaining, nextActiveId };
}
