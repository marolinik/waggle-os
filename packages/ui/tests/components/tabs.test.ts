/**
 * Multi-conversation tabs tests.
 *
 * Tests utility/logic functions and hook behavior — no jsdom/React Testing Library.
 */

import { describe, it, expect } from 'vitest';
import {
  createTab,
  reorderTabs,
  MAX_VISIBLE_TABS,
  canAddTab,
  findTabBySession,
  removeTab,
  getNextActiveTab,
  updateTabState,
  addTab,
  closeTabAndGetNext,
} from '../../src/components/tabs/tab-utils.js';
import type { ConversationTab } from '../../src/components/tabs/tab-utils.js';

// ── Test helpers ────────────────────────────────────────────────────

function makeTab(overrides: Partial<ConversationTab> = {}): ConversationTab {
  return {
    id: 'tab-1',
    sessionId: 'sess-1',
    workspaceId: 'ws-1',
    title: 'Test Session',
    order: 0,
    ...overrides,
  };
}

function makeTabs(count: number): ConversationTab[] {
  return Array.from({ length: count }, (_, i) =>
    makeTab({
      id: `tab-${i}`,
      sessionId: `sess-${i}`,
      title: `Session ${i}`,
      order: i,
    }),
  );
}

// ── createTab ────────────────────────────────────────────────────────

describe('createTab', () => {
  it('creates a tab with required fields', () => {
    const tab = createTab('sess-1', 'ws-1', 'My Session');
    expect(tab.sessionId).toBe('sess-1');
    expect(tab.workspaceId).toBe('ws-1');
    expect(tab.title).toBe('My Session');
    expect(tab.order).toBe(0);
    expect(tab.id).toBeTruthy();
    expect(typeof tab.id).toBe('string');
  });

  it('creates a tab with optional icon', () => {
    const tab = createTab('sess-1', 'ws-1', 'My Session', '🐝');
    expect(tab.workspaceIcon).toBe('🐝');
  });

  it('creates a tab without icon when omitted', () => {
    const tab = createTab('sess-1', 'ws-1', 'My Session');
    expect(tab.workspaceIcon).toBeUndefined();
  });

  it('generates unique IDs for different calls', () => {
    const tab1 = createTab('sess-1', 'ws-1', 'S1');
    const tab2 = createTab('sess-2', 'ws-1', 'S2');
    expect(tab1.id).not.toBe(tab2.id);
  });

  it('initializes scroll/draft/approvals as undefined', () => {
    const tab = createTab('sess-1', 'ws-1', 'S1');
    expect(tab.scrollPosition).toBeUndefined();
    expect(tab.inputDraft).toBeUndefined();
    expect(tab.pendingApprovals).toBeUndefined();
  });
});

// ── reorderTabs ──────────────────────────────────────────────────────

describe('reorderTabs', () => {
  it('moves a tab forward (left to right)', () => {
    const tabs = makeTabs(4);
    const result = reorderTabs(tabs, 0, 2);
    expect(result.map((t) => t.id)).toEqual(['tab-1', 'tab-2', 'tab-0', 'tab-3']);
    // Orders renumbered
    expect(result.map((t) => t.order)).toEqual([0, 1, 2, 3]);
  });

  it('moves a tab backward (right to left)', () => {
    const tabs = makeTabs(4);
    const result = reorderTabs(tabs, 3, 1);
    expect(result.map((t) => t.id)).toEqual(['tab-0', 'tab-3', 'tab-1', 'tab-2']);
    expect(result.map((t) => t.order)).toEqual([0, 1, 2, 3]);
  });

  it('returns same order when from === to', () => {
    const tabs = makeTabs(3);
    const result = reorderTabs(tabs, 1, 1);
    expect(result.map((t) => t.id)).toEqual(['tab-0', 'tab-1', 'tab-2']);
  });

  it('does not mutate original array', () => {
    const tabs = makeTabs(3);
    const original = [...tabs];
    reorderTabs(tabs, 0, 2);
    expect(tabs).toEqual(original);
  });

  it('handles moving to first position', () => {
    const tabs = makeTabs(3);
    const result = reorderTabs(tabs, 2, 0);
    expect(result.map((t) => t.id)).toEqual(['tab-2', 'tab-0', 'tab-1']);
  });

  it('handles moving to last position', () => {
    const tabs = makeTabs(3);
    const result = reorderTabs(tabs, 0, 2);
    expect(result.map((t) => t.id)).toEqual(['tab-1', 'tab-2', 'tab-0']);
  });
});

