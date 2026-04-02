/**
 * App.tsx — Main Waggle desktop application.
 *
 * Full desktop experience wiring all @waggle/ui components:
 * - Chat with file drop, session tabs, tool cards, approval gates
 * - Sidebar with workspace tree, navigation icons, workspace creation
 * - Settings panel with config management
 * - Memory browser with search, frame timeline, frame detail
 * - Event stream with step cards
 * - Onboarding wizard on first run
 * - File preview modal
 * - Keyboard shortcuts
 *
 * App-level orchestration state is extracted into focused hooks:
 * - useToastManager: toast lifecycle + notification→toast conversion
 * - useOfflineStatus: server reachability polling
 * - useAgentStatus: token/cost/model polling + model selection
 * - useTeamState: team messages polling + team connection lifecycle
 * - useKeyboardShortcuts: global keydown handler registration
 * - useApprovalGates: pending approval recovery + approve/deny handlers
 */

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import type { Message, WaggleConfig, WorkspaceContext, Frame, FileEntry, DroppedFile, WorkspaceMicroStatus } from '@waggle/ui';
import {
  ThemeProvider,
  useTheme,
  AppShell,
  StatusBar,
  CreateWorkspaceDialog,
  Modal,
  FilePreview,
  LocalAdapter,
  useChat,
  useWorkspaces,
  useTabs,
  useMemory,
  useEvents,
  useSessions,
  useApprovalGate,
  useTeamPresence,
  useTeamActivity,
  useNotifications,
  useSubAgentStatus,
  ToastContainer,
  categorizeFile,
} from '@waggle/ui';
import type { PersonaOption } from '@waggle/ui';
import { ServiceProvider, useService } from './providers/ServiceProvider';
import { AppSidebar } from './components/AppSidebar';
import { ContextPanel } from './components/ContextPanel';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ChatView } from './views/ChatView';
import { GlobalSearch } from './components/GlobalSearch';
import type { GlobalSearchResultType } from './components/GlobalSearch';
import { KeyboardShortcutsHelp } from './components/KeyboardShortcutsHelp';
import { PersonaSwitcher } from './components/PersonaSwitcher';
import { NotificationInbox } from './components/NotificationInbox';
import { WorkspaceSwitcher } from './components/WorkspaceSwitcher';
import { OnboardingWizard as EnhancedOnboardingWizard } from './components/onboarding/OnboardingWizard';
import { useOnboarding } from './hooks/useOnboarding';
import { getServerBaseUrl } from './lib/ipc';
import { TierProvider } from './context/TierContext';

// ── Extracted hooks ──────────────────────────────────────────────────────
import { useToastManager } from './hooks/useToastManager';
import { useOfflineStatus } from './hooks/useOfflineStatus';
import { useAgentStatus } from './hooks/useAgentStatus';
import { useTeamState } from './hooks/useTeamState';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useApprovalGates } from './hooks/useApprovalGates';
import { useAutoUpdate } from './hooks/useAutoUpdate';

// ── Code-split views (loaded on demand) ─────────────────────────────────
const SettingsView = React.lazy(() => import('./views/SettingsView'));
const MemoryView = React.lazy(() => import('./views/MemoryView'));
const EventsView = React.lazy(() => import('./views/EventsView'));
const CapabilitiesView = React.lazy(() => import('./views/CapabilitiesView'));
const CockpitView = React.lazy(() => import('./views/CockpitView'));
const MissionControlView = React.lazy(() => import('./views/MissionControlView'));
const DashboardView = React.lazy(() => import('./views/DashboardView'));

const SERVER_BASE = getServerBaseUrl();
const adapter = new LocalAdapter({ baseUrl: SERVER_BASE });

/** Derive a stable hue (0-360) from a workspace name for visual identity */
function workspaceHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return ((hash % 360) + 360) % 360;
}

/** Convert raw model IDs to friendly display names */
function friendlyModelName(model: string): string {
  if (model.includes('opus')) return 'Claude Opus';
  if (model.includes('sonnet')) return 'Claude Sonnet';
  if (model.includes('haiku')) return 'Claude Haiku';
  if (model.includes('gpt-4o')) return 'GPT-4o';
  if (model.includes('gpt-4')) return 'GPT-4';
  if (model.includes('gpt-3')) return 'GPT-3.5';
  // Return last segment if it's a path-like ID
  const parts = model.split('/');
  return parts[parts.length - 1];
}

import type { AppView } from './types';


