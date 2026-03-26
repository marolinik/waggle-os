/**
 * Cron Tools — agent tools for managing cron schedules.
 *
 * Tools:
 *   create_schedule  — Create a new cron schedule
 *   list_schedules   — List all cron schedules
 *   delete_schedule  — Delete a schedule by name
 *   trigger_schedule — Manually trigger a schedule
 *
 * All tools make HTTP requests to the cron REST API on localhost:3333.
 */

import type { ToolDefinition } from './tools.js';

const BASE_URL = 'http://127.0.0.1:3333';

/**
 * Basic cron expression validation.
 * Accepts 5-field (minute hour dom month dow) and 6-field (with seconds) expressions.
 * Also accepts common shorthands like @daily, @hourly, @weekly, @monthly, @yearly.
 */
function isValidCronExpression(expr: string): boolean {
  const trimmed = expr.trim();

  // Allow common shorthand expressions
  if (/^@(yearly|annually|monthly|weekly|daily|midnight|hourly)$/.test(trimmed)) {
    return true;
  }

  const parts = trimmed.split(/\s+/);
  // Standard cron: 5 fields (min hour dom month dow)
  // Extended cron: 6 fields (sec min hour dom month dow)
  if (parts.length < 5 || parts.length > 6) {
    return false;
  }

  // Each field should contain valid cron characters
  const cronFieldPattern = /^[\d*,/\-?LW#]+$/;
  return parts.every(part => cronFieldPattern.test(part));
}

export function createCronTools(): ToolDefinition[] {
  return [
    // 1. create_schedule — Create a new cron schedule
    {
      name: 'create_schedule',
      description:
        'Create a new cron schedule. Supports standard 5-field cron expressions (minute hour day-of-month month day-of-week) and shorthands like @daily, @hourly.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Human-readable name for the schedule (e.g., "Daily memory cleanup")',
          },
          cron_expression: {
            type: 'string',
            description:
              'Cron expression (e.g., "0 3 * * *" for daily at 3am, "*/15 * * * *" for every 15 minutes)',
          },
          job_type: {
            type: 'string',
            enum: ['agent_task', 'memory_consolidation', 'workspace_health'],
            description: 'Type of job to run (default: agent_task)',
          },
          job_data: {
            type: 'string',
            description: 'Optional JSON string with job configuration data',
          },
          workspace_id: {
            type: 'string',
            description: 'Workspace ID (required for agent_task type)',
          },
        },
        required: ['name', 'cron_expression'],
      },
      execute: async (args) => {
        const name = args.name as string;
        const cronExpr = args.cron_expression as string;
        const jobType = (args.job_type as string) || 'agent_task';
        const jobData = args.job_data as string | undefined;
        const workspaceId = args.workspace_id as string | undefined;

        // Validate cron expression format
        if (!isValidCronExpression(cronExpr)) {
          return `Error: Invalid cron expression "${cronExpr}". Expected 5-field format (minute hour day-of-month month day-of-week) or a shorthand like @daily, @hourly.`;
        }

        // Parse optional job data JSON
        let jobConfig: Record<string, unknown> | undefined;
        if (jobData) {
          try {
            jobConfig = JSON.parse(jobData);
          } catch {
            return `Error: Invalid JSON in job_data: "${jobData}"`;
          }
        }

        try {
          const response = await fetch(`${BASE_URL}/api/cron`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name,
              cronExpr,
              jobType,
              jobConfig,
              workspaceId,
            }),
          });

          if (!response.ok) {
            const err = await response.json().catch(() => ({ error: response.statusText }));
            return `Failed to create schedule: ${(err as any).error || response.statusText}`;
          }

          const created = (await response.json()) as {
            id: number;
            name: string;
            cronExpr: string;
            jobType: string;
            nextRunAt: string | null;
            enabled: boolean;
          };

          const nextRun = created.nextRunAt
            ? new Date(created.nextRunAt).toLocaleString()
            : 'unknown';

          return [
            `Schedule created successfully.`,
            ``,
            `- **Name**: ${created.name}`,
            `- **Expression**: \`${created.cronExpr}\``,
            `- **Job type**: ${created.jobType}`,
            `- **Enabled**: ${created.enabled ? 'yes' : 'no'}`,
            `- **Next run**: ${nextRun}`,
            `- **ID**: ${created.id}`,
          ].join('\n');
        } catch (err) {
          return `Error creating schedule: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },

    // 2. list_schedules — List all cron schedules
    {
      name: 'list_schedules',
      description: 'List all cron schedules with their expression, next run time, and enabled status.',
      parameters: {
        type: 'object',
        properties: {},
      },
      execute: async () => {
        try {
          const response = await fetch(`${BASE_URL}/api/cron`);
          if (!response.ok) {
            const err = await response.json().catch(() => ({ error: response.statusText }));
            return `Failed to list schedules: ${(err as any).error || response.statusText}`;
          }

          const data = (await response.json()) as {
            schedules: Array<{
              id: number;
              name: string;
              cronExpr: string;
              jobType: string;
              enabled: boolean;
              lastRunAt: string | null;
              nextRunAt: string | null;
            }>;
            count: number;
          };

          if (data.count === 0) {
            return 'No cron schedules configured.';
          }

          const lines: string[] = [
            `## Cron Schedules (${data.count})`,
            '',
            '| # | Name | Expression | Job Type | Enabled | Next Run |',
            '|---|------|------------|----------|---------|----------|',
          ];

          for (const [i, s] of data.schedules.entries()) {
            const nextRun = s.nextRunAt
              ? new Date(s.nextRunAt).toLocaleString()
              : '—';
            const enabled = s.enabled ? 'yes' : 'no';
            lines.push(
              `| ${i + 1} | ${s.name} | \`${s.cronExpr}\` | ${s.jobType} | ${enabled} | ${nextRun} |`,
            );
          }

          return lines.join('\n');
        } catch (err) {
          return `Error listing schedules: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },

    // 3. delete_schedule — Delete a schedule by name
    {
      name: 'delete_schedule',
      description: 'Delete a cron schedule by name. Finds the schedule by name, then deletes it by ID.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Name of the schedule to delete',
          },
        },
        required: ['name'],
      },
      execute: async (args) => {
        const name = args.name as string;

        try {
          // Step 1: List all schedules and find by name
          const listResp = await fetch(`${BASE_URL}/api/cron`);
          if (!listResp.ok) {
            return `Failed to list schedules: ${listResp.statusText}`;
          }

          const listData = (await listResp.json()) as {
            schedules: Array<{ id: number; name: string }>;
          };

          const match = listData.schedules.find(
            s => s.name.toLowerCase() === name.toLowerCase(),
          );
          if (!match) {
            return `Schedule "${name}" not found. Use \`list_schedules\` to see available schedules.`;
          }

          // Step 2: Delete by ID
          const delResp = await fetch(`${BASE_URL}/api/cron/${match.id}`, {
            method: 'DELETE',
          });

          if (!delResp.ok) {
            const err = await delResp.json().catch(() => ({ error: delResp.statusText }));
            return `Failed to delete schedule: ${(err as any).error || delResp.statusText}`;
          }

          return `Schedule "${match.name}" (ID: ${match.id}) deleted successfully.`;
        } catch (err) {
          return `Error deleting schedule: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },

    // 4. trigger_schedule — Manually trigger a schedule
    {
      name: 'trigger_schedule',
      description: 'Manually trigger a cron schedule by name. Runs the scheduled job immediately.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Name of the schedule to trigger',
          },
        },
        required: ['name'],
      },
      execute: async (args) => {
        const name = args.name as string;

        try {
          // Step 1: List all schedules and find by name
          const listResp = await fetch(`${BASE_URL}/api/cron`);
          if (!listResp.ok) {
            return `Failed to list schedules: ${listResp.statusText}`;
          }

          const listData = (await listResp.json()) as {
            schedules: Array<{ id: number; name: string }>;
          };

          const match = listData.schedules.find(
            s => s.name.toLowerCase() === name.toLowerCase(),
          );
          if (!match) {
            return `Schedule "${name}" not found. Use \`list_schedules\` to see available schedules.`;
          }

          // Step 2: Trigger by ID
          const triggerResp = await fetch(
            `${BASE_URL}/api/cron/${match.id}/trigger`,
            { method: 'POST' },
          );

          if (!triggerResp.ok) {
            const err = await triggerResp.json().catch(() => ({ error: triggerResp.statusText }));
            return `Failed to trigger schedule: ${(err as any).error || triggerResp.statusText}`;
          }

          const result = (await triggerResp.json()) as {
            triggered: boolean;
            id: number;
            nextRunAt?: string;
          };

          const nextRun = result.nextRunAt
            ? new Date(result.nextRunAt).toLocaleString()
            : 'unknown';

          return `Schedule "${match.name}" triggered successfully. Next run: ${nextRun}`;
        } catch (err) {
          return `Error triggering schedule: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },
  ];
}
