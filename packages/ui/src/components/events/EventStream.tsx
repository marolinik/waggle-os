/**
 * EventStream — scrollable list of agent steps with auto-scroll and filtering.
 *
 * Shows step-by-step agent reasoning in the right panel.
 * Each step is rendered as a StepCard with expand/collapse support.
 */

import { useState, useRef, useEffect } from 'react';
import type { AgentStep, StepFilter } from './utils.js';
import { filterSteps, STEP_ICONS } from './utils.js';
import { StepCard } from './StepCard.js';

export interface EventStreamProps {
  steps: AgentStep[];
  autoScroll?: boolean;
  onToggleAutoScroll?: () => void;
  filter?: StepFilter;
  onFilterChange?: (f: StepFilter) => void;
}

export function EventStream({
  steps,
  autoScroll = true,
  onToggleAutoScroll,
  filter = {},
  onFilterChange,
}: EventStreamProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new steps arrive
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [steps.length, autoScroll]);

  const filtered = filterSteps(steps, filter);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="event-stream flex h-full flex-col bg-background">
      {/* Toolbar */}
      <div className="event-stream__toolbar flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Events
        </span>
        <span className="text-xs text-muted-foreground">({filtered.length})</span>
        <div className="flex-1" />

        {/* Filter chips for step types */}
        {onFilterChange && (
          <div className="flex gap-1">
            {Object.entries(STEP_ICONS).map(([type, icon]) => {
              const active = filter.types?.includes(type);
              return (
                <button
                  key={type}
                  className={`rounded px-1.5 py-0.5 text-xs transition-colors ${
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card text-muted-foreground hover:bg-secondary'
                  }`}
                  onClick={() => {
                    const currentTypes = filter.types ?? [];
                    const newTypes = active
                      ? currentTypes.filter((t) => t !== type)
                      : [...currentTypes, type];
                    onFilterChange({
                      ...filter,
                      types: newTypes.length > 0 ? newTypes : undefined,
                    });
                  }}
                  title={type}
                  type="button"
                >
                  {icon}
                </button>
              );
            })}
          </div>
        )}

        {/* Auto-scroll toggle */}
        {onToggleAutoScroll && (
          <button
            className={`rounded px-2 py-0.5 text-xs transition-colors ${
              autoScroll
                ? 'bg-primary text-primary-foreground'
                : 'bg-card text-muted-foreground hover:bg-secondary'
            }`}
            onClick={onToggleAutoScroll}
            title={autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}
            type="button"
          >
            Auto
          </button>
        )}
      </div>

      {/* Steps list */}
      <div className="event-stream__list flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-8">
            <img src="/brand/bee-analyst-dark.png" alt="Events" className="w-[110px] h-[110px] float opacity-80 bee-image-analyst" />
            <h3 className="text-base font-medium" style={{ color: 'var(--hive-100)' }}>No events recorded</h3>
            <p className="text-sm max-w-xs" style={{ color: 'var(--hive-400)' }}>
              Every action your agent takes is logged here for full transparency.
            </p>
          </div>
        ) : (
          filtered.map((step) => (
            <StepCard
              key={step.id}
              step={step}
              expanded={expandedIds.has(step.id)}
              onToggleExpand={() => toggleExpand(step.id)}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
