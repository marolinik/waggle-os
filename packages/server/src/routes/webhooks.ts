import type { FastifyInstance } from 'fastify';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export async function webhookRoutes(fastify: FastifyInstance) {
  fastify.post('/api/webhooks/clerk', async (request, reply) => {
    // In production: verify Clerk webhook signature via svix
    const event = request.body as { type: string; data: Record<string, any> };

    switch (event.type) {
      case 'user.created': {
        const d = event.data;
        await fastify.db.insert(users).values({
          clerkId: d.id,
          displayName: `${d.first_name ?? ''} ${d.last_name ?? ''}`.trim() || d.id,
          email: d.email_addresses?.[0]?.email_address ?? '',
          avatarUrl: d.image_url ?? null,
        }).onConflictDoNothing();
        break;
      }
      case 'user.updated': {
        const d = event.data;
        await fastify.db.update(users)
          .set({
            displayName: `${d.first_name ?? ''} ${d.last_name ?? ''}`.trim(),
            email: d.email_addresses?.[0]?.email_address ?? '',
            avatarUrl: d.image_url ?? null,
            updatedAt: new Date(),
          })
          .where(eq(users.clerkId, d.id));
        break;
      }
      case 'user.deleted': {
        const d = event.data;
        await fastify.db.delete(users).where(eq(users.clerkId, d.id));
        break;
      }
    }

    return reply.code(200).send({ received: true });
  });
}
