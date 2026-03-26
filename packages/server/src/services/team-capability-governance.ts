import { eq, and, desc } from 'drizzle-orm';
import {
  teamCapabilityPolicies,
  teamCapabilityOverrides,
  teamCapabilityRequests,
} from '../db/schema.js';
import type { Db } from '../db/connection.js';

export interface EffectivePermissions {
  role: string;
  allowedSources: string[];
  blockedTools: string[];
  approvalThreshold: string;
  overrides: Map<string, 'approved' | 'blocked'>;
}

export type PermissionResult =
  | 'allowed'
  | 'blocked'
  | 'needs_approval'
  | 'source_not_allowed';

const RISK_LEVELS: Record<string, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
};

/**
 * Check if a given risk level exceeds the threshold.
 * Threshold 'none' means nothing triggers approval.
 */
export function riskExceedsThreshold(risk: string, threshold: string): boolean {
  if (threshold === 'none') return false;
  const riskVal = RISK_LEVELS[risk] ?? 0;
  const thresholdVal = RISK_LEVELS[threshold] ?? 0;
  return riskVal > thresholdVal;
}

/**
 * Resolve permission for a single capability against effective permissions.
 *
 * Resolution order:
 * 1. Check overrides — if override exists, return its decision immediately
 * 2. Check role policy (source allowed? tool blocked?)
 * 3. If policy allows but risk exceeds threshold → needs_approval
 * 4. Otherwise → allowed
 */
export function resolvePermission(
  perms: EffectivePermissions,
  capabilityName: string,
  capabilityType: string,
  risk: string = 'low',
): PermissionResult {
  // 1. Override wins
  const override = perms.overrides.get(capabilityName);
  if (override === 'approved') return 'allowed';
  if (override === 'blocked') return 'blocked';

  // 2. Blocked tool check
  if (perms.blockedTools.includes(capabilityName)) return 'blocked';

  // 3. Source allowed check
  if (!perms.allowedSources.includes(capabilityType)) return 'source_not_allowed';

  // 4. Risk threshold check
  if (riskExceedsThreshold(risk, perms.approvalThreshold)) return 'needs_approval';

  return 'allowed';
}

/**
 * Filter a list of capabilities by permissions, returning only those allowed or needing approval.
 */
export function filterByPermissions(
  perms: EffectivePermissions,
  capabilities: Array<{ name: string; type: string; risk?: string }>,
): Array<{ name: string; type: string; risk?: string; result: PermissionResult }> {
  return capabilities.map((cap) => ({
    ...cap,
    result: resolvePermission(perms, cap.name, cap.type, cap.risk ?? 'low'),
  }));
}

export interface DefaultPolicy {
  role: string;
  allowedSources: string[];
  blockedTools: string[];
  approvalThreshold: string;
}

/**
 * Returns the 3 default role policies for a new team.
 */
export function getDefaultPolicies(): DefaultPolicy[] {
  return [
    {
      role: 'owner',
      allowedSources: ['native', 'skill', 'plugin', 'mcp'],
      blockedTools: [],
      approvalThreshold: 'none',
    },
    {
      role: 'admin',
      allowedSources: ['native', 'skill', 'plugin', 'mcp'],
      blockedTools: [],
      approvalThreshold: 'none',
    },
    {
      role: 'member',
      allowedSources: ['native', 'skill'],
      blockedTools: ['bash', 'delete_skill'],
      approvalThreshold: 'medium',
    },
  ];
}

export class TeamCapabilityGovernance {
  constructor(private db: Db) {}

  /**
   * Get effective permissions for a role in a team, including overrides.
   */
  async getEffectivePermissions(teamId: string, role: string): Promise<EffectivePermissions> {
    // Get role policy
    const [policy] = await this.db
      .select()
      .from(teamCapabilityPolicies)
      .where(and(
        eq(teamCapabilityPolicies.teamId, teamId),
        eq(teamCapabilityPolicies.role, role),
      ))
      .limit(1);

    // Get overrides for this team
    const overrideRows = await this.db
      .select()
      .from(teamCapabilityOverrides)
      .where(eq(teamCapabilityOverrides.teamId, teamId));

    const overrides = new Map<string, 'approved' | 'blocked'>();
    for (const row of overrideRows) {
      overrides.set(row.capabilityName, row.decision as 'approved' | 'blocked');
    }

    if (!policy) {
      // Fallback: no policy found, restrictive defaults
      return {
        role,
        allowedSources: [],
        blockedTools: [],
        approvalThreshold: 'none',
        overrides,
      };
    }

    return {
      role,
      allowedSources: policy.allowedSources as string[],
      blockedTools: policy.blockedTools as string[],
      approvalThreshold: policy.approvalThreshold,
      overrides,
    };
  }

  async listPolicies(teamId: string) {
    return this.db
      .select()
      .from(teamCapabilityPolicies)
      .where(eq(teamCapabilityPolicies.teamId, teamId));
  }

