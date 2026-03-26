/**
 * AppSidebar — Hive Design System sidebar.
 * Hex logo, honey nav indicators, workspace tree, status bar.
 */

import type { Workspace, WorkspaceMicroStatus } from '@waggle/ui';
import { Sidebar, WorkspaceTree, useTheme } from '@waggle/ui';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { HiveIcon, HiveLogo } from '@/components/HiveIcon';

type AppView = 'chat' | 'dashboard' | 'memory' | 'events' | 'capabilities' | 'cockpit' | 'mission-control' | 'settings';

export interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  workspaces: Workspace[];
  activeWorkspaceId?: string;
  onSelectWorkspace: (id: string) => void;
  currentView: AppView;
  onViewChange: (view: AppView) => void;
  onCreateWorkspace: () => void;
  onOpenSearch?: () => void;
  onOpenHelp?: () => void;
  microStatus?: Record<string, WorkspaceMicroStatus>;
  memoryBadge?: number;
}

// Nav items with brand icon names — order matches Ctrl+Shift+N shortcuts
const NAV_ITEMS: { view: AppView; label: string; shortcut: string; iconName: string }[] = [
  { view: 'dashboard', label: 'Dashboard', shortcut: '0', iconName: 'cockpit' },
  { view: 'chat', label: 'Chat', shortcut: '1', iconName: 'chat' },
  { view: 'capabilities', label: 'Skills & Apps', shortcut: '2', iconName: 'capabilities' },
  { view: 'cockpit', label: 'Cockpit', shortcut: '3', iconName: 'cockpit' },
  { view: 'mission-control', label: 'Mission Control', shortcut: '4', iconName: 'mission' },
  { view: 'memory', label: 'Memory', shortcut: '5', iconName: 'memory' },
  { view: 'events', label: 'Events', shortcut: '6', iconName: 'events' },
  { view: 'settings', label: 'Settings', shortcut: '7', iconName: 'settings' },
];

