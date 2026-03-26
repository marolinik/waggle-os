import type { ToolDefinition } from './tools.js';
import { LoopGuard } from './loop-guard.js';
import { scanForInjection } from './injection-scanner.js';
import type { HookRegistry } from './hooks.js';
import type { CapabilityRouter } from './capability-router.js';

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
  /** Team governance policies — blocked tools and allowed sources */
  governancePolicies?: {
    blockedTools?: string[];
    allowedSources?: string[];
  };
}

export async function runAgentLoop(config: AgentLoopConfig): Promise<AgentResponse> {
  const {
    litellmUrl,
    litellmApiKey,
    model,
    systemPrompt,
    tools: configTools,
    messages: inputMessages,
    onToken,
    onToolUse,
    onToolResult,
    maxTurns = 10,
    stream = false,
    fetch: fetchFn = globalThis.fetch,
    hooks,
    pluginTools: pluginToolProvider,
  } = config;

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
  let retryCount = 0;
  const MAX_RETRIES = 3;

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
      retryCount++;
      if (retryCount >= MAX_RETRIES) {
        throw new Error(`Rate limit retry cap exceeded (${MAX_RETRIES} consecutive 429 responses). Try again later.`);
      }
      const retryAfter = parseInt(response.headers.get('retry-after') ?? '5', 10);
      const waitMs = Math.min(retryAfter * 1000, 60_000);
      if (onToken) onToken(`\n[Rate limited — waiting ${retryAfter}s (retry ${retryCount}/${MAX_RETRIES})...]\n`);
      await new Promise(r => setTimeout(r, waitMs));
      turn--; // retry this turn without consuming a turn
      continue;
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error');
      // Retry on transient server errors (502, 503, 504)
      if ([502, 503, 504].includes(response.status)) {
        retryCount++;
        if (retryCount >= MAX_RETRIES) {
          throw new Error(`Server error retry cap exceeded (${MAX_RETRIES} consecutive ${response.status} errors): ${errorBody}`);
        }
        const waitMs = Math.min(2000 * (retryCount), 10_000);
        if (onToken) onToken(`\n[Server error ${response.status} — retrying in ${waitMs / 1000}s (retry ${retryCount}/${MAX_RETRIES})...]\n`);
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
      // Parse SSE stream
      let accumulatedContent = '';
      const accumulatedToolCalls = new Map<
        number,
        { id: string; type: 'function'; function: { name: string; arguments: string } }
      >();

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE events (separated by double newlines)
        const parts = buffer.split('\n\n');
        // Last part may be incomplete — keep it in the buffer
        buffer = parts.pop()!;

        for (const part of parts) {
          for (const line of part.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            const payload = line.slice(6).trim();
            if (payload === '[DONE]') continue;

            let chunk: any;
            try {
              chunk = JSON.parse(payload);
            } catch {
              continue;
            }

            // Extract usage from any chunk that has it
            if (chunk.usage) {
              turnInputTokens = chunk.usage.prompt_tokens ?? turnInputTokens;
              turnOutputTokens = chunk.usage.completion_tokens ?? turnOutputTokens;
            }

            const delta = chunk.choices?.[0]?.delta;
            if (!delta) continue;

            // Accumulate content tokens (both per-turn and across all turns)
            if (delta.content) {
              accumulatedContent += delta.content;
              allStreamedContent += delta.content;
              if (onToken) {
                onToken(delta.content);
              }
            }

            // Accumulate tool calls
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                if (!accumulatedToolCalls.has(idx)) {
                  accumulatedToolCalls.set(idx, {
                    id: tc.id ?? '',
                    type: 'function' as const,
                    function: { name: tc.function?.name ?? '', arguments: '' },
                  });
                }
                const existing = accumulatedToolCalls.get(idx)!;
                if (tc.id) existing.id = tc.id;
                if (tc.function?.name) existing.function.name = tc.function.name;
                if (tc.function?.arguments) {
                  existing.function.arguments += tc.function.arguments;
                }
              }
            }
          }
        }
      }

      const toolCallsArray =
        accumulatedToolCalls.size > 0
          ? Array.from(accumulatedToolCalls.values())
          : undefined;

      assistantMessage = {
        // Use empty string (not null) when there are tool_calls — some LLM proxies
        // (LiteLLM→Anthropic) mishandle null content alongside tool_use blocks
        content: accumulatedContent || (toolCallsArray ? '' : null),
        tool_calls: toolCallsArray,
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
    retryCount = 0; // Reset retry counter on successful response

    // Check token budget
    if (config.maxTokenBudget && (totalInputTokens + totalOutputTokens) > config.maxTokenBudget) {
      const used = totalInputTokens + totalOutputTokens;
      return {
        content: `Token budget exceeded (used ${used} tokens, limit ${config.maxTokenBudget}).`,
        toolsUsed,
        usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      };
    }

    // No tool calls — return the final response
    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      // Use this turn's content, or fall back to all accumulated streamed content
      const content = (assistantMessage.content ?? '') || allStreamedContent;
      // In non-streaming mode, emit the full content as a single token
      if (!stream && onToken && content) {
        onToken(content);
      }
      return {
        content,
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

      // Fire pre:tool hook — may cancel execution
      let result: string;
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
        try {
          result = await tool.execute(fnArgs);
        } catch (err) {
          result = `Error executing ${fnName}: ${(err as Error).message}`;
        }
        toolsUsed.push(fnName);
      } else if (config.capabilityRouter) {
        const routes = config.capabilityRouter.resolve(fnName);
        const routeInfo = routes.map(r => `- [${r.source}] ${r.name}: ${r.description} (${r.available ? 'available' : 'not wired yet'})`).join('\n');
        const hasMissing = routes.some(r => r.source === 'missing');
        const acquireHint = hasMissing && toolMap.has('acquire_capability')
          ? '\n\nTip: Use acquire_capability to search for installable skills that might help.'
          : '';
        result = `Tool "${fnName}" not found. Here are alternatives:\n${routeInfo}${acquireHint}\n\nAvailable tools: ${Array.from(toolMap.keys()).join(', ')}`;
      } else {
        result = `Error: Unknown tool "${fnName}". Available tools: ${Array.from(toolMap.keys()).join(', ')}`;
      }

      // Notify on tool completion
      if (onToolResult) {
        onToolResult(fnName, fnArgs, result);
      }

      // Fire post:memory-write hook for save_memory tool
      if (hooks && fnName === 'save_memory') {
        await hooks.fire('post:memory-write', {
          toolName: fnName,
          args: fnArgs,
          result,
          memoryContent: fnArgs.content as string | undefined,
          memoryType: fnArgs.type as string | undefined,
        });
      }

      // Fire post:tool hook
      if (hooks) {
        await hooks.fire('post:tool', { toolName: fnName, args: fnArgs, result });
      }

      const scanResult = scanForInjection(result, 'tool_output');
      if (!scanResult.safe) {
        result = `[SECURITY] Tool output flagged (${scanResult.flags.join(', ')}). Content sanitized.`;
      }

      messages.push({
        role: 'tool',
        content: result,
        tool_call_id: toolCall.id,
      });
    }
  }

  // maxTurns reached — return any accumulated content rather than generic message
  return {
    content: allStreamedContent || `Max tool turns reached (${maxTurns} turns, ${toolsUsed.length} tools used).`,
    toolsUsed,
    usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
  };
}
