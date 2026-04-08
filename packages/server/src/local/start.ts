import { startService } from './service.js';
import { createLogger } from './logger.js';

const log = createLogger('startup');

const skipLiteLLM = process.argv.includes('--skip-litellm') || process.env.WAGGLE_SKIP_LITELLM === '1';

log.info('Starting Waggle service...', { skipLiteLLM });

startService({ skipLiteLLM })
  .then(({ server }) => {
    const addr = server.server.address();
    const port = typeof addr === 'object' && addr ? addr.port : '?';
    const llm = server.agentState.llmProvider;
    log.info(`Server listening on http://127.0.0.1:${port}`);
    log.info(`LLM provider: ${llm.provider} (${llm.health}) — ${llm.detail}`);
    log.info(`Health check: http://127.0.0.1:${port}/health`);
  })
  .catch((err) => {
    log.error('Failed to start:', err.message ?? err);
    process.exit(1);
  });
