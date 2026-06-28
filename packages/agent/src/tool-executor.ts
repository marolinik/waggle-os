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
 *   5. pre:memory-write hook (save_memory only) — early return on cancel
 *   6. LoopGuard.check — produces error result if duplicate
 *   7. Execute (or capability-router fallback or unknown-tool error)
 *   8. scanForInjection — REVIEW C2: BEFORE onToolResult / post-hooks
 *   9. onToolResult callback (sanitized content)
 *  10. post:memory-write hook (save_memory only, sanitized)
 *  11. post:tool hook (sanitized)
 *  12. compress model-facing result (subtractive; observers keep full fidelity)
 *
 * Critical invariant (Review C2): steps 8 → 9 → 10 → 11 must stay in this
 * order. Sanitization output is what flows into both model context AND
 * every downstream observer (audit / telemetry / team-sync / UI). Step 12 is
 * subtractive-only and applies ONLY to the returned (model-facing) content —
 * observers at 9–11 still receive the full sanitized result.
 */

import type { ToolDefinition } from './tools.js';
import type { HookRegistry } from './hooks.js';
import type { CapabilityRouter } from './capability-router.js';
import type { LoopGuard } from './loop-guard.js';
import { scanForInjection } from './injection-scanner.js';
import { compressToolOutput } from './tool-output-compressor.js';
import { logTurnEvent } from './turn-context.js';

export interface ToolExecutorDeps {
  toolMap: ReadonlyMap<string, ToolDefinition>;
  guard: LoopGuard;
  hooks?: HookRegistry;
  capabilityRouter?: CapabilityRouter;
  /** Governance policy: tool names blocked at the team level */
  blockedTools?: readonly string[];
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
}

export async function executeToolCall(
  toolCall: { id: string; function: { name: string; arguments: string } },
  deps: ToolExecutorDeps,
): Promise<ToolExecResult> {
  const { toolMap, guard, hooks, capabilityRouter, blockedTools, onToolUse, onToolResult, turnId } = deps;
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

    const scanResult = scanForInjection(result, 'tool_output');
    if (!scanResult.safe) {
      result = `[SECURITY] Tool output flagged (${scanResult.flags.join(', ')}). Content sanitized.`;
    }
    if (onToolResult) onToolResult(fnName, fnArgs, result);
    return { content: result, toolCallId: toolCall.id, countedAsUsed: false, toolName: fnName };
  }

  // ── Step 4: pre:tool hook ──
  if (hooks) {
    const hookResult = await hooks.fire('pre:tool', { toolName: fnName, args: fnArgs });
    if (hookResult.cancelled) {
      return {
        content: `[BLOCKED] ${hookResult.reason ?? 'No reason given'}`,
        toolCallId: toolCall.id,
        countedAsUsed: false,
        toolName: fnName,
      };
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
  const tool = toolMap.get(fnName);
  if (!guard.check(fnName, fnArgs)) {
    result = `Error: Loop detected — called ${fnName} with identical arguments too many times. Try a different approach.`;
  } else if (tool) {
    logTurnEvent(turnId, { stage: 'agent-loop.tool.enter', toolName: fnName, argsKeys: Object.keys(fnArgs) });
    try {
      result = await tool.execute(fnArgs);
      logTurnEvent(turnId, { stage: 'agent-loop.tool.exit', toolName: fnName, resultChars: result.length, error: false });
    } catch (err) {
      result = `Error executing ${fnName}: ${(err as Error).message}`;
      logTurnEvent(turnId, { stage: 'agent-loop.tool.exit', toolName: fnName, error: true, errorMessage: (err as Error).message });
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

  // ── Step 8: sanitize BEFORE post-hooks + onToolResult (Review C2) ──
  // The scanner output is what flows into both model context on the next
  // turn AND into every downstream observer (audit sinks, telemetry,
  // team-sync, UI). Order is load-bearing — do not reorder.
  const scanResult = scanForInjection(result, 'tool_output');
  if (!scanResult.safe) {
    result = `[SECURITY] Tool output flagged (${scanResult.flags.join(', ')}). Content sanitized.`;
  }

  // ── Step 9: onToolResult callback (sanitized content) ──
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

  // ── Step 12: compress the model-facing result (subtractive, never enlarges) ──
  // Observers above (9–11) received the full sanitized result; only the content
  // returned into the model's next-turn context is compressed.
  return { content: compressToolOutput(result), toolCallId: toolCall.id, countedAsUsed, toolName: fnName };
}
