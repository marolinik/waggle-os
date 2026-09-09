/**
 * W2A — explicit-only active-workspace selection + persistence.
 *
 * The shared useWorkspaces store used to auto-select `data[0]` whenever nothing
 * was selected, so the first Home paint silently stamped the filesystem-first
 * workspace (an `ai-os-audit-*` dev dir) as active. Selection is now explicit:
 * a fetched list only VALIDATES an existing selection, it never picks one.
 */

const LEGACY_ACTIVE_WORKSPACE_KEY = 'waggle:active-workspace-v1';
const ACTIVE_WORKSPACE_KEY = 'waggle:active-workspace-v2';

const activeWorkspaceKey = (profileId: string | null): string =>
  `${ACTIVE_WORKSPACE_KEY}:${encodeURIComponent(profileId ?? 'unbound')}`;

/** Offline `createWorkspace` mints `local-<ts>` ids the server list never
 *  contains — those must survive list validation until a real sync replaces them. */
const isLocalFallbackId = (id: string): boolean => id.startsWith('local-');

/**
 * Resolve the active id after a fresh fetch. Pure — no auto-select:
 * - null in → null out (nothing selected, don't pick).
 * - `local-*` fallback ids are kept (server list can't vouch for them).
 * - an id still present in the list is kept; a stale/deleted id resolves to null.
 */
export function resolveActiveWorkspaceId(prev: string | null, ids: readonly string[]): string | null {
  if (!prev) return null;
  if (isLocalFallbackId(prev)) return prev;
  return ids.includes(prev) ? prev : null;
}

export function readPersistedWorkspaceId(profileId: string | null = null): string | null {
  try {
    return localStorage.getItem(activeWorkspaceKey(profileId));
  } catch {
    return null;
  }
}

export function persistWorkspaceId(id: string, profileId: string | null = null): void {
  try {
    localStorage.setItem(activeWorkspaceKey(profileId), id);
  } catch {
    /* storage unavailable — selection still lives in memory this session */
  }
}

export function clearPersistedWorkspaceId(profileId: string | null = null): void {
  try {
    localStorage.removeItem(activeWorkspaceKey(profileId));
  } catch {
    /* no-op */
  }
}

export function readLegacyPersistedWorkspaceId(): string | null {
  try {
    return localStorage.getItem(LEGACY_ACTIVE_WORKSPACE_KEY);
  } catch {
    return null;
  }
}

export function clearLegacyPersistedWorkspaceId(): void {
  try {
    localStorage.removeItem(LEGACY_ACTIVE_WORKSPACE_KEY);
  } catch {
    /* no-op */
  }
}
