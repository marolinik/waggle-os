/**
 * useKeyboardShortcuts — Registers all global keyboard shortcuts.
 *
 * Handles: Escape (close modals), Ctrl+B (toggle sidebar), Ctrl+T (new tab),
 * Ctrl+K (global search), Ctrl+1-9 (quick-switch workspaces),
 * Ctrl+N (create workspace), Ctrl+, (settings), Ctrl+/ (help),
 * Ctrl+Shift+P (persona), Ctrl+Shift+1-7 (view switching).
 */

import { useEffect } from 'react';
import { matchesNamedShortcut } from '@waggle/ui';
import type { Workspace } from '@waggle/ui';

type AppView = 'chat' | 'memory' | 'events' | 'capabilities' | 'cockpit' | 'mission-control' | 'settings';

export interface UseKeyboardShortcutsOptions {
  /** Currently previewed file (for Escape handling) */
  hasPreviewFile: boolean;
  /** Whether the create-workspace dialog is open */
  showCreateWorkspace: boolean;
  /** All workspaces (for Ctrl+1-9 quick-switch) */
  workspaces: Workspace[];
  /** Callbacks for the various shortcut actions */
  onClosePreview: () => void;
  onCloseCreateWorkspace: () => void;
  onToggleSidebar: () => void;
  onNewTab: () => void;
  onToggleGlobalSearch: () => void;
  onSelectWorkspace: (id: string) => void;
  onShowCreateWorkspace: () => void;
  onOpenSettings: () => void;
  onToggleHelp: () => void;
  onTogglePersonaSwitcher: () => void;
  onToggleWorkspaceSwitcher: () => void;
  onViewChange: (view: AppView) => void;
}

export function useKeyboardShortcuts({
  hasPreviewFile,
  showCreateWorkspace,
  workspaces,
  onClosePreview,
  onCloseCreateWorkspace,
  onToggleSidebar,
  onNewTab,
  onToggleGlobalSearch,
  onSelectWorkspace,
  onShowCreateWorkspace,
  onOpenSettings,
  onToggleHelp,
  onTogglePersonaSwitcher,
  onToggleWorkspaceSwitcher,
  onViewChange,
}: UseKeyboardShortcutsOptions): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (matchesNamedShortcut(e, 'closeModal')) {
        if (hasPreviewFile) {
          onClosePreview();
        } else if (showCreateWorkspace) {
          onCloseCreateWorkspace();
        }
      }
      if (matchesNamedShortcut(e, 'toggleWorkspace')) {
        e.preventDefault();
        onToggleSidebar();
      }
      if (matchesNamedShortcut(e, 'newTab')) {
        e.preventDefault();
        onNewTab();
      }
      // F6: Ctrl+K (or Cmd+K) — Global search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        onToggleGlobalSearch();
      }
      // G2: Ctrl+1-9 quick-switch workspaces
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key, 10) - 1;
        if (idx < workspaces.length) {
          e.preventDefault();
          onSelectWorkspace(workspaces[idx].id);
        }
      }
      // Cmd+N — create workspace
      if (matchesNamedShortcut(e, 'newWorkspace')) {
        e.preventDefault();
        onShowCreateWorkspace();
      }
      // Cmd+, — open settings
      if (matchesNamedShortcut(e, 'openSettings')) {
        e.preventDefault();
        onOpenSettings();
      }
      // Cmd+/ — show help overlay
      if (matchesNamedShortcut(e, 'showHelp')) {
        e.preventDefault();
        onToggleHelp();
      }
      // Ctrl+Shift+P — switch persona
      if (matchesNamedShortcut(e, 'switchPersona')) {
        e.preventDefault();
        onTogglePersonaSwitcher();
      }
      // Ctrl+Tab — quick-switch workspace
      if (matchesNamedShortcut(e, 'quickSwitchWorkspace')) {
        e.preventDefault();
        onToggleWorkspaceSwitcher();
      }
      // Ctrl+Shift+1-7 — switch views
      const viewMap: Record<string, AppView> = {
        switchView1: 'chat',
        switchView2: 'memory',
        switchView3: 'events',
        switchView4: 'capabilities',
        switchView5: 'cockpit',
        switchView6: 'mission-control',
        switchView7: 'settings',
      };
      for (const [shortcutName, view] of Object.entries(viewMap)) {
        if (matchesNamedShortcut(e, shortcutName)) {
          e.preventDefault();
          onViewChange(view);
          break;
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    hasPreviewFile,
    showCreateWorkspace,
    workspaces,
    onClosePreview,
    onCloseCreateWorkspace,
    onToggleSidebar,
    onNewTab,
    onToggleGlobalSearch,
    onSelectWorkspace,
    onShowCreateWorkspace,
    onOpenSettings,
    onToggleHelp,
    onTogglePersonaSwitcher,
    onToggleWorkspaceSwitcher,
    onViewChange,
  ]);
}