export function AppSidebar({
  collapsed,
  onToggle,
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  currentView,
  onViewChange,
  onCreateWorkspace,
  onOpenSearch,
  onOpenHelp,
  microStatus,
  memoryBadge,
}: AppSidebarProps) {
  const { theme, toggleTheme } = useTheme();

  const bottomItems = (
    <div className="flex flex-col gap-0.5 px-1.5">
      {/* Work section: Dashboard, Chat, Skills & Apps */}
      {NAV_ITEMS.slice(0, 3).map(({ view, label, shortcut, iconName }) => {
        const isActive = currentView === view;
        return (
          <button
            key={view}
            onClick={() => onViewChange(view)}
            title={`${label} (Ctrl+Shift+${shortcut})`}
            className={`
              flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px]
              border-l-2 transition-all duration-150 cursor-pointer
              ${collapsed ? 'justify-center px-0 py-2 border-l-0' : 'justify-start'}
              ${isActive
                ? 'border-l-[var(--honey-500)] text-[var(--hive-50)]'
                : 'border-l-transparent text-[var(--hive-400)] hover:text-[var(--hive-100)] hover:bg-[var(--honey-pulse)]'
              }
            `}
            style={isActive ? { backgroundColor: 'var(--honey-glow)' } : undefined}
          >
            <HiveIcon name={iconName} size={20} />
            {!collapsed && (
              <>
                <span className="flex-1 text-left font-medium">{label}</span>
                <span className="text-[9px] opacity-40 text-[var(--hive-500)]">
                  ⇧{shortcut}
                </span>
              </>
            )}
          </button>
        );
      })}

      {/* UX-027: Visual divider between Work and System sections */}
      <div className="my-2 mx-3 border-t" style={{ borderColor: 'var(--hive-700)' }} />

      {/* System section: Cockpit, Mission Control, Memory, Events, Settings */}
      {NAV_ITEMS.slice(3).map(({ view, label, shortcut, iconName }) => {
        const isActive = currentView === view;
        const showMemoryBadge = view === 'memory' && !!memoryBadge && memoryBadge > 0;
        return (
          <button
            key={view}
            onClick={() => onViewChange(view)}
            title={`${label} (Ctrl+Shift+${shortcut})`}
            className={`
              flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px]
              border-l-2 transition-all duration-150 cursor-pointer
              ${collapsed ? 'justify-center px-0 py-2 border-l-0' : 'justify-start'}
              ${isActive
                ? 'border-l-[var(--honey-500)] text-[var(--hive-50)]'
                : 'border-l-transparent text-[var(--hive-400)] hover:text-[var(--hive-100)] hover:bg-[var(--honey-pulse)]'
              }
            `}
            style={isActive ? { backgroundColor: 'var(--honey-glow)' } : undefined}
          >
            <HiveIcon name={iconName} size={20} />
            {!collapsed && (
              <>
                <span className="flex-1 text-left font-medium">{label}</span>
                {showMemoryBadge && (
                  <span
                    className="ml-auto text-[9px] font-semibold rounded-full px-1.5 py-px"
                    style={{ backgroundColor: 'rgba(229, 160, 0, 0.15)', color: 'var(--honey-500)' }}
                  >
                    {memoryBadge}
                  </span>
                )}
                <span className="text-[9px] opacity-40 text-[var(--hive-500)]">
                  ⇧{shortcut}
                </span>
              </>
            )}
          </button>
        );
      })}

      <Separator className="my-1.5 opacity-30" />

      {/* Create Workspace */}
      <Button
        variant="ghost"
        onClick={onCreateWorkspace}
        title="Create Workspace"
        className={`
          w-full border border-dashed text-[var(--hive-400)]
          hover:border-[var(--honey-500)] hover:text-[var(--honey-400)] text-[11px]
          ${collapsed ? 'justify-center px-0' : 'justify-start'}
        `}
        style={{ borderColor: 'var(--hive-700)' }}
        size="sm"
      >
        <span className="text-[14px] leading-none">+</span>
        {!collapsed && <span>New Workspace</span>}
      </Button>

      {/* Theme toggle */}
      <Button
        variant="ghost"
        onClick={toggleTheme}
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        className={`
          w-full text-[var(--hive-400)] hover:text-[var(--honey-400)] text-[12px] mt-0.5
          ${collapsed ? 'justify-center px-0' : 'justify-start'}
        `}
        size="sm"
      >
        <span className="text-[14px] leading-none">{theme === 'dark' ? '☀' : '☾'}</span>
        {!collapsed && <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>}
      </Button>

      {/* Keyboard shortcuts */}
      {onOpenHelp && (
        <Button
          variant="ghost"
          onClick={onOpenHelp}
          title="Keyboard shortcuts (Ctrl+/)"
          className={`
            w-full text-[var(--hive-500)] hover:text-[var(--honey-400)] text-[11px]
            ${collapsed ? 'justify-center px-0' : 'justify-start'}
          `}
          size="sm"
        >
          <span className="text-[13px] leading-none">⌨</span>
          {!collapsed && <span>Shortcuts</span>}
        </Button>
      )}
      {/* Trust footer */}
      {!collapsed && (
        <div className="px-3 py-2 text-[9px] text-muted-foreground/30 text-center">
          Your data stays on your device · Encrypted with AES-256
        </div>
      )}
    </div>
  );

  return (
    <Sidebar
      collapsed={collapsed}
      onToggle={onToggle}
      bottomItems={bottomItems}
    >
      {/* ── Brand ── */}
      {!collapsed ? (
        <div className="flex flex-col gap-1 px-1">
          <div className="flex items-center gap-2">
            <HiveLogo height={36} />
            <span className="text-[8px] ml-auto" style={{ color: 'var(--hive-500)' }}>v1.0</span>
          </div>
        </div>
      ) : (
        <div className="flex justify-center py-1">
          <HiveLogo height={28} />
        </div>
      )}

      {/* ── Search (Ctrl+K) ── */}
      {onOpenSearch && (
        <Button
          variant="outline"
          onClick={onOpenSearch}
          title="Search (Ctrl+K)"
          className={`
            text-[var(--hive-400)] hover:text-[var(--hive-100)]
            text-[11px] transition-colors border-[var(--hive-700)]
            hover:border-[var(--honey-500)]
            ${collapsed ? 'w-4/5 mx-auto justify-center' : 'w-[calc(100%-8px)] mx-1 justify-start'}
          `}
          size="sm"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          {!collapsed && (
            <>
              <span className="flex-1 text-left">Search</span>
              <span className="text-[9px] opacity-40" style={{ color: 'var(--hive-500)' }}>⌘K</span>
            </>
          )}
        </Button>
      )}

      {/* ── Workspace tree ── */}
      {workspaces.length > 0 ? (
        <ScrollArea className="flex-1">
          <WorkspaceTree
            workspaces={workspaces}
            activeId={activeWorkspaceId}
            onSelect={onSelectWorkspace}
            microStatus={microStatus}
          />
        </ScrollArea>
      ) : (
        !collapsed && (
          <div className="px-3 py-4 text-[11px] leading-relaxed" style={{ color: 'var(--hive-500)' }}>
            <div className="mb-1.5 font-medium" style={{ color: 'var(--hive-400)' }}>No workspaces</div>
            <div className="text-[10px] leading-relaxed opacity-70">
              Create one to organize your conversations, memory, and files.
            </div>
          </div>
        )
      )}
    </Sidebar>
  );
}
