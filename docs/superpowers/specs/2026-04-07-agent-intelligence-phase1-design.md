# Agent Intelligence Layer — Phase 1 Design Specification
## Prompt Caching + Iteration Budget + Smart Model Routing
### Date: 2026-04-07 | Scope: Backend only, 3 features

---

## Problem

1. **No prompt caching** — every multi-turn message re-sends the full system prompt (~4K tokens) at full price. Anthropic supports cache_control for ~75% input cost reduction, but we don't use it.
2. **No iteration limit** — a runaway agent can loop indefinitely, burning $50+ in one conversation with no way to stop it programmatically.
3. **No smart routing** — simple questions ("what time is it?") go to the expensive primary model. Most chat turns are simple and could use the free/cheap budget model.

## Solution

Three independent backend features that compose with the existing Model Pilot system.

---

## 1. Prompt Caching

### What
Add Anthropic `cache_control` breakpoints to the built-in proxy's message formatting.

### Where
`packages/server/src/local/routes/anthropic-proxy.ts` — the proxy that forwards chat/completions to Anthropic's API.

### How
Before forwarding the messages array to Anthropic, mark up to 4 breakpoints (Anthropic's limit):
- Breakpoint 1: System prompt (largest, most stable content)
- Breakpoints 2-4: Last 3 non-system messages (rolling window)

Each breakpoint gets `cache_control: { type: "ephemeral" }` with 5-minute TTL (Anthropic default).

### Rules
- Only apply to Anthropic-bound requests (not OpenRouter, not LiteLLM)
- Never mutate the original messages array — clone first
- If messages have fewer than 4 entries, use fewer breakpoints
- System prompt breakpoint is always first priority

### Expected Impact
- Multi-turn conversations: ~75% input token cost reduction
- Single-turn: no change (nothing to cache)
- Zero latency impact (Anthropic handles caching server-side)

---

## 2. Iteration Budget

### What
A per-conversation counter that limits total LLM calls and communicates pressure to the model.

### New File
`packages/agent/src/iteration-budget.ts`

### Interface
```typescript
interface IterationBudgetConfig {
  maxIterations: number;        // default: 90
  cautionThreshold: number;     // default: 0.7 (70%)
  warningThreshold: number;     // default: 0.9 (90%)
  freeToolCalls: string[];      // tool names that don't count (e.g., code execution)
}

class IterationBudget {
  constructor(config: IterationBudgetConfig);
  tick(toolName?: string): void;           // Increment (unless free tool)
  readonly used: number;
  readonly remaining: number;
  readonly exhausted: boolean;
  getPressureMessage(): string | null;     // Returns warning text or null
}
```

### Pressure Messages
Appended to the last tool result content (NOT as a separate message — prevents context structure breakage):

- At 70%: `"\n\n[BUDGET: {remaining}/{max} iterations left. Start consolidating your work and prepare a response.]"`
- At 90%: `"\n\n[BUDGET WARNING: {remaining}/{max} iterations left. Wrap up immediately and respond to the user NOW.]"`
- At 100%: Hard stop — agent loop exits, returns whatever content accumulated so far

### Integration Points
- `packages/server/src/local/routes/chat.ts` — Create budget per conversation, pass to agent loop
- `packages/agent/src/agent-loop.ts` — Check `budget.exhausted` before each LLM call, append `budget.getPressureMessage()` to tool results

### Config Source
Read from `config.json` via WaggleConfig. New fields:
```typescript
maxIterations?: number;       // default 90
cautionThreshold?: number;    // default 0.7
warningThreshold?: number;    // default 0.9
```

### Subagent Budgets
Each subagent (spawned via /spawn) gets an independent budget with `maxIterations` from the spawn config (default 50). Parent and child budgets are NOT shared.

---

## 3. Smart Model Routing

### What
Heuristic classifier that routes simple messages to the budget model before the agent loop starts.

### New File
`packages/agent/src/smart-router.ts`

### Interface
```typescript
interface RoutingDecision {
  model: string;
  reason: 'simple_turn' | 'normal';
}

function routeMessage(
  message: string,
  primaryModel: string,
  budgetModel: string | null,
): RoutingDecision;
```

### Heuristics (all must be true for cheap routing)
```
message.length <= 500
word count <= 80
no code blocks (```)
no backticks (`)
no URLs (http:// or https://)
no multi-line (fewer than 3 newlines)
no complex keywords: debug, error, fix, refactor, implement, architect, design, analyze, review, migrate, deploy, build, test
```

If ANY condition fails → use primary model. If ALL pass → use budget model.

### Integration
- `packages/server/src/local/routes/chat.ts` — After Model Pilot resolution, before agent loop, call `routeMessage()`. If budget model is configured and message is simple, override `resolvedModel`.
- Routing reason stored in response metadata: `{ routedModel: "qwen/...", routingReason: "simple_turn" }`
- If `budgetModel` is null (user hasn't configured one), smart routing is disabled.

### Interaction with Model Pilot
```
1. Model Pilot resolves: primary / fallback / budget based on config
2. Smart Router checks: is this message simple enough for budget model?
3. If yes AND budget model configured → use budget model
4. Budget check (existing): if daily spend > threshold → already using budget model
5. Fallback chain (existing): if model fails → try fallback

Priority: budget_spend_check > smart_routing > primary
(If budget threshold already triggered, smart routing is redundant)
```

---

## File Changes Summary

| File | Change | New? |
|------|--------|------|
| `packages/server/src/local/routes/anthropic-proxy.ts` | Add cache_control breakpoints | No |
| `packages/agent/src/iteration-budget.ts` | IterationBudget class | Yes |
| `packages/agent/src/smart-router.ts` | routeMessage() heuristic | Yes |
| `packages/server/src/local/routes/chat.ts` | Wire budget + routing | No |
| `packages/agent/src/agent-loop.ts` | Budget check + pressure injection | No |
| `packages/core/src/config.ts` | maxIterations, cautionThreshold, warningThreshold fields | No |
| **Total** | 4 modified, 2 new | |

---

## Out of Scope

- UI changes (all backend)
- Budget display in frontend (later sprint)
- ML-based routing classifier (heuristics are sufficient)
- Per-workspace budget configuration (global only)
- Prompt caching for non-Anthropic providers (each has its own caching mechanism)

---

## Success Criteria

- [ ] Multi-turn conversations show ~75% input token reduction in Anthropic billing
- [ ] Agent stops after maxIterations (default 90) with accumulated content returned
- [ ] Pressure messages appear in tool results at 70% and 90% thresholds
- [ ] Simple messages ("what is 2+2?") route to budget model
- [ ] Complex messages ("implement a REST API with auth") route to primary model
- [ ] TypeScript compiles with zero errors across all packages
- [ ] Existing tests pass with zero regressions
