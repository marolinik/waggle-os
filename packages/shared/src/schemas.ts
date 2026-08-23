// @waggle/shared — Zod validation schemas for API requests

import { z } from 'zod';
import { AGENT_RUN_STATES } from './types.js';

export const createTeamSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
});

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'member']),
});

export const updateMemberSchema = z.object({
  role: z.enum(['admin', 'member']).optional(),
  roleDescription: z.string().max(500).optional(),
  interests: z.array(z.string()).optional(),
});

export const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  priority: z.enum(['critical', 'high', 'normal', 'low']).default('normal'),
  parentTaskId: z.string().uuid().optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  status: z.enum(['open', 'claimed', 'in_progress', 'done', 'cancelled']).optional(),
  priority: z.enum(['critical', 'high', 'normal', 'low']).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
});

export const sendMessageSchema = z.object({
  type: z.enum(['broadcast', 'request', 'response']),
  subtype: z.enum([
    'knowledge_check', 'task_delegation', 'skill_request', 'model_recommendation',
    'knowledge_match', 'task_claim', 'discovery', 'routed_share', 'skill_share', 'model_recipe',
  ]),
  content: z.record(z.unknown()),
  referenceId: z.string().uuid().optional(),
  routing: z.array(z.object({ userId: z.string().uuid(), reason: z.string() })).optional(),
});

// UX-Refactor Phase 3 (PRD §15.5): shared enum fragments for the Agent entity.
// Ref-id arrays use plain min(1) strings — workspace/agent ids in this repo are
// NOT all UUIDs (cron ids are numeric, artifact ids are `art_${uuid}`).
// status derives from the §14.5 AGENT_RUN_STATES tuple in types.ts (the
// vocabulary the sidecar agents-store actually persists) — single source.
const agentTypeEnum = z.enum(['personal', 'workspace', 'team', 'autonomous']);
const autonomyLevelEnum = z.enum(['manual', 'guided', 'medium', 'high']);
const scopeEnum = z.enum(['personal', 'workspace', 'team', 'organization']);
const agentStatusEnum = z.enum(AGENT_RUN_STATES);

// NOTE: this schema is consumed by the Clerk-gated CLOUD route
// (packages/server/src/routes/agents.ts). The cloud AgentService persists only
// the legacy fields (name/role/systemPrompt/model/tools/config/teamId) — the
// §15.5 fields below validate but are NOT stored there yet. The local sidecar
// surface (local/routes/agents.ts) is the §15.5 system of record.
export const createAgentSchema = z.object({
  name: z.string().min(1).max(100),
  role: z.string().max(500).optional(),
  systemPrompt: z.string().max(10000).optional(),
  model: z.string().min(1).default('claude-haiku-4-5'),
  tools: z.array(z.string()).default([]),
  config: z.record(z.unknown()).default({}),
  teamId: z.string().uuid().optional(),
  // §15.5 optional Agent-entity fields (Phase 3) — all optional for back-compat.
  type: agentTypeEnum.optional(),
  goal: z.string().max(4000).optional(),
  description: z.string().max(2000).optional(),
  personaId: z.string().min(1).max(200).optional(),
  autonomyLevel: autonomyLevelEnum.optional(),
  workspaceIds: z.array(z.string().min(1)).optional(),
  memoryScopes: z.array(scopeEnum).optional(),
  skillIds: z.array(z.string().min(1)).optional(),
  connectorIds: z.array(z.string().min(1)).optional(),
  mcpIds: z.array(z.string().min(1)).optional(),
  permissions: z.record(z.unknown()).optional(),
  status: agentStatusEnum.optional(),
});

// NOTE (Phase 3A review): speculative updateAgent/createSkill/updateSkill/
// createAutomation/updateAutomation schemas were removed here — no route
// consumed them and their shapes contradicted the implemented wire contracts
// (the local routes validate inline; skills mandate steps[]; automations use a
// nested trigger object). Re-add a schema only together with a route that
// parses with it.

export const createAgentGroupSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  strategy: z.enum(['parallel', 'sequential', 'coordinator']),
  members: z.array(z.object({
    agentId: z.string().uuid(),
    roleInGroup: z.enum(['lead', 'worker']).default('worker'),
    executionOrder: z.number().int().min(0).default(0),
  })),
});

export const createEntitySchema = z.object({
  entityType: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  properties: z.record(z.unknown()).default({}),
  validFrom: z.string().datetime().optional(),
  validTo: z.string().datetime().optional(),
});

export const createRelationSchema = z.object({
  sourceId: z.string().uuid(),
  targetId: z.string().uuid(),
  relationType: z.string().min(1).max(100),
  confidence: z.number().min(0).max(1).default(1.0),
  properties: z.record(z.unknown()).default({}),
});

export const createResourceSchema = z.object({
  resourceType: z.enum(['model_recipe', 'skill', 'tool_config', 'prompt_template']),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  config: z.record(z.unknown()),
});

export const scheduledJobTypeSchema = z.enum(['chat', 'task', 'waggle', 'group']);

export const createCronSchema = z.object({
  name: z.string().min(1).max(200),
  cronExpr: z.string().min(1),
  jobType: scheduledJobTypeSchema,
  jobConfig: z.record(z.unknown()).default({}),
});

export const queueJobSchema = z.object({
  jobType: z.enum(['chat', 'task', 'cron', 'waggle', 'group']),
  input: z.record(z.unknown()),
  teamId: z.string().uuid().optional(),
});
