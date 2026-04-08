/**
 * chat-governance.ts — Direct governance permission lookup for the chat route.
 *
 * Replaces the HTTP loopback call to /api/team/governance/permissions
 * with a direct function call that accesses the same data source.
 */

import { WaggleConfig } from '@waggle/core';

/** Cached governance policies — same TTL as team.ts route cache (5 minutes) */
const policyCache = new Map<string, { permissions: unknown; fetchedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export interface GovernancePolicies {
  blockedTools?: string[];
  allowedSources?: string[];
}

/**
 * Fetch governance permissions for the given workspace directly from the team server.
 * This replaces the HTTP self-call (`fetch('http://127.0.0.1:${port}/api/team/governance/permissions')`)
 * that previously looped back through the Fastify route.
 *
 * Returns the role-specific policy if found, or undefined if governance is unavailable.
 */
export async function getGovernancePermissions(
  dataDir: string,
  workspaceId: string,
  teamRole: string | undefined,
): Promise<GovernancePolicies | undefined> {
  const waggleConfig = new WaggleConfig(dataDir);
  const teamServer = waggleConfig.getTeamServer();
  if (!teamServer?.url || !teamServer?.token) {
    return undefined;
  }

  // Check cache
  const cacheKey = workspaceId ?? 'default';
  const cached = policyCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return extractRolePolicy(cached.permissions, teamRole);
  }

  try {
    const teamSlug = (teamServer as unknown as Record<string, unknown>).teamSlug as string ?? 'default';
    const url = `${teamServer.url.replace(/\/$/, '')}/api/teams/${teamSlug}/capability-policies`;
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${teamServer.token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const policies = await res.json();

    policyCache.set(cacheKey, { permissions: policies, fetchedAt: Date.now() });
    return extractRolePolicy(policies, teamRole);
  } catch {
    // Return cached if available, otherwise undefined
    if (cached) return extractRolePolicy(cached.permissions, teamRole);
    return undefined;
  }
}

/** Extract blocked tools from the role-specific policy within the permissions array */
function extractRolePolicy(
  permissions: unknown,
  teamRole: string | undefined,
): GovernancePolicies | undefined {
  if (!Array.isArray(permissions)) return undefined;
  const rolePolicy = permissions.find(
    (p: Record<string, unknown>) => p.role === teamRole,
  );
  if (rolePolicy?.blockedTools) {
    return { blockedTools: rolePolicy.blockedTools as string[] };
  }
  return undefined;
}
