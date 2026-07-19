import { createHmac } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webhookRoutes } from '../../src/routes/webhooks.js';

const SIGNING_KEY = Buffer.from('waggle-clerk-webhook-test-secret');
const SIGNING_SECRET = `whsec_${SIGNING_KEY.toString('base64')}`;

const createEvent = {
  type: 'user.created',
  data: {
    id: 'clerk_webhook_user',
    first_name: 'Ada',
    last_name: 'Lovelace',
    email_addresses: [{ email_address: 'ada@example.com' }],
    image_url: 'https://example.com/ada.png',
  },
};

function signedHeaders(payload: object, timestamp = Math.floor(Date.now() / 1000)) {
  const id = 'msg_waggle_clerk_test';
  const body = JSON.stringify(payload);
  const signature = createHmac('sha256', SIGNING_KEY)
    .update(`${id}.${timestamp}.${body}`)
    .digest('base64');

  return {
    'svix-id': id,
    'svix-timestamp': String(timestamp),
    'svix-signature': `v1,${signature}`,
  };
}

function createDbDouble() {
  const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn(() => ({ onConflictDoNothing }));
  const insert = vi.fn(() => ({ values }));

  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set }));

  const deleteWhere = vi.fn().mockResolvedValue(undefined);
  const deleteFrom = vi.fn(() => ({ where: deleteWhere }));

  return {
    db: { insert, update, delete: deleteFrom },
    mutations: { insert, values, update, deleteFrom },
  };
}

describe('Clerk webhook authenticity', () => {
  let app: FastifyInstance;
  let mutations: ReturnType<typeof createDbDouble>['mutations'];
  let originalSigningSecret: string | undefined;

  beforeEach(async () => {
    originalSigningSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
    process.env.CLERK_WEBHOOK_SIGNING_SECRET = SIGNING_SECRET;

    const dbDouble = createDbDouble();
    mutations = dbDouble.mutations;
    app = Fastify();
    app.decorate('db', dbDouble.db as never);
    await app.register(webhookRoutes);
  });

  afterEach(async () => {
    await app.close();
    if (originalSigningSecret === undefined) {
      delete process.env.CLERK_WEBHOOK_SIGNING_SECRET;
    } else {
      process.env.CLERK_WEBHOOK_SIGNING_SECRET = originalSigningSecret;
    }
  });

  it.each([
    ['user.created', createEvent.data],
    ['user.updated', createEvent.data],
    ['user.deleted', { id: createEvent.data.id }],
  ])('rejects an unsigned %s event before any database mutation', async (type, data) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/clerk',
      payload: { type, data },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'Invalid webhook signature' });
    expect(mutations.insert).not.toHaveBeenCalled();
    expect(mutations.update).not.toHaveBeenCalled();
    expect(mutations.deleteFrom).not.toHaveBeenCalled();
  });

  it('rejects an otherwise signed event when its timestamp is stale', async () => {
    const staleTimestamp = Math.floor(Date.now() / 1000) - 301;
    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/clerk',
      headers: signedHeaders(createEvent, staleTimestamp),
      payload: createEvent,
    });

    expect(response.statusCode).toBe(400);
    expect(mutations.insert).not.toHaveBeenCalled();
  });

  it('rejects a signature that was generated for a different body', async () => {
    const tamperedEvent = {
      ...createEvent,
      data: { ...createEvent.data, email_addresses: [{ email_address: 'attacker@example.com' }] },
    };
    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/clerk',
      headers: signedHeaders(createEvent),
      payload: tamperedEvent,
    });

    expect(response.statusCode).toBe(400);
    expect(mutations.insert).not.toHaveBeenCalled();
  });

  it('fails closed when the Clerk webhook signing secret is not configured', async () => {
    delete process.env.CLERK_WEBHOOK_SIGNING_SECRET;

    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/clerk',
      headers: signedHeaders(createEvent),
      payload: createEvent,
    });

    expect(response.statusCode).toBe(400);
    expect(mutations.insert).not.toHaveBeenCalled();
  });

  it('preserves a correctly signed user.created event and its field mapping', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/clerk',
      headers: signedHeaders(createEvent),
      payload: createEvent,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ received: true });
    expect(mutations.values).toHaveBeenCalledWith({
      clerkId: 'clerk_webhook_user',
      displayName: 'Ada Lovelace',
      email: 'ada@example.com',
      avatarUrl: 'https://example.com/ada.png',
    });
  });

  it('preserves correctly signed user.updated and user.deleted events', async () => {
    const updateEvent = { ...createEvent, type: 'user.updated' };
    const deleteEvent = { type: 'user.deleted', data: { id: createEvent.data.id } };

    for (const event of [updateEvent, deleteEvent]) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks/clerk',
        headers: signedHeaders(event),
        payload: event,
      });
      expect(response.statusCode).toBe(200);
    }

    expect(mutations.update).toHaveBeenCalledOnce();
    expect(mutations.deleteFrom).toHaveBeenCalledOnce();
  });
});
