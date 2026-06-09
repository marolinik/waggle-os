// Waggle core types matching the architecture document

import type {
  WorkspaceType,
  MemoryKind,
  CommandCategory,
  CommandResultType,
  CommandResult,
  CommandAction,
  Memory as SharedMemory,
} from '@waggle/shared';

// Re-export the shared Command vocabulary so command-palette FE code can import
// the whole contract from one place (lib/types) alongside the FE view-models.
export type { CommandCategory, CommandResultType, CommandResult, CommandAction };

// Re-export the UX-Refactor Memory/Artifact entity vocabulary (PRD §15.4/§15.6)
// so Memory Center / Artifact Center FE code imports the contract from lib/types
// alongside the view-models. The Artifact view-model is the shared shape verbatim
// in v1 (no FE-derived fields yet); Memory adds a derived `relevance` below.
export type {
  Artifact,
  ArtifactStatus,
  ArtifactKind,
  RelatedSearchResult,
  RelatedRef,
  MemoryKind,
  MemoryStatus,
  Scope,
  Confidence,
} from '@waggle/shared';

// NOTE: the stale `AppView` union (superseded by `AppId` in lib/dock-tiers.ts)
// was removed in the UX-refactor Phase 0 IA cleanup — it had zero references.

export type StorageType = 'virtual' | 'local' | 'team';

/**
 * FE mirror of the server `UserProfile` (profile.ts). Carries the day-0
 * onboarding signals `workType/teamSize/goals` (Phase 2D.1) alongside the
 * existing identity/brand/style fields. Kept partial-friendly — every field is
 * optional so a freshly-loaded or half-filled profile typechecks. `PUT
 * /api/profile` merges a partial of this shape (see `adapter.updateProfile`).
 */
export interface UserProfile {
  name?: string;
  role?: string;
  company?: string;
  industry?: string;
  bio?: string;
  /** Day-0 onboarding personalization signals (S13 / B8). */
  workType?: string;
  teamSize?: string;
  goals?: string[];
  communicationStyle?: string;
  language?: string;
  interests?: string[];
  questionnaireCompleted?: boolean;
  brand?: {
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    fontHeading?: string;
    fontBody?: string;
    description?: string;
  };
  writingStyle?: {
    tone?: string;
    vocabulary?: string;
    structurePreference?: string;
    examples?: string[];
    analyzed?: boolean;
    sentenceLength?: string;
    structure?: string;
  };
}

/**
 * One classified harvest item from `POST /api/harvest/preview` `items[]`
 * (harvest.ts — Phase 2B.3). Carries the canonical `kind` (B6) + heuristic
 * `confidence` (B2, 0-100) so the onboarding Import surface can show kind chips
 * + a ConfidenceBadge before commit-as-unreviewed (C33).
 */
export interface ClassifiedHarvestItem {
  id: string | number;
  title: string;
  type: string;
  source: string;
  kind: MemoryKind;
  confidence: number;
}

export interface StorageConfig {
  endpoint?: string;
  bucket?: string;
  region?: string;
  prefix?: string;
}

export interface Workspace {
  id: string;
  name: string;
  group: string;
  persona?: string;
  agentGroupId?: string;
  templateId?: string;
  hue?: number;
  memoryCount?: number;
  sessionCount?: number;
  lastActive?: string;
  health?: 'healthy' | 'degraded' | 'error';
  budget?: { used: number; limit: number };
  model?: string;
  shared?: boolean;
  storageType?: StorageType;
  storagePath?: string;
  storageConfig?: StorageConfig;
  // --- UX-Refactor V2 view-model fields (PRD §15.3; optional, back-compat) ---
  description?: string;
  type?: WorkspaceType;
  status?: 'active' | 'paused' | 'archived';
  agentIds?: string[];
  connectorIds?: string[];
  mcpIds?: string[];
  updatedAt?: string;
}

export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  mimeType?: string;
  modifiedAt?: string;
  createdAt?: string;
}

export type TemplateCategory = 'sales' | 'research' | 'engineering' | 'marketing' | 'operations' | 'legal' | 'custom';

export interface WorkspaceTemplate {
  id: string;
  name: string;
  description: string;
  persona: string;
  connectors: string[];
  suggestedCommands: string[];
  starterMemory: string[];
  builtIn: boolean;
  category?: TemplateCategory;
}

export interface WorkspaceContext {
  workspace: Workspace;
  summary?: string;
  memoryCount?: number;
  sessionCount?: number;
  model?: string;
  lastActive?: string;
  agentActive?: boolean;
  greeting?: string;
  recentThreads?: Array<{ id: string; title: string; lastActive: string }>;
  recentDecisions?: Array<{ content: string; date: string }>;
  recentMemories?: Array<{ content: string; importance: string; date: string }>;
  suggestedPrompts?: string[];
  pendingTasks?: string[];
  upcomingSchedules?: string[];
  progressItems?: Array<{ type: string; content: string; date: string }>;
  welcomeMessage?: string;
  crossWorkspaceHints?: string[];
  stats?: { memoryCount: number; sessionCount: number; fileCount: number };
}

