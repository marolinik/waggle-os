/**
 * SkillCard — displays a single starter skill in the Install Center.
 *
 * Matches the dark-theme inline-style pattern used by CapabilitySection.
 */

import type { StarterSkillEntry } from '../../services/types.js';

export interface SkillCardProps {
  skill: StarterSkillEntry;
  onInstall: (skillId: string) => void;
  installing?: boolean;
}

function StateBadge({ state }: { state: 'active' | 'installed' }) {
  const classes = state === 'active'
    ? 'bg-green-500/[0.13] text-green-500'
    : 'bg-violet-400/[0.13] text-violet-400';
  const label = state === 'active' ? 'Active' : 'Installed';
  return (
    <span className={`${classes} px-2.5 py-0.5 rounded text-[11px] font-semibold uppercase`}>
      {label}
    </span>
  );
}

function InstallButton({
  installing,
  onClick,
}: {
  installing: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={installing}
      onClick={onClick}
      className={`bg-primary/[0.13] border border-primary rounded-md px-3.5 py-1 text-xs font-semibold ${
        installing ? 'text-primary/50 cursor-not-allowed opacity-60' : 'text-primary cursor-pointer'
      }`}
    >
      {installing ? 'Installing...' : 'Install'}
    </button>
  );
}

export function SkillCard({ skill, onInstall, installing = false }: SkillCardProps) {
  return (
    <div className="bg-muted border border-border rounded-lg px-4 py-3 mb-2">
      {/* Top row: name + state indicator */}
      <div className="flex justify-between items-center">
        <span className="text-sm font-semibold text-primary-foreground">{skill.name}</span>
        {skill.state === 'available' ? (
          <InstallButton
            installing={installing}
            onClick={() => {
              if (!installing) onInstall(skill.id);
            }}
          />
        ) : (
          <StateBadge state={skill.state} />
        )}
      </div>

      {/* Description */}
      <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{skill.description}</div>

      {/* Bottom row: family tag + optional workflow badge */}
      <div className="flex gap-2 mt-2 items-center">
        <span className="bg-card border border-border rounded-full px-2.5 py-0.5 text-[10px] text-muted-foreground">{skill.familyLabel}</span>
        {skill.isWorkflow && <span className="bg-primary/[0.13] text-primary px-2 py-0.5 rounded text-[10px] font-semibold">Workflow</span>}
      </div>
    </div>
  );
}
