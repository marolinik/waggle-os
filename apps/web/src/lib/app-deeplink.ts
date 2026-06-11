/**
 * Pending deep-link handoff for the `waggle:open-app` channel (Journey 16 /
 * M-09 class). The event is dispatched synchronously, but a closed target app
 * only mounts on the NEXT React render — its own listener registers after the
 * event is gone, so any `tab`/target payload was silently dropped on cold
 * open. Desktop's always-mounted handler stashes the intent here; the target
 * app consumes it once in a mount effect (and clears it when it handles the
 * live event instead, so a later remount never replays a stale intent).
 */
export interface AppDeepLink {
  appId: string;
  /** Target tab inside the app (validated by the consumer). */
  tab?: string;
  /** Journey 16: the failing automation to preselect on the Logs tab. */
  automationId?: string;
  /** J08: a list-filter to preselect in the target app (validated by the
   *  consumer — e.g. Memory Center seeds its status filter from this). */
  filter?: string;
}

const pending = new Map<string, AppDeepLink>();

/** Stash (or overwrite) the pending intent for an app. */
export function stashDeepLink(detail: AppDeepLink): void {
  if (!detail.appId) return;
  pending.set(detail.appId, detail);
}

/** Read-and-clear the pending intent for an app (null when none). */
export function consumeDeepLink(appId: string): AppDeepLink | null {
  const detail = pending.get(appId) ?? null;
  pending.delete(appId);
  return detail;
}
