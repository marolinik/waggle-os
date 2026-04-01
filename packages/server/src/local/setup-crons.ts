/**
 * Cron schedule seeding — ensures all default and proactive cron routines exist.
 * Extracted from index.ts for readability.
 */

import type { CronStore, CronJobType } from '@waggle/core';

export function seedDefaultCrons(cronStore: CronStore): void {
  // Seed default routines on first run
  if (cronStore.list().length === 0) {
    cronStore.create({ name: 'Memory consolidation', cronExpr: '0 3 * * *', jobType: 'memory_consolidation' });
    cronStore.create({ name: 'Workspace health check', cronExpr: '0 8 * * 1', jobType: 'workspace_health' });
  }

  const existing = cronStore.list();
  const ensure = (name: string, cronExpr: string, jobType: CronJobType, jobConfig?: Record<string, unknown>, enabled?: boolean) => {
    if (!existing.find(s => s.name === name)) {
      cronStore.create({ name, cronExpr, jobType, ...(jobConfig && { jobConfig }), ...(enabled !== undefined && { enabled }) });
    }
  };

  ensure('Marketplace sync', '0 2 * * 0', 'memory_consolidation', { action: 'marketplace_sync' });
  ensure('Morning briefing', '0 8 * * *', 'proactive', { action: 'morning_briefing' });
  ensure('Stale workspace check', '0 9 * * 1', 'proactive', { action: 'stale_workspace_check' });
  ensure('Task reminder', '30 8 * * *', 'proactive', { action: 'task_reminder' });
  ensure('Capability suggestion', '0 10 * * 3', 'proactive', { action: 'capability_suggestion' });
  ensure('Prompt optimization', '0 2 * * *', 'prompt_optimization', undefined, false);
  ensure('Monthly assessment', '0 6 1 * *', 'monthly_assessment');
  ensure('Index reconciliation', '0 4 * * 0', 'memory_consolidation', { action: 'index_reconcile' });
}
