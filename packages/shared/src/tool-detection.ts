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
 * Canonical built-in AI-tool execution surfaces. CLI and desktop surfaces use
 * distinct ids whenever they have different launch/task capabilities.
 */
export const SUPPORTED_TOOLS = [
  'claude-code',
  'claude-desktop',
  'cursor',
  'codex',
  'codex-desktop',
  'hermes',
  'hermes-desktop',
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

export type ExternalToolAccess = 'read-only' | 'workspace-write' | 'native';
export type ToolPromptTransport = 'stdin' | 'arg' | 'temp-file';
export type ToolOutputDialect =
  | 'claude-stream-json'
  | 'codex-jsonl'
  | 'hermes-text'
  | 'openclaw-json'
  | 'text'
  | 'json'
  | 'jsonl';
export type ToolWorkspaceBinding = 'cwd' | 'flag' | 'managed-agent';

/** Declarative, shell-free contract for one capturable agent task. */
export interface ToolTaskSpec {
  argvTemplate: readonly string[];
  resumeArgvTemplate?: readonly string[];
  accessArgs: Partial<Record<ExternalToolAccess, readonly string[]>>;
  promptTransport: ToolPromptTransport;
  outputDialect: ToolOutputDialect;
  workspaceBinding: ToolWorkspaceBinding;
  permissionModes: readonly ExternalToolAccess[];
  resumable: boolean;
}

export interface ToolCapabilities {
  interactiveLaunch: boolean;
  headlessTask: boolean;
  structuredProgress: boolean;
  resumable: boolean;
  liveWaggleDance: boolean;
}

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
  /** Built-in-only pointer root; third-party adapters always use the user home. */
  hookRoot?: 'user-home' | 'hermes-home';
  hookPointer: string;
  detect: ToolDetectSpec;
  /**
   * Declarative inline-prompt arg template for THIRD-PARTY path adapters
   * (e.g. ['--print', '{prompt}']). Built-ins keep their logic in
   * launcher-prompt-args.ts. Captured in v1; application is a fast-follow.
   */
  promptArgTemplate?: string[];
  /** Explicit capability split: opening an app is not the same as running a task. */
  capabilities?: ToolCapabilities;
  /** Present only when the adapter has a verified, capturable headless lane. */
  task?: ToolTaskSpec;
  /** true = first-party (the 7); false/absent = loaded third-party. */
  builtin?: boolean;
}

/**
 * The canonical 8 built-in execution surfaces — the source of truth for their
 * per-tool data.
 * SUPPORTED_TOOLS (above) stays the `as const` type anchor; the cohort/name/
 * pointer consts derive from these manifests.
 */
