/**
 * StepCard — displays a single agent step in the event stream.
 *
 * Shows timestamp, icon, action name, description, duration,
 * and an expandable section with input/output, token count, cost.
 */

import type { AgentStep } from './utils.js';
import { getStepIcon, getStepColor, getStepTypeColor, formatStepDuration, formatStepTimestamp } from './utils.js';

export interface StepCardProps {
  step: AgentStep;
  expanded?: boolean;
  onToggleExpand?: () => void;
}

export function StepCard({ step, expanded = false, onToggleExpand }: StepCardProps) {
  const icon = getStepIcon(step.type);
  const typeColor = getStepTypeColor(step.type);
  const statusColor = getStepColor(step.status);

  const HeaderTag = onToggleExpand ? 'button' : 'div';

  return (
    <div
      className="step-card rounded border border-border bg-card mb-1 border-l-[3px]"
      style={{ borderLeftColor: typeColor }}
    >
      {/* Header row */}
      <HeaderTag
        className="step-card__header flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-card"
        onClick={onToggleExpand}
        type={onToggleExpand ? 'button' : undefined}
      >
        {/* Timestamp */}
        <span className="step-card__time text-xs text-muted-foreground font-mono">
          {formatStepTimestamp(step.timestamp)}
        </span>

        {/* Icon */}
        <span className="step-card__icon text-xs" title={icon}>
          {icon}
        </span>

        {/* Name + description */}
        <span className="step-card__name flex-1 truncate text-foreground">
          <strong>{step.name}</strong>
          {step.description && (
            <span className="text-muted-foreground"> — {step.description}</span>
          )}
        </span>

        {/* Duration */}
        {step.duration !== undefined && (
          <span className="step-card__duration text-xs text-muted-foreground">
            {formatStepDuration(step.duration)}
          </span>
        )}

        {/* Status indicator */}
        <span
          className="step-card__status h-2 w-2 rounded-full"
          style={{ backgroundColor: statusColor }}
          title={step.status}
        />
      </HeaderTag>

      {/* Expanded details */}
      {expanded && (
        <div className="step-card__details border-t border-border px-3 py-2 text-xs">
          {/* Tokens + cost */}
          {(step.tokens || step.cost !== undefined) && (
            <div className="step-card__meta mb-2 flex gap-4 text-muted-foreground">
              {step.tokens && (
                <span>
                  Tokens: {step.tokens.input} in / {step.tokens.output} out
                </span>
              )}
              {step.cost !== undefined && (
                <span>Cost: ${step.cost.toFixed(4)}</span>
              )}
            </div>
          )}

          {/* Input */}
          {step.input && (
            <div className="step-card__input mb-2">
              <div className="mb-1 font-semibold text-muted-foreground">Input</div>
              <pre className="overflow-x-auto rounded bg-background p-2 text-muted-foreground">
                {JSON.stringify(step.input, null, 2)}
              </pre>
            </div>
          )}

          {/* Output */}
          {step.output !== undefined && (
            <div className="step-card__output">
              <div className="mb-1 font-semibold text-muted-foreground">Output</div>
              <pre className="overflow-x-auto rounded bg-background p-2 text-muted-foreground">
                {typeof step.output === 'string'
                  ? step.output
                  : JSON.stringify(step.output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
