/**
 * MemoryBrowser — main memory browser container.
 *
 * Combines MemorySearch, FrameTimeline, FrameDetail, and memory stats footer.
 * Orchestrates search, filtering, and frame selection.
 */

import { useState, useCallback } from 'react';
import type { Frame } from '../../services/types.js';
import type { FrameFilters, MemoryStats } from './utils.js';
import { FRAME_TYPES } from './utils.js';
import { MemorySearch } from './MemorySearch.js';
import { FrameTimeline } from './FrameTimeline.js';
import { FrameDetail } from './FrameDetail.js';

export interface MemoryBrowserProps {
  frames: Frame[];
  selectedFrame?: Frame;
  onSelectFrame: (frame: Frame) => void;
  onSearch: (query: string) => void;
  filters: FrameFilters;
  onFiltersChange: (filters: FrameFilters) => void;
  stats?: MemoryStats;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  /** Callback when a frame is deleted. If not provided, delete button is hidden. */
  onDeleteFrame?: (id: number) => void;
  /** Callback when a frame is edited. If not provided, edit button is hidden. */
  onEditFrame?: (id: number, content: string, importance?: string) => void;
  /** Callback when a new frame is added. If not provided, add button is hidden. */
  onAddFrame?: (content: string, importance: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MemoryBrowser({
  frames,
  selectedFrame,
  onSelectFrame,
  onSearch,
  filters,
  onFiltersChange,
  stats,
  loading = false,
  error = null,
  onRetry,
  onDeleteFrame,
  onEditFrame,
  onAddFrame,
}: MemoryBrowserProps) {
  // Q22: Add Memory form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [addContent, setAddContent] = useState('');
  const [addImportance, setAddImportance] = useState('normal');
  const [addSubmitting, setAddSubmitting] = useState(false);

  // Q22: Edit mode state
  const [editingFrameId, setEditingFrameId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editImportance, setEditImportance] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  const handleAddSubmit = useCallback(() => {
    if (!addContent.trim() || !onAddFrame) return;
    setAddSubmitting(true);
    try {
      onAddFrame(addContent.trim(), addImportance);
      setAddContent('');
      setAddImportance('normal');
      setShowAddForm(false);
    } finally {
      setAddSubmitting(false);
    }
  }, [addContent, addImportance, onAddFrame]);

  const handleEditStart = useCallback((frame: Frame) => {
    setEditingFrameId(frame.id);
    setEditContent(frame.content);
    setEditImportance(frame.importance);
  }, []);

  const handleEditSave = useCallback(() => {
    if (editingFrameId === null || !editContent.trim() || !onEditFrame) return;
    setEditSubmitting(true);
    try {
      onEditFrame(editingFrameId, editContent.trim(), editImportance);
      setEditingFrameId(null);
      setEditContent('');
      setEditImportance('');
    } finally {
      setEditSubmitting(false);
    }
  }, [editingFrameId, editContent, editImportance, onEditFrame]);

  const handleEditCancel = useCallback(() => {
    setEditingFrameId(null);
    setEditContent('');
    setEditImportance('');
  }, []);

  const handleDelete = useCallback((frameId: number) => {
    if (!onDeleteFrame) return;
    onDeleteFrame(frameId);
  }, [onDeleteFrame]);

  return (
    <div className="memory-browser flex h-full flex-col honeycomb-bg" style={{ backgroundColor: 'var(--hive-900)' }}>
      {/* Search + Add Memory button */}
      <div className="memory-browser__search flex items-center gap-2 p-3" style={{ borderBottom: '1px solid var(--hive-700)' }}>
        <div className="flex-1">
          <MemorySearch onSearch={onSearch} disabled={loading} />
        </div>
        {onAddFrame && (
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="shrink-0 rounded px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              backgroundColor: showAddForm ? 'var(--hive-700)' : 'var(--honey-600)',
              color: showAddForm ? 'var(--hive-200)' : '#fff',
            }}
            title="Add memory"
          >
            + Add
          </button>
        )}
      </div>

      {/* Q22: Add Memory form */}
      {showAddForm && onAddFrame && (
        <div className="memory-browser__add-form p-3 flex flex-col gap-2" style={{ borderBottom: '1px solid var(--hive-700)', backgroundColor: 'var(--hive-850)' }}>
          <textarea
            value={addContent}
            onChange={(e) => setAddContent(e.target.value)}
            placeholder="What do you want to remember?"
            className="w-full rounded bg-background p-2 text-sm text-foreground resize-none"
            rows={3}
          />
          <div className="flex items-center gap-2">
            <select
              value={addImportance}
              onChange={(e) => setAddImportance(e.target.value)}
              className="rounded bg-card px-2 py-1 text-xs text-muted-foreground"
            >
              <option value="critical">Critical</option>
              <option value="important">Important</option>
              <option value="normal">Normal</option>
              <option value="temporary">Temporary</option>
            </select>
            <div className="flex-1" />
            <button
              onClick={() => { setShowAddForm(false); setAddContent(''); }}
              className="rounded px-3 py-1 text-xs text-muted-foreground hover:bg-secondary transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAddSubmit}
              disabled={!addContent.trim() || addSubmitting}
              className="rounded px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50"
              style={{ backgroundColor: 'var(--honey-600)', color: '#fff' }}
            >
              {addSubmitting ? 'Saving...' : 'Save Memory'}
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="memory-browser__filters flex flex-wrap gap-2 px-3 py-2" style={{ borderBottom: '1px solid var(--hive-700)' }}>
        {/* Type filter chips */}
        {FRAME_TYPES.map((ft) => {
          const active = filters.types?.includes(ft.value);
          return (
            <button
              key={ft.value}
              className={`rounded px-2 py-0.5 text-xs transition-colors ${
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card text-muted-foreground hover:bg-secondary'
              }`}
              onClick={() => {
                const currentTypes = filters.types ?? [];
                const newTypes = active
                  ? currentTypes.filter((t) => t !== ft.value)
                  : [...currentTypes, ft.value];
                onFiltersChange({ ...filters, types: newTypes.length > 0 ? newTypes : undefined });
              }}
            >
              {ft.label}
            </button>
          );
        })}

        {/* Source filter */}
        <select
          className="rounded bg-card px-2 py-0.5 text-xs text-muted-foreground"
          value={filters.source ?? 'all'}
          onChange={(e) =>
            onFiltersChange({
              ...filters,
              source: e.target.value as 'personal' | 'workspace' | 'all',
            })
          }
        >
          <option value="all">All sources</option>
          <option value="personal">Personal</option>
          <option value="workspace">Workspace</option>
        </select>
      </div>

      {/* Main content area */}
      <div className="memory-browser__content flex flex-1 overflow-hidden">
        {/* Timeline */}
        <div className="memory-browser__timeline w-1/2 overflow-y-auto p-2" style={{ borderRight: '1px solid var(--hive-700)' }}>
          {loading ? (
            <div className="flex flex-col gap-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-3 bg-muted rounded w-3/4 mb-2" />
                  <div className="h-3 bg-muted rounded w-1/2 mb-1" />
                  <div className="h-2 bg-muted rounded w-1/4" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-8">
              <p className="text-sm text-destructive">Unable to load memories</p>
              <p className="text-xs text-muted-foreground max-w-xs">{error}</p>
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="rounded border border-border px-3 py-1.5 text-sm text-foreground hover:bg-secondary transition-colors"
                >
                  Retry
                </button>
              )}
            </div>
          ) : frames.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-8">
              <img src="/brand/bee-researcher-dark.png" alt="Memory" className="w-[120px] h-[120px] float opacity-80 bee-image-researcher" />
              <h3 className="text-base font-medium" style={{ color: 'var(--hive-100)' }}>No memories yet</h3>
              <p className="text-sm max-w-xs" style={{ color: 'var(--hive-400)' }}>
                Start a conversation — memories build automatically. Your agent gets smarter every session.
              </p>
            </div>
          ) : (
            <FrameTimeline
              frames={frames}
              selectedId={selectedFrame?.id}
              onSelect={onSelectFrame}
            />
          )}
        </div>

