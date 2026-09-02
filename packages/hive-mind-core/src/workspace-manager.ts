import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { WorkspaceType } from '@waggle/shared';
type AIActRiskLevel = 'minimal' | 'limited' | 'high-risk' | 'unacceptable';

export interface WorkspaceConfig {
  id: string;
  name: string;
  group: string;
  icon?: string;
  model?: string;
  personality?: string;
  /** Selected agent persona ID (from persona catalog) */
  personaId?: string;
  /** Template ID chosen during onboarding (e.g. 'sales-pipeline', 'research-project'). */
  templateId?: string;
  tools?: string[];
  skills?: string[];
  team?: string | null;
  /** Filesystem directory where agent operates and generates files. */
  directory?: string;
  /** Storage type for workspace files. */
  storageType?: 'virtual' | 'local' | 'team';
  /** Path to local file storage for this workspace. */
  storagePath?: string;
  /** Extra storage provider configuration (e.g. S3 bucket, credentials). */
  storageConfig?: Record<string, unknown>;
  created: string; // ISO 8601

  // --- Team Mode fields (Phase 5) ---
  /** Team ID on the team server. Present = team workspace. */
  teamId?: string;
  /** URL of the team server (e.g. "https://team.waggle.dev"). */
  teamServerUrl?: string;
  /** Current user's role in this team workspace. */
  teamRole?: 'owner' | 'admin' | 'member' | 'viewer';
  /** Current user's ID on the team server. */
  teamUserId?: string;

  // --- Budget ---
  /** Monthly cost budget in USD. null = unlimited. */
  budget?: number | null;

  // --- Tone/Voice (Wave 7.3) ---
  /** Workspace communication tone preset. */
  tone?: 'professional' | 'casual' | 'technical' | 'legal' | 'marketing';

  // --- Optimization fields (GEPA/Ax) ---
  /** Enable GEPA prompt optimization for this workspace (opt-in, default false). */
  optimizationEnabled?: boolean;
  /** Daily optimization budget in cents (default 100 = $1/day). Only used when optimizationEnabled is true. */
  optimizationBudget?: number;

  // --- AI Act compliance (L-17 C2) ---
  /** EU AI Act risk classification for this workspace. */
  riskLevel?: AIActRiskLevel;
  /** ISO timestamp of the last risk classification change. Auto-stamped by WorkspaceManager. */
  riskClassifiedAt?: string;

  // --- UX-Refactor V2 fields (PRD §15.3; additive + optional for back-compat) ---
  /** Free-text description shown in the workspace header/cards. */
  description?: string;
  /** Workspace classification. Defaults derivable from templateId/group when absent. */
  type?: WorkspaceType;
  /** Lifecycle status. Treated as 'active' when absent. */
  status?: 'active' | 'paused' | 'archived';
  /** Agents bound to this workspace (ids). */
  agentIds?: string[];
  /** Connectors scoped to this workspace (ids). */
  connectorIds?: string[];
  /** MCP servers scoped to this workspace (ids). */
  mcpIds?: string[];
  /** ISO timestamp of the last config update. Auto-stamped by update(). */
  updatedAt?: string;
  /** ISO timestamp of the last activity (chat/agent run) in this workspace. */
  lastActiveAt?: string;
}

export interface CreateWorkspaceOptions {
  name: string;
  group: string;
  icon?: string;
  model?: string;
  personality?: string;
  /** Selected agent persona ID (from persona catalog) */
  personaId?: string;
  /** Template ID chosen during onboarding (e.g. 'sales-pipeline', 'research-project'). */
  templateId?: string;
  tools?: string[];
  skills?: string[];
  team?: string | null;
  /** Filesystem directory where agent operates and generates files. */
  directory?: string;

  // --- Team Mode fields (Phase 5) ---
  teamId?: string;
  teamServerUrl?: string;
  teamRole?: 'owner' | 'admin' | 'member' | 'viewer';
  teamUserId?: string;

  // --- Tone/Voice (Wave 7.3) ---
  tone?: 'professional' | 'casual' | 'technical' | 'legal' | 'marketing';

  // --- Budget ---
  budget?: number | null;

  // --- AI Act compliance (L-17 C2) ---
  /** Initial risk level (usually derived from template). */
  riskLevel?: AIActRiskLevel;

  // --- Optimization fields (GEPA/Ax) ---
  optimizationEnabled?: boolean;
  optimizationBudget?: number;

