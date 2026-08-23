import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { buildServer } from '../../src/index.js';
import {
  messages,
  teamCapabilityOverrides,
  teamCapabilityRequests,
  teamMembers,
  teams,
  users,
} from '../../src/db/schema.js';

const SLUG_PREFIX = 'cap-bind-';
const MISSING_ID = '00000000-0000-4000-8000-000000000000';

describe('Capability Governance Routes', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;
  let attackerAdminId: string;
  let victimOwnerId: string;
  let attackerTeamId: string;
  let victimTeamId: string;

  beforeAll(async () => {
    server = await buildServer();

    await server.db.execute(sql`DELETE FROM messages WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE ${SLUG_PREFIX + '%'})`);
    await server.db.execute(sql`DELETE FROM team_capability_requests WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE ${SLUG_PREFIX + '%'})`);
    await server.db.execute(sql`DELETE FROM team_capability_overrides WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE ${SLUG_PREFIX + '%'})`);
    await server.db.execute(sql`DELETE FROM team_capability_policies WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE ${SLUG_PREFIX + '%'})`);
    await server.db.execute(sql`DELETE FROM team_members WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE ${SLUG_PREFIX + '%'})`);
    await server.db.execute(sql`DELETE FROM teams WHERE slug LIKE ${SLUG_PREFIX + '%'}`);
    await server.db.execute(sql`DELETE FROM users WHERE clerk_id LIKE 'cap_bind_%'`);

    const [attackerAdmin, victimOwner] = await server.db.insert(users).values([
      {
        clerkId: 'cap_bind_attacker_admin',
        displayName: 'Capability Attacker Admin',
        email: 'cap-bind-attacker@test.invalid',
      },
      {
        clerkId: 'cap_bind_victim_owner',
        displayName: 'Capability Victim Owner',
        email: 'cap-bind-victim@test.invalid',
      },
    ]).returning();
    attackerAdminId = attackerAdmin.id;
    victimOwnerId = victimOwner.id;

    const [attackerTeam, victimTeam] = await server.db.insert(teams).values([
      { name: 'Capability Attacker Team', slug: `${SLUG_PREFIX}attacker`, ownerId: attackerAdminId },
      { name: 'Capability Victim Team', slug: `${SLUG_PREFIX}victim`, ownerId: victimOwnerId },
    ]).returning();
    attackerTeamId = attackerTeam.id;
    victimTeamId = victimTeam.id;

    await server.db.insert(teamMembers).values([
      { teamId: attackerTeamId, userId: attackerAdminId, role: 'admin' },
      { teamId: victimTeamId, userId: victimOwnerId, role: 'owner' },
    ]);

    server._authHandler.fn = async function (request, reply) {
      const testUserId = request.headers['x-test-user-id'] as string;
      if (!testUserId) {
        return reply.code(401).send({ error: 'Missing x-test-user-id header' });
      }
      request.userId = testUserId;
      request.clerkId = 'test';
    };
  });

  afterAll(async () => {
    await server.db.execute(sql`DELETE FROM messages WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE ${SLUG_PREFIX + '%'})`);
    await server.db.execute(sql`DELETE FROM team_capability_requests WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE ${SLUG_PREFIX + '%'})`);
    await server.db.execute(sql`DELETE FROM team_capability_overrides WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE ${SLUG_PREFIX + '%'})`);
    await server.db.execute(sql`DELETE FROM team_capability_policies WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE ${SLUG_PREFIX + '%'})`);
    await server.db.execute(sql`DELETE FROM team_members WHERE team_id IN (SELECT id FROM teams WHERE slug LIKE ${SLUG_PREFIX + '%'})`);
    await server.db.execute(sql`DELETE FROM teams WHERE slug LIKE ${SLUG_PREFIX + '%'}`);
    await server.db.execute(sql`DELETE FROM users WHERE clerk_id LIKE 'cap_bind_%'`);
    await server.close();
  });

  it('does not let an authorized admin delete another team\'s override by ID', async () => {
    const [victimOverride] = await server.db.insert(teamCapabilityOverrides).values({
      teamId: victimTeamId,
      capabilityName: 'victim-secret-tool',
      capabilityType: 'mcp',
      decision: 'blocked',
      decidedBy: victimOwnerId,
    }).returning();

    const foreign = await server.inject({
      method: 'DELETE',
      url: `/api/teams/${SLUG_PREFIX}attacker/capability-overrides/${victimOverride.id}`,
      headers: { 'x-test-user-id': attackerAdminId },
    });
    const missing = await server.inject({
      method: 'DELETE',
      url: `/api/teams/${SLUG_PREFIX}attacker/capability-overrides/${MISSING_ID}`,
      headers: { 'x-test-user-id': attackerAdminId },
    });

    expect({ statusCode: foreign.statusCode, body: foreign.body }).toEqual({
      statusCode: missing.statusCode,
      body: missing.body,
    });
    const [stored] = await server.db.select().from(teamCapabilityOverrides).where(and(
      eq(teamCapabilityOverrides.id, victimOverride.id),
      eq(teamCapabilityOverrides.teamId, victimTeamId),
    ));
    expect(stored).toBeDefined();
  });

  it('still lets a same-team admin delete an override', async () => {
    const [ownOverride] = await server.db.insert(teamCapabilityOverrides).values({
      teamId: attackerTeamId,
      capabilityName: 'attacker-team-tool',
      capabilityType: 'mcp',
      decision: 'blocked',
      decidedBy: attackerAdminId,
    }).returning();

    const response = await server.inject({
      method: 'DELETE',
      url: `/api/teams/${SLUG_PREFIX}attacker/capability-overrides/${ownOverride.id}`,
      headers: { 'x-test-user-id': attackerAdminId },
    });

    expect(response.statusCode).toBe(204);
    const [stored] = await server.db.select().from(teamCapabilityOverrides).where(eq(teamCapabilityOverrides.id, ownOverride.id));
    expect(stored).toBeUndefined();
  });

  it('does not let an authorized admin decide another team\'s request by ID', async () => {
    const [victimRequest] = await server.db.insert(teamCapabilityRequests).values({
      teamId: victimTeamId,
      requestedBy: victimOwnerId,
      capabilityName: 'victim-requested-tool',
      capabilityType: 'mcp',
      justification: 'Victim-only request',
    }).returning();

    const foreign = await server.inject({
      method: 'PATCH',
      url: `/api/teams/${SLUG_PREFIX}attacker/capability-requests/${victimRequest.id}`,
      headers: { 'x-test-user-id': attackerAdminId },
      payload: { status: 'rejected', reason: 'cross-team decision attempt' },
    });
    const missing = await server.inject({
      method: 'PATCH',
      url: `/api/teams/${SLUG_PREFIX}attacker/capability-requests/${MISSING_ID}`,
      headers: { 'x-test-user-id': attackerAdminId },
      payload: { status: 'rejected', reason: 'missing request' },
    });

    expect({ statusCode: foreign.statusCode, body: foreign.body }).toEqual({
      statusCode: missing.statusCode,
      body: missing.body,
    });
    const [stored] = await server.db.select().from(teamCapabilityRequests).where(and(
      eq(teamCapabilityRequests.id, victimRequest.id),
      eq(teamCapabilityRequests.teamId, victimTeamId),
    ));
    expect(stored?.status).toBe('pending');
    expect(stored?.decidedBy).toBeNull();
  });

  it('still lets a same-team admin decide a pending request', async () => {
    const [ownRequest] = await server.db.insert(teamCapabilityRequests).values({
      teamId: attackerTeamId,
      requestedBy: attackerAdminId,
      capabilityName: 'attacker-requested-tool',
      capabilityType: 'mcp',
      justification: 'Same-team request',
    }).returning();

    const response = await server.inject({
      method: 'PATCH',
      url: `/api/teams/${SLUG_PREFIX}attacker/capability-requests/${ownRequest.id}`,
      headers: { 'x-test-user-id': attackerAdminId },
      payload: { status: 'rejected', reason: 'same-team decision' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: ownRequest.id,
      teamId: attackerTeamId,
      status: 'rejected',
      decidedBy: attackerAdminId,
    });
  });
});
