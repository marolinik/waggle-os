/**
 * Sidebar — Hive Design System collapsible left panel.
 *
 * 48px icons when collapsed, 220px expanded.
 * Hive-800 background with subtle border.
 */

import React from 'react';

export interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  bottomItems?: React.ReactNode;
}

export function Sidebar({ collapsed, onToggle, children, bottomItems }: SidebarProps) {
  return (
    <aside
      className={`waggle-sidebar flex flex-col h-full border-r transition-[width,min-width] duration-200 ease-in-out overflow-hidden ${
        collapsed ? 'w-12 min-w-12' : 'w-[220px] min-w-[220px]'
      }`}
      style={{
        backgroundColor: 'var(--hive-800)',
        borderColor: 'var(--hive-700)',
      }}
      role="navigation"
      aria-label="Main navigation"
    >
      {/* Collapse/expand toggle */}
      <button
        className="bg-transparent border-none cursor-pointer p-2.5 text-center text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded transition-colors"
        style={{ color: 'var(--hive-500)' }}
        onClick={onToggle}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-expanded={!collapsed}
      >
        {collapsed ? '▸' : '◂'}
      </button>

      {/* Main content (brand, search, workspaces) */}
      <div className="flex-1 overflow-auto flex flex-col gap-2">
        {children}
      </div>

      {/* Bottom navigation */}
      {bottomItems && (
        <div
          className="waggle-sidebar-bottom py-2"
          style={{ borderTop: '1px solid var(--hive-700)' }}
        >
          {bottomItems}
        </div>
      )}
    </aside>
  );
}
