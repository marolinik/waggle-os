import { useState, useCallback } from 'react';
import {
  shouldShowLoginBriefing,
  readLoginBriefingDismissed,
  readSkipBriefingParam,
} from '@/lib/login-briefing';

/**
 * Briefing visibility is decided once on mount and persists until the
 * user dismisses. Per-session behaviour is implicit: React state resets
 * on every page load, so the briefing reappears each session unless
 * the user has permanently opted out via "Don't show again"
 * (localStorage `waggle:login-briefing-dismissed`).
 *
 * `?skipBriefing=true` stays as an E2E escape hatch so Playwright can
 * interact with the dock without tearing down overlays.
 */

export function useOverlayState() {
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [showPersonaSwitcher, setShowPersonaSwitcher] = useState(false);
  const [showWorkspaceSwitcher, setShowWorkspaceSwitcher] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [showSpawnAgent, setShowSpawnAgent] = useState(false);
  const [showLoginBriefing, setShowLoginBriefing] = useState(() =>
    shouldShowLoginBriefing({
      skipBriefing: readSkipBriefingParam(),
      permanentlyDismissed: readLoginBriefingDismissed(),
    }),
  );

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
