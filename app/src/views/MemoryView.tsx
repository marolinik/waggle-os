/**
 * MemoryView — Wrapper around MemoryBrowser from @waggle/ui.
 */

import type { Frame, FrameFilters, MemoryStats } from '@waggle/ui';
import { MemoryBrowser } from '@waggle/ui';

export interface MemoryViewProps {
  frames: Frame[];
  selectedFrame?: Frame;
  onSelectFrame: (frame: Frame) => void;
  onSearch: (query: string) => void;
  filters: FrameFilters;
  onFiltersChange: (filters: FrameFilters) => void;
  stats?: MemoryStats;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  /** Q22: Callback when a frame is deleted */
  onDeleteFrame?: (id: number) => void;
  /** Q22: Callback when a frame is edited */
  onEditFrame?: (id: number, content: string, importance?: string) => void;
  /** Q22: Callback when a new frame is added */
  onAddFrame?: (content: string, importance: string) => void;
}

export default function MemoryView({
  frames,
  selectedFrame,
  onSelectFrame,
  onSearch,
  filters,
  onFiltersChange,
  stats,
  loading,
  error,
  onRetry,
  onDeleteFrame,
  onEditFrame,
  onAddFrame,
}: MemoryViewProps) {
  return (
    <div className="h-full overflow-hidden">
      <MemoryBrowser
        frames={frames}
        selectedFrame={selectedFrame}
        onSelectFrame={onSelectFrame}
        onSearch={onSearch}
        filters={filters}
        onFiltersChange={onFiltersChange}
        stats={stats}
        loading={loading}
        error={error}
        onRetry={onRetry}
        onDeleteFrame={onDeleteFrame}
        onEditFrame={onEditFrame}
        onAddFrame={onAddFrame}
      />
    </div>
  );
}
