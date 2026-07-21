/**
 * Per-tool-call executor with the agent-loop middleware chain.
 *
 * Extracted from agent-loop.ts (PR-C, 2026-05-27) — was ~130L inlined in
 * the for-each-tool-call loop. Lifting it makes the chain explicit and
 * lets `runAgentLoop` read as the conversation loop it conceptually is.
 *
 * Middleware order (preserve Review C2 hook-ordering invariant):
 *   1. JSON.parse args (early return on parse error — no sanitize, no post-hooks)
 *   2. onToolUse callback
 *   3. Governance.blockedTools — early return on block (fires onToolResult)
 *   4. pre:tool hook — early return on cancel
 *  4b. critical-destructive hard floor — deny isCriticalNeverAutopass ops that
 *      reach here without an approval gate (defense-in-depth; independent of hooks)
 *   5. pre:memory-write hook (save_memory only) — early return on cancel
 *   6. LoopGuard.check — produces error result if duplicate
 *   7. Execute (or capability-router fallback or unknown-tool error)
 *   8. evaluateExternalMemoryIngress — REVIEW C2: BEFORE onToolResult / post-hooks
 *   9. onToolResult callback (sanitized content)
 *  10. post:memory-write hook (save_memory only, sanitized)
 *  11. post:tool hook (sanitized)
 *  12. compress model-facing result (subtractive; observers keep full fidelity)
 *
 * Critical invariant (Review C2): steps 8 → 9 → 10 → 11 must stay in this
 * order. Canonically guarded output is what flows into both model context AND
 * every downstream observer (audit / telemetry / team-sync / UI). Step 12 is
 * subtractive-only and applies ONLY to the returned (model-facing) content —
 * observers at 9–11 still receive the full guarded result.
 */

import type { ToolDefinition } from './tools.js';
import type { HookRegistry } from './hooks.js';
import type { CapabilityRouter } from './capability-router.js';
import type { LoopGuard } from './loop-guard.js';
import { evaluateExternalMemoryIngress } from '@waggle/core';
import { isCriticalNeverAutopass } from './confirmation.js';
import { compressToolOutput } from './tool-output-compressor.js';
import { logTurnEvent } from './turn-context.js';
import { untrustedContextWrapper } from './untrusted-context.js';

const QUARANTINED_TOOL_OUTPUT = '[SECURITY] Tool output quarantined.';

/**
 * Never reflect rejected external content (or guard details) beyond this boundary.
 * The canonical ingress guard includes legacy scanning plus normalization-aware checks.
 */
function guardExternalToolOutput(result: string): string {
  return evaluateExternalMemoryIngress({ content: result }).action === 'allow'
    ? result
    : QUARANTINED_TOOL_OUTPUT;
}

export interface ToolExecutorDeps {
  toolMap: ReadonlyMap<string, ToolDefinition>;
  guard: LoopGuard;
  hooks?: HookRegistry;
  capabilityRouter?: CapabilityRouter;
  /** Governance policy: tool names blocked at the team level */
  blockedTools?: readonly string[];
  /**
   * Defense-in-depth approval callback for CRITICAL_NEVER_AUTOPASS operations
   * (`isCriticalNeverAutopass`: rm -rf ~, sudo, mkfs, dd of=/dev, git push
   * --force main, delete_skill, connector deletes, high-risk installs). When
   * provided, executeToolCall calls it for any critical-destructive tool BEFORE
   * executing and denies on a false return. When ABSENT, executeToolCall falls
   * back to requiring a `pre:tool` approval gate (`hooks`) to be wired —
   * otherwise it fail-closes (denies). This guarantees that no spawn path
   * (sub-agent / workflow / worker / future) can run a terminal-destructive
   * command unconfirmed, regardless of whether hooks are wired.
   */
  confirmCriticalAction?: (name: string, args: Record<string, unknown>) => Promise<boolean> | boolean;
  onToolUse?: (name: string, args: Record<string, unknown>) => void;
  onToolResult?: (name: string, args: Record<string, unknown>, result: string) => void;
  /** H-AUDIT-1: per-turn trace ID for structured event logging */
  turnId?: string;
}

