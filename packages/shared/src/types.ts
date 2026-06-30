// @waggle/shared — Domain types for M3 Team Pilot

// === Auth & Users ===
export interface User {
  id: string;
  clerkId: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  mindPath: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// === Teams ===
export interface Team {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  createdAt: Date;
}

export type TeamRole = 'owner' | 'admin' | 'member';

export interface TeamMember {
  teamId: string;
  userId: string;
  role: TeamRole;
  roleDescription: string | null;
  interests: string[] | null;
  joinedAt: Date;
}

// === Agent Configuration ===
// UX-Refactor Phase 3 (PRD §15.5, gate B3): the legacy 10 members stay untouched
// (cloud callers depend on userId/role/systemPrompt/config); the optional fields
// below carry the Agent-entity vocabulary. Semantics: `tools` remains the raw
// tool allowlist while skillIds/connectorIds/mcpIds are entity references;
// `role` stays the free-text display label while `personaId` is the canonical
// persona reference. lastRunAt/successRate are DERIVED at read from
// execution_traces (B3) — route layers must not persist them.
export interface AgentDef {
  id: string;
  userId: string;
  teamId: string | null;
  name: string;
  role: string | null;
  systemPrompt: string | null;
  model: string;
  tools: string[];
  config: Record<string, unknown>;
  createdAt: Date;
  type?: AgentType;
  goal?: string;
  description?: string;
  personaId?: string;
  autonomyLevel?: AutonomyLevel;
  workspaceIds?: string[];
  memoryScopes?: Scope[];
  skillIds?: string[];
  connectorIds?: string[];
  mcpIds?: string[];
  permissions?: Record<string, unknown>;
  status?: AgentRunState;
  /** ISO timestamp — derived at read, never persisted (B3). */
  lastRunAt?: string;
  /** 0-1 — derived at read from execution_traces outcomes (B3). */
  successRate?: number;
}

export type AgentGroupStrategy = 'parallel' | 'sequential' | 'coordinator';

export interface AgentGroup {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  strategy: AgentGroupStrategy;
  createdAt: Date;
}

export interface AgentGroupMember {
  groupId: string;
  agentId: string;
  roleInGroup: 'lead' | 'worker';
  executionOrder: number;
}

// === Tasks ===
export type TaskStatus = 'open' | 'claimed' | 'in_progress' | 'done' | 'cancelled';
export type TaskPriority = 'critical' | 'high' | 'normal' | 'low';

export interface Task {
  id: string;
  teamId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  createdBy: string;
  assignedTo: string | null;
  parentTaskId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * AI-OS #6 — durable "why" injected into the agent system prompt each run
 * (the purpose above the current turn; complements recall + live awareness).
 * All levels optional. Today `project` (workspace) and `goal` (agent goal) are
 * populated; `mission` (no workspace-charter field yet) and `task` (already in
 * the self-awareness section) are reserved/omitted.
 */
export interface GoalAncestry {
  mission?: string;
  project?: string;
  goal?: string;
  task?: string;
}

// === Waggle Dance Messages ===
export type MessageType = 'broadcast' | 'request' | 'response';
export type MessageSubtype =
  | 'knowledge_check' | 'task_delegation' | 'skill_request'
  | 'model_recommendation' | 'knowledge_match' | 'task_claim'
  | 'discovery' | 'routed_share' | 'skill_share' | 'model_recipe';

export interface WaggleMessage {
  id: string;
  teamId: string;
  senderId: string;
  type: MessageType;
  subtype: MessageSubtype;
  content: Record<string, unknown>;
  referenceId: string | null;
  routing: Array<{ userId: string; reason: string }> | null;
  createdAt: Date;
}

// === Team Knowledge Graph ===
export interface TeamEntity {
  id: string;
  teamId: string;
  entityType: string;
  name: string;
  properties: Record<string, unknown>;
  sharedBy: string;
  validFrom: Date;
  validTo: Date | null;
  createdAt: Date;
}

export interface TeamRelation {
  id: string;
  teamId: string;
  sourceId: string;
  targetId: string;
  relationType: string;
  confidence: number;
  properties: Record<string, unknown>;
  createdAt: Date;
}

// === Team Resources ===
export type ResourceType = 'model_recipe' | 'skill' | 'tool_config' | 'prompt_template';

export interface TeamResource {
  id: string;
  teamId: string;
  resourceType: ResourceType;
  name: string;
  description: string | null;
  config: Record<string, unknown>;
  sharedBy: string;
  rating: number;
  useCount: number;
  createdAt: Date;
}

// === Jobs ===
export type JobType = 'chat' | 'task' | 'cron' | 'waggle';
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface AgentJob {
  id: string;
  teamId: string;
  userId: string;
  jobType: JobType;
  status: JobStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

// === Cron ===
export interface CronSchedule {
  id: string;
  teamId: string;
  createdBy: string;
  name: string;
  cronExpr: string;
  jobType: string;
  jobConfig: Record<string, unknown>;
  enabled: boolean;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  createdAt: Date;
}

// === Intelligence ===
export type ScoutSource = 'marketplace' | 'mcp_registry' | 'model_provider' | 'team';
export type ScoutCategory = 'skill' | 'mcp' | 'model' | 'feature' | 'practice';
export type FindingStatus = 'new' | 'presented' | 'adopted' | 'dismissed';

export interface ScoutFinding {
  id: string;
  userId: string | null;
  teamId: string | null;
  source: ScoutSource;
  category: ScoutCategory;
  title: string;
  summary: string | null;
  relevanceScore: number;
  url: string | null;
  status: FindingStatus;
  createdAt: Date;
}

export type SuggestionType = 'dashboard' | 'cron' | 'share' | 'skill' | 'upgrade';
export type SuggestionStatus = 'pending' | 'accepted' | 'dismissed' | 'snoozed';

export interface ProactivePattern {
  id: string;
  name: string;
  trigger: Record<string, unknown>;
  suggestionType: SuggestionType;
  template: string;
  enabled: boolean;
}

export interface SuggestionEntry {
  id: string;
  userId: string;
  patternId: string;
  context: Record<string, unknown>;
  status: SuggestionStatus;
  createdAt: Date;
}

// === Audit ===
export interface AuditEntry {
  id: string;
  userId: string;
  teamId: string | null;
  agentName: string;
  actionType: string;
  description: string;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  requiresApproval: boolean;
  approved: boolean | null;
  approvedBy: string | null;
  createdAt: Date;
}

// === WebSocket Events ===
export type WsClientEvent =
  | { type: 'authenticate'; token: string }
  | { type: 'join_team'; teamSlug: string }
  | { type: 'send_message'; teamSlug: string; messageType: MessageType; subtype: MessageSubtype; content: Record<string, unknown> };

export type WsServerEvent =
  | { type: 'waggle_message'; message: WaggleMessage }
  | { type: 'task_update'; task: Task }
  | { type: 'agent_status'; userId: string; status: 'running' | 'idle' | 'completed' }
  | { type: 'suggestion'; suggestion: SuggestionEntry }
  | { type: 'scout_finding'; finding: ScoutFinding }
  | { type: 'job_progress'; jobId: string; progress: Record<string, unknown> };

// ─── Connector Types ────────────────────────────────────────────────────

/** Connector credential type stored in vault */
export interface ConnectorCredential {
  type: 'api_key' | 'oauth2' | 'bearer' | 'basic';
  /** For oauth2: access token */
  accessToken?: string;
  /** For oauth2: refresh token */
  refreshToken?: string;
  /** ISO timestamp when accessToken expires */
  expiresAt?: string;
  /** OAuth scopes granted */
  scopes?: string[];
  /** For api_key/bearer: the key or token value */
  apiKey?: string;
  /** For basic: username */
  username?: string;
}

/** Connector status in the system */
export type ConnectorStatus = 'connected' | 'disconnected' | 'expired' | 'error';

/** Rich action metadata for SDK-backed connectors */
export interface ConnectorActionMeta {
  name: string;
  description: string;
  riskLevel: 'low' | 'medium' | 'high';
}

/** Connector definition — what the user sees */
export interface ConnectorDefinition {
  id: string;
  name: string;
  description: string;
  /** Which service this connects to */
  service: string;
  /** What auth method is needed */
  authType: 'api_key' | 'oauth2' | 'bearer' | 'basic';
  /** Whether credentials exist in vault */
  status: ConnectorStatus;
  /** What the connector can do */
  capabilities: ('read' | 'write' | 'search')[];
  /** Which substrate manages this connector */
  substrate: 'waggle' | 'kvark';
  /** Agent tools this connector provides when connected */
  tools: string[];
  /** Connector-specific config */
  config?: Record<string, unknown>;
  /** Rich action metadata (optional — available when SDK connector is loaded) */
  actions?: ConnectorActionMeta[];
  /** CDN URL for SVG logo */
  logoUrl?: string;
  /** Connector category */
  category?: 'productivity' | 'development' | 'crm' | 'data' | 'communication' | 'storage' | 'integration';
  /** 1-2 sentences: what credential is needed and where to get it */
  setupGuide?: string;
  /** When the connector was last manually synced (C16). GET /api/connectors
   *  enriches each definition with this from the vault stamp. */
  lastSyncAt?: string;
}

/** Connector health for cockpit display */
export interface ConnectorHealth {
  id: string;
  name: string;
  status: ConnectorStatus;
  lastChecked: string;
  error?: string;
  tokenExpiresAt?: string;
  /** When the connector was last manually synced (C16: sync-now = health
   *  re-probe + stamp). Stamped by POST /api/connectors/:id/sync; merged into
   *  GET /api/connectors/:id/health (and the fallback path) from the vault. */
  lastSyncAt?: string;
}

// === UX-Refactor vocabulary (PRD §15.2) ===
// Domain literal unions for the workspace-first Agent Desktop refactor.
// Single source of truth — the sidecar route layer and apps/web both import these
// (no per-file union duplication; see docs/ux-refactor/deltas/shared-types-delta.md §0).
export type WorkspaceType =
  | 'project' | 'client' | 'research' | 'personal' | 'team' | 'organization';
export type Scope = 'personal' | 'workspace' | 'team' | 'organization';
/** 0-100 confidence score for a memory / provenance signal. */
export type Confidence = number;

export type MemoryKind =
  | 'fact' | 'decision' | 'task' | 'preference'
  | 'strategy' | 'learning' | 'goal' | 'entity';
export type ArtifactKind =
  | 'document' | 'presentation' | 'spreadsheet' | 'dashboard'
  | 'research' | 'code' | 'media' | 'design' | 'other';
export type AgentType = 'personal' | 'workspace' | 'team' | 'autonomous';
export type AutonomyLevel = 'manual' | 'guided' | 'medium' | 'high';
/** PRD §14.5 agent lifecycle states — SINGLE source of truth. The sidecar
 *  store (packages/server/src/local/agents-store.ts) and the FE view-model
 *  (apps/web/src/lib/types.ts) re-export this union; do not redeclare it.
 *  Declared as a const tuple so schemas.ts derives `agentStatusEnum` from it
 *  (z.enum) — the type and the runtime list cannot drift. */
export const AGENT_RUN_STATES = [
  'draft', 'idle', 'running', 'paused', 'failed',
  'waiting_for_approval', 'completed', 'archived',
] as const;
export type AgentRunState = (typeof AGENT_RUN_STATES)[number];
/** PRD §15.2 / §12.13 extension domains (B7 ratified: drop 'external_tool' —
 *  external tools surface via connectors/MCPs — and add 'agent'). Const tuple
 *  so the Extend routes validate the `type` facet against the runtime list. */
export const EXTENSION_TYPES = [
  'skill', 'agent', 'connector', 'mcp', 'model', 'template',
] as const;
export type ExtensionType = (typeof EXTENSION_TYPES)[number];

/**
 * Installed MCP-server instance state (shared-types-delta §8b). The CATALOG
 * entry stays `McpServer` (mcp-catalog.ts) — `McpInstance.id` references
 * `McpServer.id` for catalog installs, or the custom server name for
 * user-added servers (POST /api/mcps). Produced by GET /api/mcps.
 *
 * v1 carries ONLY fields the route actually emits. The delta's
 * version/riskLevel/permissions/lastUsedAt fields are deferred (no producer
 * yet); per-tool `permissions` granularity is deferred together with C19's
 * single-workspaceId scope model — PATCH /api/mcps/:id/permissions accepts
 * `{ workspaceId }` or `{ scope: 'personal' }` only.
 */
export interface McpInstance {
  id: string;
  name: string;
  status: 'installed' | 'running' | 'stopped' | 'error';
  /** Locality (§17.3): 'workspace' when pinned to a workspaceId, else 'personal'. */
  scope: Scope;
  /** Workspace/agent ids this server is pinned to (C19: single workspaceId v1). */
  connectedTo?: string[];
}

/**
 * PRD §15.3 workspace contract — the normalized shape the sidecar route layer
 * exposes to the new UI. The PERSISTED struct lives in `@waggle/hive-mind-core`
 * (`workspace-manager.ts` `WorkspaceConfig`, a superset carrying legacy fields).
 * A route-layer normalizer (Phase 1) bridges the struct to this contract, filling
 * defaults for pre-V2 workspaces (type from templateId/group, status 'active',
 * updatedAt from created). Kept separate (not `extends`) so the additive fields on
 * the persistence struct stay optional and existing workspace literals don't break.
 */
export interface WorkspaceConfigV2 {
  id: string;
  name: string;
  description?: string;
  type: WorkspaceType;
  group: string;
  icon?: string;
  status: 'active' | 'paused' | 'archived';
  model?: string;
  personaId?: string;
  templateId?: string;
  tools?: string[];
  skills?: string[];
  agentIds?: string[];
  connectorIds?: string[];
  mcpIds?: string[];
  storageType?: 'virtual' | 'local' | 'team';
  storagePath?: string;
  teamId?: string;
  teamRole?: 'owner' | 'admin' | 'member' | 'viewer';
  riskLevel?: 'minimal' | 'limited' | 'high-risk' | 'unacceptable';
  created: string;
  updatedAt: string;
  lastActiveAt?: string;
}

// === UX-Refactor Command vocabulary (PRD §12.3 / shared-types-delta §9) ===
// Command Center (Ctrl+K) result/command shapes. Single source of truth — the
// sidecar `command.ts` route layer and apps/web both import these. See
// docs/ux-refactor/deltas/shared-types-delta.md §9.

/** The six verb sections of the Command Center (PRD §12.3). */
export type CommandCategory =
  | 'search' | 'launch' | 'create' | 'run' | 'navigate' | 'extend';

/**
 * Every searchable object class the palette federates over (PRD §12.3 FR:
 * "search across workspaces, memory, artifacts, sessions, people, agents,
 * skills, commands, connectors, MCPs"). Artifact/agent rows are gated until
 * those screens (S05/S09) land — the type carries them so the union is stable.
 */
export type CommandResultType =
  | 'workspace' | 'memory' | 'artifact' | 'session' | 'person'
  | 'agent' | 'skill' | 'command' | 'connector' | 'mcp' | 'automation';

/**
 * What a `run`/`create`/`navigate`/`extend` result does when executed. A
 * Navigate result carries a `route`; a server-dispatched action carries an
 * `endpoint` + `payload`. All optional so a pure Search result needs none.
 */
export interface CommandAction {
  route?: string;
  endpoint?: string;
  payload?: Record<string, unknown>;
}

/** One row in the Command Center result list. */
export interface CommandResult {
  id: string;
  type: CommandResultType;
  title: string;
  subtitle?: string;
  category: CommandCategory;
  icon?: string;
  /** §12.3 permission-gated → renders the approval prompt before execution. */
  requiresApproval?: boolean;
  action?: CommandAction;
}

/**
 * The execute request the palette posts to `POST /api/command/execute`. A
 * structured command resolves via `id`; a natural-language command rides in
 * `input` (PRD §12.3 "natural-language command input").
 */
export interface Command {
  id?: string;
  input?: string;
  category?: CommandCategory;
  type?: CommandResultType;
  workspaceId?: string;
  payload?: Record<string, unknown>;
}

// === UX-Refactor Memory entity (PRD §15.4 / shared-types-delta §3b) ===
// The normalized contract the sidecar `memory.ts` route layer exposes to the
// Memory Center. The PERSISTED row lives in `@waggle/hive-mind-core`
// (`memory_frames`); a route-layer normalizer (Phase 2B) projects the row +
// its JSON `metadata` blob into this shape. `kind/confidence/scope/status/
// sourceId/tags/evidence/related*` ride `memory_frames.metadata` (added by the
// idempotent ADD-COLUMN migration M1 in Phase 2B); the base columns map 1:1
// (`content`, `created_at`, `last_accessed`, `importance`, `source`).

/**
 * Memory lifecycle state (PRD §12.4 / §14.4), reconciled with the Phase-2 gate
 * ratifications (2026-06-09):
 *  - `unreviewed` — freshly imported, pending non-blocking review (C33: import
 *    commits immediately but lands unreviewed; Memory Center "needs review" filter).
 *  - `archived`   — reversible soft-status (A8 Archive).
 *  - `deprecated` — superseded (A8 Deprecate; mirrors the existing `importance`).
 *  - `low_confidence` / `conflict` — surfaced for review; may be derived at
 *    recall-time (S04 C10) rather than persisted.
 *  - Delete is a HARD delete (A8) — there is no `trash`/tombstone state in v1.
 */
export type MemoryStatus =
  | 'active' | 'unreviewed' | 'low_confidence' | 'conflict' | 'deprecated' | 'archived';

export interface Memory {
  id: string;
  kind: MemoryKind;
  title: string;
  content: string;
  scope: Scope;
  workspaceId?: string;
  teamId?: string | null;
  /** Provenance class — maps from `memory_frames.source` (FrameSource). */
  source: string;
  sourceId?: string | null;
  sourceUrl?: string | null;
  /** 0-100; B2 heuristic at import (source-trust × adapter × dedup). */
  confidence?: Confidence;
  /** Reuses the substrate `Importance` union (`frames.ts`). */
  importance: 'critical' | 'important' | 'normal' | 'temporary' | 'deprecated';
  evidence?: string[];
  tags?: string[];
  relatedMemoryIds?: string[];
  relatedArtifactIds?: string[];
  status: MemoryStatus;
  createdAt: string;
  updatedAt?: string;
  lastAccessedAt?: string;
}

// === UX-Refactor Artifact entity (PRD §15.6 / shared-types-delta §4a) ===
// Artifacts are first-class produced OUTCOMES (decks/docs/sheets/dashboards/
// research), NOT raw file attachments. Per the Phase-2 gate ratification (A6),
// the backing store is a per-workspace `artifacts.json` index over the existing
// StorageProvider (NO new SQLite table) — assigned a stable id + status/tags/
// relations. Classification rule: an artifact is an EXPLICIT produced output
// (generated doc or user-promoted file), not every ingested input.

export type ArtifactStatus = 'draft' | 'ready' | 'in_review' | 'final' | 'archived';

export interface Artifact {
  id: string;
  title: string;
  kind: ArtifactKind;
  workspaceId: string;
  teamId?: string | null;
  createdBy: string;
  /** agent | user | import | automation */
  source: string;
  status: ArtifactStatus;
  /** Pre-archive status, stashed by the server on Archive so Unarchive restores
   *  the prior lifecycle state faithfully (A8 reversibility), not a flat 'draft'. */
  prevStatus?: ArtifactStatus;
  mimeType?: string;
  /** StorageProvider path (virtual | local | team). */
  storagePath?: string;
  previewUrl?: string;
  tags?: string[];
  relatedMemoryIds?: string[];
  relatedSessionIds?: string[];
  relatedTaskIds?: string[];
  relatedAgentIds?: string[];
  createdAt: string;
  updatedAt: string;
}

// === Federated "search-related" envelope (S05 headline, PRD §16.6 / line 532) ===
// The Artifact Center's defining endpoint returns an artifact PLUS its related
// memories/sessions/tasks/agents — "outcomes with relations, not files". Memories
// reuse the canonical `Memory` shape; the other three are lightweight references
// (the full Session/Task/Agent contracts are not part of this envelope on purpose).

export interface RelatedRef {
  id: string;
  title: string;
  /** Owning workspace, when the item is workspace-scoped. */
  workspaceId?: string;
  /** Short text excerpt for display, when available. */
  snippet?: string;
  /** Sub-classification (e.g. session status, task state, agent type). */
  kind?: string;
}

export interface RelatedSearchResult {
  artifacts: Artifact[];
  memories: Memory[];
  sessions: RelatedRef[];
  tasks: RelatedRef[];
  agents: RelatedRef[];
}

// NOTE (Phase 3A review): a speculative shared `Skill` interface was removed
// here — no route produces it (GET /api/skills returns {name,length,preview};
// POST /api/skills/create takes {name,description,steps[],tools,category}).
// Re-introduce a Skill contract only together with a route that emits it.

// === UX-Refactor Automation entity (PRD §16.10 / shared-types-delta §7, Phase 3) ===
// "Automations" is the PRD-vocabulary alias over the existing cron substrate
// (B4 — alias, never rename; `/api/cron/*` callers keep working). Trigger/
// condition/actions ride the existing `cron_schedules.job_config` TEXT blob —
// NO migration. C24: schedule-only triggers v1 ('event' stays in the union but
// is rejected by the route layer). C25: `condition` is an ADVISORY string —
// no evaluation engine in v1.

export type AutomationTriggerType = 'schedule' | 'event' | 'manual';

export interface Automation {
  id: string;
  name: string;
  triggerType: AutomationTriggerType;
  /** Cron expression when triggerType === 'schedule'. */
  schedule?: string;
  /** Advisory only (C25) — stored, surfaced, never evaluated in v1. */
  condition?: string;
  actions: string[];
  agentId?: string;
  notify?: boolean;
  workspaceId: string;
  status: 'active' | 'paused' | 'running' | 'failed';
  lastRun?: string;
  nextRun?: string;
}
