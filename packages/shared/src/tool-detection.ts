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
 * AI-OS #5 — how a tool is detected. `path` = PATH lookup by binary name (CLI
 * tools; the only kind a third-party JSON adapter may declare). `candidates` =
 * platform-branching candidate-path probe, resolved by built-in agent code
 * (GUI/desktop apps) — not expressible declaratively, so built-in only.
 */
export type ToolDetectSpec =
  | { kind: 'path'; binaryName: string }
  | { kind: 'candidates' };

/**
 * AI-OS #5 — declarative descriptor for one external tool. The single source of
 * truth for the per-tool facts that used to be duplicated across SUPPORTED_TOOLS
 * / LAUNCH_COHORT / TOOL_DISPLAY_NAMES / HOOK_POINTER_BY_TOOL / HOOKS_COHORT /
 * the per-tool detectors. Built-ins live in BUILTIN_TOOL_MANIFESTS; third-party
 * adapters are loaded (data-only) from ~/.waggle/adapters/*.json.
 */
export interface ToolManifest {
  id: string;
  displayName: string;
  launchable: boolean;
  hookCapable: boolean;
  hookPointer: string;
  detect: ToolDetectSpec;
  /**
   * Declarative inline-prompt arg template for THIRD-PARTY path adapters
   * (e.g. ['--print', '{prompt}']). Built-ins keep their logic in
   * launcher-prompt-args.ts. Captured in v1; application is a fast-follow.
   */
  promptArgTemplate?: string[];
  /** true = first-party (the 7); false/absent = loaded third-party. */
  builtin?: boolean;
}

/**
 * The canonical 7 built-in tools — the source of truth for their per-tool data.
 * SUPPORTED_TOOLS (above) stays the `as const` type anchor; the cohort/name/
 * pointer consts derive from these manifests.
 */
export const BUILTIN_TOOL_MANIFESTS: readonly ToolManifest[] = [
  { id: 'claude-code', displayName: 'Claude Code', launchable: true, hookCapable: true, hookPointer: '.claude/hive-mind-install.json', detect: { kind: 'path', binaryName: 'claude' }, builtin: true },
  { id: 'claude-desktop', displayName: 'Claude Desktop', launchable: true, hookCapable: false, hookPointer: '.config/Claude/hive-mind-install.json', detect: { kind: 'candidates' }, builtin: true },
  { id: 'cursor', displayName: 'Cursor', launchable: true, hookCapable: true, hookPointer: '.cursor/hive-mind-install.json', detect: { kind: 'candidates' }, builtin: true },
  { id: 'codex', displayName: 'Codex CLI', launchable: true, hookCapable: true, hookPointer: '.codex/hive-mind-install.json', detect: { kind: 'path', binaryName: 'codex' }, builtin: true },
  { id: 'codex-desktop', displayName: 'Codex Desktop', launchable: true, hookCapable: true, hookPointer: '.codex/hive-mind-install.json', detect: { kind: 'candidates' }, builtin: true },
  { id: 'hermes', displayName: 'Hermes Agent', launchable: true, hookCapable: true, hookPointer: '.hermes/hive-mind-install.json', detect: { kind: 'path', binaryName: 'hermes' }, builtin: true },
  { id: 'openclaw', displayName: 'OpenClaw', launchable: true, hookCapable: true, hookPointer: '.openclaw/hive-mind-install.json', detect: { kind: 'path', binaryName: 'openclaw' }, builtin: true },
] as const;

/**
 * Tools the launcher dock + hook installer support end-to-end.
 *
 * Phase 1 shipped with 3 entries (Claude Code, Cursor, Claude
 * Desktop — D3). Phase 4 extends to all 7 because (a) each tool
 * already has a published hook-installer package
 * (@waggle/hive-mind-hooks-<id>), and (b) the marginal cost per
 * additional detector is one PATH lookup or candidate-path entry.
 */
export const LAUNCH_COHORT: readonly ToolId[] =
  BUILTIN_TOOL_MANIFESTS.filter((m) => m.launchable).map((m) => m.id as ToolId);

/**
 * AI-OS #5 — apply a third-party adapter's `promptArgTemplate` to a prompt by
 * substituting every `{prompt}` placeholder in each entry. Built-ins use their
 * own promptArgsForTool (web); this is the declarative form for loaded adapters.
 */
export function applyPromptArgTemplate(template: readonly string[], prompt: string): string[] {
  return template.map((a) => a.split('{prompt}').join(prompt));
}

/**
 * Per-tool human-readable display name. Centralized so the launcher
 * UI, sidecar logs, and KVARK governance reports all agree.
 */
export const TOOL_DISPLAY_NAMES = Object.fromEntries(
  BUILTIN_TOOL_MANIFESTS.map((m) => [m.id, m.displayName]),
) as Record<ToolId, string>;

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
  /** Tool id — a built-in ToolId or a loaded third-party adapter id (#5). */
  id: string;
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
