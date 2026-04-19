import type { StorageType } from '@/lib/types';

/**
 * P16 · Files app three-tab layout.
 *
 * The tabs sit above the FilesApp content and remount it with a different
 * storageType when the user switches. Remounting on tab change is deliberate:
 * it resets the per-storage `currentPath` / `selectedFiles` state so flipping
 * from a local "/C/Users/..." path back to Virtual doesn't carry that path
 * through. See FilesAppTabs.tsx for the key-based remount.
 */

export const FILES_TAB_ORDER: StorageType[] = ['virtual', 'local', 'team'];

/**
 * Pick the initial tab for the Files app when it opens. Preference order:
 *   1. The workspace's configured storageType (if set)
 *   2. 'virtual' — always available, safe default
 *
 * 'team' would be valid in the config but we never default to it on open
 * because a team workspace without a connected team server has nothing to
 * show; the tab strip lets the user switch manually.
 */
export function initialTabFor(
  configured: StorageType | undefined,
): StorageType {
  if (configured && (FILES_TAB_ORDER as string[]).includes(configured)) {
    return configured;
  }
  return 'virtual';
}
