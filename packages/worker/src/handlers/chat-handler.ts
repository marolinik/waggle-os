import type { Job } from 'bullmq';
import type { JobData } from '../job-processor.js';
import type { Db } from '../../../server/src/db/connection.js';
import { runAgentLoop } from '@waggle/agent';
import { createWorkerExecutionContext } from '../execution-policy.js';

const LITELLM_URL = process.env.LITELLM_URL ?? 'http://localhost:4000/v1';
const LITELLM_API_KEY = process.env.LITELLM_API_KEY ?? process.env.LITELLM_MASTER_KEY ?? 'sk-waggle-dev';
const DEFAULT_MODEL = process.env.DEFAULT_MODEL ?? 'claude-sonnet';

export async function chatHandler(job: Job<JobData>, _db: Db): Promise<Record<string, unknown>> {
  const { teamId, userId, input } = job.data;
  const message = (input as Record<string, unknown>).message as string ?? '';
  const model = (input as Record<string, unknown>).model as string ?? DEFAULT_MODEL;
  const { systemPrompt, tools } = createWorkerExecutionContext(teamId);

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
