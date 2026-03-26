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
}

/** Connector health for cockpit display */
export interface ConnectorHealth {
  id: string;
  name: string;
  status: ConnectorStatus;
  lastChecked: string;
  error?: string;
  tokenExpiresAt?: string;
}