        {/* Detail panel */}
        <div className="memory-browser__detail flex-1 overflow-y-auto p-3">
          {selectedFrame ? (
            <div className="flex flex-col gap-3">
              {/* Q22: Edit mode for selected frame */}
              {editingFrameId === selectedFrame.id ? (
                <div className="flex flex-col gap-3 rounded-lg bg-card p-4">
                  <div className="text-sm font-medium text-muted-foreground">Edit Memory</div>
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full rounded bg-background p-2 text-sm text-foreground resize-none"
                    rows={6}
                  />
                  <div className="flex items-center gap-2">
                    <select
                      value={editImportance}
                      onChange={(e) => setEditImportance(e.target.value)}
                      className="rounded bg-card px-2 py-1 text-xs text-muted-foreground"
                    >
                      <option value="critical">Critical</option>
                      <option value="important">Important</option>
                      <option value="normal">Normal</option>
                      <option value="temporary">Temporary</option>
                      <option value="deprecated">Superseded</option>
                    </select>
                    <div className="flex-1" />
                    <button
                      onClick={handleEditCancel}
                      className="rounded px-3 py-1 text-xs text-muted-foreground hover:bg-secondary transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleEditSave}
                      disabled={!editContent.trim() || editSubmitting}
                      className="rounded px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50"
                      style={{ backgroundColor: 'var(--honey-600)', color: '#fff' }}
                    >
                      {editSubmitting ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <FrameDetail frame={selectedFrame} />
                  {/* Q22: Action buttons */}
                  <div className="flex items-center gap-2">
                    {onEditFrame && (
                      <button
                        onClick={() => handleEditStart(selectedFrame)}
                        className="rounded border border-border px-3 py-1.5 text-xs text-foreground hover:bg-secondary transition-colors"
                      >
                        Edit
                      </button>
                    )}
                    {onDeleteFrame && (
                      <button
                        onClick={() => handleDelete(selectedFrame.id)}
                        className="rounded border px-3 py-1.5 text-xs transition-colors hover:bg-red-900/30"
                        style={{ borderColor: 'var(--destructive)', color: 'var(--destructive)' }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
              <img src="/brand/bee-researcher-dark.png" alt="" className="w-20 h-20 opacity-40 bee-image-researcher" />
              {stats ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium" style={{ color: 'var(--hive-300)' }}>
                    {stats.totalFrames} memories · {stats.entities} entities
                  </p>
                  <p className="text-xs" style={{ color: 'var(--hive-500)' }}>
                    Select a memory to view details
                  </p>
                </div>
              ) : (
                <p className="text-sm" style={{ color: 'var(--hive-500)' }}>
                  Select a memory to view details
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Stats footer */}
      {stats && (
        <div className="memory-browser__stats flex items-center gap-4 px-3 py-1.5 text-xs" style={{ borderTop: '1px solid var(--hive-700)', color: 'var(--hive-400)', backgroundColor: 'var(--hive-850)' }}>
          <span>{stats.totalFrames} memories</span>
          <span>{stats.entities} entities</span>
          <span>{stats.relations} relations</span>
          {stats.mindFileSize !== undefined && (
            <span>{formatBytes(stats.mindFileSize)}</span>
          )}
        </div>
      )}
    </div>
  );
}
