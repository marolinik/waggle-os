import type { ToolDefinition } from './tools.js';
import { LoopGuard } from './loop-guard.js';
import { scanForInjection } from './injection-scanner.js';
import { parseChatCompletionStream } from './sse-parser.js';
import { maybeFireCompletionGate, initialGateState } from './loop-gates.js';
import type { HookRegistry } from './hooks.js';
import type { CapabilityRouter } from './capability-router.js';
import type { TraceRecorder, TraceHandle } from './trace-recorder.js';
import { logTurnEvent } from './turn-context.js';

/** Minimal interface for plugin runtime integration (from @waggle/sdk) */
export interface PluginToolProvider {
  getAllTools(): Array<{ name: string; description: string; parameters: Record<string, unknown>; execute: (args: Record<string, unknown>) => Promise<string> }>;
}

export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

export interface AgentResponse {
  content: string;
  toolsUsed: string[];
  usage: { inputTokens: number; outputTokens: number };
}

export interface AgentLoopConfig {
  litellmUrl: string;
  litellmApiKey: string;
  model: string;
  systemPrompt: string;
  tools: ToolDefinition[];
  messages: Array<{ role: string; content: string }>;
  onToken?: (token: string) => void;
  onToolUse?: (name: string, input: Record<string, unknown>) => void;
  onToolResult?: (name: string, input: Record<string, unknown>, result: string) => void;
  maxTurns?: number;
  stream?: boolean;
  fetch?: typeof globalThis.fetch;
  hooks?: HookRegistry;
  capabilityRouter?: CapabilityRouter;
  /** Optional plugin tool provider — merges active plugin tools into the agent's toolset */
  pluginTools?: PluginToolProvider;
  /** Optional maximum token budget (input + output combined). Loop terminates gracefully when exceeded. */
  maxTokenBudget?: number;
  /** Optional abort signal — when aborted, the agent loop exits between turns */
  signal?: AbortSignal;
  /** Team governance policies — blocked tools and allowed sources.
   *  NOTE: `allowedSources` is **not yet enforced** (agent-loop review Critical #1).
   *  Setting it on TEAMS/ENTERPRISE tiers logs a warning at startup but does not
   *  restrict tool execution — tools don't carry source-provenance metadata yet.
   *  `blockedTools` IS enforced. Remove this caveat when per-tool source is wired. */
  governancePolicies?: {
    blockedTools?: string[];
    allowedSources?: string[];
  };
  /**
   * Optional trace recording. When provided, the agent loop automatically
   * captures tool calls, reasoning, and artifacts into the handle using
   * recorder.wireAgentLoopCallbacks(). Caller-supplied onToolUse /
   * onToolResult still fire — the trace wiring is additive.
   *
   * The caller is responsible for starting the handle via
   * `recorder.start({...})` BEFORE calling runAgentLoop and finalizing
   * it via `recorder.finalize(handle, {...})` AFTER. The loop never
   * finalizes the trace itself because outcome labeling happens after
   * the user (or correction detector) signals success / corrected /
   * abandoned / verified.
   */
  traceRecording?: {
    recorder: TraceRecorder;
    handle: TraceHandle;
  };
  /**
   * H-AUDIT-1: per-turn trace ID (UUID v4). When provided, the loop logs
   * structured events tagged with this turnId at loop entry, each LLM
   * request, and each tool call. Enables full turn-graph reconstruction
   * across all agent stages from a single correlation key.
   */
  turnId?: string;
  /**
   * D3 verification-before-completion gate. When a final turn asserts the
   * work is verified/passing/working but ran no verification-class tool,
   * the loop injects ONE corrective directive instead of accepting
   * completion (one-shot; maxTurns/loop-guard still bound the loop).
   * Default on — it is the premium contract. Set false to opt out.
   */
  verificationGate?: boolean;
  /**
   * D1 Hermes-parity closed learning loop. On a qualifying ≥5-tool,
   * R2-gated successful turn the loop deterministically injects the real
   * planSkillDistillation directive into the conversation and continues
   * (one-shot) — mechanical closure, not a soft out-of-band event the
   * model may ignore. Default on. Set false to opt out.
   */
  skillDistillationGate?: boolean;
  /**
   * AI-OS Phase 3 — skill diffusion hook. Invoked the moment D1 fires
   * (right before the distillation directive is injected). The route
   * layer typically wires this to record a `skill_share` broadcast on
   * the WaggleDance v2 bus so MCP-consuming external tools can adopt
   * the soon-to-be-authored skill.
   *
   * Failures here are swallowed — skill diffusion is observability,
   * not a precondition for the distillation loop to run.
   */
  onSkillDistillationFire?: (info: {
    patternKey: string;
    toolsUsed: readonly string[];
    directive: string;
  }) => void | Promise<void>;
}