export const BUILTIN_TOOL_MANIFESTS: readonly ToolManifest[] = [
  {
    id: 'claude-code', displayName: 'Claude Code', launchable: true, hookCapable: true,
    hookPointer: '.claude/hive-mind-install.json', detect: { kind: 'path', binaryName: 'claude' }, builtin: true,
    capabilities: { interactiveLaunch: true, headlessTask: true, structuredProgress: true, resumable: true, liveWaggleDance: false },
    task: {
      argvTemplate: ['-p', '--safe-mode', '--disable-slash-commands', '--max-budget-usd', '1.00', '--input-format', 'text', '--output-format', 'stream-json', '--verbose', '{accessArgs}'],
      resumeArgvTemplate: ['-p', '--safe-mode', '--disable-slash-commands', '--resume', '{sessionId}', '--max-budget-usd', '1.00', '--input-format', 'text', '--output-format', 'stream-json', '--verbose', '{accessArgs}'],
      accessArgs: {
        'read-only': ['--permission-mode', 'plan'],
        'workspace-write': ['--permission-mode', 'acceptEdits'],
        native: [],
      },
      promptTransport: 'stdin', outputDialect: 'claude-stream-json', workspaceBinding: 'cwd',
      permissionModes: ['read-only', 'workspace-write', 'native'], resumable: true,
    },
  },
  {
    id: 'claude-desktop', displayName: 'Claude Desktop', launchable: true, hookCapable: true,
    hookPointer: '.waggle/claude-desktop/hive-mind-install.json', detect: { kind: 'candidates' }, builtin: true,
    capabilities: { interactiveLaunch: true, headlessTask: false, structuredProgress: false, resumable: false, liveWaggleDance: false },
  },
  {
    id: 'cursor', displayName: 'Cursor', launchable: true, hookCapable: true,
    hookPointer: '.cursor/hive-mind-install.json', detect: { kind: 'candidates' }, builtin: true,
    capabilities: { interactiveLaunch: true, headlessTask: false, structuredProgress: false, resumable: false, liveWaggleDance: false },
  },
  {
    id: 'codex', displayName: 'Codex CLI', launchable: true, hookCapable: true,
    hookPointer: '.codex/hive-mind-install.json', detect: { kind: 'path', binaryName: 'codex' }, builtin: true,
    capabilities: { interactiveLaunch: true, headlessTask: true, structuredProgress: true, resumable: true, liveWaggleDance: false },
    task: {
      argvTemplate: ['{accessArgs}', 'exec', '--ignore-user-config', '--ignore-rules', '--skip-git-repo-check', '--json', '--color', 'never', '-C', '{workspacePath}', '-'],
      resumeArgvTemplate: ['{accessArgs}', 'exec', '--ignore-user-config', '--ignore-rules', '--skip-git-repo-check', '--color', 'never', '-C', '{workspacePath}', 'resume', '--json', '{sessionId}', '-'],
      accessArgs: {
        'read-only': ['--ask-for-approval', 'never', '--sandbox', 'read-only'],
        'workspace-write': ['--ask-for-approval', 'never', '--sandbox', 'workspace-write'],
        native: [],
      },
      promptTransport: 'stdin', outputDialect: 'codex-jsonl', workspaceBinding: 'flag',
      permissionModes: ['read-only', 'workspace-write', 'native'], resumable: true,
    },
  },
  {
    id: 'codex-desktop', displayName: 'Codex Desktop', launchable: true, hookCapable: true,
    hookPointer: '.codex/hive-mind-install.json', detect: { kind: 'candidates' }, builtin: true,
    capabilities: { interactiveLaunch: true, headlessTask: false, structuredProgress: false, resumable: false, liveWaggleDance: false },
  },
  {
    id: 'hermes', displayName: 'Hermes Agent CLI', launchable: true, hookCapable: true,
    hookRoot: 'hermes-home', hookPointer: 'hive-mind-install.json', detect: { kind: 'path', binaryName: 'hermes' }, builtin: true,
    capabilities: { interactiveLaunch: true, headlessTask: true, structuredProgress: false, resumable: true, liveWaggleDance: false },
    task: {
      argvTemplate: ['chat', '-q', '{prompt}', '-Q', '--source', 'tool', '--ignore-rules', '--max-turns', '12', '--checkpoints'],
      resumeArgvTemplate: ['chat', '--resume', '{sessionId}', '--no-restore-cwd', '-q', '{prompt}', '-Q', '--source', 'tool', '--ignore-rules', '--max-turns', '12', '--checkpoints'],
      accessArgs: { native: [] }, promptTransport: 'arg', outputDialect: 'hermes-text', workspaceBinding: 'cwd',
      permissionModes: ['native'], resumable: true,
    },
  },
  {
    id: 'hermes-desktop', displayName: 'Hermes Desktop', launchable: true, hookCapable: false,
    hookPointer: '', detect: { kind: 'candidates' }, builtin: true,
    capabilities: { interactiveLaunch: true, headlessTask: false, structuredProgress: false, resumable: false, liveWaggleDance: false },
  },
  {
    id: 'openclaw', displayName: 'OpenClaw', launchable: true, hookCapable: true,
    hookPointer: '.openclaw/hive-mind-install.json', detect: { kind: 'path', binaryName: 'openclaw' }, builtin: true,
    capabilities: { interactiveLaunch: true, headlessTask: true, structuredProgress: true, resumable: true, liveWaggleDance: false },
    task: {
      argvTemplate: ['agent', '--agent', '{agentId}', '--session-key', 'agent:{agentId}:waggle:{runId}', '--message-file', '{promptFile}', '--json', '--timeout', '{timeoutSeconds}'],
      resumeArgvTemplate: ['agent', '--agent', '{agentId}', '--session-key', 'agent:{agentId}:waggle:{sessionId}', '--message-file', '{promptFile}', '--json', '--timeout', '{timeoutSeconds}'],
      accessArgs: { native: [] }, promptTransport: 'temp-file', outputDialect: 'openclaw-json', workspaceBinding: 'managed-agent',
      permissionModes: ['native'], resumable: true,
    },
  },
] as const;

/**
 * Tools the launcher dock + hook installer support end-to-end.
 *
 * Phase 1 shipped with 3 entries (Claude Code, Cursor, Claude
 * Desktop — D3). Phase 4 extends to every built-in launch surface. Hook support
 * remains independently capability-gated because desktop-only surfaces need
 * not have a hook installer.
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
 *   - `hooksInstalled` : true iff the hook pointer and its referenced rollback
 *     state are healthy; tools with active-config verification must also still
 *     contain their marker-tagged hook entries.
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
  /** True when the tool manifest allows launching from the dock. */
  launchable?: boolean;
  /** True when the tool manifest declares hook support. */
  hookCapable?: boolean;
  /** True for built-in execution surfaces; false for loaded adapters. */
  builtin?: boolean;
  /** True when the manifest can accept the launch prompt inline. */
  acceptsInlinePrompt?: boolean;
  /** Canonical split between opening the app and running a captured task. */
  capabilities?: ToolCapabilities;
  /** Access modes supported by the manifest's captured-task contract. */
  permissionModes?: readonly ExternalToolAccess[];
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
  /** Per-tool detection result. Registry order: built-ins first, then adapters. */
  tools: DetectedTool[];
}