// ── UX-Refactor Phase 1 view-models ──────────────────────────────────────
// FE return shapes for the new Home Cockpit (S01), Workspace Desktop (S02),
// and Command Center (S03) adapter methods. Net-new vs the current types
// (no Home/Overnight/QuickCapture/WorkspaceState mirror existed).
// Sources: gap-cards/S01 §6, S02 §6, S03 §6; backend-api-delta Phase 1.

/** One ranked workspace card in the Home "You were working on" panel (S01 §6). */
export interface RecentWorkspaceCard {
  id: string;
  name: string;
  group: string;
  summary?: string;
  lastActive: string;
  pendingCount: number;
  continueSessionId?: string;
}

/** A Home "Suggested next action" — routes into its workspace (S01 §6). */
export interface SuggestedAction {
  label: string;
  workspaceId: string;
  sessionId?: string;
  kind: string;
}

/** A Home "Up next" row (upcoming event/task/schedule) (S01 §6). */
export interface UpNextItem {
  id: string;
  label: string;
  workspaceId?: string;
  at?: string;
  kind: 'event' | 'task' | 'schedule';
}

/** `GET /api/home/briefing` — the daily cross-workspace briefing (S01 §6). */
export interface HomeBriefing {
  greeting: string;
  userName?: string;
  date: string;
  recentWorkspaces: RecentWorkspaceCard[];
  suggestedActions: SuggestedAction[];
  upNext: UpNextItem[];
  activeModels?: string[];
  isFirstRun: boolean;
}

/** One overnight failure row, expandable to the Automation Center (S01 §6). */
export interface OvernightFailure {
  id: string;
  label: string;
  automationId?: string;
  error: string;
  at: string;
}

/** `GET /api/home/overnight` — since-last-login activity summary (S01 §6). */
export interface OvernightSummary {
  consolidated: number;
  artifactsCreated: number;
  automationsCompleted: number;
  failures: OvernightFailure[];
  window?: { from: string; to: string };
}

/** `POST /api/quick-capture` request body (S01 §6, backend-api-delta 1a). */
export interface QuickCaptureInput {
  kind: 'note' | 'task' | 'link' | 'file';
  content: string;
  workspaceId?: string;
}

/** One classified work item in a WorkspaceState bucket (S02 §6). */
export interface WorkspaceStateItem {
  id: string;
  content: string;
  date?: string;
  freshness?: 'fresh' | 'aging' | 'stale';
}

/**
 * FE mirror of the server `WorkspaceState` (workspace-state.ts:38-55), the
 * `GET /api/workspaces/:id/state` body that feeds the Overview + Tasks tabs
 * (S02 §6). `pending` + `blocked` seed the Tasks list.
 */
export interface WorkspaceStateView {
  active: WorkspaceStateItem[];
  openQuestions: WorkspaceStateItem[];
  pending: WorkspaceStateItem[];
  blocked: WorkspaceStateItem[];
  completed: WorkspaceStateItem[];
  stale: WorkspaceStateItem[];
  recentDecisions: WorkspaceStateItem[];
  nextActions: SuggestedAction[];
}

/** One row in the per-workspace activity feed (S02 §5, `/activity`). */
export interface WorkspaceActivityEvent {
  id: string | number;
  ts: string;
  type: string;
  actor?: string;
  summary: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  blocks?: ContentBlock[];
  timestamp: string;
  tools?: ToolExecution[];
  feedback?: 'up' | 'down' | null;
  pinned?: boolean;
  persona?: string;
}

export interface ToolExecution {
  id: string;
  name: string;
  status: 'running' | 'done' | 'error' | 'denied' | 'pending';
  input?: Record<string, unknown>;
  output?: unknown;
  duration?: number;
}

export interface ApprovalRequest {
  requestId: string;
  toolName: string;
  description: string;
  input: Record<string, unknown>;
  rawJson?: string;
  /** Phase B.3: the source workspace so "Always allow" grants stay scoped. */
  sourceWorkspaceId?: string | null;
}