// ── MAX_VISIBLE_TABS ────────────────────────────────────────────────

describe('MAX_VISIBLE_TABS', () => {
  it('is 10', () => {
    expect(MAX_VISIBLE_TABS).toBe(10);
  });
});

// ── canAddTab ────────────────────────────────────────────────────────

describe('canAddTab', () => {
  it('returns true when under max', () => {
    expect(canAddTab(makeTabs(5))).toBe(true);
  });

  it('returns true when empty', () => {
    expect(canAddTab([])).toBe(true);
  });

  it('returns true at max - 1', () => {
    expect(canAddTab(makeTabs(9))).toBe(true);
  });

  it('returns false at max', () => {
    expect(canAddTab(makeTabs(10))).toBe(false);
  });

  it('returns false above max', () => {
    expect(canAddTab(makeTabs(15))).toBe(false);
  });

  it('respects custom maxTabs parameter', () => {
    expect(canAddTab(makeTabs(3), 5)).toBe(true);
    expect(canAddTab(makeTabs(5), 5)).toBe(false);
    expect(canAddTab(makeTabs(4), 5)).toBe(true);
  });
});

// ── findTabBySession ────────────────────────────────────────────────

describe('findTabBySession', () => {
  it('finds a tab by session ID', () => {
    const tabs = makeTabs(5);
    const result = findTabBySession(tabs, 'sess-3');
    expect(result).toBeDefined();
    expect(result!.id).toBe('tab-3');
  });

  it('returns undefined when not found', () => {
    const tabs = makeTabs(3);
    expect(findTabBySession(tabs, 'nonexistent')).toBeUndefined();
  });

  it('returns undefined for empty array', () => {
    expect(findTabBySession([], 'sess-1')).toBeUndefined();
  });
});

// ── removeTab ────────────────────────────────────────────────────────

describe('removeTab', () => {
  it('removes a tab by id and renumbers', () => {
    const tabs = makeTabs(4);
    const result = removeTab(tabs, 'tab-1');
    expect(result).toHaveLength(3);
    expect(result.map((t) => t.id)).toEqual(['tab-0', 'tab-2', 'tab-3']);
    expect(result.map((t) => t.order)).toEqual([0, 1, 2]);
  });

  it('returns all tabs when id not found', () => {
    const tabs = makeTabs(3);
    const result = removeTab(tabs, 'nonexistent');
    expect(result).toHaveLength(3);
  });

  it('handles removing last tab', () => {
    const tabs = makeTabs(1);
    const result = removeTab(tabs, 'tab-0');
    expect(result).toHaveLength(0);
  });

  it('does not mutate original array', () => {
    const tabs = makeTabs(3);
    const original = [...tabs];
    removeTab(tabs, 'tab-1');
    expect(tabs).toEqual(original);
  });
});

// ── getNextActiveTab ────────────────────────────────────────────────

