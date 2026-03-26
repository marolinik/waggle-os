import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/index.js';
import { users, proactivePatterns, suggestionsLog } from '../src/db/schema.js';
import { sql, eq } from 'drizzle-orm';
import { ProactiveService } from '../src/services/proactive-service.js';

describe('Proactive Engine (Task 3.17)', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;
  let userId: string;
  let secondUserId: string;
  let proactiveService: ProactiveService;

  beforeAll(async () => {
    server = await buildServer();

    // Clean up leftover test data
    await server.db.execute(sql`DELETE FROM suggestions_log WHERE user_id IN (SELECT id FROM users WHERE clerk_id LIKE 'protest_%')`);
    await server.db.execute(sql`DELETE FROM proactive_patterns WHERE name LIKE 'test_%'`);
    await server.db.execute(sql`DELETE FROM users WHERE clerk_id LIKE 'protest_%'`);
    // Also clean any seeded patterns for a clean slate
    await server.db.execute(sql`DELETE FROM suggestions_log`);
    await server.db.execute(sql`DELETE FROM proactive_patterns`);

    // Create test users
    const [user] = await server.db.insert(users).values({
      clerkId: 'protest_user1',
      displayName: 'Proactive User',
      email: 'protest_user1@test.com',
    }).returning();
    userId = user.id;

    const [user2] = await server.db.insert(users).values({
      clerkId: 'protest_user2',
      displayName: 'Proactive User 2',
      email: 'protest_user2@test.com',
    }).returning();
    secondUserId = user2.id;

    proactiveService = new ProactiveService(server.db);

    // Seed patterns
    await proactiveService.ensurePatternsSeeded();

    // Override auth handler
    server._authHandler.fn = async function (request: any, reply: any) {
      const testUserId = request.headers['x-test-user-id'] as string;
      if (!testUserId) {
        return reply.code(401).send({ error: 'Missing x-test-user-id header' });
      }
      request.userId = testUserId;
      request.clerkId = 'test';
    };
  });

  afterAll(async () => {
    await server.db.execute(sql`DELETE FROM suggestions_log WHERE user_id IN (SELECT id FROM users WHERE clerk_id LIKE 'protest_%')`);
    await server.db.execute(sql`DELETE FROM proactive_patterns`);
    await server.db.execute(sql`DELETE FROM users WHERE clerk_id LIKE 'protest_%'`);
    await server.close();
  });

  it('seeds built-in patterns', async () => {
    const patterns = await server.db.select().from(proactivePatterns);
    expect(patterns.length).toBe(5);
    const names = patterns.map(p => p.name);
    expect(names).toContain('recurring_task');
    expect(names).toContain('data_report');
    expect(names).toContain('relevant_to_others');
    expect(names).toContain('expensive_model');
    expect(names).toContain('manual_repetition');
  });

  it('does not re-seed if patterns exist', async () => {
    await proactiveService.ensurePatternsSeeded();
    const patterns = await server.db.select().from(proactivePatterns);
    expect(patterns.length).toBe(5); // still 5, not 10
  });

  it('pattern triggers create suggestion when context matches', async () => {
    const result = await proactiveService.evaluate(userId, {
      repeatCount: 5, // triggers 'recurring_task' (cron) pattern
    });

    expect(result).toBeTruthy();
    expect(result!.status).toBe('pending');
    expect(result!.pattern.suggestionType).toBe('cron');
  });

  it('max 1 suggestion per interaction (second evaluate returns null)', async () => {
    // User already has a pending suggestion from previous test
    const result = await proactiveService.evaluate(userId, {
      hasData: true, // would trigger 'data_report' (dashboard) pattern
    });

    expect(result).toBeNull();
  });

  it('dismissed pattern not re-suggested', async () => {
    // Clear all pending suggestions for secondUserId so we start fresh
    await server.db.execute(sql`DELETE FROM suggestions_log WHERE user_id = ${secondUserId}`);

    // First, trigger a suggestion for secondUserId
    const suggestion = await proactiveService.evaluate(secondUserId, {
      repeatCount: 4, // triggers cron pattern
    });
    expect(suggestion).toBeTruthy();

    // Dismiss it
    await proactiveService.updateStatus(suggestion!.id, 'dismissed');

    // Clear pending count so the MAX check doesn't block us
    // (dismissed doesn't count as pending, so evaluate should proceed)

    // Try to trigger the same pattern again
    const result2 = await proactiveService.evaluate(secondUserId, {
      repeatCount: 10,
    });

    // Should be null because the cron pattern was dismissed
    // It might match a different pattern though, so check specifically
    if (result2) {
      expect(result2.pattern.suggestionType).not.toBe('cron');
    }
  });

  it('accept/dismiss/snooze updates status via API', async () => {
    // Clear suggestions for userId
    await server.db.execute(sql`DELETE FROM suggestions_log WHERE user_id = ${userId}`);

    // Create a new suggestion
    const suggestion = await proactiveService.evaluate(userId, {
      expensiveModel: true, // triggers 'upgrade' pattern
    });
    expect(suggestion).toBeTruthy();

    // Accept via API
    const response = await server.inject({
      method: 'PATCH',
      url: `/api/suggestions/${suggestion!.id}`,
      headers: { 'x-test-user-id': userId },
      payload: { status: 'accepted' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('accepted');
  });

  it('list pending returns only pending suggestions via API', async () => {
    // Clear and create fresh data
    await server.db.execute(sql`DELETE FROM suggestions_log WHERE user_id = ${userId}`);

    // Create a pending suggestion directly
    const patterns = await server.db.select().from(proactivePatterns);
    const pattern = patterns[0];

    await server.db.insert(suggestionsLog).values([
      { userId, patternId: pattern.id, context: { test: 1 }, status: 'pending' },
      { userId, patternId: pattern.id, context: { test: 2 }, status: 'accepted' },
      { userId, patternId: pattern.id, context: { test: 3 }, status: 'dismissed' },
    ]);

    const response = await server.inject({
      method: 'GET',
      url: '/api/suggestions',
      headers: { 'x-test-user-id': userId },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(Array.isArray(body)).toBe(true);
    // Only pending ones should be returned
    expect(body.every((s: any) => s.status === 'pending')).toBe(true);
    expect(body.length).toBe(1);
  });

  it('rejects invalid status in PATCH', async () => {
    const patterns = await server.db.select().from(proactivePatterns);
    const [suggestion] = await server.db.insert(suggestionsLog).values({
      userId,
      patternId: patterns[0].id,
      context: {},
      status: 'pending',
    }).returning();

    const response = await server.inject({
      method: 'PATCH',
      url: `/api/suggestions/${suggestion.id}`,
      headers: { 'x-test-user-id': userId },
      payload: { status: 'invalid' },
    });

    expect(response.statusCode).toBe(400);
  });
});
