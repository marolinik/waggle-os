import { eq, and } from 'drizzle-orm';
import { tasks } from '../db/schema.js';
import type { Db } from '../db/connection.js';

export interface TaskFilters {
  status?: string;
  assignee?: string;
  priority?: string;
}

export class TaskService {
  constructor(private db: Db) {}

  async create(
    teamId: string,
    userId: string,
    data: { title: string; description?: string; priority?: string; parentTaskId?: string },
  ) {
    const [task] = await this.db.insert(tasks).values({
      teamId,
      title: data.title,
      description: data.description,
      priority: data.priority ?? 'normal',
      createdBy: userId,
      parentTaskId: data.parentTaskId,
    }).returning();
    return task;
  }

  async list(teamId: string, filters?: TaskFilters) {
    const conditions = [eq(tasks.teamId, teamId)];

    if (filters?.status) {
      conditions.push(eq(tasks.status, filters.status));
    }
    if (filters?.assignee) {
      conditions.push(eq(tasks.assignedTo, filters.assignee));
    }
    if (filters?.priority) {
      conditions.push(eq(tasks.priority, filters.priority));
    }

    return this.db
      .select()
      .from(tasks)
      .where(and(...conditions));
  }

  async get(taskId: string) {
    const [task] = await this.db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);
    return task ?? null;
  }

  async update(
    taskId: string,
    data: {
      title?: string;
      description?: string;
      status?: string;
      priority?: string;
      assignedTo?: string | null;
    },
  ) {
    const setData: Record<string, unknown> = { updatedAt: new Date() };
    if (data.title !== undefined) setData.title = data.title;
    if (data.description !== undefined) setData.description = data.description;
    if (data.status !== undefined) setData.status = data.status;
    if (data.priority !== undefined) setData.priority = data.priority;
    if (data.assignedTo !== undefined) setData.assignedTo = data.assignedTo;

    const [updated] = await this.db
      .update(tasks)
      .set(setData)
      .where(eq(tasks.id, taskId))
      .returning();
    return updated ?? null;
  }

  async claim(taskId: string, userId: string) {
    const [updated] = await this.db
      .update(tasks)
      .set({ assignedTo: userId, status: 'claimed', updatedAt: new Date() })
      .where(eq(tasks.id, taskId))
      .returning();
    return updated ?? null;
  }
}
