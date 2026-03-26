/**
 * Pure utility functions for workspace components.
 * Tested directly without jsdom/React Testing Library.
 */

import type { Workspace } from '../../services/types.js';

/**
 * Group workspaces by their `group` field.
 * Workspaces without a group fall into "Other".
 */
export function groupWorkspacesByGroup(workspaces: Workspace[]): Record<string, Workspace[]> {
  const groups: Record<string, Workspace[]> = {};
  for (const ws of workspaces) {
    const group = ws.group || 'Other';
    if (!groups[group]) groups[group] = [];
    groups[group].push(ws);
  }
  return groups;
}

/**
 * Validate workspace creation form.
 * Returns an error message string or null if valid.
 */
export function validateWorkspaceForm(name: string): string | null {
  if (!name.trim()) return 'Name is required';
  if (name.length > 50) return 'Name must be 50 characters or less';
  return null;
}

/** Default group ordering for the tree view. */
export const GROUP_ORDER = ['Work', 'Personal', 'Study', 'Custom', 'Other'] as const;

/**
 * Sort groups by predefined order. Unknown groups go at the end alphabetically.
 */
export function sortGroups(groupNames: string[]): string[] {
  return [...groupNames].sort((a, b) => {
    const ai = GROUP_ORDER.indexOf(a as typeof GROUP_ORDER[number]);
    const bi = GROUP_ORDER.indexOf(b as typeof GROUP_ORDER[number]);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });
}
