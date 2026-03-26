/**
 * WaggleService interface — the abstraction layer that allows UI components
 * to work with local (desktop) or cloud (web) backends interchangeably.
 */

// ── Stream Events ──────────────────────────────────────────────────────

export interface StreamEvent {
  type: 'token' | 'tool' | 'tool_result' | 'step' | 'done' | 'error' | 'approval_required' | 'file_created';
  content?: string;
  name?: string;
  input?: Record<string, unknown>;
  result?: unknown;
  usage?: { inputTokens: number; outputTokens: number };
  requestId?: string;
  toolName?: string;
  /** For file_created events: the file path and action */
  filePath?: string;
  fileAction?: 'write' | 'edit' | 'generate';
  /** For tool_result events: execution duration in ms */
  duration?: number;
  /** For tool_result events: whether the result is an error */
  isError?: boolean;
  /** For done events: estimated cost in USD for this agent turn */
  cost?: number;
  /** For done events: token counts for this agent turn */
  tokens?: { input: number; output: number };
}

// ── Messages ───────────────────────────────────────────────────────────

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  toolUse?: ToolUseEvent[];
  steps?: string[];
  /** Estimated cost in USD for this message (agent responses only) */
  cost?: number;
  /** Token usage for this message */
  tokens?: { input: number; output: number };
}

export type ToolStatus = 'running' | 'done' | 'error' | 'denied' | 'pending_approval';

export interface ToolUseEvent {
  name: string;
  input: Record<string, unknown>;
  result?: string;
  duration?: number;
  approved?: boolean;
  requiresApproval: boolean;
  requestId?: string;
  status: ToolStatus;
}

// ── Workspaces ─────────────────────────────────────────────────────────

export interface Workspace {
  id: string;
  name: string;
  group: string;
  icon?: string;
  model?: string;
  personality?: string;
  /** Selected agent persona ID (from persona catalog) */
  personaId?: string;
  tools?: string[];
  skills?: string[];
  team?: string | null;
  /** Filesystem directory where agent operates and generates files. */
  directory?: string;
  created: string;

  // --- Team Mode fields (Phase 5) ---
  teamId?: string;
  teamServerUrl?: string;
  teamRole?: 'owner' | 'admin' | 'member' | 'viewer';
  teamUserId?: string;
}

// ── Progress Items (E3) ───────────────────────────────────────────────

export interface ProgressItem {
  content: string;
  type: 'task' | 'completed' | 'blocker';
  date: string;
  sessionId: string;
}

// ── Workspace Context (catch-up / return reward) ──────────────────────

export interface WorkspaceContext {
  workspace: { id: string; name: string; group?: string; model?: string; directory?: string; templateId?: string; personaId?: string };
  summary: string;
  recentThreads: Array<{ id: string; title: string; lastActive: string }>;
  recentDecisions: Array<{ content: string; date: string }>;
  suggestedPrompts: string[];
  recentMemories: Array<{ content: string; importance: string; date: string }>;
  progressItems?: ProgressItem[];
  stats: { memoryCount: number; sessionCount: number; fileCount?: number };
  lastActive: string;
  /** Wave 3.1: Time-aware greeting (e.g. "Good morning. Here's your day:") */
  greeting?: string;
  /** Wave 3.1: Open tasks and blockers as pending task strings */
  pendingTasks?: string[];
  /** Wave 3.1: Next 3 upcoming cron schedules (e.g. "Memory consolidation at Mar 26, 3:00 AM") */
  upcomingSchedules?: string[];
  /** Wave 1.6: Template-specific agent welcome message for first-time context */
  welcomeMessage?: string;
  /** Wave 5.2: Pinned/favorited messages */
  pinnedItems?: Array<{ id: string; messageContent: string; messageRole: 'assistant' | 'user'; pinnedAt: string; label?: string; status?: 'draft' | 'final' }>;
  /** Wave 6.5: Cross-workspace intelligence hints */
  crossWorkspaceHints?: string[];
}

// ── Sessions ───────────────────────────────────────────────────────────

export interface Session {
  id: string;
  workspaceId?: string;
  title?: string;
  summary?: string | null;
  messageCount: number;
  lastActive: string;
  created: string;
}

// ── Session Search (F1) ───────────────────────────────────────────

export interface SessionSearchResult {
  sessionId: string;
  title: string;
  summary: string | null;
  matchCount: number;
  snippets: Array<{ text: string; role: string }>;
  lastActive: string;
}

// ── File Registry (F2) ───────────────────────────────────────────

export interface FileRegistryEntry {
  name: string;
  type: string;
  summary: string;
  sizeBytes: number;
  ingestedAt: string;
}

