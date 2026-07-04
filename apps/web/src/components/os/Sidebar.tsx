import type { ElementType } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, Plus, Search } from "lucide-react";
import { cmdKLabel } from "@/lib/platform";

/**
 * Warm-Hive calm spine (design ref: design-files/screens/ia.html).
 *
 * The always-visible nav collapses to FIVE everyday places (Home · Chat · Memory ·
 * Agents & tasks · Library); everything else lives one keystroke away in ⌘K. A
 * power-tier "Pinned · power tools" group floats the tools a power user lives in.
 * Purely presentational — AppShell resolves routes/badges/tier and passes them in,
 * so the spine is trivial to unit-test.
 */

export interface SidebarNavItem {
  key: string;
  label: string;
  icon: ElementType;
  /** Resolved navigation target. */
  to: string;
  /** Route prefixes that mark this item active (exact or `${prefix}/…`). */
  match: string[];
  /** Optional predicate override for active state (used when a static prefix
   *  can't express the route, e.g. Chat = /workspaces/:id/chat). */
  activeWhen?: (pathname: string) => boolean;
  /** Optional attention count; only rendered when > 0. */
  badge?: number;
  /** Optional click override — e.g. open the workspace switcher when there is
   *  no real workspace to chat in (avoids a dead nav to `to`). Falls back to
   *  navigating to `to` when absent. */
  onClick?: () => void;
}

interface SidebarProps {
  workspaceName: string | null;
  spine: SidebarNavItem[];
  /** Pro "Pinned · power tools" group (empty for non-power tiers). */
  pinned?: SidebarNavItem[];
  onOpenWorkspaceSwitcher: () => void;
  onOpenCommand: () => void;
  onSpawnAgent: () => void;
  userName: string | null;
  tierLabel: string;
}

function initialOf(name: string | null, fallback: string): string {
  const c = name?.trim()?.[0];
  return (c ?? fallback).toUpperCase();
}

const Sidebar = ({
  workspaceName,
  spine,
  pinned = [],
  onOpenWorkspaceSwitcher,
  onOpenCommand,
  onSpawnAgent,
  userName,
  tierLabel,
}: SidebarProps) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const isActive = (item: SidebarNavItem): boolean =>
    item.activeWhen
      ? item.activeWhen(pathname)
      : item.match.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  const renderNavItem = (item: SidebarNavItem) => {
    const active = isActive(item);
    const Icon = item.icon;
    return (
      <button
        key={item.key}
        data-testid={`nav-${item.key}`}
        aria-label={item.label}
        aria-current={active ? "page" : undefined}
        onClick={() => (item.onClick ? item.onClick() : navigate(item.to))}
        className={`relative flex items-center gap-3 rounded-[10px] px-2.5 py-2.5 text-left transition-colors ${
          active
            ? "bg-[var(--honey-wash)] text-[var(--text)]"
            : "text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
        }`}
      >
        {active && (
          <span
            aria-hidden
            className="absolute -left-3 top-1/2 h-[18px] w-[3px] -translate-y-1/2 rounded bg-[var(--honey)]"
          />
        )}
        <Icon
          className={`h-[19px] w-[19px] shrink-0 ${active ? "text-[var(--honey)]" : ""}`}
          strokeWidth={1.7}
        />
        <span className="flex-1 text-sm font-medium">{item.label}</span>
        {!!item.badge && item.badge > 0 && (
          <span className="rounded-full bg-[var(--honey-wash)] px-[7px] py-0.5 font-mono text-[10.5px] text-[var(--attention)]">
            {item.badge > 99 ? "99+" : item.badge}
          </span>
        )}
      </button>
    );
  };

  const zoneLabel = "flex items-center gap-2 px-2.5 pt-3.5 pb-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--text-dim)]";

  return (
    <nav
      role="navigation"
      aria-label="Primary"
      className="waggle-sidebar relative z-10 flex w-[248px] shrink-0 flex-col gap-1 overflow-y-auto border-r border-[var(--line-soft)] bg-[var(--bg-2)] px-3 py-3.5"
    >
      {/* Workspace switcher pill */}
      <button
        data-testid="sidebar-workspace"
        aria-label="Switch workspace"
        onClick={onOpenWorkspaceSwitcher}
        className="mb-2.5 flex items-center gap-2.5 rounded-[11px] border border-[var(--line-soft)] bg-card px-2.5 py-2 text-left transition-colors hover:border-[var(--honey-line)]"
      >
        <span className="hex grid h-8 w-7 shrink-0 place-items-center bg-[linear-gradient(150deg,var(--honey-bright),var(--honey-deep))] text-[12px] font-extrabold text-[#1a1407]">
          {initialOf(workspaceName, "W")}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold leading-tight">
            {workspaceName ?? "Workspace"}
          </span>
          <span className="text-[11px] text-[var(--text-dim)]">workspace</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-[var(--text-dim)]" />
      </button>

      {/* Five-place calm spine */}
      {spine.map(renderNavItem)}

      {/* Pro "Pinned · power tools" group */}
      {pinned.length > 0 && (
        <>
          <div className={zoneLabel}>Pinned · power tools</div>
          {pinned.map(renderNavItem)}
        </>
      )}

      {/* General → ⌘K */}
      <div className={zoneLabel}>General</div>
      <button
        data-testid="sidebar-command"
        aria-label="Search and commands"
        onClick={onOpenCommand}
        className="flex items-center gap-3 rounded-[10px] border border-dashed border-[var(--line-strong)] px-2.5 py-2.5 text-left text-[var(--text-muted)] transition-colors hover:border-[var(--honey-line)] hover:bg-[var(--honey-wash)] hover:text-[var(--honey)]"
      >
        <Search className="h-[18px] w-[18px] shrink-0" strokeWidth={1.7} />
        <span className="flex-1 text-[13px] font-semibold">Search &amp; commands</span>
        <kbd className="rounded-md border border-[var(--line-strong)] bg-card px-[7px] py-0.5 font-mono text-[11px] text-[var(--text-2)]">
          {cmdKLabel}
        </kbd>
      </button>

      {/* New agent — primary spawn affordance (also reachable from ⌘K) */}
      <button
        data-testid="nav-spawn-agent"
        aria-label="New Agent"
        title="Start a new AI agent on a task"
        onClick={onSpawnAgent}
        className="mt-1.5 flex items-center gap-2.5 rounded-[10px] border border-[var(--line)] bg-card px-2.5 py-2 text-left text-[var(--text-2)] transition-colors hover:border-[var(--honey-line)] hover:text-[var(--honey)]"
      >
        <Plus className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} />
        <span className="flex-1 text-[13px] font-semibold">New Agent</span>
      </button>

      <div className="flex-1" />

      {/* User row → Settings */}
      <button
        data-testid="sidebar-user"
        aria-label="Account and settings"
        onClick={() => navigate("/settings")}
        className="mt-1.5 flex items-center gap-2.5 border-t border-[var(--line-soft)] px-2.5 py-2 text-left"
      >
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--honey)] text-[11px] font-bold text-[#1a1407]">
          {initialOf(userName, "W")}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold">
            {userName ?? "Account"}
          </span>
          <span className="font-mono text-[10.5px] text-[var(--text-dim)]">{tierLabel}</span>
        </span>
      </button>
    </nav>
  );
};

export default Sidebar;
