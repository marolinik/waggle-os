/**
 * FrameDetail — detail panel for a selected memory frame.
 *
 * Shows full content, frame type, importance, timestamp, source,
 * and any related metadata.
 */

import type { Frame } from '../../services/types.js';
import { getFrameTypeIcon, getFrameTypeLabel, getImportanceBadge, getSourceLabel, formatTimestamp } from './utils.js';

export interface FrameDetailProps {
  frame: Frame;
}

export function FrameDetail({ frame }: FrameDetailProps) {
  const badge = getImportanceBadge(frame.importance);
  const icon = getFrameTypeIcon(frame.frameType);
  const label = getFrameTypeLabel(frame.frameType);

  return (
    <div className="frame-detail flex flex-col gap-3 rounded-lg bg-card p-4">
      {/* Header */}
      <div className="frame-detail__header flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="frame-detail__icon text-lg" title={label}>
            {icon === 'keyframe' ? '◆' : icon === 'prediction' ? '▶' : icon === 'bidirectional' ? '◀▶' : '■'}
          </span>
          <span className="frame-detail__type text-sm font-medium text-muted-foreground">
            {label}
          </span>
        </div>
        <span
          className={`frame-detail__importance rounded px-2 py-0.5 text-xs font-medium ${
            badge.color === 'red' ? 'text-red-400' : badge.color === 'yellow' ? 'text-amber-400' : badge.color === 'gray' ? 'text-muted-foreground' : 'text-primary'
          }`}
        >
          {badge.label}
        </span>
      </div>

      {/* Metadata */}
      <div className="frame-detail__meta flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span>ID: {frame.id}</span>
        <span>{formatTimestamp(frame.timestamp)}</span>
        <span>{getSourceLabel(frame.source)}</span>
        {frame.score !== undefined && (
          <span>Score: {frame.score.toFixed(2)}</span>
        )}
        {frame.authorName && (
          <span className="frame-detail__author text-primary">
            Added by {frame.authorName}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="frame-detail__content whitespace-pre-wrap rounded bg-background p-3 text-sm text-foreground">
        {frame.content}
      </div>

      {/* GOP / Session */}
      {(frame.gop || frame.sessionId) && (
        <div className="frame-detail__session flex gap-4 text-xs text-muted-foreground">
          {frame.gop && <span>GOP: {frame.gop}</span>}
          {frame.sessionId && <span>Session: {frame.sessionId}</span>}
        </div>
      )}

      {/* Entities */}
      {frame.entities && frame.entities.length > 0 && (
        <div className="frame-detail__entities">
          <span className="text-xs font-medium text-muted-foreground">Entities</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {frame.entities.map((entity) => (
              <span
                key={entity}
                className="rounded bg-secondary px-2 py-0.5 text-xs text-muted-foreground"
              >
                {entity}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Linked Frames */}
      {frame.linkedFrames && frame.linkedFrames.length > 0 && (
        <div className="frame-detail__linked">
          <span className="text-xs font-medium text-muted-foreground">Linked Frames</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {frame.linkedFrames.map((linkedId) => (
              <span
                key={linkedId}
                className="rounded bg-primary/20 px-2 py-0.5 text-xs text-primary/70"
              >
                #{linkedId}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
