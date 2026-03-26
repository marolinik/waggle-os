/**
 * Task handler — runs agent loop with task context.
 * Replaces the stub implementation with real agent invocation.
 */

import type { Job } from 'bullmq';
import type { JobData } from '../job-processor.js';
import type { Db } from '../../../server/src/db/connection.js';
import { tasks } from '../../../server/src/db/schema.js';
import { eq } from 'drizzle-orm';
import { runAgentLoop, createSystemTools } from '@waggle/agent';

const LITELLM_URL = process.env.LITELLM_URL ?? 'http://localhost:4000/v1';
const LITELLM_API_KEY = process.env.LITELLM_API_KEY ?? process.env.LITELLM_MASTER_KEY ?? 'sk-waggle-dev';
const DEFAULT_MODEL = process.env.DEFAULT_MODEL ?? 'claude-sonnet';

export async function taskHandler(job: Job<JobData>, db: Db): Promise<Record<string, unknown>> {
  const { teamId, userId, input } = job.data;
  const taskId = (input as Record<string, unknown>).taskId as string | undefined;

  if (!taskId) {
    throw new Error('taskHandler requires input.taskId');
  }

  // Load task from DB to verify it exists and belongs to the team
  const [task] = await db.select().from(tasks)
    .where(eq(tasks.id, taskId));

  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  if (task.teamId !== teamId) {
    throw new Error(`Task ${taskId} does not belong to team ${teamId}`);
  }

  // Mark task as in-progress
  await db.update(tasks)
    .set({ status: 'in_progress', assignedTo: userId, updatedAt: new Date() })
    .where(eq(tasks.id, taskId));

  // Build prompt from task context
  const systemPrompt = [
    'You are a Waggle AI agent executing an assigned task.',
    'Complete the task described below. Be thorough but concise.',
    'Use system tools (bash, read_file, write_file, edit_file, search_files, search_content) to interact with the workspace.',
    '',
    `Task: ${task.title}`,
    task.description ? `Details: ${task.description}` : '',
    task.priority ? `Priority: ${task.priority}` : '',
  ].filter(Boolean).join('\n');

  const workspaceDir = (input as Record<string, unknown>).workspaceDir as string ?? process.cwd();
  const model = (input as Record<string, unknown>).model as string ?? DEFAULT_MODEL;

  try {
    const tools = createSystemTools(workspaceDir);

    const result = await runAgentLoop({
      litellmUrl: LITELLM_URL,
      litellmApiKey: LITELLM_API_KEY,
      model,
      systemPrompt,
      tools,
      messages: [{ role: 'user', content: `Execute this task: ${task.title}${task.description ? '\n\n' + task.description : ''}` }],
    });

    // Mark task as completed
    await db.update(tasks)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(eq(tasks.id, taskId));

    return {
      taskId,
      taskTitle: task.title,
      status: 'completed',
      result: result.content,
      toolsUsed: result.toolsUsed,
      tokensUsed: result.usage.inputTokens + result.usage.outputTokens,
      userId,
    };
  } catch (err) {
    // Reset task to open on failure (not stuck in in_progress)
    await db.update(tasks)
      .set({ status: 'open', updatedAt: new Date() })
      .where(eq(tasks.id, taskId));

    throw err; // Let the worker mark the job as failed
  }
}
