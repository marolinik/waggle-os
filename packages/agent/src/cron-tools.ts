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

/**
 * #17: heuristic minimum-interval guard for ai_task schedules. A full-agent
 * turn per firing means real LLM spend — reject expressions that fire more
 * often than roughly every 5 minutes. Heuristic on the minute field (the
 * scheduler tick is 60s, so sub-minute precision is unreachable anyway).
 */
function firesTooOften(expr: string): boolean {
  const trimmed = expr.trim();
  if (/^@(yearly|annually|monthly|weekly|daily|midnight|hourly)$/.test(trimmed)) {
    return false;
  }
  const parts = trimmed.split(/\s+/);
  // 6-field (seconds) expressions: any non-fixed seconds field fires sub-minute.
  if (parts.length === 6 && !/^\d+$/.test(parts[0])) {
    return true;
  }
  const minuteField = parts.length === 6 ? parts[1] : parts[0];
  // Allowlist, not denylist (ranges like "1-59" and step-on-range forms like
  // "0-59/2" fire near-every-minute and must not slip through): accept only a
  // fixed minute, */N with N >= 5, or a comma list of <= 12 fixed minutes.
  if (/^\d+$/.test(minuteField)) return false;
  const step = minuteField.match(/^\*\/(\d+)$/);
  if (step) return Number(step[1]) < 5;
  const list = minuteField.split(',');
  if (list.length <= 12 && list.every(p => /^\d+$/.test(p))) return false;
  return true;
}

/**
 * #17: origin of the chat turn that invoked the tool. Snapshotted by
 * create_schedule so ai_task results can be delivered back to the
 * originating IM channel — the delivery target is NEVER taken from
 * free-form tool arguments (pairing-allowlist trust boundary).
 */
export interface TurnOrigin {
  session: string;
  workspace: string | null;
  channel?: { platform: string; chatId: string };
}

export function createCronTools(opts?: { getTurnOrigin?: () => TurnOrigin | null }): ToolDefinition[] {
  return [
    // 1. create_schedule — Create a new cron schedule
    {
      name: 'create_schedule',
      description:
        'Create a new cron schedule. Supports standard 5-field cron expressions (minute hour day-of-month month day-of-week) and shorthands like @daily, @hourly. Pass `prompt` to schedule a full agent task (ai_task): the agent re-runs with that prompt on schedule and the result is delivered back to where the schedule was created from.',
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
              'Cron expression (e.g., "0 3 * * *" for daily at 3am, "*/15 * * * *" for every 15 minutes). ai_task schedules (with `prompt`) may not fire more often than every 5 minutes.',
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
            description: 'Workspace ID (required for agent_task type; defaults to the current workspace when scheduling an ai_task)',
          },
          prompt: {
            type: 'string',
            description:
              'ai_task mode (#17): the prompt the agent runs on each firing as a full agent turn (tools + memory, approval-gated writes HELD). Only valid for agent_task schedules.',
          },
          once: {
            type: 'boolean',
            description: 'ai_task only: disable the schedule after its first successful run (one-shot).',
          },
          deliver: {
            type: 'string',
            enum: ['origin', 'notification'],
            description:
              "ai_task only: 'origin' (default) delivers the result back to the originating IM channel when the schedule was created from one; 'notification' only emits a desktop notification.",
          },
        },
        required: ['name', 'cron_expression'],
      },
      execute: async (args) => {
        const name = args.name as string;
        const cronExpr = args.cron_expression as string;
        const jobType = (args.job_type as string) || 'agent_task';
        const jobData = args.job_data as string | undefined;
        let workspaceId = args.workspace_id as string | undefined;
        const prompt = args.prompt as string | undefined;
        const once = args.once as boolean | undefined;
        const deliver = (args.deliver as string | undefined) ?? 'origin';

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
          // #17 SEC: mode/deliverTo/once are executor-internal and settable
          // ONLY via the typed params below (deliverTo exclusively from the
          // trusted origin snapshot). Free-form job_data must not smuggle
          // them — otherwise the agent could route ai_task output to an
          // arbitrary, unpaired chat.
          if (jobConfig) {
            delete jobConfig.mode;
            delete jobConfig.deliverTo;
            delete jobConfig.once;
          }
        }

        // #17 ai_task: an explicit `prompt` upgrades the schedule to a full
        // agent turn per firing. Delivery target comes from the trusted
        // turn-origin snapshot, never from tool args.
        if (prompt !== undefined) {
          if (jobType !== 'agent_task') {
            return 'Error: `prompt` is only valid for agent_task schedules.';
          }
          if (firesTooOften(cronExpr)) {
            return `Error: ai_task schedules may not fire more often than every 5 minutes (got "${cronExpr}"). Use a wider interval like "*/15 * * * *".`;
          }
          const origin = opts?.getTurnOrigin?.() ?? null;
          jobConfig = {
            ...(jobConfig ?? {}),
            prompt,
            mode: 'ai_task',
            ...(once ? { once: true } : {}),
            ...(deliver === 'origin' && origin?.channel ? { deliverTo: origin.channel } : {}),
          };
          if (!workspaceId && origin?.workspace) {
            workspaceId = origin.workspace;
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
            return `Failed to create schedule: ${(err as { error?: string }).error || response.statusText}`;
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
            return `Failed to list schedules: ${(err as { error?: string }).error || response.statusText}`;
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
            return `Failed to delete schedule: ${(err as { error?: string }).error || delResp.statusText}`;
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
            return `Failed to trigger schedule: ${(err as { error?: string }).error || triggerResp.statusText}`;
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
