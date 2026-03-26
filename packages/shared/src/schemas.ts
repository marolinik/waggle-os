// @waggle/shared — Zod validation schemas for API requests

import { z } from 'zod';

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

export const createAgentSchema = z.object({
  name: z.string().min(1).max(100),
  role: z.string().max(500).optional(),
  systemPrompt: z.string().max(10000).optional(),
  model: z.string().min(1).default('claude-haiku-4-5'),
  tools: z.array(z.string()).default([]),
  config: z.record(z.unknown()).default({}),
  teamId: z.string().uuid().optional(),
});

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

export const createCronSchema = z.object({
  name: z.string().min(1).max(200),
  cronExpr: z.string().min(1),
  jobType: z.string().min(1),
  jobConfig: z.record(z.unknown()).default({}),
});

export const queueJobSchema = z.object({
  jobType: z.enum(['chat', 'task', 'cron', 'waggle']),
  input: z.record(z.unknown()),
  teamId: z.string().uuid().optional(),
});
