/**
 * Standard workspace groups — shared across:
 * - CreateWorkspaceDialog (group selector)
 * - DashboardApp (filter tabs)
 * - Onboarding
 *
 * Users can create workspaces with custom groups beyond this list.
 * Dashboard dynamically includes any non-standard groups from existing workspaces.
 */
// P13 (PDF 2026-04-17): only Personal / Work / Team are semantically distinct.
// Projects and Research are topics, not workspace scopes — they belong on the
// template selector, not here.
export const STANDARD_GROUPS = [
  'Personal',
  'Work',
  'Team',
] as const;

export type StandardGroup = typeof STANDARD_GROUPS[number];

/**
 * Get all groups: standard + any custom ones from existing workspaces.
 * Deduplicates and sorts: standard groups first (in order), then custom alphabetically.
 */
export function getAllGroups(existingGroups: string[]): string[] {
  const standardSet = new Set<string>(STANDARD_GROUPS);
  const custom = existingGroups.filter(g => !standardSet.has(g));
  const uniqueCustom = [...new Set(custom)].sort();
  return [...STANDARD_GROUPS, ...uniqueCustom];
}
