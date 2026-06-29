/**
 * Held-action approval queue — the enqueue boundary + the deferred executor.
 *
 * L2 "assisted" automations: a headless run (e.g. an assist-mode Loop) proposes
 * a discrete tool call as a self-contained {tool, args, summary} descriptor. It
 * is NOT executed inline — it is HELD (cron-store `pending_actions`) until a
 * human approves, then THIS executor re-materializes and runs that single tool
 * call. Self-contained descriptor + execute-on-approve, never mid-run
 * suspend/resume (a headless tick must finish; the only "suspend" primitive in
 * the codebase is request-bound and restart-fatal).
 *
 *   enqueueHeldAction  — the single seam both the v0 producer and a future v1
 *                        ConfirmationGate.promptFn call to hold an action.
 *   executeHeldAction  — runs the real tool on approval, idempotent + re-validated.
 */

import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { PendingActionRow, PendingActionStatus } from '@waggle/core';
import { scanForInjection, isCriticalNeverAutopass, classifyGatedToolRisk } from '@waggle/agent';
import { emitNotification } from './routes/notifications.js';

const nowIso = (): string => new Date().toISOString();

/** Held actions expire from the queue after this long if never decided. */
const HELD_ACTION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * v0 proposable-tool predicate (fork F2): the narrow set an assist-mode Loop may
 * propose. Deliberately small — it bounds the blast radius of one-click
 * approval. The canonical case is `send_email` (assistant drafts, human
 * approves). Founder-editable.
 */
export function isProposableTool(tool: string): boolean {
  if (tool === 'send_email' || tool === 'write_file' || tool === 'edit_file' || tool === 'generate_docx') {
    return true;
  }
  // Connector WRITE actions (connector_<id>_<action> where action mutates).
  if (tool.startsWith('connector_') && /_(create|update|delete|send|post|transition|remove|add|set|put)(_|$)/.test(tool)) {
    return true;
  }
  return false;
}

export interface EnqueueInput {
  workspaceId: string | null;
  source: string;                       // e.g. 'loop:<scheduleId>'
  tool: string;
  args: Record<string, unknown>;
  summary?: string;
}

export type EnqueueResult = { id: string } | { refused: 'not_proposable' | 'critical' | 'injection' };

/**
 * Validate + persist a held action awaiting approval. Refuses up front:
 *  - non-proposable tools (F2 allowlist),
 *  - critical / never-autopass actions (F3 — these may NEVER be a one-click
 *    button; a force-push-to-main can't become a single tap),
 *  - args that trip the injection scanner.
 * On success: persists 'held' with stamped risk + emits an approval notification.
 */
export function enqueueHeldAction(server: FastifyInstance, input: EnqueueInput): EnqueueResult {
  const { tool, args } = input;
  if (!isProposableTool(tool)) return { refused: 'not_proposable' };
  if (isCriticalNeverAutopass(tool, args)) return { refused: 'critical' };
  const argsJson = JSON.stringify(args ?? {});
  if (!scanForInjection(argsJson, 'tool_output').safe) return { refused: 'injection' };

  const { riskLevel, approvalClass } = classifyGatedToolRisk(tool, args);
  const id = randomUUID();
  server.cronStore.savePendingAction({
    id,
    workspaceId: input.workspaceId,
    source: input.source,
    toolName: tool,
    argsJson,
    summary: input.summary,
    riskLevel,
    approvalClass,
    expiresAt: new Date(Date.now() + HELD_ACTION_TTL_MS).toISOString(),
  });
  emitNotification(server, {
    title: 'Action awaiting your approval',
    body: input.summary || `${tool} proposed by ${input.source}`,
    category: 'approval',
    actionUrl: '/approvals',
  });
  return { id };
}

export interface ExecuteResult {
  ok: boolean;
  status: PendingActionStatus;
  result?: string;
  error?: string;
}

/**
 * Execute a held action ON APPROVAL. Idempotent (atomic claim gate), re-validates
 * the LLM-proposed args at execute time (defense-in-depth), invokes the REAL tool
 * via the workspace tool pool, and records the terminal outcome on the row.
 */
export async function executeHeldAction(server: FastifyInstance, row: PendingActionRow): Promise<ExecuteResult> {
  const store = server.cronStore;

  // Idempotency: atomically claim 'held' → 'approved'. If we didn't win, the
  // action was already decided (double-approve / approve-after-deny) — no-op.
  const claimed = store.claimPendingAction(row.id, 'approved', nowIso());
  if (!claimed) return { ok: false, status: row.status, error: 'already decided' };

  let args: Record<string, unknown>;
  try {
    args = JSON.parse(row.args_json) as Record<string, unknown>;
  } catch {
    store.updatePendingActionResult(row.id, { status: 'failed', error: 'corrupt args_json', executedAt: nowIso() });
    return { ok: false, status: 'failed', error: 'corrupt args_json' };
  }

  // Re-validate at execute — the args came from an LLM proposal, and time has
  // passed since enqueue. A critical action or injection-tripping args must not
  // run even though a human clicked approve.
  if (isCriticalNeverAutopass(row.tool_name, args) || !scanForInjection(row.args_json, 'tool_output').safe) {
    store.updatePendingActionResult(row.id, { status: 'failed', error: 'failed execute-time re-validation', executedAt: nowIso() });
    return { ok: false, status: 'failed', error: 'failed re-validation' };
  }

  try {
    const wsId = row.workspace_id && row.workspace_id !== '*' ? row.workspace_id : 'default';
    const wsPath = path.join(server.localConfig.dataDir, 'workspaces', wsId, 'files');
    const tools = server.agentState.buildToolsForWorkspace(wsPath, undefined, row.workspace_id ?? undefined);
    const tool = tools.find(t => t.name === row.tool_name);
    if (!tool) {
      store.updatePendingActionResult(row.id, { status: 'failed', error: `unknown tool: ${row.tool_name}`, executedAt: nowIso() });
      return { ok: false, status: 'failed', error: 'unknown tool' };
    }
    const result = await tool.execute(args);
    const summary = result.length > 280 ? `${result.slice(0, 277)}...` : result;
    store.updatePendingActionResult(row.id, { status: 'executed', resultSummary: summary, executedAt: nowIso() });
    emitNotification(server, {
      title: 'Approved action executed',
      body: summary || row.tool_name,
      category: 'approval',
      actionUrl: '/approvals',
    });
    return { ok: true, status: 'executed', result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    store.updatePendingActionResult(row.id, { status: 'failed', error: msg, executedAt: nowIso() });
    return { ok: false, status: 'failed', error: msg };
  }
}
