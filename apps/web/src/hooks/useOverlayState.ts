import { useState, useCallback } from 'react';

export function useOverlayState() {
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [showPersonaSwitcher, setShowPersonaSwitcher] = useState(false);
  const [showWorkspaceSwitcher, setShowWorkspaceSwitcher] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [showSpawnAgent, setShowSpawnAgent] = useState(false);
  const [showLoginBriefing, setShowLoginBriefing] = useState(true);

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
