import { useEffect, useRef } from 'react';
import type { AppId } from '@/lib/dock-tiers';

interface UseKeyboardShortcutsOptions {
  onOpenApp: (id: AppId) => void;
  onToggleGlobalSearch: () => void;
  onTogglePersonaSwitcher: () => void;
  onToggleWorkspaceSwitcher: () => void;
  onToggleKeyboardHelp: () => void;
  onCloseTopWindow?: () => void;
  onMinimizeTopWindow?: () => void;
}

const APP_SHORTCUTS: Record<string, AppId> = {
  '0': 'dashboard',
  '1': 'chat',
  '2': 'agents',
  '3': 'files',
  '4': 'cockpit',
  '5': 'memory',
  '6': 'events',
  '7': 'settings',
  '8': 'capabilities',
  '9': 'waggle-dance',
};

/** Shortcuts that work even when an input/textarea is focused */
function isGlobalShortcut(e: KeyboardEvent): boolean {
  const ctrl = e.ctrlKey || e.metaKey;
  return (ctrl && e.key === 'k') || e.key === 'Escape' || (ctrl && e.shiftKey && (e.key === 'M' || e.key === 'm'));
}

function isInputFocused(): boolean {
  const active = document.activeElement;
  if (!active) return false;
  const tag = active.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || (active as HTMLElement).isContentEditable;
}

export const useKeyboardShortcuts = (options: UseKeyboardShortcutsOptions) => {
  // Store callbacks in refs so the event listener never re-registers
  const optsRef = useRef(options);
  optsRef.current = options;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const opts = optsRef.current;

      // Skip non-global shortcuts when typing in an input
      if (isInputFocused() && !isGlobalShortcut(e)) return;

      // Ctrl+W: Close focused window
      if (ctrl && e.key === 'w' && !e.shiftKey) {
        e.preventDefault();
        opts.onCloseTopWindow?.();
        return;
      }

      // Ctrl+Shift+M: Minimize focused window
      if (ctrl && e.shiftKey && (e.key === 'M' || e.key === 'm')) {
        e.preventDefault();
        opts.onMinimizeTopWindow?.();
        return;
      }

      // Ctrl+Shift+R: Open the Room (Phase A.3 — sub-agent visibility canvas)
      if (ctrl && e.shiftKey && (e.key === 'R' || e.key === 'r')) {
        e.preventDefault();
        opts.onOpenApp('room');
        return;
      }

      // Ctrl+Shift+0-9: Open apps
      if (ctrl && e.shiftKey && APP_SHORTCUTS[e.key]) {
        e.preventDefault();
        opts.onOpenApp(APP_SHORTCUTS[e.key]);
        return;
      }

      // Ctrl+K: Global search
      if (ctrl && e.key === 'k') {
        e.preventDefault();
        opts.onToggleGlobalSearch();
        return;
      }

      // Ctrl+Shift+P: Persona switcher
      if (ctrl && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        opts.onTogglePersonaSwitcher();
        return;
      }

      // Ctrl+Tab: Workspace switcher
      if (ctrl && e.key === 'Tab') {
        e.preventDefault();
        opts.onToggleWorkspaceSwitcher();
        return;
      }

      // Ctrl+?: Keyboard help
      if (ctrl && e.key === '?') {
        e.preventDefault();
        opts.onToggleKeyboardHelp();
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []); // Empty deps — handler is stable via ref
};