describe('getNextActiveTab', () => {
  it('returns tab to the right when closing active tab', () => {
    const tabs = makeTabs(4);
    // Close tab-1 (index 1), currently active
    const next = getNextActiveTab(tabs, 'tab-1', 'tab-1');
    expect(next).toBe('tab-2');
  });

  it('returns tab to the left when closing last tab', () => {
    const tabs = makeTabs(3);
    // Close tab-2 (last), currently active
    const next = getNextActiveTab(tabs, 'tab-2', 'tab-2');
    expect(next).toBe('tab-1');
  });

  it('returns null when closing the only tab', () => {
    const tabs = makeTabs(1);
    const next = getNextActiveTab(tabs, 'tab-0', 'tab-0');
    expect(next).toBeNull();
  });

  it('returns current active when closing non-active tab', () => {
    const tabs = makeTabs(4);
    // Close tab-2, but tab-0 is active
    const next = getNextActiveTab(tabs, 'tab-2', 'tab-0');
    expect(next).toBe('tab-0');
  });

  it('returns first remaining tab when closing first active tab', () => {
    const tabs = makeTabs(3);
    const next = getNextActiveTab(tabs, 'tab-0', 'tab-0');
    expect(next).toBe('tab-1');
  });

  it('returns null when active closedTabId is not found in tabs', () => {
    const tabs = makeTabs(3);
    // Closing the active tab but it doesn't exist in list — return null
    const next = getNextActiveTab(tabs, 'nonexistent', 'nonexistent');
    expect(next).toBeNull();
  });

  it('returns current active when closing non-active nonexistent tab', () => {
    const tabs = makeTabs(3);
    const next = getNextActiveTab(tabs, 'nonexistent', 'tab-0');
    expect(next).toBe('tab-0');
  });
});

// ── updateTabState ──────────────────────────────────────────────────

describe('updateTabState', () => {
  it('updates scroll position', () => {
    const tab = makeTab();
    const updated = updateTabState(tab, { scrollPosition: 150 });
    expect(updated.scrollPosition).toBe(150);
  });

  it('updates input draft', () => {
    const tab = makeTab();
    const updated = updateTabState(tab, { inputDraft: 'hello world' });
    expect(updated.inputDraft).toBe('hello world');
  });

  it('updates pending approvals', () => {
    const tab = makeTab();
    const updated = updateTabState(tab, { pendingApprovals: 3 });
    expect(updated.pendingApprovals).toBe(3);
  });

  it('updates multiple fields at once', () => {
    const tab = makeTab();
    const updated = updateTabState(tab, {
      scrollPosition: 200,
      inputDraft: 'draft',
      pendingApprovals: 1,
    });
    expect(updated.scrollPosition).toBe(200);
    expect(updated.inputDraft).toBe('draft');
    expect(updated.pendingApprovals).toBe(1);
  });

  it('preserves other tab fields', () => {
    const tab = makeTab({ workspaceIcon: '🐝' });
    const updated = updateTabState(tab, { scrollPosition: 100 });
    expect(updated.id).toBe(tab.id);
    expect(updated.sessionId).toBe(tab.sessionId);
    expect(updated.workspaceId).toBe(tab.workspaceId);
    expect(updated.title).toBe(tab.title);
    expect(updated.workspaceIcon).toBe('🐝');
    expect(updated.order).toBe(tab.order);
  });

  it('does not mutate original tab', () => {
    const tab = makeTab();
    const original = { ...tab };
    updateTabState(tab, { scrollPosition: 999 });
    expect(tab).toEqual(original);
  });

  it('handles empty state update', () => {
    const tab = makeTab({ scrollPosition: 50 });
    const updated = updateTabState(tab, {});
    expect(updated).toEqual(tab);
  });
});

// ── Export checks ───────────────────────────────────────────────────

describe('exports', () => {
  it('exports createTab function', () => {
    expect(typeof createTab).toBe('function');
  });

  it('exports reorderTabs function', () => {
    expect(typeof reorderTabs).toBe('function');
  });

  it('exports canAddTab function', () => {
    expect(typeof canAddTab).toBe('function');
  });

  it('exports findTabBySession function', () => {
    expect(typeof findTabBySession).toBe('function');
  });

  it('exports removeTab function', () => {
    expect(typeof removeTab).toBe('function');
  });

  it('exports getNextActiveTab function', () => {
    expect(typeof getNextActiveTab).toBe('function');
  });

  it('exports updateTabState function', () => {
    expect(typeof updateTabState).toBe('function');
  });

  it('exports MAX_VISIBLE_TABS constant', () => {
    expect(typeof MAX_VISIBLE_TABS).toBe('number');
  });

  it('exports addTab function', () => {
    expect(typeof addTab).toBe('function');
  });

  it('exports closeTabAndGetNext function', () => {
    expect(typeof closeTabAndGetNext).toBe('function');
  });
});

