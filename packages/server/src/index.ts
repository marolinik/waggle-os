import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { loadConfig, type ServerConfig } from './config.js';
import { createDb, type Db } from './db/connection.js';
import redisPlugin from './plugins/redis.js';
import authPlugin from './plugins/auth.js';
import { webhookRoutes } from './routes/webhooks.js';
import { teamRoutes } from './routes/teams.js';
import { agentRoutes } from './routes/agents.js';
import { taskRoutes } from './routes/tasks.js';
import { messageRoutes } from './routes/messages.js';
import { knowledgeRoutes } from './routes/knowledge.js';
import { resourceRoutes } from './routes/resources.js';
import { jobRoutes } from './routes/jobs.js';
import { cronRoutes } from './routes/cron.js';
import { suggestionRoutes } from './routes/suggestions.js';
import { scoutRoutes } from './routes/scout.js';
import { auditRoutes } from './routes/audit.js';
import { capabilityGovernanceRoutes } from './routes/capability-governance.js';
import { analyticsRoutes } from './routes/analytics.js';
import { wsGateway } from './ws/gateway.js';
import { JobService } from './services/job-service.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: ServerConfig;
    db: Db;
    jobService: JobService;
  }
}

export async function buildServer(configOverrides?: Partial<ServerConfig>) {
  const config = { ...loadConfig(), ...configOverrides };

  const server = Fastify({ logger: true });

  server.decorate('config', config);

  const db = createDb(config.databaseUrl);
  server.decorate('db', db);

  await server.register(cors, { origin: config.corsOrigin });
  await server.register(websocket);
  await server.register(redisPlugin);
  await server.register(authPlugin);
  await server.register(webhookRoutes);
  await server.register(teamRoutes);
  await server.register(agentRoutes);
  await server.register(taskRoutes);
  await server.register(messageRoutes);
  await server.register(knowledgeRoutes);
  // Job service (must be decorated before job routes)
  const jobService = new JobService(db, config.redisUrl);
  server.decorate('jobService', jobService);
  server.addHook('onClose', async () => { await jobService.close(); });

  await server.register(resourceRoutes);
  await server.register(jobRoutes);
  await server.register(cronRoutes);
  await server.register(suggestionRoutes);
  await server.register(scoutRoutes);
  await server.register(auditRoutes);
  await server.register(capabilityGovernanceRoutes);
  await server.register(analyticsRoutes);
  await server.register(wsGateway);

  // Health check
  server.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  return server;
}

// Start server if run directly
const isDirectRun = process.argv[1]?.replace(/\\/g, '/').includes('server/src/index');
if (isDirectRun) {
  const server = await buildServer();
  await server.listen({ port: server.config.port, host: server.config.host });
  console.log(`Waggle server listening on ${server.config.host}:${server.config.port}`);
}
