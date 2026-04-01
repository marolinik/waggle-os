/**
 * Agent Groups routes — CRUD for multi-agent group configurations.
 *
 * Groups are stored in {dataDir}/agent-groups.json.
 * Each group defines a strategy (parallel/sequential/coordinator)
 * and a list of member agents with roles and execution order.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';

interface AgentGroupMember {
  agentId: string;
  roleInGroup: 'lead' | 'worker' | string;
  executionOrder: number;
}

interface AgentGroup {
  id: string;
  name: string;
  description?: string;
  strategy: 'parallel' | 'sequential' | 'coordinator';
  members: AgentGroupMember[];
  createdAt: string;
}

function getGroupsPath(dataDir: string): string {
  return path.join(dataDir, 'agent-groups.json');
}

function loadGroups(dataDir: string): AgentGroup[] {
  const filePath = getGroupsPath(dataDir);
  if (!fs.existsSync(filePath)) return [];
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch { return []; }
}

function saveGroups(dataDir: string, groups: AgentGroup[]): void {
  fs.writeFileSync(getGroupsPath(dataDir), JSON.stringify(groups, null, 2), 'utf-8');
}

export const agentGroupRoutes: FastifyPluginAsync = async (server) => {
  const dataDir = server.localConfig.dataDir;

  // GET /api/agent-groups
  server.get('/api/agent-groups', async () => {
    return loadGroups(dataDir);
  });

  // POST /api/agent-groups
  server.post<{
    Body: { name: string; description?: string; strategy: string; members: AgentGroupMember[] };
  }>('/api/agent-groups', async (request, reply) => {
    const { name, description, strategy, members } = request.body;
    if (!name) return reply.code(400).send({ error: 'name is required' });

    const groups = loadGroups(dataDir);
    const group: AgentGroup = {
      id: crypto.randomUUID(),
      name,
      description,
      strategy: strategy as AgentGroup['strategy'],
      members: members ?? [],
      createdAt: new Date().toISOString(),
    };
    groups.push(group);
    saveGroups(dataDir, groups);
    return reply.code(201).send(group);
  });

  // PATCH /api/agent-groups/:id
  server.patch<{
    Params: { id: string };
    Body: Partial<{ name: string; description: string; strategy: string; members: AgentGroupMember[] }>;
  }>('/api/agent-groups/:id', async (request, reply) => {
    const groups = loadGroups(dataDir);
    const idx = groups.findIndex(g => g.id === request.params.id);
    if (idx === -1) return reply.code(404).send({ error: 'Group not found' });

    const { name, description, strategy, members } = request.body;
    if (name !== undefined) groups[idx].name = name;
    if (description !== undefined) groups[idx].description = description;
    if (strategy !== undefined) groups[idx].strategy = strategy as AgentGroup['strategy'];
    if (members !== undefined) groups[idx].members = members;
    saveGroups(dataDir, groups);
    return groups[idx];
  });

  // DELETE /api/agent-groups/:id
  server.delete<{
    Params: { id: string };
  }>('/api/agent-groups/:id', async (request, reply) => {
    const groups = loadGroups(dataDir);
    const idx = groups.findIndex(g => g.id === request.params.id);
    if (idx === -1) return reply.code(404).send({ error: 'Group not found' });

    groups.splice(idx, 1);
    saveGroups(dataDir, groups);
    return { deleted: true };
  });

  // POST /api/agent-groups/:id/run — execute a group (placeholder — delegates to orchestrator)
  server.post<{
    Params: { id: string };
    Body: { task: string; teamId?: string };
  }>('/api/agent-groups/:id/run', async (request, reply) => {
    const groups = loadGroups(dataDir);
    const group = groups.find(g => g.id === request.params.id);
    if (!group) return reply.code(404).send({ error: 'Group not found' });

    const { task } = request.body;
    if (!task) return reply.code(400).send({ error: 'task is required' });

    // Placeholder: return job ID for async execution
    return {
      jobId: crypto.randomUUID(),
      groupId: group.id,
      groupName: group.name,
      strategy: group.strategy,
      memberCount: group.members.length,
      task,
      status: 'queued',
    };
  });
};
