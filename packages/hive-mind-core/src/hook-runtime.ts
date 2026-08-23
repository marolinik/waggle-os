/**
 * Minimal synchronous persistence path for short-lived IDE hooks.
 *
 * Deliberately imports only the SQLite-backed mind primitives. Hook latency
 * must not depend on loading the full core barrel, probing an embedding
 * provider, or starting an MCP server. FTS is committed synchronously;
 * vector enrichment remains repairable through reconcileVecIndex().
 */

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { evaluateExternalMemoryIngress } from './memory-ingress-guard.js';
import { MindDB } from './mind/db.js';
import {
  FrameStore,
  type FrameSource,
  type Importance,
  type MemoryFrame,
} from './mind/frames.js';
import { SessionStore } from './mind/sessions.js';

export interface SaveHookFrameOptions {
  dataDir?: string;
  workspace?: string;
  content: string;
  importance: Exclude<Importance, 'deprecated'>;
  source: Exclude<FrameSource, 'import'>;
}

export interface SaveHookFrameResult {
  id: string;
  success: true;
  workspace: string;
}

export interface RecallHookFramesOptions {
  dataDir?: string;
  workspace?: string;
  limit?: number;
}

export interface HookMemoryHit {
  id: number;
  content: string;
  importance: string;
  source: string;
  score: number;
  created_at: string;
  from: string;
}

const WORKSPACE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/;
const IMPORTANCE_SCORE: Record<Exclude<Importance, 'deprecated'>, number> = {
  critical: 1,
  important: 0.85,
  normal: 0.65,
  temporary: 0.45,
};
const ALLOWED_IMPORTANCE = new Set(Object.keys(IMPORTANCE_SCORE));
const ALLOWED_SOURCE = new Set(['user_stated', 'tool_verified', 'agent_inferred', 'system']);

function resolveDataDir(override?: string): string {
  if (override !== undefined && override.trim() === '') {
    throw new Error('Hook data directory must not be blank');
  }
  const envDir = process.env.HIVE_MIND_DATA_DIR;
  const configured = override
    ?? (envDir?.trim() ? envDir : join(homedir(), '.hive-mind'));
  const expanded = configured.startsWith('~')
    ? join(homedir(), configured.slice(1))
    : configured;
  return resolve(expanded);
}

function normalizedPath(value: string): string {
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

function isContained(root: string, candidate: string): boolean {
  const normalizedRoot = normalizedPath(root);
  const normalizedCandidate = normalizedPath(candidate);
  return normalizedCandidate === normalizedRoot
    || normalizedCandidate.startsWith(`${normalizedRoot}${sep}`);
}

function rejectLink(path: string, label: string): void {
  if (lstatSync(path).isSymbolicLink()) throw new Error(`${label} must not be a link`);
}

function requireRegularFile(path: string, label: string): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) throw new Error(`${label} must not be a link`);
  if (!stat.isFile()) throw new Error(`${label} must be a regular file`);
}

function hasRegularFileEntry(path: string, label: string): boolean {
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (stat === undefined) return false;
  if (stat.isSymbolicLink()) throw new Error(`${label} must not be a link`);
  if (!stat.isFile()) throw new Error(`${label} must be a regular file`);
  return true;
}