function WaggleApp() {
  const service = useService();
  const { toggleTheme } = useTheme();

  // ── Auto-update (silent, non-blocking — Rust checks, frontend listens) ──
  useAutoUpdate();

  // ── View state ────────────────────────────────────────────────────
  const [newMemoryCount, setNewMemoryCount] = useState(0);
  const prevSaveMemoryCountRef = useRef(0);
  const [currentView, setCurrentView] = useState<AppView>('chat');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [contextPanelOpen, setContextPanelOpen] = useState(true);

  // W4.7: Auto-collapse sidebar/context panel on narrow viewports
  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      if (w < 1024) {
        setSidebarCollapsed(true);
      }
      if (w < 1280) {
        setContextPanelOpen(false);
      } else {
        setContextPanelOpen(true);
      }
    };
    handleResize(); // run on mount
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const [previewFile, setPreviewFile] = useState<FileEntry | null>(null);
  const [config, setConfig] = useState<WaggleConfig | null>(null);
  // F6: Global search state
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  // Keyboard shortcuts help overlay
  const [showHelp, setShowHelp] = useState(false);
  // Persona switcher dialog state
  const [showPersonaSwitcher, setShowPersonaSwitcher] = useState(false);
  // Q16:C — Notification inbox panel state
  const [showNotificationInbox, setShowNotificationInbox] = useState(false);
  // Workspace quick-switch overlay state (Ctrl+Tab)
  const [showWorkspaceSwitcher, setShowWorkspaceSwitcher] = useState(false);

  // IMP-007: Reset memory badge when switching to Memory view
  const handleViewChange = useCallback((view: AppView) => {
    if (view === 'memory') setNewMemoryCount(0);
    setCurrentView(view);
  }, []);

  // ── Workspaces ────────────────────────────────────────────────────
  const {
    workspaces,
    activeWorkspace,
    setActiveWorkspace,
    createWorkspace,
    updateWorkspace,
  } = useWorkspaces({ service });

  // ── Team presence (I4) ───────────────────────────────────────────
  const { members: teamMembers } = useTeamPresence({
    teamId: activeWorkspace?.teamId,
    service,
  });
  const { items: teamActivity, loading: teamActivityLoading } = useTeamActivity({
    teamId: activeWorkspace?.teamId,
  });

  // ── Team messages + connection (extracted) ────────────────────────
  const {
    teamMessages,
    teamConnection,
    handleTeamConnect,
    handleTeamDisconnect,
    handleFetchTeams,
  } = useTeamState({
    teamId: activeWorkspace?.teamId,
    serverBaseUrl: SERVER_BASE,
    adapter,
  });

  // ── Agent personas (for workspace creation) ────────────────────
  const [personas, setPersonas] = useState<PersonaOption[]>([]);
  useEffect(() => {
    fetch(`${SERVER_BASE}/api/personas`)
      .then(r => r.ok ? r.json() as Promise<{ personas: PersonaOption[] }> : null)
      .then(data => { if (data?.personas) setPersonas(data.personas); })
      .catch(() => { /* personas are optional — degrade gracefully */ });
  }, []);

  // ── Notifications + Toasts (extracted) ────────────────────────────
  const { notifications } = useNotifications(SERVER_BASE);
  const { toasts, setToasts, dismissToast } = useToastManager({ notifications });

  // ── Sub-agent status + Workflow suggestions (via SSE) ──────────
  const { subAgents, workflowSuggestion, dismissSuggestion } = useSubAgentStatus(
    SERVER_BASE,
    activeWorkspace?.id,
  );

  const handleWorkflowAccept = useCallback(async (pattern: { name: string; description: string; steps: string[]; tools: string[]; category: string }) => {
    try {
      await fetch(`${SERVER_BASE}/api/skills/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: pattern.name,
          description: pattern.description,
          steps: pattern.steps,
          tools: pattern.tools,
          category: pattern.category,
        }),
      });
      dismissSuggestion();
      setToasts(prev => [{
        id: `wf-${Date.now()}`,
        category: 'agent',
        title: 'Skill saved',
        body: `"${pattern.name}" is now a reusable skill.`,
        createdAt: Date.now(),
      }, ...prev]);
    } catch {
      setToasts(prev => [{
        id: `wf-err-${Date.now()}`,
        category: 'agent',
        title: 'Failed to save skill',
        body: 'Could not create skill from workflow pattern.',
        createdAt: Date.now(),
      }, ...prev]);
    }
  }, [dismissSuggestion, setToasts]);

  // ── Tray event listeners (Tauri only) ─────────────────────────
  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return;

    const listeners: Array<() => void> = [];

    (async () => {
      const eventModule = '@tauri-apps/' + 'api/event';
      const { listen } = await import(/* @vite-ignore */ eventModule);

      listeners.push(await listen('waggle://pause-agents', () => {
        console.log('[waggle] Pause agents toggled via tray');
      }));

      listeners.push(await listen('waggle://navigate', (event: any) => {
        const path = event.payload as string;
        console.log('[waggle] Navigate via tray:', path);
      }));

      listeners.push(await listen('waggle://quit', async () => {
        try {
          const coreModule = '@tauri-apps/' + 'api/core';
          const { invoke } = await import(/* @vite-ignore */ coreModule);
          await invoke('stop_service');
        } catch {}
        try {
          const processModule = '@tauri-apps/' + 'plugin-process';
          const { exit } = await import(/* @vite-ignore */ processModule);
          await exit(0);
        } catch {
          window.close();
        }
      }));

      listeners.push(await listen('waggle://service-status', (event: any) => {
        const payload = event.payload as { status: string };
        console.log('[waggle] Service status:', payload.status);
      }));

      listeners.push(await listen('waggle://service-restart-needed', async () => {
        try {
          const coreModule2 = '@tauri-apps/' + 'api/core';
          const { invoke } = await import(/* @vite-ignore */ coreModule2);
          await invoke('ensure_service');
        } catch {}
      }));
    })();

    return () => {
      listeners.forEach(unlisten => unlisten());
    };
  }, []);

  // ── Sessions ──────────────────────────────────────────────────────
  const {
    grouped: groupedSessions,
    activeSessionId,
    selectSession,
    createSession,
    deleteSession,
    renameSession,
    searchResults,
    searchLoading,
    searchSessions: doSearchSessions,
    clearSearch,
    exportSession,
  } = useSessions({
    service,
    workspaceId: activeWorkspace?.id ?? 'default',
  });

  // ── F7: Workspace micro-status for sidebar indicators ────────────
  const [workspaceMicroStatus, setWorkspaceMicroStatus] = useState<Record<string, WorkspaceMicroStatus>>({});

  useEffect(() => {
    if (workspaces.length === 0) return;

    const fetchMicroStatus = async () => {
      const status: Record<string, WorkspaceMicroStatus> = {};
      // BUG-R2-04: Limit context fetches to first 5 workspaces to prevent request storm
      const toFetch = workspaces.slice(0, 5);
      await Promise.allSettled(
        toFetch.map(async (ws) => {
          try {
            const res = await fetch(`${SERVER_BASE}/api/workspaces/${ws.id}/context`);
            if (res.ok) {
              const ctx = await res.json();
              status[ws.id] = {
                memoryCount: ctx.stats?.memoryCount ?? 0,
                lastActive: ctx.lastActive ?? ws.created,
              };
            }
          } catch {
            // Silent — workspace stats unavailable
          }
        })
      );
      setWorkspaceMicroStatus(status);
    };

    fetchMicroStatus();
  }, [workspaces]);

  // ── Workspace context (catch-up / return reward) ────────────────
  const [workspaceContext, setWorkspaceContext] = useState<WorkspaceContext | null>(null);
  useEffect(() => {
    if (!activeWorkspace?.id) {
      setWorkspaceContext(null);
      return;
    }
    // Fetch workspace context whenever workspace changes
    service.getWorkspaceContext(activeWorkspace.id)
      .then(setWorkspaceContext)
      .catch(() => setWorkspaceContext(null));
  }, [activeWorkspace?.id, service]);

  // ── Chat (with workspace directory and file preview) ──────────────
  const handleFileCreated = useCallback((filePath: string, action: 'write' | 'edit' | 'generate') => {
    // Auto-show file preview when agent creates/writes files
    const wsDir = activeWorkspace?.directory;
    const fullPath = wsDir ? `${wsDir}/${filePath}` : filePath;
    const parts = fullPath.replace(/\\/g, '/').split('/');
    const fileName = parts[parts.length - 1] || fullPath;
    const ext = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.') + 1) : '';
    setPreviewFile({
      path: fullPath,
      name: fileName,
      extension: ext,
      content: `File ${action === 'generate' ? 'generated' : action === 'edit' ? 'edited' : 'written'}: ${fullPath}`,
      action: action === 'edit' ? 'edit' : 'write',
      timestamp: new Date().toISOString(),
    });
  }, [activeWorkspace?.directory]);

  const {
    messages,
    setMessages,
    isLoading,
    sendMessage,
  } = useChat({
    service,
    workspace: activeWorkspace?.id ?? 'default',
    session: activeSessionId ?? undefined,
    workspacePath: activeWorkspace?.directory,
    onFileCreated: handleFileCreated,
  });

  // ── F7: Update active workspace agent status in micro-status ──
  useEffect(() => {
    if (!activeWorkspace?.id) return;
    setWorkspaceMicroStatus(prev => {
      const existing = prev[activeWorkspace.id] ?? {};
      if (existing.isAgentActive === isLoading) return prev;
      return { ...prev, [activeWorkspace.id]: { ...existing, isAgentActive: isLoading } };
    });
  }, [activeWorkspace?.id, isLoading]);

  // ── Approval gate (listens for WebSocket-based approval events) ──
  useApprovalGate({ service, setMessages });

  // ── Approval gates: pending recovery + approve/deny (extracted) ──
  const { handleToolApprove, handleToolDeny } = useApprovalGates({
    service,
    serverBaseUrl: SERVER_BASE,
    setMessages,
  });

  // ── IMP-007: Track new memory saves for nav badge ───────────────
  useEffect(() => {
    let count = 0;
    for (const msg of messages) {
      if (msg.toolUse) {
        for (const t of msg.toolUse) {
          if (t.name === 'save_memory' && t.status === 'done') count++;
        }
      }
    }
    const delta = count - prevSaveMemoryCountRef.current;
    if (delta > 0) {
      setNewMemoryCount(prev => prev + delta);
    }
    prevSaveMemoryCountRef.current = count;
  }, [messages]);

  // ── Agent status (extracted) ──────────────────────────────────────
  const {
    agentTokens,
    agentCost,
    agentModel,
    setAgentModel,
    availableModels,
    handleModelSelect: agentHandleModelSelect,
  } = useAgentStatus({ service, serverBaseUrl: SERVER_BASE });

  // ── Offline status (extracted) ────────────────────────────────────
  const { offlineStatus } = useOfflineStatus({ serverBaseUrl: SERVER_BASE });

  // ── Slash commands ──────────────────────────────────────────────
  // NOTE: Slash commands remain in App.tsx because they are deeply entangled
  // with agentModel (from useAgentStatus), setMessages (from useChat),
  // activeSessionId, activeWorkspace, and sendMessage. Extracting would
  // require passing 6+ dependencies and the resulting hook would not be
  // meaningfully self-contained.
  const addSystemMessage = useCallback((content: string) => {
    const msg: Message = {
      id: `sys-${Date.now()}`,
      role: 'system',
      content,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, msg]);
  }, [setMessages]);

  const handleSlashCommand = useCallback(async (command: string, args: string) => {
    const baseUrl = SERVER_BASE;
    try {
      switch (command) {
        case '/model': {
          if (!args) {
            addSystemMessage(`Current model: **${agentModel}**`);
          } else {
            await fetch(`${baseUrl}/api/agent/model`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ model: args }),
            });
            setAgentModel(args);
            addSystemMessage(`Switched to model: **${args}**`);
          }
          break;
        }
        case '/models': {
          const res = await fetch(`${baseUrl}/api/litellm/models`);
          if (res.ok) {
            const data = await res.json() as { models: string[] };
            const list = data.models.length > 0
              ? data.models.map(m => `- ${m}${m === agentModel ? ' **(active)**' : ''}`).join('\n')
              : 'No models available. Check LiteLLM configuration.';
            addSystemMessage(`**Available Models:**\n${list}`);
          } else {
            addSystemMessage('Failed to fetch models. Is LiteLLM running?');
          }
          break;
        }
        case '/cost': {
          const res = await fetch(`${baseUrl}/api/agent/cost`);
          if (res.ok) {
            const data = await res.json() as { summary: string };
            addSystemMessage(`**Cost:** ${data.summary}`);
          }
          break;
        }
        case '/clear': {
          setMessages([]);
          const sessionId = activeSessionId ?? activeWorkspace?.id ?? 'default';
          await fetch(`${baseUrl}/api/chat/history?session=${sessionId}`, { method: 'DELETE' });
          addSystemMessage('Conversation cleared.');
          break;
        }
        case '/identity': {
          const res = await fetch(`${baseUrl}/api/mind/identity`);
          if (res.ok) {
            const data = await res.json() as { identity: string };
            addSystemMessage(`**Identity:**\n${data.identity}`);
          }
          break;
        }
        case '/awareness': {
          const res = await fetch(`${baseUrl}/api/mind/awareness`);
          if (res.ok) {
            const data = await res.json() as { awareness: string };
            addSystemMessage(`**Awareness:**\n${data.awareness}`);
          }
          break;
        }
        case '/skills': {
          const res = await fetch(`${baseUrl}/api/skills`);
          if (res.ok) {
            const data = await res.json() as { skills: Array<{ name: string; length: number }>; count: number; directory: string };
            if (data.count === 0) {
              addSystemMessage(`No skills loaded. Add .md files to ${data.directory}`);
            } else {
              const list = data.skills.map(s => `- **${s.name}** (${s.length} chars)`).join('\n');
              addSystemMessage(`**Loaded Skills (${data.count}):**\n${list}\n\nDirectory: ${data.directory}`);
            }
          }
          break;
        }
        case '/git': {
          addSystemMessage('Git tools are available via the agent. Ask the agent to check git status.');
          break;
        }
        case '/help': {
          addSystemMessage(
            '**Available Commands:**\n\n' +
            '| Command | Description |\n' +
            '|---------|-------------|\n' +
            '| `/model [name]` | Show or switch the active LLM model |\n' +
            '| `/models` | List all available models |\n' +
            '| `/cost` | Show token usage and cost summary |\n' +
            '| `/clear` | Clear conversation history |\n' +
            '| `/identity` | Show agent identity |\n' +
            '| `/awareness` | Show agent self-awareness state |\n' +
            '| `/skills` | List loaded skills |\n' +
            '| `/git` | Git tool info |\n' +
            '| `/help` | Show this help message |\n\n' +
            '**Workflow Commands** (processed by agent):\n\n' +
            '| Command | Description |\n' +
            '|---------|-------------|\n' +
            '| `/research [topic]` | Deep research on a topic |\n' +
            '| `/draft [type]` | Draft a document |\n' +
            '| `/review [item]` | Review code or content |\n' +
            '| `/spawn [task]` | Spawn a sub-agent |\n' +
            '| `/plan [goal]` | Create a structured plan |\n\n' +
            'Other commands are sent to the server command registry.',
          );
          break;
        }
        default: {
          // Workflow commands that need LLM → send as regular agent message
          const llmCommands = ['/research', '/draft', '/review', '/spawn', '/plan'];
          if (llmCommands.includes(command)) {
            // Send the full command text as a user message so the agent handles it
            // with full workspace context + skills
            const fullText = args ? `${command} ${args}` : command;
            sendMessage(fullText);
            break;
          }

          // All other commands → try server command execution route
          const fullCommand = args ? `${command} ${args}` : command;
          const cmdRes = await fetch(`${baseUrl}/api/commands/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              command: fullCommand,
              workspaceId: activeWorkspace?.id,
            }),
          });
          if (cmdRes.ok) {
            const data = await cmdRes.json() as { result: string };
            addSystemMessage(data.result);
          } else {
            addSystemMessage(`Unknown command: ${command}. Type /help for available commands.`);
          }
          break;
        }
      }
    } catch (err) {
      addSystemMessage(`Command failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [agentModel, setAgentModel, activeSessionId, activeWorkspace?.id, addSystemMessage, sendMessage, setMessages]);

  // ── Tabs ──────────────────────────────────────────────────────────
  const {
    tabs,
    activeTabId,
    openTab,
    closeTab,
    switchTab,
    canAddTab,
  } = useTabs();

  // ── Memory ────────────────────────────────────────────────────────
  const {
    frames,
    loading: memoryLoading,
    error: memoryError,
    search: memorySearch,
    filters: memoryFilters,
    setFilters: setMemoryFilters,
    stats: memoryStats,
  } = useMemory({
    service,
    workspaceId: activeWorkspace?.id,
  });
  const [selectedFrame, setSelectedFrame] = useState<Frame | undefined>(undefined);

  // Q22: Memory management callbacks (delete, edit, add)
  const handleDeleteFrame = useCallback(async (id: number) => {
    try {
      const wsParam = activeWorkspace?.id ? `?workspace=${activeWorkspace.id}` : '';
      const res = await fetch(`${SERVER_BASE}/api/memory/frames/${id}${wsParam}`, { method: 'DELETE' });
      if (res.ok) {
        // Clear selection if deleted frame was selected
        if (selectedFrame?.id === id) setSelectedFrame(undefined);
        // Refresh memory list
        memorySearch('');
      }
    } catch { /* network error — silently fail */ }
  }, [activeWorkspace?.id, selectedFrame?.id, memorySearch]);

  const handleEditFrame = useCallback(async (id: number, content: string, importance?: string) => {
    try {
      const wsParam = activeWorkspace?.id ? `?workspace=${activeWorkspace.id}` : '';
      const res = await fetch(`${SERVER_BASE}/api/memory/frames/${id}${wsParam}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, importance }),
      });
      if (res.ok) {
        // Refresh memory list to reflect update
        memorySearch('');
      }
    } catch { /* network error — silently fail */ }
  }, [activeWorkspace?.id, memorySearch]);

  const handleAddFrame = useCallback(async (content: string, importance: string) => {
    try {
      const res = await fetch(`${SERVER_BASE}/api/memory/frames`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, importance, workspace: activeWorkspace?.id }),
      });
      if (res.ok) {
        // Refresh memory list to show new frame
        memorySearch('');
      }
    } catch { /* network error — silently fail */ }
  }, [activeWorkspace?.id, memorySearch]);

  // ── Events ────────────────────────────────────────────────────────
  const {
    steps,
    autoScroll,
    toggleAutoScroll,
    filter: eventFilter,
    setFilter: setEventFilter,
  } = useEvents({ service });

  // ── Onboarding ────────────────────────────────────────────────────
  // Check if onboarding is needed on mount
  useEffect(() => {
    service.getConfig()
      .then((cfg) => {
        setConfig(cfg);
        const hasProviders = cfg.providers && Object.keys(cfg.providers).length > 0;
        if (!hasProviders) {
          setShowOnboarding(true);
        }
      })
      .catch(() => {
        setShowOnboarding(true);
      });
  }, [service]);

  // Legacy onboarding handler removed — EnhancedOnboardingWizard uses onComplete/onFinish props directly

  const handleConfigUpdate = useCallback(async (updates: Partial<WaggleConfig>) => {
    await service.updateConfig(updates);
    setConfig((prev) => prev ? { ...prev, ...updates } : null);
    // If theme changed, toggle the ThemeProvider context too
    if (updates.theme) {
      toggleTheme();
    }
  }, [service, toggleTheme]);

  // ── Tab management ────────────────────────────────────────────────
  const handleNewTab = useCallback(() => {
    if (!canAddTab || !activeWorkspace) return;
    createSession().then((session) => {
      openTab(session.id, activeWorkspace.id, session.title ?? 'New Chat');
    });
  }, [canAddTab, activeWorkspace, createSession, openTab]);

  const handleTabSelect = useCallback((tabId: string) => {
    switchTab(tabId);
    const tab = tabs.find((t) => t.id === tabId);
    if (tab) {
      selectSession(tab.sessionId);
    }
  }, [switchTab, tabs, selectSession]);

  const handleTabClose = useCallback((tabId: string) => {
    closeTab(tabId);
  }, [closeTab]);

  // ── Keyboard shortcuts (extracted) ────────────────────────────────
  useKeyboardShortcuts({
    hasPreviewFile: previewFile !== null,
    showCreateWorkspace,
    workspaces,
    onClosePreview: useCallback(() => setPreviewFile(null), []),
    onCloseCreateWorkspace: useCallback(() => setShowCreateWorkspace(false), []),
    onToggleSidebar: useCallback(() => setSidebarCollapsed(prev => !prev), []),
    onNewTab: handleNewTab,
    onToggleGlobalSearch: useCallback(() => setGlobalSearchOpen(prev => !prev), []),
    onSelectWorkspace: setActiveWorkspace,
    onShowCreateWorkspace: useCallback(() => setShowCreateWorkspace(true), []),
    onOpenSettings: useCallback(() => handleViewChange('settings'), [handleViewChange]),
    onToggleHelp: useCallback(() => setShowHelp(prev => !prev), []),
    onTogglePersonaSwitcher: useCallback(() => setShowPersonaSwitcher(prev => !prev), []),
    onToggleWorkspaceSwitcher: useCallback(() => setShowWorkspaceSwitcher(prev => !prev), []),
    onViewChange: handleViewChange,
  });

  // ── File drop — read, upload to ingest API, send context to agent ──
  const handleFileDrop = useCallback(async (files: DroppedFile[]) => {
    // Files with content can be ingested via the API
    const filesWithContent = files.filter((f) => f.content);
    if (filesWithContent.length === 0) {
      // Fallback: no content read, just send names
      const summary = files.map((f) => `[File: ${f.name}]`).join(', ');
      sendMessage(`I've dropped these files: ${summary}`);
      return;
    }

    try {
      const response = await fetch(`${SERVER_BASE}/api/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: filesWithContent.map((f) => ({ name: f.name, content: f.content })),
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Upload failed' }));
        sendMessage(`File upload failed: ${(err as Record<string, unknown>).error ?? 'Unknown error'}`);
        return;
      }

      const data = await response.json() as {
        files: Array<{ name: string; type: string; summary: string; content?: string }>;
      };

      // Build a rich context message for the agent with file contents
      const parts = data.files.map((f) => {
        if ((f.type === 'text' || f.type === 'document' || f.type === 'spreadsheet') && f.content) {
          const preview = f.content.length > 4000
            ? f.content.slice(0, 4000) + '\n... (truncated)'
            : f.content;
          const lang = f.type === 'spreadsheet' ? 'csv' : '';
          return `**${f.name}** (${f.summary}):\n\`\`\`${lang}\n${preview}\n\`\`\``;
        }
        if (f.type === 'csv' && f.content) {
          const preview = f.content.length > 4000
            ? f.content.slice(0, 4000) + '\n... (truncated)'
            : f.content;
          return `**${f.name}** (${f.summary}):\n\`\`\`csv\n${preview}\n\`\`\``;
        }
        if (f.type === 'image' && f.content) {
          // C5: Pass full data URI for vision-capable models, not truncated
          // The agent loop handles token counting; the model needs the full image
          return `**${f.name}** — ${f.summary}\n![${f.name}](${f.content})`;
        }
        if (f.type === 'archive' && f.content) {
          return `**${f.name}** (${f.summary}):\n\`\`\`\n${f.content}\n\`\`\``;
        }
        return `**${f.name}** — ${f.summary}`;
      });

      // Also set the first text-like file as preview in context panel
      const textFile = data.files.find((f) =>
        (f.type === 'text' || f.type === 'csv' || f.type === 'document' || f.type === 'spreadsheet') && f.content
      );
      if (textFile && textFile.content) {
        const tfName = textFile.name;
        const tfExt = tfName.includes('.') ? tfName.slice(tfName.lastIndexOf('.') + 1) : '';
        setPreviewFile({
          path: tfName,
          name: tfName,
          extension: tfExt,
          content: textFile.content,
          action: 'read',
          timestamp: new Date().toISOString(),
        });
      }

      sendMessage(
        `I've uploaded ${data.files.length} file(s). Here's the content:\n\n` +
        parts.join('\n\n')
      );
    } catch (err) {
      sendMessage(`File upload error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [sendMessage]);

  // ── File select via + button — convert raw File[] to DroppedFile[] and reuse handleFileDrop ──
  const handleFileSelect = useCallback(async (files: File[]) => {
    const droppedFiles: DroppedFile[] = [];
    for (const file of files) {
      const df = categorizeFile(file.name, file.size);
      // Read as base64
      const b64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Strip the data:...;base64, prefix
          const base64 = result.includes(',') ? result.split(',')[1] : result;
          resolve(base64);
        };
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
      });
      if (b64) {
        df.content = b64;
        droppedFiles.push(df);
      }
    }
    if (droppedFiles.length > 0) {
      handleFileDrop(droppedFiles);
    }
  }, [handleFileDrop]);

  // ── Workspace creation ────────────────────────────────────────────
  const handleCreateWorkspace = useCallback(async (wsConfig: {
    name: string;
    group: string;
    model?: string;
    personality?: string;
    directory?: string;
    teamId?: string;
    teamServerUrl?: string;
    teamRole?: 'owner' | 'admin' | 'member' | 'viewer';
    teamUserId?: string;
    templateId?: string;
    templateConnectors?: string[];
    templateCommands?: string[];
    templateMemory?: string[];
  }) => {
    await createWorkspace(wsConfig);
    setShowCreateWorkspace(false);
  }, [createWorkspace]);

  // ── Session selection from context panel ──────────────────────────
  const handleSessionSelect = useCallback((id: string) => {
    selectSession(id);
    if (activeWorkspace) {
      openTab(id, activeWorkspace.id, 'Session');
    }
  }, [selectSession, activeWorkspace, openTab]);

  const handleCreateSessionFromPanel = useCallback(() => {
    createSession().then((s) => {
      if (activeWorkspace) {
        openTab(s.id, activeWorkspace.id, s.title ?? 'New Chat');
      }
    });
  }, [createSession, activeWorkspace, openTab]);

  // ── Model selection (wraps extracted hook's handler with addSystemMessage) ──
  const handleModelSelect = useCallback(async (newModel: string) => {
    await agentHandleModelSelect(newModel, addSystemMessage);
  }, [agentHandleModelSelect, addSystemMessage]);

  // ── Persona switching (mid-conversation) ─────────────────────────
  const currentPersona = personas.find(p => p.id === activeWorkspace?.personaId) ?? null;

  const handlePersonaSwitch = useCallback(async (personaId: string | null) => {
    if (!activeWorkspace?.id) return;
    try {
      // Update workspace config via hook (calls PUT /api/workspaces/:id and updates local state)
      await updateWorkspace(activeWorkspace.id, { personaId: personaId ?? undefined });
      const personaName = personaId
        ? personas.find(p => p.id === personaId)?.name ?? personaId
        : 'Default';
      const personaHintKey = 'waggle:hint:persona-shortcut';
      const hint = !localStorage.getItem(personaHintKey)
        ? (localStorage.setItem(personaHintKey, 'shown'), ' · Pro tip: Use Ctrl+Shift+P to switch personas anytime')
        : '';
      addSystemMessage(`Switched persona to **${personaName}**. Messages preserved — the next response will use the new persona.${hint}`);
    } catch {
      addSystemMessage('Failed to switch persona.');
    }
  }, [activeWorkspace?.id, updateWorkspace, personas, addSystemMessage]);

  // ── F5: Settings tab state (lifted for ContextPanel) ───────────────
  const [settingsTab, setSettingsTab] = useState('general');

  // ── F6: Global search handler ──────────────────────────────────────
  const handleGlobalSearchSelect = useCallback((type: GlobalSearchResultType, id: string) => {
    switch (type) {
      case 'workspace': {
        const ws = workspaces.find(w => w.id === id);
        if (ws) setActiveWorkspace(ws.id);
        handleViewChange('chat');
        break;
      }
      case 'command': {
        // Send the command as if typed in chat
        handleSlashCommand(id, '');
        handleViewChange('chat');
        break;
      }
      case 'settings': {
        setSettingsTab(id);
        handleViewChange('settings');
        break;
      }
    }
  }, [workspaces, setActiveWorkspace, handleSlashCommand, setSettingsTab, handleViewChange]);

  // ── F5: Event filter state for context panel ──────────────────────
  const [eventFilters, setEventFilters] = useState<Record<string, boolean>>({
    'Tool Call': true,
    'Memory': true,
    'Search': true,
    'File': true,
    'Response': true,
  });

  // ── F5: Cockpit health refresh (calls fetchHealth in CockpitView) ──
  const handleRefreshHealth = useCallback(() => {
    // Trigger a re-fetch by toggling a key; CockpitView manages its own
    // fetch logic, but we can call the health endpoint from here too
    fetch(`${SERVER_BASE}/health`).catch(() => {});
  }, []);

  // ── Should context panel show? ────────────────────────────────────
  const showContextPanel = contextPanelOpen;

  // ── Render ────────────────────────────────────────────────────────

  // Enhanced onboarding wizard state
  const onboarding = useOnboarding();

  // Show enhanced wizard on first run, or fall back to basic wizard if needed
  if (showOnboarding || onboarding.showWizard) {
    return (
      <EnhancedOnboardingWizard
        serverBaseUrl={SERVER_BASE}
        state={onboarding.state}
        onUpdate={onboarding.updateState}
        onNext={onboarding.nextStep}
        onComplete={(url) => {
          onboarding.complete(url);
          setShowOnboarding(false);
          service.getConfig().then(setConfig).catch(() => {});
        }}
        onDismiss={() => {
          onboarding.dismiss();
          setShowOnboarding(false);
        }}
        onFinish={(_workspaceId, _firstMessage) => {
          // Workspace was created during onboarding but don't auto-open it.
          // Land on Dashboard so the user sees their workspaces and clicks in manually.
          setCurrentView('dashboard');
        }}
      />
    );
  }

  return (
    <>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <AppShell
        sidebar={
          <AppSidebar
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed((prev) => !prev)}
            workspaces={workspaces}
            activeWorkspaceId={activeWorkspace?.id}
            onSelectWorkspace={setActiveWorkspace}
            currentView={currentView}
            onViewChange={handleViewChange}
            onCreateWorkspace={() => setShowCreateWorkspace(true)}
            onOpenSearch={() => setGlobalSearchOpen(true)}
            onOpenHelp={() => setShowHelp(true)}
            microStatus={workspaceMicroStatus}
            memoryBadge={newMemoryCount}
          />
        }
        content={
          <div
            key={activeWorkspace?.id ?? 'none'}
            className="workspace-transition h-full overflow-hidden relative"
            style={{ '--workspace-hue': activeWorkspace ? workspaceHue(activeWorkspace.name) : 220 } as React.CSSProperties}
          >
            {/* Q16:C — Notification bell + inbox */}
            <div className="absolute top-2 right-3 z-40">
              <button
                onClick={() => setShowNotificationInbox(prev => !prev)}
                className="relative p-1.5 rounded-lg transition-colors cursor-pointer"
                style={{
                  color: 'var(--hive-400, #8a8d9a)',
                  backgroundColor: showNotificationInbox ? 'var(--honey-glow, rgba(229,160,0,0.08))' : 'transparent',
                }}
                title="Notifications"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {notifications.length > 0 && (
                  <span
                    className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center text-[9px] font-bold rounded-full px-1"
                    style={{ backgroundColor: 'var(--honey-500, #e5a000)', color: 'var(--hive-900, #0f1117)' }}
                  >
                    {notifications.length > 99 ? '99+' : notifications.length}
                  </span>
                )}
              </button>
              <NotificationInbox
                open={showNotificationInbox}
                onClose={() => setShowNotificationInbox(false)}
                serverBaseUrl={SERVER_BASE}
                sseNotificationCount={notifications.length}
              />
            </div>
            {currentView === 'dashboard' && (
              <ErrorBoundary viewName="Dashboard">
                <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Loading...</div>}>
                  <DashboardView
                    workspaces={workspaces}
                    activeWorkspaceId={activeWorkspace?.id ?? null}
                    microStatus={workspaceMicroStatus}
                    onSelectWorkspace={setActiveWorkspace}
                    onCreateWorkspace={() => setShowCreateWorkspace(true)}
                  />
                </Suspense>
              </ErrorBoundary>
            )}
            {currentView === 'chat' && (
              <ErrorBoundary viewName="Chat">
                <ChatView
                  tabs={tabs.map((t) => ({ id: t.id, label: t.title, icon: t.workspaceIcon }))}
                  activeTabId={activeTabId}
                  onTabSelect={handleTabSelect}
                  onTabClose={handleTabClose}
                  onTabAdd={handleNewTab}
                  messages={messages}
                  isLoading={isLoading}
                  onSendMessage={sendMessage}
                  onSlashCommand={handleSlashCommand}
                  onFileDrop={handleFileDrop}
                  onFileSelect={handleFileSelect}
                  onToolApprove={handleToolApprove}
                  onToolDeny={handleToolDeny}
                  workspaceContext={workspaceContext}
                  onThreadSelect={handleSessionSelect}
                  workspaceName={activeWorkspace?.name}
                  currentPersona={currentPersona}
                  onPersonaClick={() => setShowPersonaSwitcher(true)}
                  subAgents={subAgents}
                  workflowSuggestion={workflowSuggestion}
                  onWorkflowAccept={handleWorkflowAccept}
                  onWorkflowDismiss={dismissSuggestion}
                />
              </ErrorBoundary>
            )}
            {currentView === 'settings' && (
              <ErrorBoundary viewName="Settings">
                <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Loading...</div>}>
                  <SettingsView
                    config={config}
                    onConfigUpdate={handleConfigUpdate}
                    onTestApiKey={(provider, key) => service.testApiKey(provider, key)}
                    teamConnection={teamConnection}
                    onTeamConnect={handleTeamConnect}
                    onTeamDisconnect={handleTeamDisconnect}
                    activeTab={settingsTab}
                    onTabChange={setSettingsTab}
                    serverUrl={SERVER_BASE}
                  />
                </Suspense>
              </ErrorBoundary>
            )}
            {currentView === 'memory' && (
              <ErrorBoundary viewName="Memory">
                <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Loading...</div>}>
                  <MemoryView
                    frames={frames}
                    selectedFrame={selectedFrame}
                    onSelectFrame={setSelectedFrame}
                    onSearch={memorySearch}
                    filters={memoryFilters}
                    onFiltersChange={setMemoryFilters}
                    stats={memoryStats ?? undefined}
                    loading={memoryLoading}
                    error={memoryError}
                    onRetry={() => memorySearch('')}
                    onDeleteFrame={handleDeleteFrame}
                    onEditFrame={handleEditFrame}
                    onAddFrame={handleAddFrame}
                  />
                </Suspense>
              </ErrorBoundary>
            )}
            {currentView === 'events' && (
              <ErrorBoundary viewName="Events">
                <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Loading...</div>}>
                  <EventsView
                    steps={steps}
                    autoScroll={autoScroll}
                    onToggleAutoScroll={toggleAutoScroll}
                    filter={eventFilter}
                    onFilterChange={setEventFilter}
                    workspaceId={activeWorkspace?.id}
                  />
                </Suspense>
              </ErrorBoundary>
            )}
            {currentView === 'capabilities' && (
              <ErrorBoundary viewName="Capabilities">
                <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Loading...</div>}>
                  <CapabilitiesView onNavigate={(view, tab) => { if (tab) setSettingsTab(tab); handleViewChange(view as AppView); }} />
                </Suspense>
              </ErrorBoundary>
            )}
            {currentView === 'cockpit' && (
              <ErrorBoundary viewName="Cockpit">
                <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Loading...</div>}>
                  <CockpitView />
                </Suspense>
              </ErrorBoundary>
            )}
            {currentView === 'mission-control' && (
              <ErrorBoundary viewName="Mission Control">
                <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Loading...</div>}>
                  <MissionControlView />
                </Suspense>
              </ErrorBoundary>
            )}
          </div>
        }
        contextPanelOpen={contextPanelOpen}
        onToggleContextPanel={() => setContextPanelOpen(prev => !prev)}
        contextPanel={
          showContextPanel ? (
            <ContextPanel
              currentView={currentView}
              workspaceInfo={workspaceContext ? {
                name: workspaceContext.workspace.name,
                group: workspaceContext.workspace.group,
                model: workspaceContext.workspace.model,
                memoryCount: workspaceContext.stats.memoryCount,
                sessionCount: workspaceContext.stats.sessionCount,
                lastActive: workspaceContext.lastActive,
              } : activeWorkspace ? {
                name: activeWorkspace.name,
                group: activeWorkspace.group,
                model: activeWorkspace.model,
                memoryCount: 0,
                sessionCount: 0,
              } : undefined}
              groupedSessions={groupedSessions}
              activeSessionId={activeSessionId ?? undefined}
              onSelectSession={handleSessionSelect}
              onCreateSession={handleCreateSessionFromPanel}
              onDeleteSession={deleteSession}
              onRenameSession={renameSession}
              selectedFrame={selectedFrame}
              previewFile={previewFile}
              onClosePreview={() => setPreviewFile(null)}
              recentMemories={workspaceContext?.recentMemories}
              onExportSession={exportSession}
              onSearchSessions={doSearchSessions}
              searchResults={searchResults}
              searchLoading={searchLoading}
              onClearSearch={clearSearch}
              teamMembers={teamMembers}
              teamActivity={teamActivity}
              teamActivityLoading={teamActivityLoading}
              teamMessages={teamMessages}
              onRefreshHealth={handleRefreshHealth}
              settingsTab={settingsTab}
              eventFilters={eventFilters}
              onEventFiltersChange={setEventFilters}
            />
          ) : undefined
        }
        statusBar={
          <StatusBar
            model={friendlyModelName(agentModel)}
            workspace={activeWorkspace?.name ?? 'Default'}
            tokens={agentTokens}
            cost={agentCost}
            mode="local"
            availableModels={availableModels}
            onModelSelect={handleModelSelect}
            offlineStatus={offlineStatus}
          />
        }
      />

      {/* F6: Global search */}
      <GlobalSearch
        open={globalSearchOpen}
        onClose={() => setGlobalSearchOpen(false)}
        onSelect={handleGlobalSearchSelect}
        workspaces={workspaces}
      />

      {/* Keyboard shortcuts help overlay */}
      <KeyboardShortcutsHelp
        open={showHelp}
        onClose={() => setShowHelp(false)}
      />

      {/* Persona switcher dialog (Ctrl+Shift+P) */}
      <PersonaSwitcher
        open={showPersonaSwitcher}
        onClose={() => setShowPersonaSwitcher(false)}
        onSelect={handlePersonaSwitch}
        currentPersonaId={activeWorkspace?.personaId ?? null}
        personas={personas}
        serverBaseUrl={SERVER_BASE}
        onPersonaCreated={() => {
          fetch(`${SERVER_BASE}/api/personas`)
            .then(r => r.ok ? r.json() as Promise<{ personas: PersonaOption[] }> : null)
            .then(data => { if (data?.personas) setPersonas(data.personas); })
            .catch(() => {});
        }}
      />

      {/* Workspace quick-switch overlay (Ctrl+Tab) */}
      <WorkspaceSwitcher
        open={showWorkspaceSwitcher}
        onClose={() => setShowWorkspaceSwitcher(false)}
        onSelect={(id) => { setActiveWorkspace(id); setShowWorkspaceSwitcher(false); }}
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspace?.id ?? null}
        microStatus={workspaceMicroStatus}
      />

      {/* Create workspace modal */}
      <CreateWorkspaceDialog
        isOpen={showCreateWorkspace}
        onClose={() => setShowCreateWorkspace(false)}
        onSubmit={handleCreateWorkspace}
        isTeamConnected={teamConnection !== null}
        teamServerUrl={teamConnection?.serverUrl}
        teamUserId={teamConnection?.userId}
        onFetchTeams={handleFetchTeams}
      />

      {/* File preview modal — B6: with "Open" button via Tauri shell */}
      {previewFile && (
        <Modal
          isOpen={true}
          onClose={() => setPreviewFile(null)}
          title={previewFile.path}
        >
          <FilePreview
            file={previewFile}
            onOpenInApp={async (filePath) => {
              try {
                const mod = '@tauri-apps/' + 'plugin-opener';
                const { open } = await import(/* @vite-ignore */ mod);
                await open(filePath);
              } catch {
                // Fallback: try to open via shell command
                try {
                  const { invoke } = await import('@tauri-apps/api/core');
                  await invoke('open_path', { path: filePath });
                } catch {
                  // Last resort: copy path to clipboard
                  navigator.clipboard?.writeText(filePath);
                }
              }
            }}
            onCopyPath={(filePath) => {
              navigator.clipboard?.writeText(filePath);
            }}
          />
        </Modal>
      )}
    </>
  );
}

export function App() {
  return (
    <ErrorBoundary viewName="Waggle">
      <ThemeProvider defaultTheme="dark">
        <TierProvider serverBaseUrl={SERVER_BASE}>
          <ServiceProvider adapter={adapter}>
            <WaggleApp />
          </ServiceProvider>
        </TierProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
