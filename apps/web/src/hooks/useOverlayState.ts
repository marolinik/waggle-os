import { useState, useCallback } from 'react';

/**
 * E2E-only: `?skipBriefing=true` suppresses the LoginBriefing overlay that
 * otherwise covers the desktop and intercepts dock clicks on every load.
 * Mirrors the `?skipOnboarding=true` bypass in `useOnboarding.ts` so
 * Playwright can interact with the dock without tearing down overlays.
 */
function readSkipBriefing(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('skipBriefing') === 'true';
  } catch {
    return false;
  }
}

export function useOverlayState() {
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [showPersonaSwitcher, setShowPersonaSwitcher] = useState(false);
  const [showWorkspaceSwitcher, setShowWorkspaceSwitcher] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [showSpawnAgent, setShowSpawnAgent] = useState(false);
  const [showLoginBriefing, setShowLoginBriefing] = useState(() => !readSkipBriefing());

  const toggleGlobalSearch = useCallback(() => setShowGlobalSearch(p => !p), []);
  const togglePersonaSwitcher = useCallback(() => setShowPersonaSwitcher(p => !p), []);
  const toggleWorkspaceSwitcher = useCallback(() => setShowWorkspaceSwitcher(p => !p), []);
  const toggleNotifications = useCallback(() => setShowNotifications(p => !p), []);
  const toggleKeyboardHelp = useCallback(() => setShowKeyboardHelp(p => !p), []);

  return {
    showGlobalSearch, setShowGlobalSearch, toggleGlobalSearch,
    showCreateWorkspace, setShowCreateWorkspace,
    showPersonaSwitcher, setShowPersonaSwitcher, togglePersonaSwitcher,
    showWorkspaceSwitcher, setShowWorkspaceSwitcher, toggleWorkspaceSwitcher,
    showNotifications, setShowNotifications, toggleNotifications,
    showKeyboardHelp, setShowKeyboardHelp, toggleKeyboardHelp,
    showSpawnAgent, setShowSpawnAgent,
    showLoginBriefing, setShowLoginBriefing,
  };
}
