# Chat Turn Sequence

This diagram traces one conversational chat turn end to end: the frontend POSTs to the real endpoint `POST /api/chat`, which is an SSE stream (the server validates, then calls `reply.hijack()` and writes a raw `text/event-stream`). The route handler (`packages/server/src/local/routes/chat.ts`) assembles the layered system prompt via the per-session `Orchestrator` (`buildSystemPrompt` + `recallMemory`, where recall runs `HybridSearch` over the workspace mind), filters tools by persona/context, then calls `runAgentLoop`, which POSTs to LiteLLM at `${litellmUrl}/chat/completions`. Tool calls pass through the 11-step `executeToolCall` middleware chain (governance, hooks, LoopGuard, injection scan); a `TraceRecorder` wires additive trace callbacks. Tokens and tool events stream back to the UI as named SSE events, and after the loop `autoSaveFromExchange` runs the `CognifyPipeline` to write new memory frames. All claims are grounded in `sections/03a-api-chat-agents.md`, `sections/05a-subsystem-agent-runtime.md`, and `sections/05b-subsystem-memory.md`.

```mermaid
sequenceDiagram
    autonumber
    participant UI as "Frontend (chat UI)"
    participant Route as "POST /api/chat\nchat.ts (SSE)"
    participant Orch as "Orchestrator\nbuildSystemPrompt + recallMemory"
    participant Search as "HybridSearch\n(workspace mind)"
    participant Loop as "runAgentLoop\nagent-loop.ts"
    participant LLM as "LiteLLM\n/chat/completions"
    participant Tools as "executeToolCall\n11-step chain"
    participant Trace as "TraceRecorder"
    participant Cog as "CognifyPipeline\nautoSaveFromExchange"
    participant Disk as "session .jsonl"

    UI->>Route: "POST { message, workspace, session, model?, persona?, autonomy? }"
    Note over Route: "validate · injection scan score < 0.7 · RBAC · path guard (all pre-hijack)"
    alt rejected
        Route-->>UI: "400 / 403 JSON error (MESSAGE_TOO_LONG, INJECTION_DETECTED, ...)"
    else accepted
        Note over Route: "reply.hijack() · write SSE headers · wire AbortController to client close"
        Route->>Disk: "persistMessage user turn (append .jsonl)"
        Route->>Route: "generateTurnId UUID v4 · resolve model fallback chain"

        Route->>Orch: "recallMemory(query, turnId)"
        Note over Orch: "catch-up vs semantic · drop temporary/deprecated · injection scan"
        Orch->>Search: "search(query) keyword + vector"
        Search-->>Orch: "SearchResult[] ranked by finalScore = rrfScore * relevanceScore"
        Orch-->>Route: "recalledContext text"
        Route-->>UI: "event: step  Recalling relevant memories..."
        Route-->>UI: "event: tool / tool_result  (auto_recall)"

        Route->>Orch: "buildSystemPrompt()"
        Orch-->>Route: "identity + self-awareness + preloaded context"
        Note over Route: "layer profile + runtime facts + activeSpec.rules + skills + Workspace Now + corrections, then composePersonaPrompt"
        Note over Route: "filterToolsForContext + filterAvailableTools + persona allow/deny"

        Route->>Loop: "runAgentLoop { systemPrompt, tools, messages, stream:true, maxTurns:200, turnId, traceRecording }"

        loop "each turn up to maxTurns"
            Loop->>LLM: "POST /chat/completions { model, messages, tools, stream }"
            Note over Loop,LLM: "signal = client-abort + 300s timeout · 429/5xx -> backoff, turn--, retry"
            LLM-->>Loop: "stream chunks: content + tool_calls + usage"
            Loop-->>UI: "event: token  xN assistant text"

            alt "tool_calls present"
                Loop-->>UI: "event: tool { name, input }"
                Loop->>Tools: "executeToolCall(name, args)"
                Note over Tools: "parse args -> onToolUse -> governance blockedTools -> pre:tool -> pre:memory-write -> LoopGuard.check -> execute -> scanForInjection -> onToolResult -> post hooks"
                opt "gated tool"
                    Loop-->>UI: "event: approval_required { requestId, toolName, input }"
                    UI->>Route: "POST /api/approval/:requestId { approved, always? }"
                    Route-->>Loop: "resolve(approved)  (auto-deny after 5 min)"
                end
                Tools->>Trace: "record tool call + sanitized result"
                Tools-->>Loop: "role:tool result message (sanitized)"
                Loop-->>UI: "event: tool_result { name, result, isError }"
            else "no tool_calls (final answer)"
                Note over Loop: "maybeFireCompletionGate: D3 verification -> D4 phantom-write -> D1 skill-distillation"
                alt "a gate fired"
                    Note over Loop: "push corrective directive, continue one more turn"
                else "none fired"
                    Loop-->>Trace: "finalize trace"
                    Loop-->>Route: "AgentResponse { content, toolsUsed, usage }"
                end
            end
        end

        Note over Route: "cost tracking · KG entity extraction · disclaimers"
        Route->>Cog: "autoSaveFromExchange(message, result.content)"
        Cog->>Disk: "cognify writes new memory frame (I/P) + FTS + vec index + entities"
        Route->>Orch: "commitSurfacedSignals()"
        Route->>Disk: "persistMessage assistant turn"
        Route-->>UI: "event: done { content, usage, toolsUsed, model, cost? }"
    end
    Note over Route: "on failure -> event: error { message }  (raw turn still persisted) · finally: raw.end()"
```
