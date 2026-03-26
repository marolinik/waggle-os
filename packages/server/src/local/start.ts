import { startService } from './service.js';

const skipLiteLLM = process.argv.includes('--skip-litellm') || process.env.WAGGLE_SKIP_LITELLM === '1';

console.log('[waggle] Starting Waggle service...', { skipLiteLLM });

startService({ skipLiteLLM })
  .then(({ server }) => {
    const addr = server.server.address();
    const port = typeof addr === 'object' && addr ? addr.port : '?';
    const llm = server.agentState.llmProvider;
    console.log(`[waggle] Server listening on http://127.0.0.1:${port}`);
    console.log(`[waggle] LLM provider: ${llm.provider} (${llm.health}) — ${llm.detail}`);
    console.log(`[waggle] Health check: http://127.0.0.1:${port}/health`);
  })
  .catch((err) => {
    console.error('[waggle] Failed to start:', err.message ?? err);
    process.exit(1);
  });
