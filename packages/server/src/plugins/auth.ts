import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createClerkClient } from '@clerk/fastify';
import { UserService } from '../services/user-service.js';

export type AuthenticateFn = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

declare module 'fastify' {
  interface FastifyRequest {
    userId: string; // our internal user UUID
    clerkId: string;
  }
  interface FastifyInstance {
    authenticate: AuthenticateFn;
    _authHandler: { fn: AuthenticateFn };
  }
}

export default fp(async function authPlugin(fastify: FastifyInstance) {
  const clerk = createClerkClient({ secretKey: fastify.config.clerkSecretKey });
  const userService = new UserService(fastify.db);

  const clerkAuth: AuthenticateFn = async function (request, reply) {
    const token = request.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return reply.code(401).send({ error: 'Missing authorization token' });
    }

    try {
      const payload = await (clerk as any).verifyToken(token);
      request.clerkId = payload.sub;

      // Look up internal user, auto-provision if not found
      let user = await userService.getByClerkId(payload.sub);

      if (!user) {
        // Auto-create user from Clerk JWT claims (self-healing: works even if webhook was missed)
        const clerkUser = await clerk.users.getUser(payload.sub);
        user = await userService.upsertFromClerk({
          clerkId: payload.sub,
          displayName: `${clerkUser.firstName ?? ''} ${clerkUser.lastName ?? ''}`.trim() || payload.sub,
          email: clerkUser.emailAddresses?.[0]?.emailAddress ?? '',
          avatarUrl: clerkUser.imageUrl ?? null,
        });
      }

      request.userId = user.id;
    } catch {
      return reply.code(401).send({ error: 'Invalid token' });
    }
  };

  // Use an indirection object so tests can swap the auth handler after routes are registered
  const handler = { fn: clerkAuth };
  fastify.decorate('_authHandler', handler);

  fastify.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    return handler.fn(request, reply);
  });
});
