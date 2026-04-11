/**
 * Smart confirmation gates — only block truly destructive operations.
 *
 * Philosophy: read-only and informational commands should flow freely.
 * Only commands that modify state need user approval.
 */

// Tools that ALWAYS need confirmation.
// Write tools modify state. Cross-workspace reads don't modify state but
// reach into another workspace's private memory, which is a privacy
// surface enterprise buyers care about — so they're gated too.
// Phase B.3 will add persistent "always allow" grants per pair.
const ALWAYS_CONFIRM = new Set([
  'write_file', 'edit_file', 'generate_docx',
  'git_commit', 'git_push', 'git_pr', 'git_merge',
  'install_capability',
  // Cross-workspace reads (Phase B.2)
  'read_other_workspace', 'list_workspace_files',
]);

// Connector action name patterns that indicate write operations
const CONNECTOR_WRITE_PATTERNS = /_(create|update|delete|send|post|transition|remove|add|set|put)_/;

// Bash command patterns that are safe (read-only / informational)
const SAFE_BASH_PATTERNS = [
  /^(date|whoami|hostname|pwd|echo|printenv|env|uname|id|uptime)\b/,
  /^(ls|dir|cat|head|tail|wc|find|which|where|type)\b/,
  /^(git\s+(status|log|diff|branch|remote|show|tag))\b/,
  /^(node|python|python3|npm|npx|pip)\s+--version/,
  /^(curl|wget)\s+.*--head/,
  /^(df|du|free|top|ps|netstat|lsof)\b/,
];

// Bash command patterns that are destructive (always confirm)
const DESTRUCTIVE_BASH_PATTERNS = [
  /\brm\s+-[rf]/,
  /\brmdir\b/,
  /\brd\b/,          // Windows alias for rmdir
  /\bdel\b/i,        // Windows delete (any form — always confirm)
  /\berase\b/i,      // Windows alias for del
  /\bformat\b/,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  />\s*\//,  // redirect overwriting root paths
  /\bkill\s+-9/,
  /\btaskkill\b/,
  /\bgit\s+(push|reset|rebase|cherry-pick|merge)\b/,
  /\bnpm\s+(publish|unpublish)\b/,
  /\bchmod\b/,
  /\bchown\b/,
  /\bsudo\b/,
  /\breg\s+delete\b/i,  // Windows registry delete
  /\bpowershell\b/i,    // PowerShell (can do anything)
  /\bpwsh\b/i,          // PowerShell Core
  // Exfiltration patterns
  /\bcurl\s+.*-d\b/,
  /\bcurl\s+.*--data\b/,
  /\bwget\s+.*--post\b/,
  /\bnc\s/,
  /\bncat\s/,
  /\bnetcat\s/,
];

// Chain operators that could be used to bypass safe pattern checks.
// If ANY of these appear in a command, we never auto-approve via safe patterns.
const CHAIN_OPERATORS = /&&|\|\||;|\|/;

/** Known high-risk connector actions (never trust LLM-provided metadata for this) */
const CONNECTOR_HIGH_RISK_ACTIONS = new Set([
  'send_email', 'send_template', // email is always high-risk
]);

export function needsConfirmation(toolName: string, args?: Record<string, unknown>): boolean {
  // Connector tools: determine risk from tool NAME only (never trust args metadata)
  // This prevents LLM injection of _connectorMeta to bypass approval gates
  if (toolName.startsWith('connector_')) {
    // Extract action name: connector_<id>_<action> → <action>
    const parts = toolName.split('_');
    const actionPart = parts.slice(2).join('_'); // everything after connector_<id>_
    if (CONNECTOR_HIGH_RISK_ACTIONS.has(actionPart)) return true;
    return CONNECTOR_WRITE_PATTERNS.test(toolName);
  }

  // Non-bash tools: simple set check
  if (toolName !== 'bash') {
    return ALWAYS_CONFIRM.has(toolName);
  }

  // Bash: analyze the command
  const command = String(args?.command ?? '').trim();
  if (!command) return true; // empty command — suspicious, confirm

  // If the command contains chain operators (&&, ||, ;, |), ALWAYS require
  // confirmation regardless of safe patterns. An attacker could prepend a
  // benign command (e.g. `echo hello`) to smuggle a dangerous payload past
  // the safe-pattern check.
  const hasChainOperator = CHAIN_OPERATORS.test(command);

  // Check if it matches a safe pattern (only if no chain operators)
  if (!hasChainOperator) {
    for (const pattern of SAFE_BASH_PATTERNS) {
      if (pattern.test(command)) return false;
    }
  }

  // Check if it matches a destructive pattern
  for (const pattern of DESTRUCTIVE_BASH_PATTERNS) {
    if (pattern.test(command)) return true;
  }

  // Default: confirm unknown bash commands (safe by default)
  return true;
}

/**
 * Get the approval class for a tool call based on trust metadata.
 * Returns 'standard' for non-install tools. For install_capability,
 * inspects the args for trust metadata to determine the class.
 */
export type ApprovalClass = 'standard' | 'elevated' | 'critical';

export function getApprovalClass(toolName: string, args?: Record<string, unknown>): ApprovalClass {
  // Connector tools: derive approval class from tool NAME, not args
  if (toolName.startsWith('connector_')) {
    const parts = toolName.split('_');
    const actionPart = parts.slice(2).join('_');
    if (CONNECTOR_HIGH_RISK_ACTIONS.has(actionPart)) return 'critical';
    if (CONNECTOR_WRITE_PATTERNS.test(toolName)) return 'elevated';
    return 'standard';
  }

  if (toolName !== 'install_capability') return 'standard';

  // If trust metadata is passed in args (from the proposal flow), use it
  const riskLevel = args?._riskLevel as string | undefined;
  if (riskLevel === 'high') return 'critical';
  if (riskLevel === 'medium') return 'elevated';
  return 'standard';
}

