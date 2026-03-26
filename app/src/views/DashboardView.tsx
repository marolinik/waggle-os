/**
 * DashboardView — workspace overview grid.
 *
 * Shows all workspaces as cards with:
 * - Name, group badge, health dot, memory count
 * - Last active (relative time), 1-line summary
 * - Click card to switch workspace
 * - "New Workspace" card at the end
 *
 * Hive Design System: hive-900 bg cards, honey accents.
 */

import { useMemo } from 'react';

export interface DashboardMicroStatus {
  memoryCount: number;
  lastActive: string;
  isAgentActive?: boolean;
}

export interface DashboardViewProps {
  workspaces: Array<{ id: string; name: string; group: string }>;
  activeWorkspaceId: string | null;
  microStatus?: Map<string, DashboardMicroStatus> | Record<string, DashboardMicroStatus>;
  onSelectWorkspace: (id: string) => void;
  onCreateWorkspace: () => void;
}

function formatRelativeTime(isoOrDate: string): string {
  const now = Date.now();
  const then = new Date(isoOrDate).getTime();
  if (isNaN(then)) return 'unknown';
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return new Date(isoOrDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Derive a stable hue from workspace name for the group badge. */
function groupHue(group: string): number {
  let hash = 0;
  for (let i = 0; i < group.length; i++) {
    hash = group.charCodeAt(i) + ((hash << 5) - hash);
  }
  return ((hash % 360) + 360) % 360;
}

export default function DashboardView({
  workspaces,
  activeWorkspaceId,
  microStatus,
  onSelectWorkspace,
  onCreateWorkspace,
}: DashboardViewProps) {
  // Normalize microStatus (accept both Map and Record)
  const statusMap = useMemo(() => {
    if (!microStatus) return new Map<string, DashboardMicroStatus>();
    if (microStatus instanceof Map) return microStatus;
    return new Map(Object.entries(microStatus));
  }, [microStatus]);

  return (
    <div className="h-full overflow-auto p-6" style={{ backgroundColor: 'var(--hive-950, #0c0a09)' }}>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold" style={{ color: 'var(--hive-50, #fafaf9)' }}>
          Workspaces
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--hive-400, #a8a29e)' }}>
          {workspaces.length} workspace{workspaces.length !== 1 ? 's' : ''} — select one to open
        </p>
      </div>

      {/* Grid */}
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
        {workspaces.map((ws) => {
          const status = statusMap.get(ws.id);
          const isActive = ws.id === activeWorkspaceId;
          const memoryCount = status?.memoryCount ?? 0;
          const lastActive = status?.lastActive ?? '';
          const isAgentActive = status?.isAgentActive ?? false;
          const hue = groupHue(ws.group);

          return (
            <button
              key={ws.id}
              onClick={() => onSelectWorkspace(ws.id)}
              className="text-left rounded-xl border p-4 transition-all duration-150 cursor-pointer hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{
                backgroundColor: 'var(--hive-900, #1c1917)',
                borderColor: isActive ? 'var(--honey-500, #e5a000)' : 'var(--hive-800, #292524)',
                boxShadow: isActive ? '0 0 0 1px var(--honey-500, #e5a000)' : undefined,
              }}
            >
              {/* Top row: name + health dot */}
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{
                    backgroundColor: isAgentActive
                      ? 'var(--honey-500, #e5a000)'
                      : memoryCount > 0
                        ? '#22c55e'
                        : 'var(--hive-600, #57534e)',
                  }}
                  title={isAgentActive ? 'Agent active' : memoryCount > 0 ? 'Has memories' : 'Empty'}
                />
                <span
                  className="text-sm font-semibold truncate flex-1"
                  style={{ color: 'var(--hive-50, #fafaf9)' }}
                >
                  {ws.name}
                </span>
                {isActive && (
                  <span
                    className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: 'rgba(229, 160, 0, 0.15)', color: 'var(--honey-500, #e5a000)' }}
                  >
                    Active
                  </span>
                )}
              </div>

              {/* Group badge */}
              <div className="mb-3">
                <span
                  className="inline-block text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: `hsla(${hue}, 40%, 50%, 0.12)`,
                    color: `hsl(${hue}, 45%, 65%)`,
                  }}
                >
                  {ws.group}
                </span>
              </div>

              {/* Stats row */}
              <div className="flex items-center gap-4 text-[11px]" style={{ color: 'var(--hive-400, #a8a29e)' }}>
                <span>{memoryCount} memor{memoryCount === 1 ? 'y' : 'ies'}</span>
                {lastActive && (
                  <span>{formatRelativeTime(lastActive)}</span>
                )}
              </div>
            </button>
          );
        })}

        {/* New Workspace card */}
        <button
          onClick={onCreateWorkspace}
          className="rounded-xl border-2 border-dashed p-4 flex flex-col items-center justify-center gap-2 min-h-[120px] transition-all duration-150 cursor-pointer hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{
            borderColor: 'var(--hive-700, #44403c)',
            backgroundColor: 'transparent',
          }}
        >
          <span
            className="text-2xl leading-none"
            style={{ color: 'var(--hive-500, #78716c)' }}
          >
            +
          </span>
          <span
            className="text-xs font-medium"
            style={{ color: 'var(--hive-400, #a8a29e)' }}
          >
            New Workspace
          </span>
        </button>
      </div>
    </div>
  );
}
