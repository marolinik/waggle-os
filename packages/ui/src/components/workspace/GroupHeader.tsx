/**
 * GroupHeader — collapsible group header in the workspace tree.
 *
 * Shows group name, workspace count, and an expand/collapse chevron.
 */

export interface GroupHeaderProps {
  name: string;
  count: number;
  isExpanded: boolean;
  onToggle: () => void;
}

export function GroupHeader({ name, count, isExpanded, onToggle }: GroupHeaderProps) {
  return (
    <button
      className="group-header flex w-full items-center gap-2 px-2 py-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
      onClick={onToggle}
      aria-expanded={isExpanded}
    >
      {/* Chevron */}
      <span
        className={`group-header__chevron inline-block transition-transform ${
          isExpanded ? 'rotate-90' : 'rotate-0'
        }`}
      >
        &#9654;
      </span>

      {/* Group name */}
      <span className="group-header__name flex-1 text-left">{name}</span>

      {/* Count badge */}
      <span className="group-header__count text-xs text-muted-foreground">{count}</span>
    </button>
  );
}
