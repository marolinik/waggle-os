import {
  pgTable, uuid, text, timestamp, boolean, real, integer, jsonb, primaryKey,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkId: text('clerk_id').unique().notNull(),
  displayName: text('display_name').notNull(),
  email: text('email').unique().notNull(),
  avatarUrl: text('avatar_url'),
  mindPath: text('mind_path'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const teams = pgTable('teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').unique().notNull(),
  ownerId: uuid('owner_id').references(() => users.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const teamMembers = pgTable('team_members', {
  teamId: uuid('team_id').references(() => teams.id).notNull(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  role: text('role').notNull().default('member'),
  roleDescription: text('role_description'),
  interests: jsonb('interests').$type<string[]>(),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.teamId, t.userId] })]);

export const agents = pgTable('agents', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  teamId: uuid('team_id').references(() => teams.id),
  name: text('name').notNull(),
  role: text('role'),
  systemPrompt: text('system_prompt'),
  model: text('model').notNull().default('claude-haiku-4-5'),
  tools: jsonb('tools').$type<string[]>().notNull().default([]),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const agentGroups = pgTable('agent_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  name: text('name').notNull(),
  description: text('description'),
  strategy: text('strategy').notNull().default('parallel'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const agentGroupMembers = pgTable('agent_group_members', {
  groupId: uuid('group_id').references(() => agentGroups.id).notNull(),
  agentId: uuid('agent_id').references(() => agents.id).notNull(),
  roleInGroup: text('role_in_group').notNull().default('worker'),
  executionOrder: integer('execution_order').notNull().default(0),
}, (t) => [primaryKey({ columns: [t.groupId, t.agentId] })]);

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id').references(() => teams.id).notNull(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull().default('open'),
  priority: text('priority').notNull().default('normal'),
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  assignedTo: uuid('assigned_to').references(() => users.id),
  parentTaskId: uuid('parent_task_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id').references(() => teams.id).notNull(),
  senderId: uuid('sender_id').references(() => users.id).notNull(),
  type: text('type').notNull(),
  subtype: text('subtype').notNull(),
  content: jsonb('content').$type<Record<string, unknown>>().notNull(),
  referenceId: uuid('reference_id'),
  routing: jsonb('routing').$type<Array<{ userId: string; reason: string }>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const teamEntities = pgTable('team_entities', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id').references(() => teams.id).notNull(),
  entityType: text('entity_type').notNull(),
  name: text('name').notNull(),
  properties: jsonb('properties').$type<Record<string, unknown>>().notNull().default({}),
  sharedBy: uuid('shared_by').references(() => users.id).notNull(),
  validFrom: timestamp('valid_from', { withTimezone: true }).defaultNow().notNull(),
  validTo: timestamp('valid_to', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const teamRelations = pgTable('team_relations', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id').references(() => teams.id).notNull(),
  sourceId: uuid('source_id').references(() => teamEntities.id).notNull(),
  targetId: uuid('target_id').references(() => teamEntities.id).notNull(),
  relationType: text('relation_type').notNull(),
  confidence: real('confidence').notNull().default(1.0),
  properties: jsonb('properties').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const teamResources = pgTable('team_resources', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id').references(() => teams.id).notNull(),
  resourceType: text('resource_type').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull(),
  sharedBy: uuid('shared_by').references(() => users.id).notNull(),
  rating: real('rating').notNull().default(0),
  useCount: integer('use_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const teamCapabilityPolicies = pgTable('team_capability_policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id').references(() => teams.id).notNull(),
  role: text('role').notNull(),
  allowedSources: jsonb('allowed_sources').$type<string[]>().notNull().default([]),
  blockedTools: jsonb('blocked_tools').$type<string[]>().notNull().default([]),
  approvalThreshold: text('approval_threshold').notNull().default('none'),
  updatedBy: uuid('updated_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const teamCapabilityOverrides = pgTable('team_capability_overrides', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id').references(() => teams.id).notNull(),
  capabilityName: text('capability_name').notNull(),
  capabilityType: text('capability_type').notNull(),
  decision: text('decision').notNull(),
  reason: text('reason').notNull().default(''),
  decidedBy: uuid('decided_by').references(() => users.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  decidedAt: timestamp('decided_at', { withTimezone: true }).defaultNow().notNull(),
});

export const teamCapabilityRequests = pgTable('team_capability_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id').references(() => teams.id).notNull(),
  requestedBy: uuid('requested_by').references(() => users.id).notNull(),
  capabilityName: text('capability_name').notNull(),
  capabilityType: text('capability_type').notNull(),
  justification: text('justification').notNull(),
  status: text('status').notNull().default('pending'),
  decidedBy: uuid('decided_by').references(() => users.id),
  decisionReason: text('decision_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
});

export const agentJobs = pgTable('agent_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id').references(() => teams.id).notNull(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  jobType: text('job_type').notNull(),
  status: text('status').notNull().default('queued'),
  input: jsonb('input').$type<Record<string, unknown>>().notNull(),
  output: jsonb('output').$type<Record<string, unknown>>(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const cronSchedules = pgTable('cron_schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id').references(() => teams.id).notNull(),
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  name: text('name').notNull(),
  cronExpr: text('cron_expr').notNull(),
  jobType: text('job_type').notNull(),
  jobConfig: jsonb('job_config').$type<Record<string, unknown>>().notNull().default({}),
  enabled: boolean('enabled').notNull().default(true),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const scoutFindings = pgTable('scout_findings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  teamId: uuid('team_id').references(() => teams.id),
  source: text('source').notNull(),
  category: text('category').notNull(),
  title: text('title').notNull(),
  summary: text('summary'),
  relevanceScore: real('relevance_score').notNull().default(0),
  url: text('url'),
  status: text('status').notNull().default('new'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const proactivePatterns = pgTable('proactive_patterns', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  trigger: jsonb('trigger').$type<Record<string, unknown>>().notNull(),
  suggestionType: text('suggestion_type').notNull(),
  template: text('template').notNull(),
  enabled: boolean('enabled').notNull().default(true),
});

export const suggestionsLog = pgTable('suggestions_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  patternId: uuid('pattern_id').references(() => proactivePatterns.id).notNull(),
  context: jsonb('context').$type<Record<string, unknown>>().notNull(),
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const agentAuditLog = pgTable('agent_audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  teamId: uuid('team_id').references(() => teams.id),
  agentName: text('agent_name').notNull(),
  actionType: text('action_type').notNull(),
  description: text('description').notNull(),
  beforeState: jsonb('before_state').$type<Record<string, unknown>>(),
  afterState: jsonb('after_state').$type<Record<string, unknown>>(),
  requiresApproval: boolean('requires_approval').notNull().default(false),
  approved: boolean('approved'),
  approvedBy: uuid('approved_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