export interface ConfirmationGateConfig {
  interactive?: boolean;
  autoApprove?: string[];
  promptFn?: (toolName: string, args: Record<string, unknown>) => Promise<boolean>;
}

// ── Phase B.5: tiered autonomy ────────────────────────────────────────
//
// Power users hate getting prompted for every write. Three levels:
//   - normal  = current behavior, gate everything needsConfirmation flags
//   - trusted = auto-pass writes, edits, docx, read_other_workspace; still
//               gate git push/commit/pr/merge, install_capability,
//               cross-workspace writes, connector writes
//   - yolo    = auto-pass everything except a hardcoded critical blacklist
//
// The critical blacklist below stays gated even at YOLO — these are the
// "you meant to do this, right?" ops where a wrong keystroke is terminal.

export type AutonomyLevel = 'normal' | 'trusted' | 'yolo';

/** Tools Trusted auto-approves (in addition to anything Normal auto-approves). */
const TRUSTED_AUTOPASS = new Set<string>([
  'write_file',
  'edit_file',
  'generate_docx',
  'read_other_workspace',
]);

/**
 * Bash commands that NEVER auto-pass, even at YOLO. The autonomy toggle
 * is a UX lever, not a permission to delete the user's home directory.
 * Kept deliberately small — only truly terminal operations.
 */
const CRITICAL_NEVER_AUTOPASS: RegExp[] = [
  /\brm\s+-[rf]+\s*[\/~]\s*(?:$|\s)/,             // rm -rf / or rm -rf ~
  /\brm\s+-[rf]+\s+\$HOME/,                        // rm -rf $HOME
  /\brm\s+-[rf]+\s+\/\*/,                          // rm -rf /*
  /\bsudo\b/,                                      // any sudo
  /\bformat\s+[a-z]:\b/i,                          // Windows format C:
  /\bmkfs\b/,                                      // mkfs.*
  /\breg\s+delete\b/i,                             // Windows registry delete
  /\bdd\s+if=.*of=\/dev/,                          // dd if=* of=/dev/...
  /\bgit\s+push\s+.*--force.*\b(main|master|production)\b/i,
  /\b:(){\s*:\|:&\s*}\s*;:/,                       // fork bomb (defensive)
];

/**
 * Returns true if the tool call would be critical/never-autopass EVEN at YOLO.
 * Used by the autonomy gate to keep the safety net intact at the top level.
 */
export function isCriticalNeverAutopass(toolName: string, args?: Record<string, unknown>): boolean {
  if (toolName === 'bash') {
    const command = String(args?.command ?? '').trim();
    for (const pat of CRITICAL_NEVER_AUTOPASS) {
      if (pat.test(command)) return true;
    }
  }
  if (toolName === 'install_capability') {
    const risk = args?._riskLevel as string | undefined;
    if (risk === 'high') return true;
  }
  if (toolName === 'git_push') {
    // Force-push to main/master stays gated even at YOLO.
    const force = args?.force as boolean | string | undefined;
    const branch = String(args?.branch ?? '').toLowerCase();
    if (force && (branch === 'main' || branch === 'master' || branch === 'production')) {
      return true;
    }
  }
  return false;
}

/**
 * Autonomy-aware confirmation check. Wraps needsConfirmation with the
 * autonomy level override. Returns true if the tool still needs confirmation
 * at this autonomy level; false if it should pass silently.
 *
 * Invariants:
 *   - Normal reproduces current behavior exactly.
 *   - Trusted and YOLO ALWAYS respect isCriticalNeverAutopass.
 *   - A tool that wouldn't need confirmation at Normal never gates at any level.
 */
export function needsConfirmationWithAutonomy(
  toolName: string,
  args: Record<string, unknown> | undefined,
  level: AutonomyLevel = 'normal',
): boolean {
  const baseGates = needsConfirmation(toolName, args);
  if (!baseGates) return false; // never gated anyway

  if (level === 'normal') return true;

  // Critical blacklist overrides everything — never auto-pass at any level.
  if (isCriticalNeverAutopass(toolName, args ?? {})) return true;

  if (level === 'yolo') return false;

  // Trusted: pass the Trusted-specific set + bash (already filtered above),
  // gate everything else.
  if (level === 'trusted') {
    if (TRUSTED_AUTOPASS.has(toolName)) return false;
    if (toolName === 'bash') return false; // passed the blacklist check
    return true; // git push, install, connector writes, cross-workspace writes still gate
  }

  return true;
}

export class ConfirmationGate {
  private interactive: boolean;
  private autoApprove: Set<string>;
  private promptFn?: (toolName: string, args: Record<string, unknown>) => Promise<boolean>;

  constructor(config: ConfirmationGateConfig = {}) {
    this.interactive = config.interactive ?? true;
    this.autoApprove = new Set(config.autoApprove ?? []);
    this.promptFn = config.promptFn;
  }

  async confirm(toolName: string, args: Record<string, unknown>): Promise<boolean> {
    if (!this.interactive) return true;
    if (!needsConfirmation(toolName, args)) return true;
    if (this.autoApprove.has(toolName)) return true;
    if (this.promptFn) return this.promptFn(toolName, args);
    return true; // no promptFn = auto-approve
  }
}
