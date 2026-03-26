/**
 * ActivityFeed — shows recent team activity as a timeline.
 *
 * Displays session summaries, memory additions, and task changes
 * from all team members. Used in the context panel for team workspaces.
 */

export interface ActivityItem {
  id: string;
  type: 'session' | 'memory' | 'task' | 'join' | 'general';
  authorName: string;
  authorId?: string;
  summary: string;
  timestamp: string;
}

export interface ActivityFeedProps {
  items: ActivityItem[];
  loading?: boolean;
}

const TYPE_ICONS: Record<ActivityItem['type'], string> = {
  session: '\u{1F4AC}',   // 💬
  memory: '\u{1F9E0}',    // 🧠
  task: '\u{2705}',       // ✅
  join: '\u{1F44B}',      // 👋
  general: '\u{1F4E2}',   // 📢
};

export function formatActivityTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function ActivityFeed({ items, loading }: ActivityFeedProps) {
  if (loading) {
    return (
      <div className="activity-feed p-3 text-muted-foreground/70 text-[11px]">
        Loading team activity...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="activity-feed p-3 text-muted-foreground/70 text-[11px]">
        No recent team activity.
      </div>
    );
  }

  return (
    <div className="activity-feed max-h-[300px] overflow-auto">
      {items.map((item) => (
        <div
          key={item.id}
          className="activity-feed__item px-3 py-2 border-b border-border/20 text-[11px]"
        >
          <div className="flex items-center gap-1.5 mb-0.5">
            <span>{TYPE_ICONS[item.type] ?? TYPE_ICONS.general}</span>
            <span className="font-semibold text-muted-foreground">
              {item.authorName}
            </span>
            <span className="text-muted-foreground/70 text-[9px] ml-auto">
              {formatActivityTime(item.timestamp)}
            </span>
          </div>
          <div className="text-muted-foreground leading-[1.4] overflow-hidden line-clamp-2">
            {item.summary}
          </div>
        </div>
      ))}
    </div>
  );
}
