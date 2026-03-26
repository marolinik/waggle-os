/**
 * SessionList — grouped session list with time-based sections.
 *
 * Renders sessions grouped by Today, Yesterday, This Week, Older.
 * Includes a "New Session" button at the top.
 */

import { useState, useCallback, useRef } from 'react';
import type { Session, SessionSearchResult } from '../../services/types.js';
import { SessionCard } from './SessionCard.js';
import { TIME_GROUPS } from './utils.js';

export interface SessionListProps {
  grouped: Record<string, Session[]>;
  activeSessionId?: string;
  onSelectSession: (id: string) => void;
  onCreateSession: () => void;
  onDeleteSession?: (id: string) => void;
  onRenameSession?: (id: string, title: string) => void;
  onExportSession?: (id: string) => void;
  /** F1: Session search */
  onSearch?: (query: string) => void;
  searchResults?: SessionSearchResult[] | null;
  searchLoading?: boolean;
  onClearSearch?: () => void;
}

export function SessionList({
  grouped,
  activeSessionId,
  onSelectSession,
  onCreateSession,
  onDeleteSession,
  onRenameSession,
  onExportSession,
  onSearch,
  searchResults,
  searchLoading,
  onClearSearch,
}: SessionListProps) {
  const [searchValue, setSearchValue] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!onSearch) return;
    if (!value) {
      onClearSearch?.();
      return;
    }
    debounceRef.current = setTimeout(() => onSearch(value), 300);
  }, [onSearch, onClearSearch]);

  const handleClearSearch = useCallback(() => {
    setSearchValue('');
    onClearSearch?.();
  }, [onClearSearch]);

  const showSearchResults = searchResults != null && searchValue.length >= 2;

  return (
    <div className="session-list flex flex-col gap-1">
      {/* New Session button */}
      <button
        className="session-list__new flex items-center gap-2 w-full rounded px-3 py-2 text-sm text-primary hover:bg-card transition-colors"
        onClick={onCreateSession}
      >
        <span>+</span>
        <span>New Session</span>
      </button>

      {/* F1: Search input */}
      {onSearch && (
        <div className="session-list__search px-2 py-1">
          <div className="relative">
            <input
              className="session-list__search-input w-full rounded px-3 py-1.5 text-sm focus:outline-none transition-colors"
              style={{ backgroundColor: 'var(--hive-850)', border: '1px solid var(--hive-700)', color: 'var(--hive-200)' }}
              onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = 'var(--honey-500)'; }}
              onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = 'var(--hive-700)'; }}
              type="text"
              placeholder="Search sessions..."
              value={searchValue}
              onChange={handleSearchChange}
            />
            {searchValue && (
              <button
                className="session-list__search-clear absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground text-xs"
                onClick={handleClearSearch}
                aria-label="Clear search"
              >
                &#x2715;
              </button>
            )}
          </div>
          {searchLoading && (
            <div className="session-list__search-loading text-xs text-muted-foreground px-1 py-0.5">Searching...</div>
          )}
        </div>
      )}

      {/* F1: Search results */}
      {showSearchResults && (
        <div className="session-list__search-results">
          <div className="session-list__group-header px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {searchResults.length === 0 ? 'No results' : `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''}`}
          </div>
          {searchResults.map((result) => (
            <button
              key={result.sessionId}
              className="session-list__search-result flex flex-col w-full text-left rounded px-3 py-2 text-sm text-muted-foreground hover:bg-card transition-colors"
              onClick={() => { onSelectSession(result.sessionId); handleClearSearch(); }}
            >
              <span className="session-list__search-title block truncate font-medium">{result.title}</span>
              {result.snippets.length > 0 && (
                <span className="session-list__search-snippet block text-xs text-muted-foreground truncate mt-0.5">
                  {result.snippets[0].text}
                </span>
              )}
              <span className="session-list__search-meta block text-xs text-muted-foreground">
                {result.matchCount} match{result.matchCount !== 1 ? 'es' : ''}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Grouped sessions (hidden while showing search results) */}
      {!showSearchResults && TIME_GROUPS.map((group) => {
        const sessions = grouped[group];
        if (!sessions || sessions.length === 0) return null;

        return (
          <div key={group} className="session-list__group">
            <div className="session-list__group-header px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {group}
            </div>
            {sessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                active={session.id === activeSessionId}
                onSelect={() => onSelectSession(session.id)}
                onDelete={onDeleteSession ? () => onDeleteSession(session.id) : undefined}
                onRename={onRenameSession ? (title) => onRenameSession(session.id, title) : undefined}
                onExport={onExportSession ? () => onExportSession(session.id) : undefined}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
