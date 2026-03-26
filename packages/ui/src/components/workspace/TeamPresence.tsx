/**
 * TeamPresence — shows online team members for a team workspace.
 *
 * Displays small status dots with member names on hover.
 * Only visible when a team workspace is active.
 */

import type { TeamMember } from '../../services/types.js';

export interface TeamPresenceProps {
  members: TeamMember[];
  /** Max number of avatars to show before "+N more" */
  maxVisible?: number;
}

const STATUS_BG_CLASS: Record<string, string> = {
  online: 'bg-green-500',
  away: 'bg-amber-500',
  offline: 'bg-gray-500',
};

export function TeamPresence({ members, maxVisible = 5 }: TeamPresenceProps) {
  if (members.length === 0) return null;

  const online = members.filter(m => m.status === 'online');
  const visible = members.slice(0, maxVisible);
  const remaining = members.length - maxVisible;

  return (
    <div className="team-presence flex items-center gap-1.5">
      {/* Online count */}
      <span className="team-presence__count text-[10px] text-muted-foreground">
        {online.length} online
      </span>

      {/* Member dots */}
      <div className="team-presence__dots flex -space-x-1">
        {visible.map((member) => (
          <div
            key={member.userId}
            className="team-presence__dot relative flex h-6 w-6 items-center justify-center rounded-full border border-border bg-secondary text-[10px] font-medium text-foreground"
            title={`${member.displayName}${member.activitySummary ? ` — ${member.activitySummary}` : ''} (${member.status})`}
          >
            {member.avatarUrl ? (
              <img
                src={member.avatarUrl}
                alt={member.displayName}
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              getInitials(member.displayName)
            )}
            {/* Status indicator */}
            <span
              className={`team-presence__status absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-border ${STATUS_BG_CLASS[member.status] ?? STATUS_BG_CLASS.offline}`}
            />
          </div>
        ))}
        {remaining > 0 && (
          <div
            className="team-presence__more flex h-6 w-6 items-center justify-center rounded-full border border-border bg-muted text-[9px] text-muted-foreground"
            title={`${remaining} more member${remaining > 1 ? 's' : ''}`}
          >
            +{remaining}
          </div>
        )}
      </div>
    </div>
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export { getInitials };
