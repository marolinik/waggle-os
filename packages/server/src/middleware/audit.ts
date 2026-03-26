import type { AuditService } from '../services/audit-service.js';

export function createAuditWrapper(auditService: AuditService) {
  return async function auditAction(params: {
    userId: string;
    teamId?: string;
    agentName: string;
    actionType: string;
    description: string;
    beforeState?: Record<string, unknown>;
    requiresApproval?: boolean;
    action: () => Promise<Record<string, unknown>>;
  }): Promise<{ auditEntry: any; result?: Record<string, unknown> }> {
    if (params.requiresApproval) {
      // Don't execute -- just log for approval
      const auditEntry = await auditService.log({
        userId: params.userId,
        teamId: params.teamId,
        agentName: params.agentName,
        actionType: params.actionType,
        description: params.description,
        beforeState: params.beforeState,
        requiresApproval: true,
      });
      return { auditEntry };
    }

    // Execute and log
    const result = await params.action();
    const auditEntry = await auditService.log({
      userId: params.userId,
      teamId: params.teamId,
      agentName: params.agentName,
      actionType: params.actionType,
      description: params.description,
      beforeState: params.beforeState,
      afterState: result,
    });
    return { auditEntry, result };
  };
}