  async upsertPolicy(
    teamId: string,
    role: string,
    data: {
      allowedSources?: string[];
      blockedTools?: string[];
      approvalThreshold?: string;
    },
    updatedBy: string,
  ) {
    const [existing] = await this.db
      .select()
      .from(teamCapabilityPolicies)
      .where(and(
        eq(teamCapabilityPolicies.teamId, teamId),
        eq(teamCapabilityPolicies.role, role),
      ))
      .limit(1);

    if (existing) {
      const [updated] = await this.db
        .update(teamCapabilityPolicies)
        .set({
          ...(data.allowedSources !== undefined && { allowedSources: data.allowedSources }),
          ...(data.blockedTools !== undefined && { blockedTools: data.blockedTools }),
          ...(data.approvalThreshold !== undefined && { approvalThreshold: data.approvalThreshold }),
          updatedBy,
          updatedAt: new Date(),
        })
        .where(eq(teamCapabilityPolicies.id, existing.id))
        .returning();
      return updated;
    }

    const defaults = getDefaultPolicies().find((p) => p.role === role);
    const [created] = await this.db
      .insert(teamCapabilityPolicies)
      .values({
        teamId,
        role,
        allowedSources: data.allowedSources ?? defaults?.allowedSources ?? [],
        blockedTools: data.blockedTools ?? defaults?.blockedTools ?? [],
        approvalThreshold: data.approvalThreshold ?? defaults?.approvalThreshold ?? 'none',
        updatedBy,
      })
      .returning();
    return created;
  }

  async seedDefaultPolicies(teamId: string, seedBy: string) {
    const defaults = getDefaultPolicies();
    const results = [];
    for (const policy of defaults) {
      const [row] = await this.db
        .insert(teamCapabilityPolicies)
        .values({
          teamId,
          role: policy.role,
          allowedSources: policy.allowedSources,
          blockedTools: policy.blockedTools,
          approvalThreshold: policy.approvalThreshold,
          updatedBy: seedBy,
        })
        .returning();
      results.push(row);
    }
    return results;
  }

  // --- Overrides ---

  async listOverrides(teamId: string) {
    return this.db
      .select()
      .from(teamCapabilityOverrides)
      .where(eq(teamCapabilityOverrides.teamId, teamId))
      .orderBy(desc(teamCapabilityOverrides.createdAt));
  }

  async createOverride(
    teamId: string,
    data: {
      capabilityName: string;
      capabilityType: string;
      decision: 'approved' | 'blocked';
      reason?: string;
    },
    decidedBy: string,
  ) {
    const [row] = await this.db
      .insert(teamCapabilityOverrides)
      .values({
        teamId,
        capabilityName: data.capabilityName,
        capabilityType: data.capabilityType,
        decision: data.decision,
        reason: data.reason ?? '',
        decidedBy,
      })
      .returning();
    return row;
  }

  async deleteOverride(overrideId: string) {
    const [deleted] = await this.db
      .delete(teamCapabilityOverrides)
      .where(eq(teamCapabilityOverrides.id, overrideId))
      .returning();
    return deleted ?? null;
  }

  // --- Requests ---

  async listRequests(teamId: string, status?: string) {
    const conditions = [eq(teamCapabilityRequests.teamId, teamId)];
    if (status) {
      conditions.push(eq(teamCapabilityRequests.status, status));
    }
    return this.db
      .select()
      .from(teamCapabilityRequests)
      .where(and(...conditions))
      .orderBy(desc(teamCapabilityRequests.createdAt));
  }

  async submitRequest(
    teamId: string,
    requestedBy: string,
    data: {
      capabilityName: string;
      capabilityType: string;
      justification: string;
    },
  ): Promise<{ duplicate: true } | { duplicate: false; request: typeof teamCapabilityRequests.$inferSelect }> {
    // Duplicate check: pending request for same capability by same user
    const [existing] = await this.db
      .select()
      .from(teamCapabilityRequests)
      .where(and(
        eq(teamCapabilityRequests.teamId, teamId),
        eq(teamCapabilityRequests.requestedBy, requestedBy),
        eq(teamCapabilityRequests.capabilityName, data.capabilityName),
        eq(teamCapabilityRequests.status, 'pending'),
      ))
      .limit(1);

    if (existing) return { duplicate: true };

    const [request] = await this.db
      .insert(teamCapabilityRequests)
      .values({
        teamId,
        requestedBy,
        capabilityName: data.capabilityName,
        capabilityType: data.capabilityType,
        justification: data.justification,
      })
      .returning();

    return { duplicate: false, request };
  }

  async getRequest(requestId: string) {
    const [row] = await this.db
      .select()
      .from(teamCapabilityRequests)
      .where(eq(teamCapabilityRequests.id, requestId))
      .limit(1);
    return row ?? null;
  }

  async decideRequest(
    requestId: string,
    decidedBy: string,
    decision: 'approved' | 'rejected',
    reason?: string,
  ) {
    const [updated] = await this.db
      .update(teamCapabilityRequests)
      .set({
        status: decision,
        decidedBy,
        decisionReason: reason ?? null,
        decidedAt: new Date(),
      })
      .where(eq(teamCapabilityRequests.id, requestId))
      .returning();
    return updated ?? null;
  }
}
