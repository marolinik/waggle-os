/**
 * chat-governance.ts — Direct governance permission lookup for the chat route.
 *
 * Replaces the HTTP loopback call to /api/team/governance/permissions
 * with a direct function call that accesses the same data source.
 */

import { WaggleConfig } from '@waggle/core';
import { fetchTeamServer } from '../team-server-egress.js';

/** A role policy as the team server sends it, before any field is read. */
type RolePolicyRecord = Record<string, unknown>;

/** Cached governance policies — same TTL as team.ts route cache (5 minutes) */
const policyCache = new Map<string, { permissions: RolePolicyRecord[]; fetchedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export interface GovernancePolicies {
  blockedTools?: string[];
  allowedSources?: string[];
}

/**
 * The outcome of a lookup, kept distinct because the caller owes each one a
 * different response. Returning one `undefined` for all of them made "this team
 * has no restrictions" indistinguishable from "we could not find out", and a
 * chat turn silently ran ungoverned either way.
 *
 * - `none` — no team server is configured, so there is no policy to enforce.
 * - `policy` — the lookup succeeded. `policies` is undefined when the team has
 *   no entry for this role, which is also "no restrictions".
 * - `unavailable` — the team server could not be reached or refused the
 *   request. Transient, and the caller may proceed.
 * - `invalid` — the team server answered with something this client cannot
 *   read. A fault, not an absent policy: the caller cannot safely proceed.
 *
 * The function never throws. Every failure is one of these outcomes, so the
 * decision about what a failed lookup means lives here rather than at the call
 * site.
 */
export type GovernanceLookup =
  | { status: 'none' }
  | { status: 'policy'; policies: GovernancePolicies | undefined }
  | { status: 'unavailable'; reason: string }
  | { status: 'invalid'; reason: string };

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isPlainObject(value: unknown): value is RolePolicyRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * An array holding something the role lookup cannot read is a fault: reading
 * `role` off it throws, and that throw used to escape the module.
 *
 * A payload that is not an array at all is not a fault. It carries no policy
 * this client can match, which is the same answer as a team with no entry for
 * this role, and it has always been handled that way.
 */
function isUnreadablePolicyArray(value: unknown): boolean {
  return Array.isArray(value) && !value.every(isPlainObject);
}

/**
 * Look up the governance policy for one workspace.
 *
 * Successful payloads are cached for the TTL, per workspace. A payload is
 * validated before it is cached, so one unreadable response cannot make every
 * later lookup fail for the rest of the window.
 */
export async function getGovernancePermissions(
  dataDir: string,
  workspaceId: string,
  teamRole: string | undefined,
): Promise<GovernanceLookup> {
  let teamServer: ReturnType<WaggleConfig['getTeamServer']>;
  try {
    teamServer = new WaggleConfig(dataDir).getTeamServer();
  } catch (error) {
    // Reading the local config can fail on its own (unreadable or malformed
    // config file). That says nothing about the team's policy.
    return { status: 'unavailable', reason: `team configuration unreadable: ${describe(error)}` };
  }
  if (!teamServer?.url || !teamServer?.token) {
    return { status: 'none' };
  }

  const cacheKey = workspaceId ?? 'default';
  const cached = policyCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { status: 'policy', policies: extractRolePolicy(cached.permissions, teamRole) };
  }

  try {
    const teamSlug = (teamServer as unknown as Record<string, unknown>).teamSlug as string ?? 'default';
    const url = `${teamServer.url.replace(/\/$/, '')}/api/teams/${teamSlug}/capability-policies`;
    const res = await fetchTeamServer(url, {
      headers: { 'Authorization': `Bearer ${teamServer.token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const payload = await res.json();

    if (isUnreadablePolicyArray(payload)) {
      return {
        status: 'invalid',
        reason: 'the team server returned a capability-policies entry this client cannot read',
      };
    }

    const permissions = Array.isArray(payload) ? payload as RolePolicyRecord[] : [];
    policyCache.set(cacheKey, { permissions, fetchedAt: Date.now() });
    return { status: 'policy', policies: extractRolePolicy(permissions, teamRole) };
  } catch (error) {
    // A stale policy is closer to the team's intent than no policy at all.
    if (cached) return { status: 'policy', policies: extractRolePolicy(cached.permissions, teamRole) };
    return { status: 'unavailable', reason: describe(error) };
  }
}

/** Extract blocked tools from the role-specific policy within the permissions array */
function extractRolePolicy(
  permissions: RolePolicyRecord[],
  teamRole: string | undefined,
): GovernancePolicies | undefined {
  const rolePolicy = permissions.find(policy => policy.role === teamRole);
  if (rolePolicy?.blockedTools) {
    return { blockedTools: rolePolicy.blockedTools as string[] };
  }
  return undefined;
}
