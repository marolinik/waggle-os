import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  MessageSquare, LayoutDashboard, Settings, Brain,
  Activity, Package, Radio, Zap, FolderOpen,
} from "lucide-react";
import wallpaper from "@/assets/wallpaper.jpg";
import waggleLogo from "@/assets/waggle-logo.jpeg";
import StatusBar from "./StatusBar";
import Dock, { type AppId } from "./Dock";
import AppWindow from "./AppWindow";
import ChatWindowInstance from "./apps/ChatWindowInstance";
import DashboardApp from "./apps/DashboardApp";
import SettingsApp from "./apps/SettingsApp";
import MemoryApp from "./apps/MemoryApp";
import EventsApp from "./apps/EventsApp";
import CockpitApp from "./apps/CockpitApp";
import MissionControlApp from "./apps/MissionControlApp";
import CapabilitiesApp from "./apps/CapabilitiesApp";
import WaggleDanceApp from "./apps/WaggleDanceApp";
import FilesApp from "./apps/FilesApp";
import GlobalSearch from "./overlays/GlobalSearch";
import CreateWorkspaceDialog from "./overlays/CreateWorkspaceDialog";
import PersonaSwitcher from "./overlays/PersonaSwitcher";
import SpawnAgentDialog from "./overlays/SpawnAgentDialog";
import WorkspaceSwitcher from "./overlays/WorkspaceSwitcher";
import NotificationInbox from "./overlays/NotificationInbox";
import KeyboardShortcutsHelp from "./overlays/KeyboardShortcutsHelp";
import OnboardingWizard from "./overlays/OnboardingWizard";
import OnboardingTooltips from "./overlays/OnboardingTooltips";
import { adapter } from "@/lib/adapter";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import { useMemory } from "@/hooks/useMemory";
import { useEvents } from "@/hooks/useEvents";
import { useAgentStatus } from "@/hooks/useAgentStatus";
import { useNotifications } from "@/hooks/useNotifications";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useOnboarding } from "@/hooks/useOnboarding";
import { useOfflineStatus } from "@/hooks/useOfflineStatus";
import { useKnowledgeGraph } from "@/hooks/useKnowledgeGraph";
import { useWaggleDance } from "@/hooks/useWaggleDance";

/* ── Window instance with unique ID ── */
interface WindowState {
  instanceId: string;        // unique per window instance
  appId: AppId;              // which app type
  workspaceId?: string;      // for chat windows — which workspace
  workspaceName?: string;
  personaLabel?: string;     // persona display name for title bar
  templateLabel?: string;    // template display name for title bar
  zIndex: number;
  minimized: boolean;
  cascadeOffset: number;
}

const TEMPLATE_SHORT: Record<string, string> = {
  'sales-pipeline': 'Sales',
  'research-project': 'Research',
  'code-review': 'Code',
  'marketing-campaign': 'Marketing',
  'product-launch': 'Launch',
  'legal-review': 'Legal',
  'agency-consulting': 'Consulting',
};

const PERSONA_SHORT: Record<string, string> = {
  'researcher': 'Researcher',
  'writer': 'Writer',
  'analyst': 'Analyst',
  'coder': 'Coder',
  'project-manager': 'PM',
  'executive-assistant': 'EA',
  'sales-rep': 'Sales',
  'marketer': 'Marketer',
};

const appConfig: Record<string, { title: string; icon: React.ReactNode; pos: { x: number; y: number }; size: { w: string; h: string } }> = {
  "chat": { title: "Waggle Chat", icon: <MessageSquare className="w-3.5 h-3.5 text-primary" />, pos: { x: 180, y: 40 }, size: { w: "520px", h: "520px" } },
  "dashboard": { title: "Dashboard", icon: <LayoutDashboard className="w-3.5 h-3.5 text-sky-400" />, pos: { x: 100, y: 60 }, size: { w: "560px", h: "440px" } },
  "settings": { title: "Settings", icon: <Settings className="w-3.5 h-3.5 text-muted-foreground" />, pos: { x: 250, y: 80 }, size: { w: "560px", h: "460px" } },
  "memory": { title: "Memory", icon: <Brain className="w-3.5 h-3.5 text-amber-300" />, pos: { x: 120, y: 50 }, size: { w: "640px", h: "460px" } },
  "events": { title: "Events", icon: <Activity className="w-3.5 h-3.5 text-cyan-400" />, pos: { x: 200, y: 70 }, size: { w: "580px", h: "420px" } },
  "cockpit": { title: "Cockpit", icon: <Activity className="w-3.5 h-3.5 text-emerald-400" />, pos: { x: 300, y: 60 }, size: { w: "520px", h: "520px" } },
  "mission-control": { title: "Mission Control", icon: <Radio className="w-3.5 h-3.5 text-rose-400" />, pos: { x: 220, y: 90 }, size: { w: "520px", h: "440px" } },
  "capabilities": { title: "Skills & Apps", icon: <Package className="w-3.5 h-3.5 text-violet-400" />, pos: { x: 150, y: 80 }, size: { w: "560px", h: "480px" } },
  "waggle-dance": { title: "Waggle Dance", icon: <Zap className="w-3.5 h-3.5 text-amber-400" />, pos: { x: 160, y: 50 }, size: { w: "580px", h: "460px" } },
  "files": { title: "Files", icon: <FolderOpen className="w-3.5 h-3.5 text-amber-300" />, pos: { x: 140, y: 55 }, size: { w: "620px", h: "440px" } },
};

