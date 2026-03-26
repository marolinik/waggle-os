/**
 * AppShell — Hive Design System three-panel layout.
 * Left sidebar + center content + right context panel.
 * Honeycomb background on main content area.
 */

import React from 'react';

export interface AppShellProps {
  sidebar: React.ReactNode;
  content: React.ReactNode;
  contextPanel?: React.ReactNode;
  contextPanelOpen?: boolean;
  onToggleContextPanel?: () => void;
  statusBar: React.ReactNode;
}

export function AppShell({ sidebar, content, contextPanel, contextPanelOpen = true, onToggleContextPanel, statusBar }: AppShellProps) {
  return (
    <div
      className="waggle-app-shell flex flex-col h-screen w-screen overflow-hidden"
      style={{ backgroundColor: 'var(--hive-900)', color: 'var(--hive-200)' }}
    >
      <div className="waggle-app-shell-body flex flex-1 overflow-hidden">
        {sidebar}

        <main className="waggle-content flex-1 flex flex-col overflow-hidden min-w-0 honeycomb-bg">
          {content}
        </main>

        {/* Context panel */}
        {contextPanel && contextPanelOpen && (
          <aside
            className="waggle-context-panel w-[280px] min-w-[280px] overflow-auto hidden lg:block"
            style={{ borderLeft: '1px solid var(--hive-700)', backgroundColor: 'var(--hive-850)' }}
          >
            {onToggleContextPanel && (
              <button
                onClick={onToggleContextPanel}
                className="absolute top-1 right-1 text-xs z-10 hover:opacity-100 opacity-40 transition-opacity"
                style={{ color: 'var(--hive-400)' }}
                title="Hide panel"
              >
                ✕
              </button>
            )}
            {contextPanel}
          </aside>
        )}
        {contextPanel && !contextPanelOpen && onToggleContextPanel && (
          <button
            onClick={onToggleContextPanel}
            className="w-8 flex items-center justify-center cursor-pointer hidden lg:flex transition-colors"
            style={{ borderLeft: '1px solid var(--hive-700)', backgroundColor: 'var(--hive-850)', color: 'var(--hive-500)' }}
            title="Show context panel"
          >
            ◀
          </button>
        )}
      </div>

      {statusBar}
    </div>
  );
}
