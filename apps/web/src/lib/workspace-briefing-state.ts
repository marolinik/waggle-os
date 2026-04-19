/**
 * Per-workspace WorkspaceBriefing collapsed-state persistence
 * (M-23 / ENG-2).
 *
 * The briefing is valuable on first visit but becomes noise once the
 * user knows the workspace. A per-workspace localStorage flag lets the
 * user collapse it and have that preference survive reloads and
 * remain scoped so sibling workspaces stay independent.
 */

const KEY_PREFIX = 'waggle:workspace-briefing-collapsed:';

/** Build the scoped localStorage key for a given workspace id. */
export function workspaceBriefingStorageKey(workspaceId: string): string {
  // Basic sanitisation: drop whitespace and angle brackets. The
  // workspaceId typically looks like `ws_xxx` / `local-123` / a UUID;
  // we don't need aggressive escaping, just a deterministic key.
  const safe = workspaceId.replace(/[\s<>]/g, '_');
  return `${KEY_PREFIX}${safe}`;
}

/** Read the collapsed flag for the workspace. Default: false (expanded). */
export function readWorkspaceBriefingCollapsed(workspaceId: string): boolean {
  if (!workspaceId) return false;
  try {
    return window.localStorage.getItem(workspaceBriefingStorageKey(workspaceId)) === 'true';
  } catch {
    return false;
  }
}

/** Persist the collapsed flag for the workspace. */
export function writeWorkspaceBriefingCollapsed(workspaceId: string, collapsed: boolean): void {
  if (!workspaceId) return;
  try {
    window.localStorage.setItem(
      workspaceBriefingStorageKey(workspaceId),
      String(collapsed),
    );
  } catch {
    // no-op
  }
}