export interface ToolExecResult {
  /** Sanitized content to push as the tool-role message in the conversation */
  content: string;
  /** Tool call ID for message threading */
  toolCallId: string;
  /**
   * True iff the caller should append the tool name to its `toolsUsed`
   * array. Pre-execution rejections (parse error, governance block, hook
   * cancel) return false; only attempted executes (success OR thrown error
   * inside the tool) return true. Matches the prior inline semantics.
   */
  countedAsUsed: boolean;
  /** Tool name resolved from the call (for caller's toolsUsed bookkeeping) */
  toolName: string;
  /**
   * Set by the tiered loop-guard (T3-critical) when a tool has failed enough
   * consecutive times that continuing is futile. The agent loop must terminate
   * the run and surface `abortReason` as a user-facing give-up message.
   */
  abort?: boolean;
  /** User-facing give-up copy — only present when `abort` is true. */
  abortReason?: string;
}

export async function executeToolCall(
  toolCall: { id: string; function: { name: string; arguments: string } },
  deps: ToolExecutorDeps,
): Promise<ToolExecResult> {
  const { toolMap, guard, hooks, capabilityRouter, blockedTools, confirmCriticalAction, onToolUse, onToolResult, turnId } = deps;
  const fnName = toolCall.function.name;

  // ── Step 1: safely parse tool arguments ──
  let fnArgs: Record<string, unknown>;
  try {
    fnArgs = JSON.parse(toolCall.function.arguments || '{}');
  } catch {
    return {
      content: `Error: Invalid arguments for ${fnName}. The arguments were not valid JSON.`,
      toolCallId: toolCall.id,
      countedAsUsed: false,
      toolName: fnName,
    };
  }

  // ── Step 2: onToolUse callback ──
  if (onToolUse) onToolUse(fnName, fnArgs);

  // ── Step 3: governance block — early return + fire onToolResult ──
  if (blockedTools?.includes(fnName)) {
    const policyMsg = `Tool "${fnName}" is blocked by your team's governance policy. Contact your team admin to request access, or use the request_team_capability tool to submit a request.`;
    if (onToolResult) onToolResult(fnName, fnArgs, policyMsg);
    return { content: policyMsg, toolCallId: toolCall.id, countedAsUsed: false, toolName: fnName };
  }

  const existingTool = toolMap.get(fnName);
  if (!existingTool) {
    let result: string;
    if (capabilityRouter) {
      const routes = capabilityRouter.resolve(fnName);
      const routeInfo = routes
        .map(r => `- [${r.source}] ${r.name}: ${r.description} (${r.available ? 'available' : 'not wired yet'})`)
        .join('\n');
      const ACQUIRE_TOOL = 'acquire_capability';
      const hasMissing = routes.some(r => r.source === 'missing');
      const acquireHint = hasMissing && toolMap.has(ACQUIRE_TOOL)
        ? `\n\nTip: Use ${ACQUIRE_TOOL} to search for installable skills that might help.`
        : '';
      result = `Tool "${fnName}" not found. Here are alternatives:\n${routeInfo}${acquireHint}\n\nAvailable tools: ${Array.from(toolMap.keys()).join(', ')}`;
    } else {
      result = `Error: Unknown tool "${fnName}". Available tools: ${Array.from(toolMap.keys()).join(', ')}`;
    }

    result = guardExternalToolOutput(result);
    if (onToolResult) onToolResult(fnName, fnArgs, result);
    return { content: result, toolCallId: toolCall.id, countedAsUsed: false, toolName: fnName };
  }

  // ── Step 4: pre:tool hook ──
  if (hooks) {
    const hookResult = await hooks.fire('pre:tool', {
      toolName: fnName,
      args: fnArgs,
      riskLevel: existingTool.riskLevel,
    });
    if (hookResult.cancelled) {
      return {
        content: `[BLOCKED] ${hookResult.reason ?? 'No reason given'}`,
        toolCallId: toolCall.id,
        countedAsUsed: false,
        toolName: fnName,
      };
    }
  }

  // ── Step 4b: critical-destructive hard floor (defense-in-depth) ──
  // isCriticalNeverAutopass flags terminal, irreversible operations that must
  // pass a human/policy approval gate at EVERY layer — not only the main chat
  // loop. The main loop gates them via the pre:tool hook fired above; spawn
  // paths (sub-agent / workflow / worker) that forward that same hook registry
  // inherit the gate. If NO approval mechanism reached this call, fail closed:
  // deny rather than silently execute. This runs unconditionally — it does not
  // depend on the pre:tool hook being wired, which is the whole point. Without
  // it, a spawn path constructed with `hooks: undefined` executed rm -rf ~,
  // sudo, git push --force main, delete_skill, etc. unconfirmed.
  if (isCriticalNeverAutopass(fnName, fnArgs, existingTool.riskLevel)) {
    const approvedOutOfBand = confirmCriticalAction
      ? await confirmCriticalAction(fnName, fnArgs)
      : false;
    // A pre:tool approval gate present at step 4 already vetted this call (a
    // critical op always trips needsConfirmationWithAutonomy, so reaching here
    // past a non-cancelled hook means it was approved). No callback and no gate
    // ⇒ no human in the loop ⇒ deny.
    const gatedByHook = hooks !== undefined;
    if (!approvedOutOfBand && !gatedByHook) {
      const denyMsg =
        `[BLOCKED] "${fnName}" is a critical, irreversible operation that requires ` +
        `explicit human approval. It was denied because this execution context ` +
        `(such as a sub-agent or automated workflow) has no approval gate. ` +
        `Terminal-destructive commands never run unconfirmed.`;
      if (onToolResult) onToolResult(fnName, fnArgs, denyMsg);
      return { content: denyMsg, toolCallId: toolCall.id, countedAsUsed: false, toolName: fnName };
    }
  }

  // ── Step 5: pre:memory-write hook (save_memory only) ──
  if (hooks && fnName === 'save_memory') {
    const memoryHookResult = await hooks.fire('pre:memory-write', {
      toolName: fnName,
      args: fnArgs,
      memoryContent: fnArgs.content as string | undefined,
      memoryType: fnArgs.type as string | undefined,
    });
    if (memoryHookResult.cancelled) {
      return {
        content: `[BLOCKED] Memory write blocked: ${memoryHookResult.reason ?? 'No reason given'}`,
        toolCallId: toolCall.id,
        countedAsUsed: false,
        toolName: fnName,
      };
    }
  }

  // ── Steps 6-7: LoopGuard check + execute / capability route / unknown ──
  // `result` is assigned in every branch; the empty-string init exists as a
  // defense against future early-continues that might slip in (the
  // surrounding `let` is preserved from the original Review H3 rationale).
  let result = '';
  let countedAsUsed = false;
  let abort = false;
  let abortReason: string | undefined;
  const tool = toolMap.get(fnName);
  // Graduated failure tiers (steal #9) are consulted BEFORE the identical-args
  // heuristic: a critical failure streak aborts, and any tier block short-
  // circuits execution without advancing check()'s window/consecutive state.
  const tiered = guard.checkTiered(fnName, fnArgs);
  if (tiered.action === 'abort') {
    abort = true;
    abortReason = tiered.reason;
    result = tiered.reason;
  } else if (tiered.action === 'block') {
    result = tiered.reason;
    // A blocked attempt still counts as a failed attempt — without this the
    // same-tool failure tail freezes at T4's threshold (6) and T3's hard abort
    // (8) is unreachable: the model can hammer a broken tool forever, eating
    // one nudge per turn until maxTurns.
    guard.record(fnName, fnArgs, false);
  } else if (!guard.check(fnName, fnArgs)) {
    result = `Error: Loop detected — called ${fnName} with identical arguments too many times. Try a different approach.`;
    guard.record(fnName, fnArgs, false);
  } else if (tool) {
    logTurnEvent(turnId, { stage: 'agent-loop.tool.enter', toolName: fnName, argsKeys: Object.keys(fnArgs) });
    try {
      const rawResult = await tool.execute(fnArgs);
      // Tools in this codebase report many failures by RETURNING an
      // "Error: ..." string rather than throwing — count those as failures
      // too, or the failure tiers never see them.
      guard.record(fnName, fnArgs, !/^Error\b/.test(rawResult));
      result = guardExternalToolOutput(rawResult);
      logTurnEvent(turnId, { stage: 'agent-loop.tool.exit', toolName: fnName, resultChars: result.length, error: false });
    } catch (err) {
      result = guardExternalToolOutput(`Error executing ${fnName}: ${(err as Error).message}`);
      guard.record(fnName, fnArgs, false);
      logTurnEvent(turnId, { stage: 'agent-loop.tool.exit', toolName: fnName, error: true, errorMessage: result });
    }
    countedAsUsed = true;
  } else if (capabilityRouter) {
    const routes = capabilityRouter.resolve(fnName);
    const routeInfo = routes
      .map(r => `- [${r.source}] ${r.name}: ${r.description} (${r.available ? 'available' : 'not wired yet'})`)
      .join('\n');
    const ACQUIRE_TOOL = 'acquire_capability';
    const hasMissing = routes.some(r => r.source === 'missing');
    const acquireHint = hasMissing && toolMap.has(ACQUIRE_TOOL)
      ? `\n\nTip: Use ${ACQUIRE_TOOL} to search for installable skills that might help.`
      : '';
    result = `Tool "${fnName}" not found. Here are alternatives:\n${routeInfo}${acquireHint}\n\nAvailable tools: ${Array.from(toolMap.keys()).join(', ')}`;
  } else {
    result = `Error: Unknown tool "${fnName}". Available tools: ${Array.from(toolMap.keys()).join(', ')}`;
  }

  // ── Step 8: canonical guard BEFORE post-hooks + onToolResult (Review C2) ──
  // The guarded output is what flows into both model context on the next turn
  // AND every downstream observer (audit sinks, telemetry, team-sync, UI).
  // Non-allows become an opaque marker; guard details and normalized attacker
  // content must never cross this boundary. Order is load-bearing.
  result = guardExternalToolOutput(result);

  // ── Step 9: onToolResult callback (guarded content) ──
  if (onToolResult) onToolResult(fnName, fnArgs, result);

  // ── Step 10: post:memory-write hook (save_memory only, sanitized) ──
  if (hooks && fnName === 'save_memory') {
    await hooks.fire('post:memory-write', {
      toolName: fnName,
      args: fnArgs,
      result,
      memoryContent: fnArgs.content as string | undefined,
      memoryType: fnArgs.type as string | undefined,
    });
  }

  // ── Step 11: post:tool hook (sanitized) ──
  if (hooks) {
    await hooks.fire('post:tool', { toolName: fnName, args: fnArgs, result });
  }

  // ── Step 12: compress, then fence genuine tool output as untrusted data ──
  // Observers above (9–11) received the full sanitized result; only the content
  // returned into the model's next-turn context is compressed + fenced.
  // Order is load-bearing: compress FIRST (subtractive — could otherwise truncate
  // the closing marker), then wrap. We fence ONLY actual tool-execution output
  // (`countedAsUsed`), including a thrown tool's error string (it can echo
  // attacker-controlled bytes from a malicious tool/MCP server). First-party
  // orchestration messages (loop-guard, capability-router recovery guidance,
  // unknown-tool) are NOT fenced — they are trusted guidance the model SHOULD act
  // on, and fencing them as "do not obey" would defeat recovery. §C / untrusted-context.ts.
  const compressed = compressToolOutput(result);
  const modelFacing = countedAsUsed ? untrustedContextWrapper(fnName, compressed) : compressed;
  return { content: modelFacing, toolCallId: toolCall.id, countedAsUsed, toolName: fnName, abort, abortReason };
}
