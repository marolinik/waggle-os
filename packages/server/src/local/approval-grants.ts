/**
 * ApprovalGrantStore — Phase B.3 persistent "always allow" grants.
 *
 * When a user approves a gated tool and picks "Always allow", the decision
 * is written to a JSON file alongside the user's personal mind so subsequent
 * sessions skip the approval prompt for the same (tool, target) combination.
 *
 * Grant keys are small, deterministic fingerprints derived from the tool
 * arguments — different tools compute different keys (see `keyForTool`).
 * Never persist the full argument blob — it might contain file contents
 * or PII. Only the minimum identity needed to match future requests.
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export interface ApprovalGrant {
  id: string;
  toolName: string;
  /** Small fingerprint for matching future requests. See keyForTool below. */
  targetKey: string;
  /** The workspace the grant was approved FROM (source context), if any. */
  sourceWorkspaceId: string | null;
  /** Human-readable summary shown in the Approvals app. */
  description: string;
  grantedAt: string;
  /** Optional expiry ISO timestamp. null = permanent until revoked. */
  expiresAt: string | null;
}

interface StoredFile {
  version: number;
  grants: ApprovalGrant[];
}

/**
 * Compute the target key fingerprint for a tool call.
 *
 * For write/edit tools we key on the file path (so "always allow write to
 * src/foo.ts" stays scoped). For cross-workspace reads we key on the target
 * workspace ID. For git/install tools we use '*' (any invocation of that
 * tool matches). Unknown tools default to '*'.
 */
export function keyForTool(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case 'write_file':
    case 'edit_file': {
      const p = String(args.path ?? args.file_path ?? '').trim();
      return p || '*';
    }
    case 'read_other_workspace':
    case 'list_workspace_files': {
      const target = String(args.target_workspace_id ?? '').trim();
      return target || '*';
    }
    case 'generate_docx':
    case 'git_commit':
    case 'git_push':
    case 'git_pr':
    case 'git_merge':
    case 'install_capability':
      return '*';
    default:
      return '*';
  }
}

/**
 * Build a compact human-readable summary for a grant entry.
 * Shown in the Approvals app list so users know what they granted.
 */
export function describeGrant(toolName: string, targetKey: string, sourceWorkspaceId: string | null): string {
  if (toolName === 'read_other_workspace') {
    const from = sourceWorkspaceId ? ` from "${sourceWorkspaceId}"` : '';
    return `Read workspace "${targetKey}"${from}`;
  }
  if (toolName === 'list_workspace_files') {
    return `List files in workspace "${targetKey}"`;
  }
  if (toolName === 'write_file' || toolName === 'edit_file') {
    return targetKey === '*' ? `Write any file` : `Write to ${targetKey}`;
  }
  if (toolName === 'generate_docx') return 'Generate .docx documents';
  if (toolName === 'install_capability') return 'Install capabilities (skills, plugins)';
  if (toolName.startsWith('git_')) return `Run ${toolName}`;
  return `Execute ${toolName} on ${targetKey}`;
}

export class ApprovalGrantStore {
  private grants: ApprovalGrant[] = [];
  private filePath: string;

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, 'approval-grants.json');
    this.load();
  }

  private load(): void {
    if (!fs.existsSync(this.filePath)) return;
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as StoredFile;
      if (parsed.version === 1 && Array.isArray(parsed.grants)) {
        this.grants = parsed.grants.filter(g => this.isValidGrant(g));
      }
    } catch {
      // Corrupted file — start fresh. Do NOT delete, user may want to recover.
      this.grants = [];
    }
  }

  private save(): void {
    try {
      const payload: StoredFile = { version: 1, grants: this.grants };
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(payload, null, 2), 'utf-8');
    } catch {
      // Non-fatal — session grants still work in memory
    }
  }

  private isValidGrant(g: unknown): g is ApprovalGrant {
    if (!g || typeof g !== 'object') return false;
    const gg = g as Record<string, unknown>;
    return typeof gg.id === 'string'
      && typeof gg.toolName === 'string'
      && typeof gg.targetKey === 'string'
      && typeof gg.description === 'string'
      && typeof gg.grantedAt === 'string';
  }

  /**
   * Check if a grant exists that covers the given (tool, args, source).
   * Expired grants are treated as absent and pruned from memory.
   */
  has(toolName: string, args: Record<string, unknown>, sourceWorkspaceId: string | null): boolean {
    const now = Date.now();
    const key = keyForTool(toolName, args);
    let found = false;
    let changed = false;

    this.grants = this.grants.filter(g => {
      if (g.expiresAt && Date.parse(g.expiresAt) < now) {
        changed = true;
        return false; // expired — drop
      }
      const matches = g.toolName === toolName
        && g.targetKey === key
        && (g.sourceWorkspaceId ?? null) === (sourceWorkspaceId ?? null);
      if (matches) found = true;
      return true;
    });

    if (changed) this.save();
    return found;
  }

  /** Add a permanent grant. Returns the created entry. */
  grant(
    toolName: string,
    args: Record<string, unknown>,
    sourceWorkspaceId: string | null,
    opts: { ttlMs?: number } = {},
  ): ApprovalGrant {
    const targetKey = keyForTool(toolName, args);
    const description = describeGrant(toolName, targetKey, sourceWorkspaceId);
    const grantedAt = new Date().toISOString();
    const expiresAt = opts.ttlMs ? new Date(Date.now() + opts.ttlMs).toISOString() : null;

    const entry: ApprovalGrant = {
      id: randomUUID(),
      toolName,
      targetKey,
      sourceWorkspaceId,
      description,
      grantedAt,
      expiresAt,
    };

    // Replace any existing equivalent grant rather than duplicating
    this.grants = this.grants.filter(g =>
      !(g.toolName === toolName
        && g.targetKey === targetKey
        && (g.sourceWorkspaceId ?? null) === (sourceWorkspaceId ?? null))
    );
    this.grants.push(entry);
    this.save();
    return entry;
  }

  /** Revoke a grant by ID. Returns true if something was removed. */
  revoke(id: string): boolean {
    const before = this.grants.length;
    this.grants = this.grants.filter(g => g.id !== id);
    const removed = this.grants.length !== before;
    if (removed) this.save();
    return removed;
  }

  /** List all grants, sorted newest first. */
  list(): ApprovalGrant[] {
    return [...this.grants].sort((a, b) => b.grantedAt.localeCompare(a.grantedAt));
  }

  /** Remove every grant. Used by tests and by a future "reset permissions" button. */
  clear(): void {
    this.grants = [];
    this.save();
  }
}
