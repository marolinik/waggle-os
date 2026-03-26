/**
 * WorkflowSuggestionCard — inline card shown above chat input when a
 * repeated workflow pattern is detected.
 *
 * Amber-bordered, compact design. "Save as Skill" or "Dismiss".
 * Dismiss is permanent per pattern per workspace.
 */

export interface WorkflowSuggestionProps {
  pattern: { name: string; steps: string[]; tools: string[] };
  onAccept: () => void;
  onDismiss: () => void;
}

export function WorkflowSuggestionCard({ pattern, onAccept, onDismiss }: WorkflowSuggestionProps) {
  return (
    <div
      className="mx-3 mb-2 rounded-lg border border-primary/50 bg-card px-3 py-2"
      data-testid="workflow-suggestion-card"
    >
      <div className="flex items-start gap-2">
        {/* Icon */}
        <span className="mt-0.5 text-primary" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 1v4M8 11v4M1 8h4M11 8h4" />
            <circle cx="8" cy="8" r="2" />
          </svg>
        </span>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">
            I noticed you repeat this workflow. Save as a reusable skill?
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {pattern.tools.slice(0, 6).map((tool, i) => (
              <span
                key={i}
                className="inline-block rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
              >
                {tool}
              </span>
            ))}
            {pattern.tools.length > 6 && (
              <span className="text-xs text-muted-foreground">
                +{pattern.tools.length - 6} more
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-2 flex items-center gap-2 justify-end">
        <button
          type="button"
          onClick={onDismiss}
          className="rounded px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          data-testid="workflow-suggestion-dismiss"
        >
          Dismiss
        </button>
        <button
          type="button"
          onClick={onAccept}
          className="rounded bg-primary/10 border border-primary/30 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
          data-testid="workflow-suggestion-accept"
        >
          Save as Skill
        </button>
      </div>
    </div>
  );
}