// ── Memory ─────────────────────────────────────────────────────────────

export interface Frame {
  id: number;
  content: string;
  source: 'personal' | 'workspace';
  frameType: string;
  importance: string;
  timestamp: string;
  score?: number;
  gop?: string;
  sessionId?: string;
  entities?: string[];
  linkedFrames?: number[];
  /** Team attribution — present for frames synced from team server */
  authorId?: string;
  authorName?: string;
}

// ── Agent Status ───────────────────────────────────────────────────────

export interface AgentStatus {
  running: boolean;
  currentTask?: string;
  model: string;
  tokensUsed: number;
  estimatedCost: number;
}

// ── Configuration ──────────────────────────────────────────────────────

export interface TeamMember {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  status: 'online' | 'away' | 'offline';
  lastActivity?: string;
  /** What the user was last doing (e.g., "Working on marketing plan") */
  activitySummary?: string;
}

export interface TeamConnection {
  serverUrl: string;
  token: string;
  userId: string;
  displayName: string;
  teamSlug?: string;
}

export interface CustomModelEntry {
  name: string;
  baseUrl?: string;
}

export interface WaggleConfig {
  providers: Record<string, { apiKey: string; models: string[] }>;
  defaultModel: string;
  theme: 'dark' | 'light';
  autostart: boolean;
  globalHotkey: string;
  teamConnection?: TeamConnection | null;
  /** User-defined custom models (local or remote) */
  customModels?: CustomModelEntry[];
}

// ── Install Center (Slice 3) ────────────────────────────────────────

export type SkillState = 'active' | 'installed' | 'available';

export interface StarterSkillEntry {
  id: string;
  name: string;
  description: string;
  family: string;
  familyLabel: string;
  state: SkillState;
  isWorkflow: boolean;
}

export interface SkillFamily {
  id: string;
  label: string;
}

export interface StarterCatalogResponse {
  skills: StarterSkillEntry[];
  families: SkillFamily[];
}

// ── Service Interface ──────────────────────────────────────────────────

export interface WaggleService {
  // Connection lifecycle
  connect(): Promise<void>;
  disconnect(): void;
  isConnected(): boolean;

  // Chat
  sendMessage(workspace: string, message: string, session?: string, model?: string, workspacePath?: string): AsyncGenerator<StreamEvent>;
  getHistory(workspace: string, session?: string): Promise<Message[]>;

  // Workspaces
  listWorkspaces(): Promise<Workspace[]>;
  createWorkspace(config: Partial<Workspace>): Promise<Workspace>;
  updateWorkspace(id: string, config: Partial<Workspace>): Promise<void>;
  deleteWorkspace(id: string): Promise<void>;
  getWorkspaceContext(id: string): Promise<WorkspaceContext>;

  // Memory
  searchMemory(query: string, scope: 'personal' | 'workspace' | 'all', workspace?: string): Promise<Frame[]>;
  listFrames(workspace?: string, limit?: number): Promise<Frame[]>;
  getKnowledgeGraph(workspace: string): Promise<{ entities: unknown[]; relations: unknown[] }>;

  // Sessions
  listSessions(workspace: string): Promise<Session[]>;
  createSession(workspace: string, title?: string): Promise<Session>;
  deleteSession(sessionId: string, workspace: string): Promise<void>;
  renameSession(sessionId: string, workspace: string, title: string): Promise<void>;
  searchSessions(workspace: string, query: string): Promise<SessionSearchResult[]>;
  exportSession(workspace: string, sessionId: string): Promise<string>;

  // Files
  listFiles(workspace: string): Promise<FileRegistryEntry[]>;

  // Approval gates
  approveAction(requestId: string): void;
  denyAction(requestId: string, reason?: string): void;

  // Agent
  getAgentStatus(): Promise<AgentStatus>;

  // Settings
  getConfig(): Promise<WaggleConfig>;
  updateConfig(config: Partial<WaggleConfig>): Promise<void>;
  testApiKey(provider: string, key: string): Promise<{ valid: boolean; error?: string }>;

  // Team
  connectTeam(serverUrl: string, token: string): Promise<TeamConnection>;
  disconnectTeam(): Promise<void>;
  getTeamStatus(): Promise<TeamConnection | null>;
  listTeams(): Promise<Array<{ id: string; name: string; slug: string; role: string }>>;

  // Install Center
  getStarterCatalog(): Promise<StarterCatalogResponse>;
  installStarterSkill(skillId: string): Promise<{ ok: boolean; skill: { id: string; name: string; state: SkillState } }>;

  // Events
  on(event: string, cb: (data: unknown) => void): () => void;
}