const Desktop = () => {
  const [windows, setWindows] = useState<WindowState[]>([]);
  const topZRef = useRef(10);
  const cascadeCounter = useRef(0);
  const [focusedInstanceId, setFocusedInstanceId] = useState<string | null>(null);

  const nextZ = () => { topZRef.current += 1; return topZRef.current; };

  // Overlay states
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [showPersonaSwitcher, setShowPersonaSwitcher] = useState(false);
  const [showWorkspaceSwitcher, setShowWorkspaceSwitcher] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [showSpawnAgent, setShowSpawnAgent] = useState(false);

  // Core hooks
  const { workspaces, activeWorkspace, activeWorkspaceId, selectWorkspace, createWorkspace } = useWorkspaces();
  const memory = useMemory(activeWorkspaceId);
  const events = useEvents(activeWorkspaceId);
  const agentStatus = useAgentStatus();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const { state: onboardingState, update: updateOnboarding, complete: completeOnboarding } = useOnboarding();
  const offline = useOfflineStatus();
  const kg = useKnowledgeGraph(activeWorkspaceId);
  const { allSignals: waggleSignals } = useWaggleDance();
  const waggleUnacknowledged = waggleSignals.filter(s => !s.acknowledged).length;

  /* ── Open app: singleton for non-chat, per-workspace for chat ── */
  const openApp = useCallback((id: AppId) => {
    setWindows(prev => {
      // Non-chat apps: singleton behavior
      if (id !== 'chat') {
        const existing = prev.find(w => w.appId === id);
        if (existing) {
          const z = nextZ();
          setFocusedInstanceId(existing.instanceId);
          return prev.map(w => w.instanceId === existing.instanceId ? { ...w, zIndex: z, minimized: false } : w);
        }
      }

      const offset = cascadeCounter.current;
      cascadeCounter.current = (cascadeCounter.current + 1) % 10;
      const z = nextZ();
      const instanceId = `${id}-${Date.now()}`;
      setFocusedInstanceId(instanceId);
      return [...prev, { instanceId, appId: id, zIndex: z, minimized: false, cascadeOffset: offset }];
    });
  }, []);

  /* ── Open a chat window for a specific workspace ── */
  const openChatForWorkspace = useCallback((workspaceId: string, workspaceName?: string) => {
    const ws = workspaces.find(w => w.id === workspaceId);
    const personaLabel = ws?.persona ? (PERSONA_SHORT[ws.persona] || ws.persona) : undefined;
    const templateLabel = ws?.templateId && ws.templateId !== 'blank' ? (TEMPLATE_SHORT[ws.templateId] || ws.templateId) : undefined;

    setWindows(prev => {
      // Check if a chat window for this workspace already exists
      const existing = prev.find(w => w.appId === 'chat' && w.workspaceId === workspaceId);
      if (existing) {
        const z = nextZ();
        setFocusedInstanceId(existing.instanceId);
        return prev.map(w => w.instanceId === existing.instanceId ? { ...w, zIndex: z, minimized: false } : w);
      }

      const offset = cascadeCounter.current;
      cascadeCounter.current = (cascadeCounter.current + 1) % 10;
      const z = nextZ();
      const instanceId = `chat-${workspaceId}-${Date.now()}`;
      setFocusedInstanceId(instanceId);
      return [...prev, {
        instanceId, appId: 'chat' as AppId,
        workspaceId, workspaceName,
        personaLabel, templateLabel,
        zIndex: z, minimized: false, cascadeOffset: offset,
      }];
    });
  }, [workspaces]);

  const closeApp = useCallback((instanceId: string) => {
    setWindows(prev => prev.filter(w => w.instanceId !== instanceId));
  }, []);

  const minimizeApp = useCallback((instanceId: string) => {
    setWindows(prev => prev.map(w => w.instanceId === instanceId ? { ...w, minimized: true } : w));
  }, []);

  const focusWindow = useCallback((instanceId: string) => {
    const z = nextZ();
    setFocusedInstanceId(instanceId);
    setWindows(prev => prev.map(w => w.instanceId === instanceId ? { ...w, zIndex: z, minimized: false } : w));
  }, []);

  /* ── Alt+Tab: cycle focus among non-minimized windows ── */
  const cycleWindowFocus = useCallback(() => {
    setWindows(prev => {
      const visible = prev.filter(w => !w.minimized);
      if (visible.length <= 1) return prev;

      const sorted = [...visible].sort((a, b) => b.zIndex - a.zIndex);
      const nextWindow = sorted[1];
      const z = nextZ();
      setFocusedInstanceId(nextWindow.instanceId);
      return prev.map(w => w.instanceId === nextWindow.instanceId ? { ...w, zIndex: z } : w);
    });
  }, []);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onOpenApp: openApp,
    onToggleGlobalSearch: () => setShowGlobalSearch(p => !p),
    onTogglePersonaSwitcher: () => setShowPersonaSwitcher(p => !p),
    onToggleWorkspaceSwitcher: () => setShowWorkspaceSwitcher(p => !p),
    onToggleKeyboardHelp: () => setShowKeyboardHelp(p => !p),
  });

  /* ── Ctrl+` (backtick): cycle focus among windows ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        cycleWindowFocus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [cycleWindowFocus]);

  const handleSearchNavigate = useCallback((type: string, id: string) => {
    if (type === 'command') openApp(id as AppId);
    else if (type === 'workspace') {
      selectWorkspace(id);
      const ws = workspaces.find(w => w.id === id);
      openChatForWorkspace(id, ws?.name);
    }
    else if (type === 'memory') openApp('memory');
  }, [openApp, selectWorkspace, openChatForWorkspace, workspaces]);

  const handleOnboardingComplete = useCallback((serverBaseUrl: string) => {
    completeOnboarding();
  }, [completeOnboarding]);

  const handleOnboardingFinish = useCallback((workspaceId: string, _firstMessage: string) => {
    selectWorkspace(workspaceId);
    openApp('dashboard');
  }, [selectWorkspace, openApp]);

  const getWindowTitle = (win: WindowState) => {
    if (win.appId === 'chat') {
      const parts = [win.workspaceName || 'Chat'];
      if (win.templateLabel) parts.push(win.templateLabel);
      if (win.personaLabel) parts.push(win.personaLabel);
      return parts.join(' · ');
    }
    return appConfig[win.appId]?.title || win.appId;
  };

  const renderAppContent = (win: WindowState) => {
    switch (win.appId) {
      case 'chat': {
        const wsId = win.workspaceId || activeWorkspaceId || 'local-default';
        const ws = workspaces.find(w => w.id === wsId);
        return <ChatWindowInstance workspaceId={wsId} workspaceName={win.workspaceName} templateId={ws?.templateId} />;
      }
      case 'dashboard':
        return (
          <DashboardApp
            workspaces={workspaces}
            activeWorkspaceId={activeWorkspaceId}
            onSelectWorkspace={(id) => {
              selectWorkspace(id);
              const ws = workspaces.find(w => w.id === id);
              openChatForWorkspace(id, ws?.name);
            }}
            onCreateWorkspace={() => setShowCreateWorkspace(true)}
          />
        );
      case 'settings':
        return <SettingsApp />;
      case 'memory':
        return (
          <MemoryApp
            frames={memory.frames}
            selectedFrame={memory.selectedFrame}
            onSelectFrame={memory.setSelectedFrame}
            searchQuery={memory.filters.searchQuery}
            onSearchChange={(q) => memory.setFilters({ ...memory.filters, searchQuery: q })}
            onDeleteFrame={memory.deleteFrame}
            loading={memory.loading}
            stats={memory.stats}
            typeFilters={memory.filters.types}
            onTypeFiltersChange={(types) => memory.setFilters({ ...memory.filters, types })}
            minImportance={memory.filters.minImportance}
            onMinImportanceChange={(val) => memory.setFilters({ ...memory.filters, minImportance: val })}
            knowledgeGraph={{ nodes: kg.nodes, edges: kg.edges }}
            onRefreshKG={kg.refresh}
          />
        );
      case 'events':
        return (
          <EventsApp
            steps={events.steps}
            autoScroll={events.autoScroll}
            onToggleAutoScroll={events.toggleAutoScroll}
            filter={events.filter}
            onFilterChange={events.setFilter}
            onAbort={() => {
              if (activeWorkspaceId) {
                adapter.abortAgent(activeWorkspaceId).catch(() => {});
              }
            }}
          />
        );
      case 'cockpit':
        return <CockpitApp />;
      case 'mission-control':
        return <MissionControlApp onSpawnOpen={() => setShowSpawnAgent(true)} />;
      case 'capabilities':
        return <CapabilitiesApp />;
      case 'waggle-dance':
        return <WaggleDanceApp />;
      case 'files': {
        const wsId = activeWorkspaceId || 'local-default';
        const ws = workspaces.find(w => w.id === wsId);
        return <FilesApp workspaceId={wsId} workspaceName={ws?.name} storageType={ws?.storageType} />;
      }
      default:
        return <div className="p-4 text-sm text-muted-foreground">Coming soon...</div>;
    }
  };

  // Compute which appIds are open (for dock indicators)
  const openAppIds = useMemo(() => [...new Set(windows.map(w => w.appId))], [windows]);
  const minimizedAppIds = useMemo(() => {
    // An appId is "minimized" if ALL its instances are minimized
    const grouped = new Map<AppId, boolean[]>();
    windows.forEach(w => {
      const list = grouped.get(w.appId) || [];
      list.push(w.minimized);
      grouped.set(w.appId, list);
    });
    const result: AppId[] = [];
    grouped.forEach((statuses, appId) => {
      if (statuses.every(m => m)) result.push(appId);
    });
    return result;
  }, [windows]);

  return (
    <div className="relative w-screen h-screen overflow-hidden select-none">
      <img src={wallpaper} alt="" className="absolute inset-0 w-full h-full object-cover" width={1920} height={1080} />
      <div className="absolute inset-0 bg-background/20" />

      {/* Desktop logo hero */}
      {windows.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center pointer-events-none z-[1]" style={{ paddingTop: "3vh" }}>
          <div className="relative w-40 h-40">
            <img
              src={waggleLogo}
              alt="Waggle AI"
              className="w-40 h-40 mix-blend-screen"
              style={{
                borderRadius: 0,
                background: "transparent",
                maskImage: "radial-gradient(circle, rgba(0,0,0,0.8) 30%, rgba(0,0,0,0.3) 60%, transparent 80%)",
                WebkitMaskImage: "radial-gradient(circle, rgba(0,0,0,0.8) 30%, rgba(0,0,0,0.3) 60%, transparent 80%)",
              }}
            />
          </div>

          <motion.h1
            initial={{ opacity: 0, y: 14, letterSpacing: "0.35em" }}
            animate={{ opacity: 1, y: 0, letterSpacing: "0.15em" }}
            transition={{ delay: 0.4, duration: 0.9, ease: "easeOut" }}
            className="mt-4 text-6xl font-display font-bold tracking-widest"
            style={{
              color: "hsl(40, 15%, 92%)",
              textShadow: "0 0 40px hsl(var(--primary) / 0.2), 0 2px 4px hsl(0 0% 0% / 0.8)",
            }}
          >
            Waggle AI
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 0.9, y: 0 }}
            transition={{ delay: 0.7, duration: 0.7 }}
            className="text-sm font-display mt-2 tracking-[0.3em] uppercase"
            style={{
              color: "hsl(38, 50%, 65%)",
              textShadow: "0 1px 4px hsl(0 0% 0% / 0.8)",
            }}
          >
            Autonomous Agent OS
          </motion.p>

          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.95, duration: 0.8, ease: "easeOut" }}
            className="w-20 h-px mt-3"
            style={{ background: "linear-gradient(90deg, transparent, hsl(var(--primary) / 0.3), transparent)" }}
          />

          {offline && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.5 }}
              className="mt-6 px-4 py-2 rounded-xl glass-strong"
            >
              <p className="text-xs text-muted-foreground">
                <span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-2" />
                Running in offline mode — connect a backend server in Settings
              </p>
            </motion.div>
          )}
        </div>
      )}

      {/* Hint */}
      {windows.length === 0 && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.5, 0.35, 0.5] }}
          transition={{ delay: 1.2, duration: 5, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-20 left-0 right-0 text-center text-sm font-mono tracking-wide pointer-events-none z-[1]"
          style={{
            color: "hsl(30, 8%, 50%)",
            textShadow: "0 1px 3px hsl(0 0% 0% / 0.7)",
          }}
        >
          Click an app in the dock · Ctrl+` to switch windows
        </motion.p>
      )}

      <StatusBar
        workspaceName={activeWorkspace?.name}
        model={agentStatus.model !== 'unknown' ? agentStatus.model : activeWorkspace?.model}
        tokensUsed={agentStatus.tokensUsed}
        costUsd={agentStatus.costUsd}
        offline={offline}
        unreadNotifications={unreadCount}
        onSearchClick={() => setShowGlobalSearch(true)}
        onNotificationClick={() => setShowNotifications(p => !p)}
      />

      <AnimatePresence>
        {windows.map((win) => {
          const config = appConfig[win.appId];
          if (!config) return null;
          const cascadedPos = {
            x: config.pos.x + win.cascadeOffset * 30,
            y: config.pos.y + win.cascadeOffset * 30,
          };
          return (
            <AppWindow
              key={win.instanceId}
              title={getWindowTitle(win)}
              icon={config.icon}
              onClose={() => closeApp(win.instanceId)}
              onMinimize={() => minimizeApp(win.instanceId)}
              isMinimized={win.minimized}
              defaultPosition={cascadedPos}
              defaultSize={config.size}
              zIndex={win.zIndex}
              onFocus={() => focusWindow(win.instanceId)}
            >
              {renderAppContent(win)}
            </AppWindow>
          );
        })}
      </AnimatePresence>

      <Dock
        onOpenApp={(id) => {
          if (id === 'chat') {
            // Opening chat from dock uses active workspace
            openChatForWorkspace(activeWorkspaceId || 'local-default', activeWorkspace?.name);
          } else {
            openApp(id);
          }
        }}
        openApps={openAppIds}
        minimizedApps={minimizedAppIds}
        onSpawnAgent={() => setShowSpawnAgent(true)}
        waggleBadgeCount={waggleUnacknowledged}
      />

      {/* Overlays */}
      <GlobalSearch open={showGlobalSearch} onClose={() => setShowGlobalSearch(false)} onNavigate={handleSearchNavigate} />
      <CreateWorkspaceDialog
        open={showCreateWorkspace}
        onClose={() => setShowCreateWorkspace(false)}
        onCreate={createWorkspace}
        onBrowsePath={(storageType, _currentPath) => {
          // Open the Files app so user can browse and pick a folder
          openApp('files');
        }}
      />
      <PersonaSwitcher open={showPersonaSwitcher} onClose={() => setShowPersonaSwitcher(false)} currentPersona={activeWorkspace?.persona} onSelect={() => {}} />
      <WorkspaceSwitcher
        open={showWorkspaceSwitcher}
        onClose={() => setShowWorkspaceSwitcher(false)}
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        onSelect={(id) => {
          selectWorkspace(id);
          const ws = workspaces.find(w => w.id === id);
          openChatForWorkspace(id, ws?.name);
        }}
      />
      <NotificationInbox open={showNotifications} onClose={() => setShowNotifications(false)} notifications={notifications} onMarkRead={markRead} onMarkAllRead={markAllRead} />
      <KeyboardShortcutsHelp open={showKeyboardHelp} onClose={() => setShowKeyboardHelp(false)} />
      <SpawnAgentDialog
        open={showSpawnAgent}
        onClose={() => setShowSpawnAgent(false)}
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        onWorkspaceCreated={(ws) => {
          selectWorkspace(ws.id);
        }}
      />
      {!onboardingState.completed && (
        <OnboardingWizard
          serverBaseUrl={adapter.getServerUrl()}
          state={onboardingState}
          onUpdate={updateOnboarding}
          onComplete={handleOnboardingComplete}
          onDismiss={completeOnboarding}
          onFinish={handleOnboardingFinish}
        />
      )}
      {onboardingState.completed && <OnboardingTooltips />}
    </div>
  );
};

export default Desktop;
