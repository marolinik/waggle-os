/**
 * FrameTimeline — scrollable list of frame cards sorted by time.
 *
 * Each card shows type icon, timestamp, first 2 lines, importance badge, source,
 * and team attribution (author name) when present.
 */

import type { Frame } from '../../services/types.js';
import {
  getImportanceBadge,
  getSourceLabel,
  truncateContent,
  formatTimestamp,
  groupFramesByDate,
} from './utils.js';

export interface FrameTimelineProps {
  frames: Frame[];
  selectedId?: number;
  onSelect: (frame: Frame) => void;
}

export function FrameTimeline({ frames, selectedId, onSelect }: FrameTimelineProps) {
  if (frames.length === 0) {
    return (
      <div className="frame-timeline__empty flex flex-col items-center justify-center gap-2 p-8 text-center">
        <div className="text-sm text-muted-foreground">No memories match your filters</div>
        <div className="text-xs text-muted-foreground/60">Try adjusting the frame type or date filters above.</div>
      </div>
    );
  }

  // E4: Group frames by date period
  const dateGroups = groupFramesByDate(frames);

  return (
    <div className="frame-timeline flex flex-col gap-1 overflow-y-auto">
      {dateGroups.map((group) => (
        <div key={group.label}>
          <div className="text-[10px] font-semibold uppercase tracking-wider px-3 pt-3 pb-1" style={{ color: 'var(--hive-500)' }}>
            {group.label}
          </div>
          {group.frames.map((frame) => {
        const isSelected = frame.id === selectedId;
        const badge = getImportanceBadge(frame.importance);
        const preview = truncateContent(frame.content, 2);

        // Source-type dot color: personal = honey, workspace = blue
        const dotColor = frame.source === 'personal' ? 'var(--honey-500)' : 'var(--status-info)';

        return (
          <button
            key={`${frame.source ?? 'default'}-${frame.id}`}
            className="frame-timeline__card flex flex-col gap-1.5 rounded-lg px-3 py-2.5 text-left transition-all duration-150"
            style={{
              backgroundColor: isSelected ? 'var(--honey-glow)' : 'transparent',
              border: isSelected ? '1px solid var(--honey-500)' : '1px solid transparent',
            }}
            onClick={() => onSelect(frame)}
            onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--honey-pulse)'; }}
            onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
          >
            {/* Top row: source dot + content preview */}
            <div className="flex items-start gap-2">
              <span
                className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                style={{ backgroundColor: dotColor }}
                title={getSourceLabel(frame.source)}
              />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold line-clamp-1" style={{ color: 'var(--hive-100)' }}>
                  {preview}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[11px]" style={{ color: 'var(--hive-500)' }}>
                    {formatTimestamp(frame.timestamp)}
                  </span>
                  <span className="text-[11px]" style={{ color: 'var(--hive-500)' }}>
                    {getSourceLabel(frame.source)}
                  </span>
                  {badge.label !== 'normal' && (
                    <span
                      className="text-[10px] font-medium"
                      style={{
                        color: badge.color === 'red' ? 'var(--status-error)'
                          : badge.color === 'yellow' ? 'var(--status-warning)'
                          : 'var(--honey-500)',
                      }}
                    >
                      {badge.label}
                    </span>
                  )}
                  {frame.authorName && (
                    <span className="text-[10px]" style={{ color: 'var(--honey-500)' }}>
                      by {frame.authorName}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </button>
        );
      })}
        </div>
      ))}
    </div>
  );
}
