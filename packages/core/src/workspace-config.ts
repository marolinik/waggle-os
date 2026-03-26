import fs from 'node:fs';
import path from 'node:path';

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

  // --- Optimization fields (GEPA/Ax) ---
  optimizationEnabled?: boolean;
  optimizationBudget?: number;
}

interface WorkspacesMeta {
  defaultWorkspace?: string | null;
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
  private readonly metaPath: string;

  constructor(private readonly baseDir: string) {
    this.workspacesDir = path.join(baseDir, 'workspaces');
    this.metaPath = path.join(baseDir, 'workspaces-meta.json');

    if (!fs.existsSync(this.workspacesDir)) {
      fs.mkdirSync(this.workspacesDir, { recursive: true });
    }
  }

  /**
   * Create a new workspace with directory structure and config.
   */
  create(options: CreateWorkspaceOptions): WorkspaceConfig {
    const id = this.generateId(options.name);
    const wsDir = path.join(this.workspacesDir, id);

    fs.mkdirSync(wsDir, { recursive: true });
    fs.mkdirSync(path.join(wsDir, 'sessions'), { recursive: true });

    // Touch workspace.mind — MindDB will init schema when first opened
    fs.writeFileSync(path.join(wsDir, 'workspace.mind'), '');

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
      created: new Date().toISOString(),
    };

    fs.writeFileSync(
      path.join(wsDir, 'workspace.json'),
      JSON.stringify(config, null, 2),
      'utf-8'
    );

    return config;
  }

  /**
   * List all workspaces by reading workspace.json from each subdirectory.
   */
  list(): WorkspaceConfig[] {
    if (!fs.existsSync(this.workspacesDir)) return [];

    const entries = fs.readdirSync(this.workspacesDir, { withFileTypes: true });
    const configs: WorkspaceConfig[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const configPath = path.join(this.workspacesDir, entry.name, 'workspace.json');
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf-8');
        configs.push(JSON.parse(raw) as WorkspaceConfig);
      }
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
    const configPath = path.join(this.workspacesDir, id, 'workspace.json');
    if (!fs.existsSync(configPath)) return null;

    const raw = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(raw) as WorkspaceConfig;
  }

  /**
   * Partially update a workspace config.
   */
  update(id: string, updates: Partial<Omit<WorkspaceConfig, 'id' | 'created'>>): void {
    const existing = this.get(id);
    if (!existing) throw new Error(`Workspace not found: ${id}`);

    const updated = { ...existing, ...updates };
    const configPath = path.join(this.workspacesDir, id, 'workspace.json');
    fs.writeFileSync(configPath, JSON.stringify(updated, null, 2), 'utf-8');
  }

  /**
   * Delete a workspace by removing its entire directory.
   */
  delete(id: string): void {
    const wsDir = path.join(this.workspacesDir, id);
    if (fs.existsSync(wsDir)) {
      fs.rmSync(wsDir, { recursive: true, force: true });
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
    return path.join(this.workspacesDir, id, 'workspace.mind');
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
    return fs.existsSync(path.join(this.workspacesDir, id));
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
