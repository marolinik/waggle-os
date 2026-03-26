// Waggle core types matching the architecture document

export type AppView =
  | 'chat'
  | 'dashboard'
  | 'memory'
  | 'events'
  | 'capabilities'
  | 'cockpit'
  | 'mission-control'
  | 'settings';

export type StorageType = 'virtual' | 'local' | 'team';

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
  memoryCount: number;
  sessionCount: number;
  model: string;
  lastActive: string;
  agentActive: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
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

export interface AgentStep {
  id: string;
  type: 'think' | 'tool_call' | 'tool_result' | 'response' | 'error' | 'spawn';
  description: string;
  status: 'running' | 'complete' | 'error';
  duration?: number;
  timestamp: string;
  details?: Record<string, unknown>;
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
  type: 'token' | 'tool_start' | 'tool_end' | 'done' | 'error' | 'approval_request';
  data: unknown;
}

export interface Settings {
  model: string;
  provider: string;
  apiKey?: string;
  tokenLimit: number;
  theme: 'dark' | 'light';
  yoloMode: boolean;
  mutationGates: boolean;
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
