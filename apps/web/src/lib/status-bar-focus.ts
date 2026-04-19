/**
 * P39 — dynamic status bar focus label.
 *
 * Computes the short string that replaces the previously-static area in the
 * status bar with whatever window is currently focused (e.g. "Chat · Marketing
 * · Researcher" or "Files"). Pure / DOM-free so the cascade rules
 * (no-focus → null, minimized → null, empty-title → null) can be unit-tested.
 */

export interface StatusBarFocusInput {
  appId: string;
  title: string;
  minimized?: boolean;
}

export interface BuildStatusBarFocusArgs {
  focused?: StatusBarFocusInput | null;
  /**
   * Workspace name shown elsewhere in the status bar. If the focused title
   * starts with this workspace name, we strip it to avoid the duplicate
   * "Marketing · Chat · Marketing · Researcher" rendering.
   */
  workspaceName?: string;
  /** Maximum length for the returned label. Trimmed with ellipsis. */
  maxLength?: number;
}

export const DEFAULT_MAX_LENGTH = 60;

function stripWorkspacePrefix(title: string, workspaceName: string): string {
  const prefix = `${workspaceName} · `;
  return title.startsWith(prefix) ? title.slice(prefix.length) : title;
}

/**
 * Trim and clip the focus title. Returns null when there's nothing useful to
 * show (no focused window, minimized, empty-after-cleanup).
 */
export function buildStatusBarFocus(args: BuildStatusBarFocusArgs): string | null {
  const { focused, workspaceName, maxLength = DEFAULT_MAX_LENGTH } = args;
  if (!focused) return null;
  if (focused.minimized === true) return null;

  const rawTitle = focused.title ?? '';
  // Strip the workspace prefix BEFORE trimming so 'Marketing · ' (just a
  // trailing separator with no focus meaning) normalises to empty and we
  // can return null.
  const wsName = (workspaceName ?? '').trim();
  const afterStrip = wsName.length > 0 ? stripWorkspacePrefix(rawTitle, wsName) : rawTitle;
  const cleaned = afterStrip.trim();
  if (cleaned.length === 0) return null;

  if (cleaned.length <= maxLength) return cleaned;
  // slice -1 leaves room for the single-char ellipsis
  return `${cleaned.slice(0, maxLength - 1).trimEnd()}…`;
}
