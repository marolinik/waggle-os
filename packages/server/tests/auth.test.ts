import { createHmac } from 'node:crypto';
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { buildServer } from '../src/index.js';
import { users } from '../src/db/schema.js';
import { sql } from 'drizzle-orm';
import { UserService } from '../src/services/user-service.js';

const SIGNING_KEY = Buffer.from('waggle-clerk-auth-integration-test-secret');
const SIGNING_SECRET = `whsec_${SIGNING_KEY.toString('base64')}`;

function signedHeaders(payload: object) {
  const id = 'msg_waggle_clerk_auth_integration';
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', SIGNING_KEY)
    .update(`${id}.${timestamp}.${JSON.stringify(payload)}`)
    .digest('base64');

  return {
    'svix-id': id,
    'svix-timestamp': String(timestamp),
    'svix-signature': `v1,${signature}`,
  };
}

describe('Clerk webhook', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;
  let originalSigningSecret: string | undefined;

  beforeAll(async () => {
    originalSigningSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
    process.env.CLERK_WEBHOOK_SIGNING_SECRET = SIGNING_SECRET;
    server = await buildServer();
  });

  afterAll(async () => {
    await server.db.execute(sql`DELETE FROM users WHERE clerk_id LIKE 'test_%'`);
    await server.close();
    if (originalSigningSecret === undefined) {
      delete process.env.CLERK_WEBHOOK_SIGNING_SECRET;
    } else {
      process.env.CLERK_WEBHOOK_SIGNING_SECRET = originalSigningSecret;
    }
  });

  it('creates user on user.created webhook', async () => {
    const payload = {
      type: 'user.created',
      data: {
        id: 'test_clerk_001',
        first_name: 'Marko',
        last_name: 'Markovic',
        email_addresses: [{ email_address: 'marko@test.com' }],
        image_url: 'https://example.com/avatar.jpg',
      },
    };
    const response = await server.inject({
      method: 'POST',
      url: '/api/webhooks/clerk',
      headers: signedHeaders(payload),
      payload,
    });
    expect(response.statusCode).toBe(200);

    const [user] = await server.db.select().from(users).where(sql`clerk_id = 'test_clerk_001'`);
    expect(user).toBeDefined();
    expect(user.displayName).toBe('Marko Markovic');
    expect(user.email).toBe('marko@test.com');
  });

  it('updates user on user.updated webhook', async () => {
    const payload = {
      type: 'user.updated',
      data: {
        id: 'test_clerk_001',
        first_name: 'Marko',
        last_name: 'Updated',
        email_addresses: [{ email_address: 'marko@test.com' }],
        image_url: null,
      },
    };
    const response = await server.inject({
      method: 'POST',
      url: '/api/webhooks/clerk',
      headers: signedHeaders(payload),
      payload,
    });
    expect(response.statusCode).toBe(200);

    const [user] = await server.db.select().from(users).where(sql`clerk_id = 'test_clerk_001'`);
    expect(user.displayName).toBe('Marko Updated');
  });

  it('deletes user on user.deleted webhook', async () => {
    const payload = {
      type: 'user.deleted',
      data: {
        id: 'test_clerk_001',
      },
    };
    const response = await server.inject({
      method: 'POST',
      url: '/api/webhooks/clerk',
      headers: signedHeaders(payload),
      payload,
    });
    expect(response.statusCode).toBe(200);

    const result = await server.db.select().from(users).where(sql`clerk_id = 'test_clerk_001'`);
    expect(result).toHaveLength(0);
  });
});

describe('UserService.upsertFromClerk', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;
  let userService: UserService;

  beforeAll(async () => {
    server = await buildServer();
    userService = new UserService(server.db);
  });

  afterAll(async () => {
    await server.db.execute(sql`DELETE FROM users WHERE clerk_id LIKE 'test_upsert_%'`);
    await server.close();
  });

  it('creates a new user when clerkId does not exist', async () => {
    const user = await userService.upsertFromClerk({
      clerkId: 'test_upsert_new',
      displayName: 'New User',
      email: 'new@test.com',
      avatarUrl: 'https://example.com/avatar.jpg',
    });

    expect(user).toBeDefined();
    expect(user.clerkId).toBe('test_upsert_new');
    expect(user.displayName).toBe('New User');
    expect(user.email).toBe('new@test.com');
    expect(user.id).toBeTruthy();
  });

  it('updates existing user when clerkId already exists', async () => {
    // First create
    await userService.upsertFromClerk({
      clerkId: 'test_upsert_existing',
      displayName: 'Original Name',
      email: 'original@test.com',
    });

    // Then upsert with updated data
    const updated = await userService.upsertFromClerk({
      clerkId: 'test_upsert_existing',
      displayName: 'Updated Name',
      email: 'updated@test.com',
      avatarUrl: 'https://new-avatar.com/pic.jpg',
    });

    expect(updated.displayName).toBe('Updated Name');
    expect(updated.email).toBe('updated@test.com');
    expect(updated.avatarUrl).toBe('https://new-avatar.com/pic.jpg');
  });

  it('getByClerkId returns null for unknown clerkId', async () => {
    const result = await userService.getByClerkId('nonexistent_clerk_id');
    expect(result).toBeNull();
  });
});