// Phase 2 Commit 2.1: re-export structured-action retrieval loop alongside
// the existing tool-use loop. Implementation lives in retrieval-agent-loop.ts
// to keep this file under the 800-line guideline; agent-loop.ts is the
// canonical "unified entry point" for both loop patterns per sprint plan §2.
export {
  runSoloAgent,
  runRetrievalAgentLoop,
  type SoloAgentRunConfig,
  type MultiStepAgentRunConfig,
  type AgentRunResult,
  type LlmCallFn,
  type LlmCallInput,
  type LlmCallResult,
  type RetrievalSearchFn,
  type RetrievalSearchInput,
  type RetrievalSearchResult,
  type NormalizationPresetName,
  type BaseAgentRunConfig,
  // Phase 3.4 — long-task integration (whole-loop recovery + progress events).
  runRetrievalAgentLoopWithRecovery,
  type LoopRecoveryOptions,
  type AgentRunProgressEvent,
  type AgentRunProgressEventType,
  type AgentRunProgressCallback,
} from './retrieval-agent-loop.js';

export async function runAgentLoop(config: AgentLoopConfig): Promise<AgentResponse> {
  const {
    litellmUrl,
    litellmApiKey,
    model,
    systemPrompt,
    tools: configTools,
    messages: inputMessages,
    onToken,
    onToolUse: userOnToolUse,
    onToolResult: userOnToolResult,
    maxTurns = 10,
    stream = false,
    fetch: fetchFn = globalThis.fetch,
    hooks,
    pluginTools: pluginToolProvider,
    traceRecording,
    turnId,
    verificationGate = true,
    skillDistillationGate = true,
    onSkillDistillationFire,
  } = config;

  logTurnEvent(turnId, {
    stage: 'agent-loop.enter',
    model,
    maxTurns,
    toolCount: configTools.length,
    messageCount: inputMessages.length,
    systemPromptChars: systemPrompt.length,
  });

  // Review C1: surface the honest contract for allowedSources. Admins set this
  // via the TEAMS/ENTERPRISE governance UI believing data-source restrictions
  // are active; they are NOT until ToolDefinition carries source-provenance
  // metadata. Log once per invocation so the policy visibility gap is loud.
  if (config.governancePolicies?.allowedSources && config.governancePolicies.allowedSources.length > 0) {
    console.warn(
      '[agent-loop] governancePolicies.allowedSources is set but NOT YET ENFORCED — ' +
      'tool-source metadata required first. blockedTools IS enforced. ' +
      `Received ${config.governancePolicies.allowedSources.length} allowed sources.`
    );
  }

  // Wire trace recorder callbacks if configured. The recorder's handlers
  // run BEFORE the caller's so the trace captures the call even if the
  // caller's handler throws.
  const traceCallbacks = traceRecording
    ? traceRecording.recorder.wireAgentLoopCallbacks(traceRecording.handle)
    : null;

  const onToolUse = traceCallbacks
    ? (name: string, input: Record<string, unknown>) => {
        traceCallbacks.onToolUse(name, input);
        userOnToolUse?.(name, input);
      }
    : userOnToolUse;

  const onToolResult = traceCallbacks
    ? (name: string, input: Record<string, unknown>, result: string) => {
        traceCallbacks.onToolResult(name, input, result);
        userOnToolResult?.(name, input, result);
      }
    : userOnToolResult;

  // Merge plugin tools (if any) into the base tool set
  const tools: ToolDefinition[] = pluginToolProvider
    ? [...configTools, ...pluginToolProvider.getAllTools()]
    : configTools;

  // Build messages array with system prompt + input messages
  const messages: AgentMessage[] = [
    { role: 'system', content: systemPrompt },
    ...inputMessages.map((m) => ({
      role: m.role as AgentMessage['role'],
      content: m.content,
    })),
  ];

  // Build OpenAI-format tool definitions
  // Ensure all parameter schemas have type: 'object' (required by Anthropic via LiteLLM)
  const openaiTools = tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: 'object' as const,
        properties: {},
        ...t.parameters,
      },
    },
  }));

  // Index tools by name for execution
  const toolMap = new Map<string, ToolDefinition>();
  for (const t of tools) {
    toolMap.set(t.name, t);
  }

  const toolsUsed: string[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let allStreamedContent = ''; // Accumulate ALL streamed content across all turns
  const guard = new LoopGuard();
  // Separate retry counters — 429 and 5xx have different backoff strategies
  let rateLimitRetries = 0;
  let serverErrorRetries = 0;
  const MAX_RETRIES = 3;
  // One-shot completion gates (D3 verification, D1 skill distillation) +
  // preserved-answer slot for issue #4. See `./loop-gates.ts` for details.
  let gateState = initialGateState();

  for (let turn = 0; turn < maxTurns; turn++) {
    // Check for abort between turns
    if (config.signal?.aborted) {
      return {
        content: 'Agent loop aborted (client disconnected).',
        toolsUsed,
        usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      };
    }

    const body: Record<string, unknown> = {
      model,
      messages,
    };
    if (openaiTools.length > 0) {
      body.tools = openaiTools;
    }
    if (stream) {
      body.stream = true;
      body.stream_options = { include_usage: true };
    }

    const response = await fetchFn(`${litellmUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${litellmApiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (response.status === 429) {
      rateLimitRetries++;
      if (rateLimitRetries >= MAX_RETRIES) {
        throw new Error(`Rate limit retry cap exceeded (${MAX_RETRIES} consecutive 429 responses). Try again later.`);
      }
      const retryAfter = parseInt(response.headers.get('retry-after') ?? '5', 10);
      const waitMs = Math.min(retryAfter * 1000, 60_000);
      if (onToken) onToken(`\n[Rate limited — waiting ${retryAfter}s (retry ${rateLimitRetries}/${MAX_RETRIES})...]\n`);
      await new Promise(r => setTimeout(r, waitMs));
      turn--; // retry this turn without consuming a turn
      continue;
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error');
      // Retry on transient server errors (502, 503, 504)
      if ([502, 503, 504].includes(response.status)) {
        serverErrorRetries++;
        if (serverErrorRetries >= MAX_RETRIES) {
          throw new Error(`Server error retry cap exceeded (${MAX_RETRIES} consecutive ${response.status} errors): ${errorBody}`);
        }
        const waitMs = Math.min(1000 * Math.pow(2, serverErrorRetries), 30_000);
        if (onToken) onToken(`\n[Server error ${response.status} — retrying in ${waitMs / 1000}s (retry ${serverErrorRetries}/${MAX_RETRIES})...]\n`);
        await new Promise(r => setTimeout(r, waitMs));
        turn--; // retry this turn without consuming a turn
        continue;
      }
      throw new Error(`LLM error (${response.status}): ${errorBody}`);
    }

    let assistantMessage: {
      content: string | null;
      tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
    };
    let turnInputTokens = 0;
    let turnOutputTokens = 0;

    if (stream) {
      const parsed = await parseChatCompletionStream(response.body!, {
        onToken: (token) => {
          allStreamedContent += token;
          if (onToken) onToken(token);
        },
      });
      turnInputTokens = parsed.usage.inputTokens;
      turnOutputTokens = parsed.usage.outputTokens;
      // Use empty string (not null) when there are tool_calls — some LLM
      // proxies (LiteLLM→Anthropic) mishandle null content alongside tool_use.
      assistantMessage = {
        content: parsed.content || (parsed.toolCalls ? '' : null),
        tool_calls: parsed.toolCalls,
      };
    } else {
      // Non-streaming path (unchanged)
      const data: any = await response.json();
      if (!data.choices || data.choices.length === 0) {
        throw new Error(
          `LiteLLM returned no choices: ${JSON.stringify(data).slice(0, 200)}`
        );
      }
      const choice = data.choices[0];
      assistantMessage = choice.message;
      turnInputTokens = data.usage?.prompt_tokens ?? 0;
      turnOutputTokens = data.usage?.completion_tokens ?? 0;
    }

    totalInputTokens += turnInputTokens;
    totalOutputTokens += turnOutputTokens;
    rateLimitRetries = 0; // Reset retry counters on successful response
    serverErrorRetries = 0;

    // Check token budget
    if (config.maxTokenBudget && (totalInputTokens + totalOutputTokens) > config.maxTokenBudget) {
      const used = totalInputTokens + totalOutputTokens;
      // Issue #4 — if D1 has already fired, the user's answer is the deliverable;
      // surface it rather than swallowing it under a budget message.
      return {
        content: gateState.preservedAnswerForDistillation
          ?? `Token budget exceeded (used ${used} tokens, limit ${config.maxTokenBudget}).`,
        toolsUsed,
        usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      };
    }

    // No tool calls — return the final response
    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      // Use this turn's content, or fall back to all accumulated streamed content
      const content = (assistantMessage.content ?? '') || allStreamedContent;
      allStreamedContent = ''; // Release accumulated tokens once consumed

      // Completion-time gates: D3 (verification) + D1 (skill distillation).
      // See ./loop-gates.ts. If a gate fires, it pushes the corrective
      // directive into `messages` and returns fired=true → continue loop.
      const gate = await maybeFireCompletionGate({
        content,
        toolsUsed,
        messages,
        state: gateState,
        enableVerification: verificationGate,
        enableSkillDistillation: skillDistillationGate,
        onSkillDistillationFire,
        turnId,
      });
      gateState = gate.state;
      if (gate.fired) continue;

      // In non-streaming mode, emit the full content as a single token
      if (!stream && onToken && content) {
        onToken(content);
      }
      // Issue #4 — once D1 has fired, the user's answer was captured before
      // the distillation turn ran; the current `content` is the skill
      // summary, NOT the answer. Surface the preserved answer instead.
      const finalContent = gateState.preservedAnswerForDistillation ?? content;
      logTurnEvent(turnId, {
        stage: 'agent-loop.exit',
        contentChars: finalContent.length,
        toolsUsed,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
      });
      return {
        content: finalContent,
        toolsUsed,
        usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      };
    }

    // Has tool calls — execute them and continue the loop
    // Ensure content is never null when tool_calls are present (LiteLLM→Anthropic compat)
    messages.push({
      role: 'assistant',
      content: assistantMessage.content ?? '',
      tool_calls: assistantMessage.tool_calls,
    });

    for (const toolCall of assistantMessage.tool_calls) {
      const fnName = toolCall.function.name;

      // Safely parse tool arguments — malformed JSON shouldn't crash the loop
      let fnArgs: Record<string, unknown>;
      try {
        fnArgs = JSON.parse(toolCall.function.arguments || '{}');
      } catch {
        const result = `Error: Invalid arguments for ${fnName}. The arguments were not valid JSON.`;
        messages.push({ role: 'tool', content: result, tool_call_id: toolCall.id });
        continue;
      }

      if (onToolUse) {
        onToolUse(fnName, fnArgs);
      }

      // Governance enforcement — check team policies before tool execution
      if (config.governancePolicies?.blockedTools?.includes(fnName)) {
        const policyMsg = `Tool "${fnName}" is blocked by your team's governance policy. Contact your team admin to request access, or use the request_team_capability tool to submit a request.`;
        messages.push({
          role: 'tool',
          content: policyMsg,
          tool_call_id: toolCall.id,
        });
        if (onToolResult) onToolResult(fnName, fnArgs, policyMsg);
        continue; // Skip execution, process next tool call
      }

      // Fire pre:tool hook — may cancel execution.
      // Review H3: initialize to a safe empty-string sentinel. Every branch below does
      // assign `result`, so TypeScript's definite-assignment analysis accepts it without
      // the init — but adding one defends against future refactors that slip in an
      // early continue and produce a runtime `undefined` string.
      let result: string = '';
      if (hooks) {
        const hookResult = await hooks.fire('pre:tool', { toolName: fnName, args: fnArgs });
        if (hookResult.cancelled) {
          result = `[BLOCKED] ${hookResult.reason ?? 'No reason given'}`;

          messages.push({
            role: 'tool',
            content: result,
            tool_call_id: toolCall.id,
          });
          continue;
        }
      }

      // Fire pre:memory-write hook for save_memory tool
      if (hooks && fnName === 'save_memory') {
        const memoryHookResult = await hooks.fire('pre:memory-write', {
          toolName: fnName,
          args: fnArgs,
          memoryContent: fnArgs.content as string | undefined,
          memoryType: fnArgs.type as string | undefined,
        });
        if (memoryHookResult.cancelled) {
          result = `[BLOCKED] Memory write blocked: ${memoryHookResult.reason ?? 'No reason given'}`;
          messages.push({
            role: 'tool',
            content: result,
            tool_call_id: toolCall.id,
          });
          continue;
        }
      }

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
        toolsUsed.push(fnName);
      } else if (config.capabilityRouter) {
        const routes = config.capabilityRouter.resolve(fnName);
        const routeInfo = routes.map(r => `- [${r.source}] ${r.name}: ${r.description} (${r.available ? 'available' : 'not wired yet'})`).join('\n');
        const ACQUIRE_TOOL = 'acquire_capability';
        const hasMissing = routes.some(r => r.source === 'missing');
        const acquireHint = hasMissing && toolMap.has(ACQUIRE_TOOL)
          ? `\n\nTip: Use ${ACQUIRE_TOOL} to search for installable skills that might help.`
          : '';
        result = `Tool "${fnName}" not found. Here are alternatives:\n${routeInfo}${acquireHint}\n\nAvailable tools: ${Array.from(toolMap.keys()).join(', ')}`;
      } else {
        result = `Error: Unknown tool "${fnName}". Available tools: ${Array.from(toolMap.keys()).join(', ')}`;
      }

      // Review C2: sanitize BEFORE post-hooks + onToolResult callback.
      // Old order let audit sinks, telemetry hooks, team-sync, and UI callbacks all
      // see raw injection-flagged content. The scanner output is what flows into
      // model context on the next turn; it's also what should flow into every
      // downstream observer.
      const scanResult = scanForInjection(result, 'tool_output');
      if (!scanResult.safe) {
        result = `[SECURITY] Tool output flagged (${scanResult.flags.join(', ')}). Content sanitized.`;
      }

      // Notify on tool completion (now receives sanitized content)
      if (onToolResult) {
        onToolResult(fnName, fnArgs, result);
      }

      // Fire post:memory-write hook for save_memory tool (sanitized result)
      if (hooks && fnName === 'save_memory') {
        await hooks.fire('post:memory-write', {
          toolName: fnName,
          args: fnArgs,
          result,
          memoryContent: fnArgs.content as string | undefined,
          memoryType: fnArgs.type as string | undefined,
        });
      }

      // Fire post:tool hook (sanitized result)
      if (hooks) {
        await hooks.fire('post:tool', { toolName: fnName, args: fnArgs, result });
      }

      messages.push({
        role: 'tool',
        content: result,
        tool_call_id: toolCall.id,
      });
    }
  }

  // maxTurns reached — return any accumulated content rather than generic message.
  // Issue #4 — if D1 has already fired, prefer the user's captured answer
  // over the generic "max tool turns" fallback (the answer is the deliverable).
  return {
    content: gateState.preservedAnswerForDistillation
      ?? (allStreamedContent || `Max tool turns reached (${maxTurns} turns, ${toolsUsed.length} tools used).`),
    toolsUsed,
    usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
  };
}