  // --- UX-Refactor V2 fields (PRD §15.3) ---
  /** Free-text description shown in the workspace header/cards. */
  description?: string;
  /** Workspace classification (defaults derivable from templateId/group). */
  type?: WorkspaceType;
}

interface WorkspacesMeta {
  defaultWorkspace?: string | null;
}

const WORKSPACE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/;
const DELETION_TOMBSTONE_PREFIX = '.waggle-deleting-';
const DELETION_TOMBSTONE = /^\.waggle-deleting-[A-Za-z0-9][A-Za-z0-9_-]{0,199}-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function isContained(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

/**
 * WorkspaceManager manages workspace CRUD, groups, and directory structure.
 * Each workspace lives under {baseDir}/workspaces/{id}/ with:
 *   - workspace.json (config)
 *   - workspace.mind (SQLite .mind file, created empty)
 *   - sessions/ (JSONL session logs)
 */
export class WorkspaceManager {
  private readonly workspacesDir: string;
  private readonly canonicalWorkspacesDir: string;
  private readonly metaPath: string;

  constructor(private readonly baseDir: string) {
    this.workspacesDir = path.join(baseDir, 'workspaces');
    this.metaPath = path.join(baseDir, 'workspaces-meta.json');

    if (!fs.existsSync(this.workspacesDir)) {
      fs.mkdirSync(this.workspacesDir, { recursive: true });
    }
    const rootStat = fs.lstatSync(this.workspacesDir);
    const canonicalBase = fs.realpathSync.native(baseDir);
    const canonicalRoot = fs.realpathSync.native(this.workspacesDir);
    if (
      rootStat.isSymbolicLink()
      || !rootStat.isDirectory()
      || canonicalRoot === canonicalBase
      || !isContained(canonicalBase, canonicalRoot)
    ) {
      throw new Error('Workspace root must be a regular directory inside the data directory');
    }
    this.canonicalWorkspacesDir = canonicalRoot;
    this.cleanupDeletionTombstones();
  }

  /**
   * Create a new workspace with directory structure and config.
   */
  create(options: CreateWorkspaceOptions): WorkspaceConfig {
    return this.createWithId(this.generateId(options.name), options);
  }

  /**
   * Ensure a workspace with the given id exists. Idempotent — returns the
   * existing config unchanged if the workspace already exists; otherwise
   * creates it with the supplied id (bypassing slug-collision handling in
   * generateId, since callers construct ids from trusted internal state
   * like CWD-derived prefixes — e.g. SessionStart hooks).
   *
   * Use this from auto-attach paths (e.g. save_memory with a workspace arg
   * that names a workspace not yet created on disk). Direct-create flows
   * with user-supplied names should still go through `create()` so the
   * generateId collision logic runs.
   */
  // Reverse-ported from OSS hive-mind (oss-drift triage R4, 2026-06-11).
  ensure(id: string, options: Partial<CreateWorkspaceOptions> = {}): WorkspaceConfig {
    this.assertWorkspaceId(id);
    const existing = this.get(id);
    if (existing) return existing;
    const workspacePath = path.join(this.resolveWorkspaceRoot(), id);
    const workspaceStat = fs.lstatSync(workspacePath, { throwIfNoEntry: false });
    if (workspaceStat) {
      if (id !== 'default' || !this.isEmptyLegacyWorkspaceDirectory(workspacePath, workspaceStat)) {
        throw new Error(`Workspace path already exists but is not a valid workspace: ${id}`);
      }
      const sessionsPath = path.join(workspacePath, 'sessions');
      if (fs.lstatSync(sessionsPath, { throwIfNoEntry: false })) fs.rmdirSync(sessionsPath);
      fs.rmdirSync(workspacePath);
    }

    return this.createWithId(id, {
      ...options,
      name: options.name ?? id,
      group: options.group ?? 'auto',
    });
  }

  /**
   * Shared create path: write directory structure + config for an exact id.
   */
  private createWithId(id: string, options: CreateWorkspaceOptions): WorkspaceConfig {
    this.assertWorkspaceId(id);
    const canonicalRoot = this.resolveWorkspaceRoot();
    const wsDir = path.join(canonicalRoot, id);

    fs.mkdirSync(wsDir);
    const canonicalWorkspace = fs.realpathSync.native(wsDir);
    if (!isContained(canonicalRoot, canonicalWorkspace)) {
      throw new Error(`Workspace path escapes workspace root: ${id}`);
    }
    fs.mkdirSync(path.join(canonicalWorkspace, 'sessions'));

    // Touch workspace.mind — MindDB will init schema when first opened
    fs.writeFileSync(path.join(canonicalWorkspace, 'workspace.mind'), '', { flag: 'wx' });

    const config: WorkspaceConfig = {
      id,
      name: options.name,
      group: options.group,
      ...(options.icon !== undefined && { icon: options.icon }),
      ...(options.model !== undefined && { model: options.model }),
      ...(options.personality !== undefined && { personality: options.personality }),
      ...(options.personaId !== undefined && { personaId: options.personaId }),
      ...(options.templateId !== undefined && { templateId: options.templateId }),
      ...(options.tools !== undefined && { tools: options.tools }),
      ...(options.skills !== undefined && { skills: options.skills }),
      ...(options.team !== undefined && { team: options.team }),
      ...(options.directory !== undefined && { directory: options.directory }),
      ...(options.teamId !== undefined && { teamId: options.teamId }),
      ...(options.teamServerUrl !== undefined && { teamServerUrl: options.teamServerUrl }),
      ...(options.teamRole !== undefined && { teamRole: options.teamRole }),
      ...(options.teamUserId !== undefined && { teamUserId: options.teamUserId }),
      ...(options.tone !== undefined && { tone: options.tone }),
      ...(options.optimizationEnabled !== undefined && { optimizationEnabled: options.optimizationEnabled }),
      ...(options.optimizationBudget !== undefined && { optimizationBudget: options.optimizationBudget }),
      ...(options.riskLevel !== undefined && {
        riskLevel: options.riskLevel,
        riskClassifiedAt: new Date().toISOString(),
      }),
      created: new Date().toISOString(),
    };

    fs.writeFileSync(
      path.join(canonicalWorkspace, 'workspace.json'),
      JSON.stringify(config, null, 2),
      { encoding: 'utf-8', flag: 'wx' }
    );

    return config;
  }

  /**
   * List all workspaces by reading workspace.json from each subdirectory.
   */
  list(): WorkspaceConfig[] {
    const root = this.resolveWorkspaceRoot();
    const entries = fs.readdirSync(root, { withFileTypes: true });
    const configs: WorkspaceConfig[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || !WORKSPACE_ID.test(entry.name)) continue;
      const config = this.get(entry.name);
      if (config) configs.push(config);
    }

    return configs;
  }

  /**
   * List workspaces filtered by group name.
   */
  listByGroup(group: string): WorkspaceConfig[] {
    return this.list().filter(ws => ws.group === group);
  }

  /**
   * List all unique group names.
   */
  listGroups(): string[] {
    const groups = new Set(this.list().map(ws => ws.group));
    return [...groups];
  }

  /**
   * Get a workspace by ID. Returns null if not found.
   */
  get(id: string): WorkspaceConfig | null {
    if (!WORKSPACE_ID.test(id)) return null;

    try {
      const workspaceDir = this.resolveWorkspaceDir(id);
      if (!workspaceDir) return null;
      const configPath = path.join(workspaceDir, 'workspace.json');
      const configStat = fs.lstatSync(configPath, { throwIfNoEntry: false });
      if (!configStat?.isFile() || configStat.isSymbolicLink() || configStat.nlink !== 1) return null;
      const canonicalConfig = fs.realpathSync.native(configPath);
      if (!isContained(workspaceDir, canonicalConfig)) return null;

      const config = JSON.parse(fs.readFileSync(canonicalConfig, 'utf-8')) as WorkspaceConfig;
      return config.id === id ? config : null;
    } catch {
      return null;
    }
  }

  /**
   * Partially update a workspace config.
   * When `riskLevel` changes, `riskClassifiedAt` is auto-stamped with the
   * current ISO timestamp (EU AI Act Art. 14 provenance requirement).
   */
  update(id: string, updates: Partial<Omit<WorkspaceConfig, 'id' | 'created'>>): void {
    const existing = this.get(id);
    if (!existing) throw new Error(`Workspace not found: ${id}`);

    const now = new Date().toISOString();
    const stamped: Partial<WorkspaceConfig> =
      'riskLevel' in updates && updates.riskLevel !== existing.riskLevel
        ? { ...updates, riskClassifiedAt: now, updatedAt: now }
        : { ...updates, updatedAt: now };

    const updated = { ...existing, ...stamped };
    const configPath = path.join(this.workspacesDir, id, 'workspace.json');
    fs.writeFileSync(configPath, JSON.stringify(updated, null, 2), 'utf-8');
  }

  /**
   * Delete a workspace by removing its entire directory.
   */
  delete(id: string): void {
    this.assertWorkspaceId(id);
    if (!this.get(id)) return;
    const workspaceDir = this.resolveWorkspaceDir(id);
    if (!workspaceDir) return;
    const tombstone = path.join(
      this.resolveWorkspaceRoot(),
      `${DELETION_TOMBSTONE_PREFIX}${id}-${randomUUID()}`,
    );

    // The same-volume rename is the commit boundary. If it fails, the active
    // workspace is untouched and the caller can roll runtime state back. Once
    // it succeeds, recursive cleanup is best-effort: a Windows AV/indexer lock
    // may leave a hidden tombstone, but can never half-delete an active workspace.
    fs.renameSync(workspaceDir, tombstone);
    try {
      fs.rmSync(tombstone, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Retried at next WorkspaceManager startup.
    }
  }

  private cleanupDeletionTombstones(): void {
    for (const entry of fs.readdirSync(this.canonicalWorkspacesDir, { withFileTypes: true })) {
      if (!DELETION_TOMBSTONE.test(entry.name)) continue;
      try {
        const tombstonePath = path.join(this.canonicalWorkspacesDir, entry.name);
        const tombstoneStat = fs.lstatSync(tombstonePath, { throwIfNoEntry: false });
        if (!tombstoneStat?.isDirectory() || tombstoneStat.isSymbolicLink()) continue;
        const canonicalTombstone = fs.realpathSync.native(tombstonePath);
        if (!isContained(this.canonicalWorkspacesDir, canonicalTombstone)) continue;
        fs.rmSync(canonicalTombstone, {
          recursive: true,
          force: true,
          maxRetries: 3,
          retryDelay: 100,
        });
      } catch {
        // A still-locked tombstone remains hidden and will be retried later.
      }
    }
  }

  /**
   * Check whether a workspace is team-connected (has a teamId).
   */
  isTeamWorkspace(id: string): boolean {
    const ws = this.get(id);
    return ws !== null && typeof ws.teamId === 'string' && ws.teamId.length > 0;
  }

  /**
   * List only team-connected workspaces.
   */
  listTeamWorkspaces(): WorkspaceConfig[] {
    return this.list().filter(ws => typeof ws.teamId === 'string' && ws.teamId.length > 0);
  }

  /**
   * Get the path to a workspace's .mind file.
   */
  getMindPath(id: string): string {
    this.assertWorkspaceId(id);
    const lexicalMindPath = path.join(this.workspacesDir, id, 'workspace.mind');
    const workspaceDir = this.resolveWorkspaceDir(id);
    if (!workspaceDir) throw new Error(`Workspace not found: ${id}`);

    const configPath = path.join(workspaceDir, 'workspace.json');
    const configStat = fs.lstatSync(configPath, { throwIfNoEntry: false });
    if (!configStat?.isFile() || configStat.isSymbolicLink() || configStat.nlink !== 1) {
      throw new Error(`Workspace config not found: ${id}`);
    }
    const canonicalConfig = fs.realpathSync.native(configPath);
    if (!isContained(workspaceDir, canonicalConfig)) {
      throw new Error(`Workspace config escapes workspace directory: ${id}`);
    }
    const config = JSON.parse(fs.readFileSync(canonicalConfig, 'utf-8')) as WorkspaceConfig;
    if (config.id !== id) throw new Error(`Workspace config id mismatch: ${id}`);

    const mindPath = path.join(workspaceDir, 'workspace.mind');
    const mindStat = fs.lstatSync(mindPath, { throwIfNoEntry: false });
    if (!mindStat) return lexicalMindPath;
    if (!mindStat?.isFile() || mindStat.isSymbolicLink() || mindStat.nlink !== 1) {
      throw new Error(`Workspace mind is not a regular file: ${id}`);
    }
    const canonicalMind = fs.realpathSync.native(mindPath);
    if (!isContained(workspaceDir, canonicalMind)) {
      throw new Error(`Workspace mind escapes workspace directory: ${id}`);
    }
    return lexicalMindPath;
  }

  private assertWorkspaceId(id: string): void {
    if (!WORKSPACE_ID.test(id)) throw new Error(`Invalid workspace id: ${id}`);
  }

  private isEmptyLegacyWorkspaceDirectory(workspacePath: string, stat: fs.Stats): boolean {
    if (stat.isSymbolicLink() || !stat.isDirectory()) return false;
    const canonicalRoot = this.resolveWorkspaceRoot();
    const canonicalWorkspace = fs.realpathSync.native(workspacePath);
    if (!isContained(canonicalRoot, canonicalWorkspace)) return false;
    const entries = fs.readdirSync(workspacePath, { withFileTypes: true });
    if (entries.length === 0) return true;
    if (entries.length !== 1 || entries[0]?.name !== 'sessions' || !entries[0].isDirectory()) return false;
    const sessionsPath = path.join(workspacePath, 'sessions');
    const sessionsStat = fs.lstatSync(sessionsPath);
    if (sessionsStat.isSymbolicLink()) return false;
    const canonicalSessions = fs.realpathSync.native(sessionsPath);
    return isContained(canonicalWorkspace, canonicalSessions) && fs.readdirSync(sessionsPath).length === 0;
  }

  private resolveWorkspaceDir(id: string): string | null {
    this.assertWorkspaceId(id);
    const lexicalRoot = this.resolveWorkspaceRoot();
    const lexicalWorkspace = path.resolve(lexicalRoot, id);
    if (!isContained(lexicalRoot, lexicalWorkspace)) {
      throw new Error(`Workspace path escapes workspace root: ${id}`);
    }
    const workspaceStat = fs.lstatSync(lexicalWorkspace, { throwIfNoEntry: false });
    if (!workspaceStat) return null;
    if (workspaceStat.isSymbolicLink() || !workspaceStat.isDirectory()) {
      throw new Error(`Workspace path is not a regular directory: ${id}`);
    }

    const canonicalWorkspace = fs.realpathSync.native(lexicalWorkspace);
    if (!isContained(this.canonicalWorkspacesDir, canonicalWorkspace)) {
      throw new Error(`Workspace path escapes workspace root: ${id}`);
    }
    return canonicalWorkspace;
  }

  private resolveWorkspaceRoot(): string {
    const rootStat = fs.lstatSync(this.workspacesDir, { throwIfNoEntry: false });
    if (!rootStat?.isDirectory() || rootStat.isSymbolicLink()) {
      throw new Error('Workspace root is not a regular directory');
    }
    const canonicalRoot = fs.realpathSync.native(this.workspacesDir);
    if (canonicalRoot !== this.canonicalWorkspacesDir) {
      throw new Error('Workspace root changed after initialization');
    }
    return canonicalRoot;
  }

  /**
   * Set the default workspace ID in workspaces-meta.json.
   */
  setDefault(id: string): void {
    if (!this.get(id)) throw new Error(`Workspace not found: ${id}`);
    const meta = this.loadMeta();
    meta.defaultWorkspace = id;
    this.saveMeta(meta);
  }

  /**
   * Get the default workspace ID. Returns null if none set.
   */
  getDefault(): string | null {
    const meta = this.loadMeta();
    return meta.defaultWorkspace ?? null;
  }

  /**
   * Ensure at least one workspace exists. If none, create a default one
   * and mark it as the default. Idempotent — safe to call on every startup.
   */
  ensureDefault(options?: Partial<CreateWorkspaceOptions>): WorkspaceConfig {
    const existing = this.list();
    if (existing.length > 0) {
      const defaultId = this.getDefault();
      const found = defaultId ? this.get(defaultId) : null;
      return found ?? existing[0];
    }

    const ws = this.create({
      name: 'Default Workspace',
      group: 'Personal',
      personaId: 'researcher',
      ...options,
    });
    this.setDefault(ws.id);
    return ws;
  }

  /**
   * Generate a slug-based ID from a workspace name.
   * Handles duplicates by appending -2, -3, etc.
   */
  generateId(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (!this.workspaceExists(base)) return base;

    let counter = 2;
    while (this.workspaceExists(`${base}-${counter}`)) {
      counter++;
    }
    return `${base}-${counter}`;
  }

  private workspaceExists(id: string): boolean {
    return fs.existsSync(path.join(this.resolveWorkspaceRoot(), id));
  }

  private loadMeta(): WorkspacesMeta {
    if (fs.existsSync(this.metaPath)) {
      const raw = fs.readFileSync(this.metaPath, 'utf-8');
      return JSON.parse(raw) as WorkspacesMeta;
    }
    return {};
  }

  private saveMeta(meta: WorkspacesMeta): void {
    fs.writeFileSync(this.metaPath, JSON.stringify(meta, null, 2), 'utf-8');
  }
}
