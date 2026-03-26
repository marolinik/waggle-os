/**
 * Pure utility functions for session components.
 * Tested directly without jsdom/React Testing Library.
 */

import type { Session } from '../../services/types.js';

/** Ordered time groups for session list display. */
export const TIME_GROUPS = ['Today', 'Yesterday', 'This Week', 'Older'] as const;

/**
 * Determine which time group a date string falls into.
 * Groups: Today, Yesterday, This Week (7 days), Older.
 */
export function getTimeGroup(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();

  const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const todayStart = new Date(nowUtc);
  const yesterdayStart = new Date(nowUtc - 86_400_000);
  const weekStart = new Date(nowUtc - 6 * 86_400_000);

  if (date >= todayStart) return 'Today';
  if (date >= yesterdayStart) return 'Yesterday';
  if (date >= weekStart) return 'This Week';
  return 'Older';
}

/**
 * Group sessions by time period based on lastActive.
 * Only includes groups that have sessions (omits empty groups).
 */
export function groupSessionsByTime(sessions: Session[]): Record<string, Session[]> {
  const groups: Record<string, Session[]> = {};
  for (const session of sessions) {
    const group = getTimeGroup(session.lastActive);
    if (!groups[group]) groups[group] = [];
    groups[group].push(session);
  }
  return groups;
}

/**
 * Format a date string as relative time.
 * - < 1 min: "just now"
 * - < 1 hr: "X min ago"
 * - < 24 hr: "X hr ago"
 * - older: short date like "Mar 5"
 */
export function formatLastActive(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr} hr ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Auto-generate a session title from first messages.
 * Uses first ~50 chars of first user message, truncated at a word boundary.
 * Returns "New Session" when no messages are available.
 */
export function generateSessionTitle(messages?: string[]): string {
  if (!messages || messages.length === 0) return 'New Session';
  const first = messages[0].trim();
  if (!first) return 'New Session';
  if (first.length <= 50) return first;
  // Truncate at word boundary: find last space within first 50 chars
  const truncated = first.slice(0, 50);
  const lastSpace = truncated.lastIndexOf(' ');
  const cutPoint = lastSpace > 20 ? lastSpace : 50; // fallback to hard-cut if no good word boundary
  return first.slice(0, cutPoint) + '...';
}

/**
 * Sort sessions by lastActive descending (newest first).
 * Returns a new array — does not mutate the original.
 */
export function sortSessions(sessions: Session[]): Session[] {
  return [...sessions].sort(
    (a, b) => new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime(),
  );
}

/**
 * Filter sessions to those belonging to a specific workspace.
 */
export function filterSessionsByWorkspace(sessions: Session[], workspaceId: string): Session[] {
  return sessions.filter((s) => s.workspaceId === workspaceId);
}
