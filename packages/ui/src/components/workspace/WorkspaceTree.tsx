/**
 * WorkspaceTree — explorer-style tree view of workspaces grouped by category.
 *
 * Groups are collapsible headers. Active workspace is highlighted.
 */

import React, { useState, useMemo, useEffect } from 'react';
import type { Workspace } from '../../services/types.js';
import { GroupHeader } from './GroupHeader.js';
import { WorkspaceCard } from './WorkspaceCard.js';
import { groupWorkspacesByGroup, sortGroups } from './utils.js';

/** F7: Per-workspace micro-status data for sidebar indicators */
export interface WorkspaceMicroStatus {
  /** Whether an agent is currently active in this workspace */
  isAgentActive?: boolean;
  /** Number of memories stored for this workspace */
  memoryCount?: number;
  /** ISO timestamp of last activity */
  lastActive?: string;
}

export interface WorkspaceTreeProps {
  workspaces: Workspace[];
  activeId?: string;
  onSelect: (id: string) => void;
  onContextMenu?: (id: string, event: React.MouseEvent) => void;
  /** F7: Micro-status data keyed by workspace ID */
  microStatus?: Record<string, WorkspaceMicroStatus>;
}

export function WorkspaceTree({ workspaces, activeId, onSelect, onContextMenu, microStatus }: WorkspaceTreeProps) {
  const grouped = useMemo(() => groupWorkspacesByGroup(workspaces), [workspaces]);
  const sortedGroupNames = useMemo(() => sortGroups(Object.keys(grouped)), [grouped]);

  // C4: Collapse all groups by default — expand only the active workspace's group
  const initialCollapsed = useMemo(() => new Set(sortedGroupNames), [sortedGroupNames]);
  const [collapsed, setCollapsed] = useState<Set<string>>(initialCollapsed);

  // Auto-expand the group containing the active workspace
  useEffect(() => {
    if (!activeId) return;
    const activeWs = workspaces.find(w => w.id === activeId);
    if (activeWs?.group) {
      setCollapsed(prev => {
        if (!prev.has(activeWs.group)) return prev;
        const next = new Set(prev);
        next.delete(activeWs.group);
        return next;
      });
    }
  }, [activeId, workspaces]);

  const toggleGroup = (name: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  return (
    <div className="workspace-tree flex flex-col gap-1">
      {sortedGroupNames.map((groupName) => {
        const items = grouped[groupName];
        const isExpanded = !collapsed.has(groupName);

        return (
          <div key={groupName} className="workspace-tree__group">
            <GroupHeader
              name={groupName}
              count={items.length}
              isExpanded={isExpanded}
              onToggle={() => toggleGroup(groupName)}
            />
            {isExpanded && (
              <div className="workspace-tree__items pl-2">
                {items.map((ws) => (
                  <WorkspaceCard
                    key={ws.id}
                    workspace={ws}
                    isActive={ws.id === activeId}
                    onClick={() => onSelect(ws.id)}
                    onContextMenu={
                      onContextMenu
                        ? (e) => onContextMenu(ws.id, e)
                        : undefined
                    }
                    isAgentActive={microStatus?.[ws.id]?.isAgentActive}
                    memoryCount={microStatus?.[ws.id]?.memoryCount}
                    lastActive={microStatus?.[ws.id]?.lastActive}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
