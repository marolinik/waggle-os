/**
 * useTabs — React hook for multi-conversation tab management.
 *
 * Manages tab state: open, close, switch, reorder, and per-tab state.
 * Supports cross-workspace tabs (e.g., Marketing + Dev open simultaneously).
 */

import { useState, useCallback, useMemo, useRef } from 'react';
import type { ConversationTab } from '../components/tabs/tab-utils.js';
import {
  createTab,
  reorderTabs as reorderTabsUtil,
  removeTab as removeTabUtil,
  getNextActiveTab,
  updateTabState as updateTabStateUtil,
  canAddTab as canAddTabUtil,
  findTabBySession,
  MAX_VISIBLE_TABS,
} from '../components/tabs/tab-utils.js';

export interface UseTabsOptions {
  maxTabs?: number; // default MAX_VISIBLE_TABS (10)
}

export interface UseTabsReturn {
  tabs: ConversationTab[];
  activeTabId: string | null;
  openTab: (sessionId: string, workspaceId: string, title: string, icon?: string) => string | null;
  closeTab: (tabId: string) => void;
  switchTab: (tabId: string) => void;
  reorderTab: (fromIndex: number, toIndex: number) => void;
  updateTabState: (
    tabId: string,
    state: Partial<Pick<ConversationTab, 'scrollPosition' | 'inputDraft' | 'pendingApprovals'>>,
  ) => void;
  canAddTab: boolean;
}

export function useTabs(options?: UseTabsOptions): UseTabsReturn {
  const maxTabs = options?.maxTabs ?? MAX_VISIBLE_TABS;
  const [tabs, setTabs] = useState<ConversationTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // Refs for stale-closure-free access in callbacks
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;

  const canAdd = useMemo(() => canAddTabUtil(tabs, maxTabs), [tabs, maxTabs]);

  const openTab = useCallback(
    (sessionId: string, workspaceId: string, title: string, icon?: string): string | null => {
      let resultId: string = '';
      setTabs((prev) => {
        const existing = findTabBySession(prev, sessionId);
        if (existing) {
          resultId = existing.id;
          return prev;
        }
        if (prev.length >= maxTabs) {
          resultId = '';
          return prev;
        }
        const tab = createTab(sessionId, workspaceId, title, icon);
        tab.order = prev.length;
        resultId = tab.id;
        return [...prev, tab];
      });
      if (resultId) setActiveTabId(resultId);
      return resultId || null;
    },
    [maxTabs],
  );

  const closeTab = useCallback((tabId: string) => {
    const nextActive = getNextActiveTab(tabsRef.current, tabId, activeTabIdRef.current ?? '');
    setActiveTabId(nextActive);
    setTabs((prev) => removeTabUtil(prev, tabId));
  }, []);

  const switchTab = useCallback((tabId: string) => {
    setActiveTabId(tabId);
  }, []);

  const reorderTab = useCallback((fromIndex: number, toIndex: number) => {
    setTabs((prev) => reorderTabsUtil(prev, fromIndex, toIndex));
  }, []);

  const updateTabStateCb = useCallback(
    (
      tabId: string,
      state: Partial<Pick<ConversationTab, 'scrollPosition' | 'inputDraft' | 'pendingApprovals'>>,
    ) => {
      setTabs((prev) =>
        prev.map((t) => (t.id === tabId ? updateTabStateUtil(t, state) : t)),
      );
    },
    [],
  );

  return {
    tabs,
    activeTabId,
    openTab,
    closeTab,
    switchTab,
    reorderTab,
    updateTabState: updateTabStateCb,
    canAddTab: canAdd,
  };
}
