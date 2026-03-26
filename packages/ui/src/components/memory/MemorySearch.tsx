/**
 * MemorySearch — search box for full-text memory search.
 *
 * Provides an input field with search button. Calls onSearch callback on submit.
 */

import React, { useState, useCallback } from 'react';

export interface MemorySearchProps {
  onSearch: (query: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function MemorySearch({
  onSearch,
  placeholder = 'Search memory...',
  disabled = false,
}: MemorySearchProps) {
  const [query, setQuery] = useState('');

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (query.trim()) {
        onSearch(query.trim());
      }
    },
    [query, onSearch],
  );

  return (
    <div className="memory-search">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          className="memory-search__input flex-1 rounded bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
        />
        <button
          type="submit"
          className="memory-search__button rounded bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary disabled:opacity-50"
          disabled={disabled || !query.trim()}
        >
          Search
        </button>
      </form>
    </div>
  );
}
