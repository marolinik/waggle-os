/**
 * Tool Detection — shared types for AI-OS Phase 0.
 *
 * Mission: report which external AI tools are installed on the user's
 * machine, with version and hive-mind hook status. Foundation for the
 * launcher dock (Phase 2), hook auto-installer UX (Phase 2), and the
 * Mission Control inventory tile (Phase 4).
 *
 * The detection itself runs in the sidecar (agent package); these types
 * live in @waggle/shared so both the sidecar and the web bundle can
 * consume the same envelope without duplicating shapes.
 *
 * Out of scope for these types:
 *   - Hook installation (Phase 2)
 *   - Tool spawn / process management (Phase 2)
 *   - Workspace context injection (Phase 2)
 */

/**
 * Canonical AI-tool IDs that hive-mind has shipped hook packages for.
 * See packages/hive-mind-hooks-* for the matching installers.
 */
export const SUPPORTED_TOOLS = [
  'claude-code',
  'claude-desktop',
  'cursor',
  'codex',
  'codex-desktop',
  'hermes',
  'openclaw',
] as const;

export type ToolId = typeof SUPPORTED_TOOLS[number];

/**
 * Phase 1 launch cohort — the three tools the launcher dock and
 * activity-bus wire to first. The rest follow in Phase 4.
 */
export const LAUNCH_COHORT: readonly ToolId[] = [
  'claude-code',
  'cursor',
  'claude-desktop',
] as const;

/**
 * Per-tool human-readable display name. Centralized so the launcher
 * UI, sidecar logs, and KVARK governance reports all agree.
 */
export const TOOL_DISPLAY_NAMES: Record<ToolId, string> = {
  'claude-code': 'Claude Code',
  'claude-desktop': 'Claude Desktop',
  'cursor': 'Cursor',
  'codex': 'Codex CLI',
  'codex-desktop': 'Codex Desktop',
  'hermes': 'Hermes Agent',
  'openclaw': 'OpenClaw',
};

/**
 * Result of detecting a single tool on the user's machine.
 *
 * Field semantics:
 *   - `installed`  : true iff the binary was found at a known path.
 *   - `installedPath` : absolute path to the binary, or null.
 *   - `version` : version string (best-effort; null if exec failed).
 *   - `hooksInstalled` : true iff a hive-mind hook pointer file
 *     was found AND its referenced backup file still exists
 *     (so a partially-rolled-back install reports false).
 *   - `hookPointerPath` : the pointer file we read (or attempted),
 *     for diagnostics.
 *   - `diagnostic` : optional human-readable reason for any
 *     partial-failure case (e.g. "claude-code installed but --version
 *     returned non-zero").
 */
export interface DetectedTool {
  id: ToolId;
  displayName: string;
  installed: boolean;
  installedPath: string | null;
  version: string | null;
  hooksInstalled: boolean;
  hookPointerPath: string | null;
  diagnostic?: string;
}

/**
 * Top-level detection envelope. Stable shape across all callers
 * (sidecar route, web UI, Tauri command).
 */
export interface ToolDetectionResult {
  /** Platform the detection ran on. */
  platform: NodeJS.Platform | 'other';
  /** ISO timestamp at which the detection completed. */
  detectedAt: string;
  /** Per-tool detection result. Order matches SUPPORTED_TOOLS. */
  tools: DetectedTool[];
}