function resolveMind(options: { dataDir?: string; workspace?: string }): {
  path: string;
  workspace: string;
} {
  const dataDir = resolveDataDir(options.dataDir);
  if (options.workspace === undefined) {
    mkdirSync(dataDir, { recursive: true });
    const canonicalDataDir = realpathSync(dataDir);
    const personalMind = join(canonicalDataDir, 'personal.mind');
    if (hasRegularFileEntry(personalMind, 'Personal mind')) {
      const canonicalMind = realpathSync(personalMind);
      if (!isContained(canonicalDataDir, canonicalMind)) {
        throw new Error('Personal mind escapes data directory');
      }
      return { path: canonicalMind, workspace: 'personal' };
    }
    return { path: personalMind, workspace: 'personal' };
  }

  const id = options.workspace;
  if (!WORKSPACE_ID.test(id)) throw new Error(`Invalid workspace id: ${id}`);
  const workspacesRoot = resolve(dataDir, 'workspaces');
  const workspaceDir = resolve(workspacesRoot, id);
  if (!workspaceDir.startsWith(`${workspacesRoot}${sep}`)) {
    throw new Error(`Workspace path escapes data directory: ${id}`);
  }
  if (!existsSync(workspacesRoot) || !lstatSync(workspacesRoot).isDirectory()) {
    throw new Error(`Workspace not found: ${id}`);
  }
  rejectLink(workspacesRoot, 'Workspaces directory');
  if (!existsSync(workspaceDir) || !lstatSync(workspaceDir).isDirectory()) {
    throw new Error(`Workspace not found: ${id}`);
  }
  rejectLink(workspaceDir, 'Workspace directory');
  const canonicalDataDir = realpathSync(dataDir);
  const canonicalRoot = realpathSync(workspacesRoot);
  const canonicalWorkspace = realpathSync(workspaceDir);
  if (!isContained(canonicalDataDir, canonicalRoot)
      || !isContained(canonicalRoot, canonicalWorkspace)) {
    throw new Error(`Workspace path escapes data directory: ${id}`);
  }
  const configPath = join(canonicalWorkspace, 'workspace.json');
  if (!existsSync(configPath)) {
    throw new Error(`Workspace not found: ${id}`);
  }
  requireRegularFile(configPath, 'Workspace config');
  const canonicalConfig = realpathSync(configPath);
  if (!isContained(canonicalWorkspace, canonicalConfig)) {
    throw new Error(`Workspace config escapes data directory: ${id}`);
  }
  let configuredId: unknown;
  try {
    configuredId = (JSON.parse(readFileSync(canonicalConfig, 'utf8')) as { id?: unknown }).id;
  } catch {
    throw new Error(`Workspace config is invalid: ${id}`);
  }
  if (configuredId !== id) throw new Error(`Workspace config id mismatch: ${id}`);
  const mindPath = join(canonicalWorkspace, 'workspace.mind');
  if (hasRegularFileEntry(mindPath, 'Workspace mind')) {
    const canonicalMind = realpathSync(mindPath);
    if (!isContained(canonicalWorkspace, canonicalMind)) {
      throw new Error(`Workspace mind escapes data directory: ${id}`);
    }
    return { path: canonicalMind, workspace: id };
  }
  return { path: mindPath, workspace: id };
}

function assertSaveInput(options: SaveHookFrameOptions): void {
  if (typeof options.content !== 'string') throw new Error('Hook frame content must be a string');
  if (evaluateExternalMemoryIngress({ content: options.content }).action !== 'allow') {
    throw new Error('Hook frame content was rejected because it is unsafe.');
  }
  if (!ALLOWED_IMPORTANCE.has(options.importance)) {
    throw new Error(`Invalid hook frame importance: ${String(options.importance)}`);
  }
  if (!ALLOWED_SOURCE.has(options.source)) {
    throw new Error(`Invalid hook frame source: ${String(options.source)}`);
  }
}

export function saveHookFrame(options: SaveHookFrameOptions): SaveHookFrameResult {
  assertSaveInput(options);
  const target = resolveMind(options);
  const db = new MindDB(target.path);
  try {
    const raw = db.getDatabase();
    const save = raw.transaction(() => {
      const sessions = new SessionStore(db);
      const frames = new FrameStore(db);
      const today = new Date().toISOString().slice(0, 10);
      const session = sessions.ensure(`mcp:${today}`, undefined, `MCP session ${today}`);
      return frames.createIFrame(
        session.gop_id,
        options.content,
        options.importance,
        options.source,
      );
    });
    const frame = db.runWithBusyRetry(save);
    return { id: String(frame.id), success: true, workspace: target.workspace };
  } finally {
    db.close();
  }
}

export function recallHookFrames(options: RecallHookFramesOptions = {}): HookMemoryHit[] {
  const target = resolveMind(options);
  const requestedLimit = options.limit;
  const limit = typeof requestedLimit === 'number' && Number.isFinite(requestedLimit)
    ? Math.min(100, Math.max(1, Math.floor(requestedLimit)))
    : 20;
  const db = new MindDB(target.path);
  try {
    const rows = db.getDatabase().prepare(`
      SELECT * FROM memory_frames
      WHERE importance != 'deprecated'
      ORDER BY CASE importance
        WHEN 'critical' THEN 4
        WHEN 'important' THEN 3
        WHEN 'normal' THEN 2
        ELSE 1
      END DESC, id DESC
      LIMIT ?
    `).all(limit) as MemoryFrame[];
    return rows.map((frame, index) => ({
      id: frame.id,
      content: frame.content,
      importance: frame.importance,
      source: frame.source,
      score: Math.max(0, (IMPORTANCE_SCORE[frame.importance as Exclude<Importance, 'deprecated'>] ?? 0) - index / 1000),
      created_at: frame.created_at,
      from: target.workspace === 'personal' ? 'personal' : `workspace:${target.workspace}`,
    }));
  } finally {
    db.close();
  }
}
