import type { Notification } from '@/lib/types';

/**
 * W4C (F25) — humanize a notification for display.
 *
 * The server persists machine-flavored copy (e.g. a generic per-tick cron
 * completion reads "<name> completed" / "Scheduled task ran successfully.") and
 * a deep-link `actionUrl` that the inbox never rendered. This pure mapper turns
 * a raw Notification into { title, body, href } the inbox can render directly:
 *   - softens the known generic-jargon bodies,
 *   - surfaces the action link as an href,
 *   - always falls back to the raw copy so unmapped events still read sensibly.
 */

export interface HumanizedNotification {
  title: string;
  body: string;
  /** Deep-link target for a CTA, when the notification carries one. */
  href?: string;
}

/** The hardcoded generic cron-tick body (packages/server/src/local/index.ts). */
const GENERIC_CRON_BODY = /^scheduled task ran successfully\.?$/i;

/** A friendlier default body per category when the server sent none. */
const EMPTY_BODY_FALLBACK: Record<string, string> = {
  cron: 'Your scheduled automation just ran.',
  approval: 'An action is waiting for your approval.',
  task: 'A task was updated.',
  message: 'You have a new message.',
  agent: 'An agent finished its work.',
};

export function humanizeNotification(n: Notification): HumanizedNotification {
  const href = typeof n.actionUrl === 'string' && n.actionUrl.trim() ? n.actionUrl.trim() : undefined;
  const title = (n.title ?? '').trim() || 'Notification';
  let body = (n.body ?? '').trim();

  if (!body) {
    body = EMPTY_BODY_FALLBACK[n.type] ?? '';
  } else if (n.type === 'cron' && GENERIC_CRON_BODY.test(body)) {
    // "Scheduled task ran successfully." → plain-language equivalent.
    body = 'Your scheduled automation just ran.';
  }

  return { title, body, href };
}
