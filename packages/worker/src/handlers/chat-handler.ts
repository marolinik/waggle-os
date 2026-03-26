import type { Job } from 'bullmq';
import type { JobData } from '../job-processor.js';
import type { Db } from '../../../server/src/db/connection.js';
import { runAgentLoop, createSystemTools } from '@waggle/agent';

const LITELLM_URL = process.env.LITELLM_URL ?? 'http://localhost:4000/v1';
const LITELLM_API_KEY = process.env.LITELLM_API_KEY ?? process.env.LITELLM_MASTER_KEY ?? 'sk-waggle-dev';
const DEFAULT_MODEL = process.env.DEFAULT_MODEL ?? 'claude-sonnet';

export async function chatHandler(job: Job<JobData>, _db: Db): Promise<Record<string, unknown>> {
  const { userId, input } = job.data;
  const message = (input as Record<string, unknown>).message as string ?? '';
  const model = (input as Record<string, unknown>).model as string ?? DEFAULT_MODEL;
  const workspaceDir = (input as Record<string, unknown>).workspaceDir as string ?? process.cwd();

  const tools = createSystemTools(workspaceDir);

  const systemPrompt = [
    'You are a Waggle AI agent. You help users with tasks using your tools.',
    'Use system tools (bash, read_file, write_file, edit_file, search_files, search_content) to interact with the workspace.',
    'Be helpful, concise, and proactive.',
  ].join('\n');

  const result = await runAgentLoop({
    litellmUrl: LITELLM_URL,
    litellmApiKey: LITELLM_API_KEY,
    model,
    systemPrompt,
    tools,
    messages: [{ role: 'user', content: message }],
  });

  return {
    response: result.content,
    userId,
    model,
    toolsUsed: result.toolsUsed,
    tokensUsed: result.usage.inputTokens + result.usage.outputTokens,
  };
}
