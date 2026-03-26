/**
 * WorkspaceSwitcher — Quick-switch overlay for workspaces (Ctrl+Tab).
 *
 * Full-screen semi-transparent overlay with a centered card showing
 * recent workspaces. Keyboard navigation: Arrow keys, Enter, Escape.
 * Matches Hive Design System: dark card, honey border on selected.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { WorkspaceMicroStatus } from '@waggle/ui';

export interface WorkspaceSwitcherProps {
  open: boolean;
  onClose: () => void;
  onSelect: (workspaceId: string) => void;
  workspaces: Array<{ id: string; name: string; group: string }>;
  activeWorkspaceId: string | null;
  microStatus?: Record<string, WorkspaceMicroStatus>;
}

/** Format a relative time string from an ISO timestamp. */
function formatRelative(iso?: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function WorkspaceSwitcher({
  open,
  onClose,
  onSelect,
  workspaces,
  activeWorkspaceId,
  microStatus,
}: WorkspaceSwitcherProps) {
  // Show at most 10 recent workspaces
  const visibleWorkspaces = workspaces.slice(0, 10);

  // Default highlight to the workspace after the active one (so Ctrl+Tab acts like Alt+Tab)
  const activeIndex = visibleWorkspaces.findIndex((ws) => ws.id === activeWorkspaceId);
  const defaultIndex = visibleWorkspaces.length > 1
    ? (activeIndex + 1) % visibleWorkspaces.length
    : 0;

  const [selectedIndex, setSelectedIndex] = useState(defaultIndex);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset selection when opened
  useEffect(() => {
    if (open) {
      const idx = visibleWorkspaces.findIndex((ws) => ws.id === activeWorkspaceId);
      const next = visibleWorkspaces.length > 1 ? (idx + 1) % visibleWorkspaces.length : 0;
      setSelectedIndex(next);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard handler
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!open) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % visibleWorkspaces.length);
        return;
      }

      if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + visibleWorkspaces.length) % visibleWorkspaces.length);
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        const ws = visibleWorkspaces[selectedIndex];
        if (ws) {
          onSelect(ws.id);
          onClose();
        }
        return;
      }
    },
    [open, visibleWorkspaces, selectedIndex, onSelect, onClose],
  );

  useEffect(() => {
    if (!open) return;
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, handleKeyDown]);

  // Scroll selected item into view
  useEffect(() => {
    if (!open || !listRef.current) return;
    const items = listRef.current.querySelectorAll('[data-ws-item]');
    items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [open, selectedIndex]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9000] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="rounded-xl shadow-2xl overflow-hidden"
        style={{
          backgroundColor: 'var(--hive-900)',
          border: '1px solid var(--hive-700)',
          minWidth: 380,
          maxWidth: 480,
          maxHeight: '70vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-4 py-3 text-xs font-medium uppercase tracking-wider flex items-center justify-between"
          style={{ color: 'var(--hive-400)', borderBottom: '1px solid var(--hive-700)' }}
        >
          <span>Switch Workspace</span>
          <span className="text-[10px] opacity-50 normal-case tracking-normal">
            Ctrl+Tab
          </span>
        </div>

        {/* Workspace list */}
        <div ref={listRef} className="overflow-auto" style={{ maxHeight: 'calc(70vh - 48px)' }}>
          {visibleWorkspaces.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm" style={{ color: 'var(--hive-500)' }}>
              No workspaces available
            </div>
          ) : (
            visibleWorkspaces.map((ws, index) => {
              const isActive = ws.id === activeWorkspaceId;
              const isSelected = index === selectedIndex;
              const status = microStatus?.[ws.id];
              const memCount = status?.memoryCount ?? 0;
              const lastActive = status?.lastActive;
              const agentActive = status?.isAgentActive ?? false;

              // Build 1-line status
              const statusParts: string[] = [];
              if (memCount > 0) statusParts.push(`${memCount} memories`);
              if (lastActive) statusParts.push(`active ${formatRelative(lastActive)}`);
              const statusLine = statusParts.length > 0
                ? statusParts.join(', ')
                : isActive ? 'Current workspace' : '';

              return (
                <button
                  key={ws.id}
                  data-ws-item
                  onClick={() => { onSelect(ws.id); onClose(); }}
                  className="w-full text-left px-4 py-3 transition-colors cursor-pointer"
                  style={{
                    backgroundColor: isSelected ? 'var(--honey-glow)' : 'transparent',
                    borderLeft: isSelected ? '3px solid var(--honey-500)' : '3px solid transparent',
                  }}
                >
                  <div className="flex items-center gap-3">
                    {/* Health dot */}
                    <span
                      className="shrink-0 w-2 h-2 rounded-full"
                      style={{
                        backgroundColor: agentActive
                          ? 'var(--honey-500)'
                          : isActive
                            ? '#4ade80'
                            : 'var(--hive-600)',
                        boxShadow: agentActive ? '0 0 6px var(--honey-500)' : undefined,
                      }}
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-sm font-medium truncate"
                          style={{ color: isSelected ? 'var(--hive-50)' : 'var(--hive-200)' }}
                        >
                          {ws.name}
                        </span>
                        {ws.group && (
                          <span
                            className="text-[9px] px-1.5 py-0.5 rounded shrink-0"
                            style={{
                              backgroundColor: 'var(--hive-800)',
                              color: 'var(--hive-400)',
                              border: '1px solid var(--hive-700)',
                            }}
                          >
                            {ws.group}
                          </span>
                        )}
                        {isActive && (
                          <span
                            className="text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0"
                            style={{ color: 'var(--honey-500)', backgroundColor: 'rgba(229, 160, 0, 0.1)' }}
                          >
                            CURRENT
                          </span>
                        )}
                      </div>
                      {statusLine && (
                        <div
                          className="text-[11px] mt-0.5 truncate"
                          style={{ color: 'var(--hive-500)' }}
                        >
                          {statusLine}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
