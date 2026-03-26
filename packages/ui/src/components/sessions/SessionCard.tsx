/**
 * SessionCard — a single session item in the session list.
 *
 * Shows title, message count, last active time. Highlights when active.
 * Right-click context menu for rename/delete/export.
 */

import React, { useState, useCallback } from 'react';
import type { Session } from '../../services/types.js';
import { formatLastActive } from './utils.js';

export interface SessionCardProps {
  session: Session;
  active?: boolean;
  workspaceIcon?: string;
  onSelect: () => void;
  onDelete?: () => void;
  onRename?: (title: string) => void;
  onExport?: () => void;
}

export function SessionCard({
  session,
  active = false,
  workspaceIcon,
  onSelect,
  onDelete,
  onRename,
  onExport,
}: SessionCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(session.title || '');

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (onDelete || onRename || onExport) {
        setShowMenu(true);
      }
    },
    [onDelete, onRename, onExport],
  );

  const handleRename = useCallback(() => {
    setShowMenu(false);
    setEditing(true);
    setEditTitle(session.title || '');
  }, [session.title]);

  const handleRenameSubmit = useCallback(() => {
    setEditing(false);
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== session.title && onRename) {
      onRename(trimmed);
    }
  }, [editTitle, session.title, onRename]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleRenameSubmit();
      if (e.key === 'Escape') setEditing(false);
    },
    [handleRenameSubmit],
  );

  const cardClasses = `session-card__button flex w-full items-center gap-2 rounded px-3 py-2 text-sm transition-colors ${
    active
      ? 'bg-primary/30 text-primary border-l-2 border-primary'
      : 'text-muted-foreground hover:bg-card border-l-2 border-transparent'
  }`;

  const cardContent = (
    <div className="session-card__content flex-1 min-w-0 text-left">
      {editing ? (
        <input
          className="session-card__rename w-full bg-secondary text-foreground rounded px-1 text-sm"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onBlur={handleRenameSubmit}
          onKeyDown={handleKeyDown}
          autoFocus
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="session-card__title block truncate" style={{ wordBreak: 'break-word' }}>
          {workspaceIcon && <span className="session-card__workspace-icon mr-1">{workspaceIcon}</span>}
          {session.title || 'Untitled Session'}
        </span>
      )}
      {session.summary && (
        <span className="session-card__summary block text-xs truncate mt-0.5" style={{ color: 'var(--hive-400)', wordBreak: 'break-word' }}>
          {session.summary}
        </span>
      )}
      <div className="session-card__meta flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
        <span>{session.messageCount} msg</span>
        <span className="text-muted-foreground/30">·</span>
        <span>{formatLastActive(session.lastActive)}</span>
        {/* IMP-13: Inline delete button for quick access */}
        {onDelete && !editing && (
          <>
            <span className="text-muted-foreground/30 ml-auto">·</span>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="text-[10px] text-muted-foreground/30 hover:text-destructive transition-colors"
              title="Delete session"
            >
              ×
            </button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="session-card relative">
      {editing ? (
        <div
          className={cardClasses}
          onContextMenu={handleContextMenu}
          title={session.title || 'Untitled Session'}
        >
          {cardContent}
        </div>
      ) : (
        <button
          className={cardClasses}
          onClick={onSelect}
          onContextMenu={handleContextMenu}
          title={session.title || 'Untitled Session'}
        >
          {cardContent}
        </button>
      )}

      {/* Context menu */}
      {showMenu && (
        <>
          <div
            className="session-card__overlay fixed inset-0 z-10"
            onClick={() => setShowMenu(false)}
          />
          <div className="session-card__menu absolute right-0 top-full z-20 mt-1 rounded bg-card border border-border shadow-lg py-1 min-w-[120px]">
            {onRename && (
              <button
                className="session-card__menu-item w-full text-left px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary"
                onClick={handleRename}
              >
                Rename
              </button>
            )}
            {onExport && (
              <button
                className="session-card__menu-item w-full text-left px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary"
                onClick={() => { setShowMenu(false); onExport(); }}
              >
                Export
              </button>
            )}
            {onDelete && (
              <button
                className="session-card__menu-item w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-secondary"
                onClick={() => { setShowMenu(false); onDelete(); }}
              >
                Delete
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