export interface MemoryFrame {
  id: string;
  type: 'fact' | 'event' | 'insight' | 'decision' | 'task' | 'entity';
  title: string;
  content: string;
  importance: number;
  timestamp: string;
  workspaceId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Memory Center FE view-model (S04) — the shared `Memory` entity (PRD §15.4,
 * carrying kind/confidence/scope/source/evidence/status) plus FE-derived display
 * fields. The legacy `MemoryFrame` above is kept for back-compat with existing
 * `/api/memory/frames` consumers; Memory Center components migrate onto `Memory`
 * in Phase 2B. `MemoryKind` (PRD §15.2) is the canonical type vocabulary (B6) —
 * do NOT widen `MemoryFrame.type`; map it via `lib/harvest-kind-map.ts`.
 */
export interface Memory extends SharedMemory {
  /** FE-derived recall relevance for ranked lists (0-1); not persisted. */
  relevance?: number;
}

export interface AgentStep {
  id: string;
  type: 'think' | 'tool_call' | 'tool_result' | 'response' | 'error' | 'spawn';
  description: string;
  status: 'running' | 'complete' | 'error';
  duration?: number;
  timestamp: string;
  details?: Record<string, unknown>;
}

export interface TimelineEvent {
  id: number;
  eventType: string;
  toolName?: string;
  input?: string;
  output?: string;
  model?: string;
  tokensUsed?: number;
  cost?: number;
  sessionId?: string;
  approved?: boolean;
  timestamp: string;
}

// ── Content Block System ─────────────────────────────────────────────
// Messages are composed of ordered blocks that interleave text, tool usage,
// and agent activity — matching Claude.ai's visual rendering pattern.

export type ContentBlock =
  | TextContentBlock
  | StepContentBlock
  | ToolUseContentBlock
  | ModelSwitchContentBlock
  | ErrorContentBlock;

export interface TextContentBlock {
  type: 'text';
  blockId: string;
  content: string;
}

export interface StepContentBlock {
  type: 'step';
  blockId: string;
  description: string;
  status: 'running' | 'done';
}

export interface ToolUseContentBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input?: Record<string, unknown>;
  status: 'running' | 'done' | 'error' | 'denied';
  result?: string;
  duration?: number;
}

export interface ModelSwitchContentBlock {
  type: 'model_switch';
  blockId: string;
  from: string;
  to: string;
  reason: string;
}

export interface ErrorContentBlock {
  type: 'error';
  blockId: string;
  message: string;
}

export interface Session {
  id: string;
  workspaceId: string;
  title: string;
  messageCount: number;
  lastActive: string;
  model?: string;
}

export interface SkillPack {
  id: string;
  name: string;
  description: string;
  category: 'research' | 'writing' | 'planning' | 'team' | 'decision';
  skills: string[];
  installed: boolean;
  trust: 'verified' | 'community' | 'experimental';
}

export interface FleetSession {
  workspaceId: string;
  workspaceName: string;
  status: 'active' | 'paused' | 'idle';
  duration: number;
  toolCount: number;
  model: string;
  tokenUsage: number;
}

export interface CronJob {
  id: string;
  name: string;
  schedule: string;
  workspaceId: string;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
}

export interface Notification {
  id: string;
  type: 'cron' | 'approval' | 'task' | 'message' | 'agent';
  title: string;
  body: string;
  read: boolean;
  timestamp: string;
}

export interface AgentStatus {
  model: string;
  tokensUsed: number;
  costUsd: number;
  isActive: boolean;
}

export interface Persona {
  id: string;
  name: string;
  description: string;
  avatar?: string;
  /** One-line differentiator shown in the switcher hover card. */
  tagline?: string;
  /** 3-4 example tasks this persona is best suited for. */
  bestFor?: string[];
  /** Hard boundary statement — what this persona will not do. */
  wontDo?: string;
  /** True when the persona has no write/execute tools; rendered as a badge. */
  isReadOnly?: boolean;
  icon?: string;
  workspaceAffinity?: string[];
  suggestedCommands?: string[];
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'down';
  uptime: number;
  services: { name: string; status: string }[];
}

export interface Connector {
  id: string;
  name: string;
  type: string;
  status: 'connected' | 'disconnected' | 'error';
}

export interface StreamEvent {
  type: 'token' | 'step' | 'tool_start' | 'tool_end' | 'done' | 'error' | 'approval_request' | 'approval_required' | 'model_switch' | 'notification';
  data: unknown;
}

export interface Settings {
  model: string;
  provider: string;
  apiKey?: string;
  tokenLimit: number;
  theme: 'dark' | 'light';
  teamServerUrl?: string;
  teamToken?: string;
}

export interface KGNode {
  id: string;
  label: string;
  type: string;
}

export interface KGEdge {
  source: string;
  target: string;
  relationship: string;
}

export interface ModelPricing {
  model: string;
  inputCostPer1k: number;
  outputCostPer1k: number;
  estimatedTokens?: { min: number; max: number };
  estimatedCost?: { min: number; max: number };
}

export interface WaggleSignal {
  id: string;
  type: 'discovery' | 'handoff' | 'insight' | 'alert' | 'coordination';
  sourceWorkspaceId: string;
  sourceWorkspaceName?: string;
  sourceAgentId?: string;
  sourceUser?: string;
  targetWorkspaceId?: string;
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
  acknowledged?: boolean;
  priority?: 'low' | 'normal' | 'high' | 'critical';
}
