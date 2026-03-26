/**
 * Task routes — workspace-scoped task board.
 *
 * JSONL-based storage in `~/.waggle/workspaces/{id}/tasks.jsonl`.
 * Each task: id, title, status (open|in_progress|done), assignee, creator, timestamps.
 */

import type { FastifyPluginAsync } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { emitNotification } from './notifications.js';

export interface TeamTask {
  id: string;
  title: string;
  status: 'open' | 'in_progress' | 'done';
  assigneeId?: string;
  assigneeName?: string;
  creatorId?: string;
  creatorName?: string;
  createdAt: string;
  updatedAt: string;
}

function tasksPath(dataDir: string, workspaceId: string): string {
  return path.join(dataDir, 'workspaces', workspaceId, 'tasks.jsonl');
}

export function readTasks(dataDir: string, workspaceId: string): TeamTask[] {
  const fp = tasksPath(dataDir, workspaceId);
  if (!fs.existsSync(fp)) return [];
  const content = fs.readFileSync(fp, 'utf-8').trim();
  if (!content) return [];
  const tasks: TeamTask[] = [];
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      tasks.push(JSON.parse(line));
    } catch { /* skip malformed */ }
  }
  return tasks;
}

function writeTasks(dataDir: string, workspaceId: string, tasks: TeamTask[]): void {
  const dir = path.join(dataDir, 'workspaces', workspaceId);
  fs.mkdirSync(dir, { recursive: true });
  const fp = tasksPath(dataDir, workspaceId);
  const content = tasks.map(t => JSON.stringify(t)).join('\n') + (tasks.length ? '\n' : '');
  fs.writeFileSync(fp, content);
}

export const taskRoutes: FastifyPluginAsync = async (fastify) => {
  const dataDir = (fastify as any).localConfig.dataDir as string;

  /**
   * D3: GET /api/tasks — global task view across all workspaces.
   * Team Lead / CEO persona needs cross-workspace task visibility.
   */
  fastify.get<{
    Querystring: { status?: string };
  }>('/api/tasks', async (request, reply) => {
    const workspaces = (fastify as any).workspaceManager?.list() ?? [];
    const allTasks: Array<TeamTask & { workspaceId: string; workspaceName: string }> = [];

    for (const ws of workspaces) {
      const wsTasks = readTasks(dataDir, ws.id);
      for (const task of wsTasks) {
        allTasks.push({ ...task, workspaceId: ws.id, workspaceName: ws.name });
      }
    }

    let filtered = allTasks;
    if (request.query.status) {
      filtered = filtered.filter(t => t.status === request.query.status);
    }

    // Sort by most recent first
    filtered.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return reply.code(200).send({ tasks: filtered, total: filtered.length });
  });

  /**
   * GET /api/workspaces/:id/tasks
   * List all tasks for a workspace.
   */
  fastify.get<{
    Params: { id: string };
    Querystring: { status?: string };
  }>('/api/workspaces/:id/tasks', async (request, reply) => {
    const { id } = request.params;
    let tasks = readTasks(dataDir, id);

    if (request.query.status) {
      tasks = tasks.filter(t => t.status === request.query.status);
    }

    return reply.code(200).send({ tasks });
  });

  /**
   * POST /api/workspaces/:id/tasks
   * Create a new task.
   */
  fastify.post<{
    Params: { id: string };
    Body: {
      title: string;
      assigneeId?: string;
      assigneeName?: string;
      creatorId?: string;
      creatorName?: string;
    };
  }>('/api/workspaces/:id/tasks', async (request, reply) => {
    const { id } = request.params;
    const { title, assigneeId, assigneeName, creatorId, creatorName } = request.body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return reply.code(400).send({ error: 'Title is required' });
    }

    const task: TeamTask = {
      id: randomUUID(),
      title: title.trim(),
      status: 'open',
      assigneeId,
      assigneeName,
      creatorId,
      creatorName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const tasks = readTasks(dataDir, id);
    tasks.push(task);
    writeTasks(dataDir, id, tasks);

    emitNotification(fastify, {
      title: 'Task update',
      body: task.title || 'New task',
      category: 'task',
      actionUrl: '/tasks',
    });

    return reply.code(201).send(task);
  });

  /**
   * PATCH /api/workspaces/:id/tasks/:taskId
   * Update task (status, title, assignee).
   */
  fastify.patch<{
    Params: { id: string; taskId: string };
    Body: {
      title?: string;
      status?: 'open' | 'in_progress' | 'done';
      assigneeId?: string;
      assigneeName?: string;
    };
  }>('/api/workspaces/:id/tasks/:taskId', async (request, reply) => {
    const { id, taskId } = request.params;
    const tasks = readTasks(dataDir, id);
    const idx = tasks.findIndex(t => t.id === taskId);

    if (idx === -1) {
      return reply.code(404).send({ error: 'Task not found' });
    }

    const update = request.body;
    if (update.title !== undefined) tasks[idx].title = update.title.trim();
    if (update.status !== undefined) tasks[idx].status = update.status;
    if (update.assigneeId !== undefined) tasks[idx].assigneeId = update.assigneeId;
    if (update.assigneeName !== undefined) tasks[idx].assigneeName = update.assigneeName;
    tasks[idx].updatedAt = new Date().toISOString();

    writeTasks(dataDir, id, tasks);
    return reply.code(200).send(tasks[idx]);
  });

  /**
   * DELETE /api/workspaces/:id/tasks/:taskId
   * Delete a task.
   */
  fastify.delete<{
    Params: { id: string; taskId: string };
  }>('/api/workspaces/:id/tasks/:taskId', async (request, reply) => {
    const { id, taskId } = request.params;
    const tasks = readTasks(dataDir, id);
    const filtered = tasks.filter(t => t.id !== taskId);

    if (filtered.length === tasks.length) {
      return reply.code(404).send({ error: 'Task not found' });
    }

    writeTasks(dataDir, id, filtered);
    return reply.code(204).send();
  });
};