// ── addTab (pure composite) ─────────────────────────────────────────

describe('addTab', () => {
  it('adds a new tab within limit', () => {
    const tabs = makeTabs(3);
    const result = addTab(tabs, 'sess-new', 'ws-1', 'New Session');
    expect(result.tabs).toHaveLength(4);
    expect(result.newTabId).toBeTruthy();
    expect(result.tabs[3].sessionId).toBe('sess-new');
    expect(result.tabs[3].order).toBe(3);
  });

  it('rejects when at max limit', () => {
    const tabs = makeTabs(10);
    const result = addTab(tabs, 'sess-new', 'ws-1', 'New Session');
    expect(result.tabs).toHaveLength(10);
    expect(result.newTabId).toBeNull();
    // Tabs array unchanged (same reference)
    expect(result.tabs).toBe(tabs);
  });

  it('rejects when at custom max limit', () => {
    const tabs = makeTabs(3);
    const result = addTab(tabs, 'sess-new', 'ws-1', 'New Session', undefined, 3);
    expect(result.tabs).toHaveLength(3);
    expect(result.newTabId).toBeNull();
  });

  it('deduplicates by session ID', () => {
    const tabs = makeTabs(3);
    const result = addTab(tabs, 'sess-1', 'ws-1', 'Duplicate');
    expect(result.tabs).toHaveLength(3);
    expect(result.newTabId).toBe('tab-1');
    // Tabs array unchanged (same reference)
    expect(result.tabs).toBe(tabs);
  });

  it('sets workspace icon when provided', () => {
    const result = addTab([], 'sess-1', 'ws-1', 'Session', '🐝');
    expect(result.tabs[0].workspaceIcon).toBe('🐝');
  });

  it('adds to empty tabs list', () => {
    const result = addTab([], 'sess-1', 'ws-1', 'First');
    expect(result.tabs).toHaveLength(1);
    expect(result.newTabId).toBeTruthy();
    expect(result.tabs[0].order).toBe(0);
  });
});

// ── closeTabAndGetNext (pure composite) ─────────────────────────────

describe('closeTabAndGetNext', () => {
  it('closes active tab and selects right neighbor', () => {
    const tabs = makeTabs(4);
    const result = closeTabAndGetNext(tabs, 'tab-1', 'tab-1');
    expect(result.tabs).toHaveLength(3);
    expect(result.tabs.map((t) => t.id)).toEqual(['tab-0', 'tab-2', 'tab-3']);
    expect(result.nextActiveId).toBe('tab-2');
  });

  it('closes active last tab and selects left neighbor', () => {
    const tabs = makeTabs(3);
    const result = closeTabAndGetNext(tabs, 'tab-2', 'tab-2');
    expect(result.tabs).toHaveLength(2);
    expect(result.nextActiveId).toBe('tab-1');
  });

  it('closes non-active tab and keeps active', () => {
    const tabs = makeTabs(4);
    const result = closeTabAndGetNext(tabs, 'tab-2', 'tab-0');
    expect(result.tabs).toHaveLength(3);
    expect(result.nextActiveId).toBe('tab-0');
  });

  it('closes only tab and returns null', () => {
    const tabs = makeTabs(1);
    const result = closeTabAndGetNext(tabs, 'tab-0', 'tab-0');
    expect(result.tabs).toHaveLength(0);
    expect(result.nextActiveId).toBeNull();
  });

  it('closing nonexistent active tab returns null for next active', () => {
    const tabs = makeTabs(3);
    const result = closeTabAndGetNext(tabs, 'nonexistent', 'nonexistent');
    expect(result.tabs).toHaveLength(3);
    expect(result.nextActiveId).toBeNull();
  });

  it('closing nonexistent non-active tab keeps current active', () => {
    const tabs = makeTabs(3);
    const result = closeTabAndGetNext(tabs, 'nonexistent', 'tab-0');
    expect(result.tabs).toHaveLength(3);
    expect(result.nextActiveId).toBe('tab-0');
  });
});
