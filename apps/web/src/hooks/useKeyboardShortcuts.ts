import { useEffect } from 'react';
import type { AppId } from '@/components/os/Dock';

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

export const useKeyboardShortcuts = ({
  onOpenApp,
  onToggleGlobalSearch,
  onTogglePersonaSwitcher,
  onToggleWorkspaceSwitcher,
  onToggleKeyboardHelp,
  onCloseTopWindow,
  onMinimizeTopWindow,
}: UseKeyboardShortcutsOptions) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;

      // Ctrl+W: Close focused window (prevent browser tab close)
      if (ctrl && e.key === 'w' && !e.shiftKey) {
        e.preventDefault();
        onCloseTopWindow?.();
        return;
      }

      // Ctrl+Shift+M: Minimize focused window
      if (ctrl && e.shiftKey && (e.key === 'M' || e.key === 'm')) {
        e.preventDefault();
        onMinimizeTopWindow?.();
        return;
      }

      // Ctrl+Shift+0-7: Open apps
      if (ctrl && e.shiftKey && APP_SHORTCUTS[e.key]) {
        e.preventDefault();
        onOpenApp(APP_SHORTCUTS[e.key]);
        return;
      }

      // Ctrl+K: Global search
      if (ctrl && e.key === 'k') {
        e.preventDefault();
        onToggleGlobalSearch();
        return;
      }

      // Ctrl+Shift+P: Persona switcher
      if (ctrl && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        onTogglePersonaSwitcher();
        return;
      }

      // Ctrl+Tab: Workspace switcher
      if (ctrl && e.key === 'Tab') {
        e.preventDefault();
        onToggleWorkspaceSwitcher();
        return;
      }

      // Ctrl+?: Keyboard help
      if (ctrl && e.key === '?') {
        e.preventDefault();
        onToggleKeyboardHelp();
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onOpenApp, onToggleGlobalSearch, onTogglePersonaSwitcher, onToggleWorkspaceSwitcher, onToggleKeyboardHelp, onCloseTopWindow, onMinimizeTopWindow]);
};
