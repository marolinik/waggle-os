import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { runChannelChatTurn } from '../src/local/channels/chat-client.js';
import { securityMiddleware } from '../src/local/security-middleware.js';

describe('channel loopback authentication', () => {
  const servers: ReturnType<typeof Fastify>[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map(server => server.close()));
  });

  it('completes through a bearer-protected local chat route', async () => {
    const originalTrustLocalhost = process.env.WAGGLE_TRUST_LOCALHOST;
    process.env.WAGGLE_TRUST_LOCALHOST = '0';
    const server = Fastify();
    servers.push(server);
    try {
      await server.register(securityMiddleware, { sessionToken: 'channel-session-token' });
      server.post('/api/chat', async (_request, reply) => {
        reply.type('text/event-stream');
        return 'event: done\ndata: {"content":"protected channel reply"}\n\n';
      });
      await server.listen({ host: '127.0.0.1', port: 0 });
      const address = server.server.address();
      if (!address || typeof address === 'string') throw new Error('Expected a TCP address');

      const result = await runChannelChatTurn({
        port: address.port,
        message: 'hello from Telegram',
        workspace: 'default',
        session: 'channel-telegram-chat-1',
        sessionToken: 'channel-session-token',
      });

      expect(result).toEqual({
        content: 'protected channel reply',
        approvalRequired: false,
        error: undefined,
      });
    } finally {
      if (originalTrustLocalhost === undefined) delete process.env.WAGGLE_TRUST_LOCALHOST;
      else process.env.WAGGLE_TRUST_LOCALHOST = originalTrustLocalhost;
    }
  });
});
