# Agent Intelligence Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add prompt caching (75% cost reduction), iteration budget (prevents runaway agents), and smart model routing (auto-routes simple messages to cheap model).

**Architecture:** Three independent backend features that compose with the existing Model Pilot system. Prompt caching modifies the Anthropic proxy. Iteration budget is a new class injected into the chat route and agent loop. Smart routing is a heuristic classifier that runs before the agent loop.

**Tech Stack:** TypeScript, Fastify (server), Anthropic Messages API (caching), existing WaggleConfig for persistence.

---

### Task 1: Prompt Caching in Anthropic Proxy

**Files:**
- Modify: `packages/server/src/local/routes/anthropic-proxy.ts:125-131`

- [ ] **Step 1: Add cache_control to system prompt and messages**

In `packages/server/src/local/routes/anthropic-proxy.ts`, find the `anthropicBody` construction (line 125-131):

```typescript
    const anthropicBody: Record<string, unknown> = {
      model: mapModel(body.model),
      max_tokens: body.max_tokens ?? 4096,
      system,
      messages: merged,
      stream: body.stream ?? false,
    };
```

Replace with:

```typescript
    // Apply Anthropic prompt caching — cache system prompt for multi-turn efficiency
    // See: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
    const systemWithCache = system
      ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' as const } }]
      : undefined;

    // Mark last 3 non-system messages for caching (rolling window)
    // Anthropic allows max 4 cache breakpoints — 1 for system + 3 for messages
    const cachedMessages = merged.map((msg, i) => {
      const isInCacheWindow = i >= merged.length - 3;
      if (!isInCacheWindow) return msg;

      // Add cache_control to the message content
      const content = msg.content;
      if (typeof content === 'string') {
        return { ...msg, content: [{ type: 'text', text: content, cache_control: { type: 'ephemeral' } }] };
      }
      if (Array.isArray(content) && content.length > 0) {
        const lastBlock = content[content.length - 1];
        const taggedBlock = { ...lastBlock, cache_control: { type: 'ephemeral' } };
        return { ...msg, content: [...content.slice(0, -1), taggedBlock] };
      }
      return msg;
    });

    const anthropicBody: Record<string, unknown> = {
      model: mapModel(body.model),
      max_tokens: body.max_tokens ?? 4096,
      system: systemWithCache ?? system,
      messages: cachedMessages,
      stream: body.stream ?? false,
    };
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project packages/server/tsconfig.json`
Expected: Zero errors.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/local/routes/anthropic-proxy.ts
git commit -m "feat(proxy): add Anthropic prompt caching — cache system prompt + last 3 messages for ~75% cost reduction"
```

---

### Task 2: Iteration Budget Class

**Files:**
- Create: `packages/agent/src/iteration-budget.ts`
- Test: `packages/agent/tests/iteration-budget.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/agent/tests/iteration-budget.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { IterationBudget } from '../src/iteration-budget.js';

describe('IterationBudget', () => {
  it('starts with zero used', () => {
    const budget = new IterationBudget({ maxIterations: 10 });
    expect(budget.used).toBe(0);
    expect(budget.remaining).toBe(10);
    expect(budget.exhausted).toBe(false);
  });

  it('increments on tick', () => {
    const budget = new IterationBudget({ maxIterations: 10 });
    budget.tick();
    budget.tick();
    expect(budget.used).toBe(2);
    expect(budget.remaining).toBe(8);
  });

  it('marks exhausted at max', () => {
    const budget = new IterationBudget({ maxIterations: 3 });
    budget.tick();
    budget.tick();
    budget.tick();
    expect(budget.exhausted).toBe(true);
    expect(budget.remaining).toBe(0);
  });

  it('skips free tool calls', () => {
    const budget = new IterationBudget({
      maxIterations: 10,
      freeToolCalls: ['execute_code'],
    });
    budget.tick('execute_code');
    budget.tick('execute_code');
    expect(budget.used).toBe(0); // free tools don't count
    budget.tick('web_search');
    expect(budget.used).toBe(1);
  });

  it('returns null pressure below caution threshold', () => {
    const budget = new IterationBudget({ maxIterations: 10, cautionThreshold: 0.7 });
    budget.tick(); // 10%
    expect(budget.getPressureMessage()).toBeNull();
  });

  it('returns caution message at 70%', () => {
    const budget = new IterationBudget({ maxIterations: 10, cautionThreshold: 0.7 });
    for (let i = 0; i < 7; i++) budget.tick();
    const msg = budget.getPressureMessage();
    expect(msg).toContain('BUDGET');
    expect(msg).toContain('3');
    expect(msg).toContain('consolidating');
  });

  it('returns warning message at 90%', () => {
    const budget = new IterationBudget({ maxIterations: 10, warningThreshold: 0.9 });
    for (let i = 0; i < 9; i++) budget.tick();
    const msg = budget.getPressureMessage();
    expect(msg).toContain('WARNING');
    expect(msg).toContain('1');
    expect(msg).toContain('NOW');
  });

  it('uses default thresholds when not specified', () => {
    const budget = new IterationBudget({ maxIterations: 100 });
    for (let i = 0; i < 70; i++) budget.tick();
    expect(budget.getPressureMessage()).toContain('BUDGET');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/agent/tests/iteration-budget.test.ts --reporter=verbose`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement IterationBudget**

Create `packages/agent/src/iteration-budget.ts`:

```typescript
/**
 * IterationBudget — per-conversation LLM call counter with pressure warnings.
 *
 * Prevents runaway agents by limiting total iterations and communicating
 * budget pressure to the model via messages appended to tool results.
 */

export interface IterationBudgetConfig {
  /** Maximum LLM calls per conversation. Default: 90 */
  maxIterations: number;
  /** Fraction at which caution message appears. Default: 0.7 */
  cautionThreshold?: number;
  /** Fraction at which warning message appears. Default: 0.9 */
  warningThreshold?: number;
  /** Tool names that don't consume budget (e.g., code execution). Default: [] */
  freeToolCalls?: string[];
}

export class IterationBudget {
  private readonly max: number;
  private readonly cautionAt: number;
  private readonly warningAt: number;
  private readonly freeTools: ReadonlySet<string>;
  private count = 0;

  constructor(config: IterationBudgetConfig) {
    this.max = config.maxIterations;
    this.cautionAt = config.cautionThreshold ?? 0.7;
    this.warningAt = config.warningThreshold ?? 0.9;
    this.freeTools = new Set(config.freeToolCalls ?? []);
  }

  /** Record one iteration. Free tool calls are skipped. */
  tick(toolName?: string): void {
    if (toolName && this.freeTools.has(toolName)) return;
    this.count++;
  }

  get used(): number {
    return this.count;
  }

  get remaining(): number {
    return Math.max(0, this.max - this.count);
  }

  get exhausted(): boolean {
    return this.count >= this.max;
  }

  /**
   * Returns a pressure message to append to tool results, or null if no pressure yet.
   * Two tiers: caution (consolidate) and warning (respond NOW).
   */
  getPressureMessage(): string | null {
    const fraction = this.count / this.max;
    if (fraction >= this.warningAt) {
      return `\n\n[BUDGET WARNING: ${this.remaining}/${this.max} iterations remaining. Wrap up immediately and respond to the user NOW.]`;
    }
    if (fraction >= this.cautionAt) {
      return `\n\n[BUDGET: ${this.remaining}/${this.max} iterations remaining. Start consolidating your work and prepare a response.]`;
    }
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/agent/tests/iteration-budget.test.ts --reporter=verbose`
Expected: All 8 tests PASS.

- [ ] **Step 5: Export from package index**

In `packages/agent/src/index.ts`, add:

```typescript
export { IterationBudget, type IterationBudgetConfig } from './iteration-budget.js';
```

- [ ] **Step 6: Commit**

```bash
git add packages/agent/src/iteration-budget.ts packages/agent/tests/iteration-budget.test.ts packages/agent/src/index.ts
git commit -m "feat(agent): add IterationBudget — per-conversation LLM call limit with pressure warnings"
```

---

### Task 3: Smart Model Router

**Files:**
- Create: `packages/agent/src/smart-router.ts`
- Test: `packages/agent/tests/smart-router.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/agent/tests/smart-router.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { routeMessage } from '../src/smart-router.js';

describe('routeMessage', () => {
  const primary = 'claude-sonnet-4-6';
  const budget = 'qwen/qwen3.6-plus:free';

  it('routes simple short message to budget model', () => {
    const result = routeMessage('What time is it?', primary, budget);
    expect(result.model).toBe(budget);
    expect(result.reason).toBe('simple_turn');
  });

  it('routes complex message to primary model', () => {
    const result = routeMessage('Implement a REST API with JWT authentication and role-based access control', primary, budget);
    expect(result.model).toBe(primary);
    expect(result.reason).toBe('normal');
  });

  it('routes message with code blocks to primary', () => {
    const result = routeMessage('Fix this:\n```\nconst x = 1;\n```', primary, budget);
    expect(result.model).toBe(primary);
    expect(result.reason).toBe('normal');
  });

  it('routes message with URL to primary', () => {
    const result = routeMessage('Check https://example.com for errors', primary, budget);
    expect(result.model).toBe(primary);
    expect(result.reason).toBe('normal');
  });

  it('routes message with debug keywords to primary', () => {
    const result = routeMessage('debug this error please', primary, budget);
    expect(result.model).toBe(primary);
    expect(result.reason).toBe('normal');
  });

  it('routes long message to primary', () => {
    const long = 'word '.repeat(100);
    const result = routeMessage(long, primary, budget);
    expect(result.model).toBe(primary);
    expect(result.reason).toBe('normal');
  });

  it('routes multi-line message to primary', () => {
    const result = routeMessage('line one\nline two\nline three\nline four', primary, budget);
    expect(result.model).toBe(primary);
    expect(result.reason).toBe('normal');
  });

  it('returns primary when budget model is null', () => {
    const result = routeMessage('Hello', primary, null);
    expect(result.model).toBe(primary);
    expect(result.reason).toBe('normal');
  });

  it('routes greeting to budget', () => {
    const result = routeMessage('Hi there!', primary, budget);
    expect(result.model).toBe(budget);
    expect(result.reason).toBe('simple_turn');
  });

  it('routes translation request to budget', () => {
    const result = routeMessage('Translate "hello" to Serbian', primary, budget);
    expect(result.model).toBe(budget);
    expect(result.reason).toBe('simple_turn');
  });

  it('routes message with backtick to primary', () => {
    const result = routeMessage('What does `useState` do?', primary, budget);
    expect(result.model).toBe(primary);
    expect(result.reason).toBe('normal');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/agent/tests/smart-router.test.ts --reporter=verbose`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement routeMessage**

Create `packages/agent/src/smart-router.ts`:

```typescript
/**
 * Smart Model Router — heuristic classifier that routes simple messages
 * to the budget model for cost optimization.
 *
 * Integrates with Model Pilot: simple → budget, normal → primary, failure → fallback.
 */

export interface RoutingDecision {
  model: string;
  reason: 'simple_turn' | 'normal';
}

const COMPLEX_KEYWORDS = /\b(debug|error|fix|refactor|implement|architect|design|analyze|review|migrate|deploy|build|test|create|generate|write|develop|configure|setup|install)\b/i;

/**
 * Route a user message to either the primary or budget model.
 * Returns budget model only if ALL simplicity checks pass.
 */
export function routeMessage(
  message: string,
  primaryModel: string,
  budgetModel: string | null,
): RoutingDecision {
  // No budget model configured → always primary
  if (!budgetModel) {
    return { model: primaryModel, reason: 'normal' };
  }

  // Length checks
  if (message.length > 500) {
    return { model: primaryModel, reason: 'normal' };
  }

  const wordCount = message.split(/\s+/).filter(Boolean).length;
  if (wordCount > 80) {
    return { model: primaryModel, reason: 'normal' };
  }

  // Code detection
  if (message.includes('```') || message.includes('`')) {
    return { model: primaryModel, reason: 'normal' };
  }

  // URL detection
  if (/https?:\/\//.test(message)) {
    return { model: primaryModel, reason: 'normal' };
  }

  // Multi-line detection (3+ newlines = complex)
  const newlineCount = (message.match(/\n/g) || []).length;
  if (newlineCount >= 3) {
    return { model: primaryModel, reason: 'normal' };
  }

  // Complex keyword detection
  if (COMPLEX_KEYWORDS.test(message)) {
    return { model: primaryModel, reason: 'normal' };
  }

  // All checks passed → simple message, use budget model
  return { model: budgetModel, reason: 'simple_turn' };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/agent/tests/smart-router.test.ts --reporter=verbose`
Expected: All 11 tests PASS.

- [ ] **Step 5: Export from package index**

In `packages/agent/src/index.ts`, add:

```typescript
export { routeMessage, type RoutingDecision } from './smart-router.js';
```

- [ ] **Step 6: Commit**

```bash
git add packages/agent/src/smart-router.ts packages/agent/tests/smart-router.test.ts packages/agent/src/index.ts
git commit -m "feat(agent): add smart model router — heuristic classifier for budget model routing"
```

---

### Task 4: Wire Budget + Routing into Chat Route

**Files:**
- Modify: `packages/server/src/local/routes/chat.ts:620-640` (model resolution)
- Modify: `packages/server/src/local/routes/chat.ts:1182-1206` (agent runner call)

- [ ] **Step 1: Add imports at top of chat.ts**

At the top of `packages/server/src/local/routes/chat.ts`, add after the existing imports:

```typescript
import { IterationBudget } from '@waggle/agent';
import { routeMessage } from '@waggle/agent';
```

Check if these are already importable from `@waggle/agent`. If not, import from the direct path:

```typescript
import { IterationBudget } from '../../../../agent/src/iteration-budget.js';
import { routeMessage } from '../../../../agent/src/smart-router.js';
```

- [ ] **Step 2: Add smart routing after Model Pilot resolution**

Find the Model Pilot resolution block (around line 620-640) that ends with:

```typescript
      let resolvedModel = primaryModel;
      let modelSwitchReason: string | null = null;
```

After the budget check `if (dailyBudget && ...)` block, add smart routing:

```typescript
      // Smart routing: if message is simple and no budget override already applied, use budget model
      if (!modelSwitchReason && budgetModel) {
        const routing = routeMessage(message, resolvedModel, budgetModel);
        if (routing.reason === 'simple_turn') {
          resolvedModel = routing.model;
          // Don't set modelSwitchReason — smart routing is silent (no toast)
        }
      }
```

- [ ] **Step 3: Create iteration budget before agent loop**

Before the agent loop config construction (around line 1073), add:

```typescript
        // Create iteration budget for this conversation
        const iterBudget = new IterationBudget({
          maxIterations: pilotConfig.getMaxIterations?.() ?? 90,
          freeToolCalls: ['execute_code'],
        });
```

Note: `getMaxIterations()` may not exist yet on WaggleConfig. If not, use hardcoded default:

```typescript
        const iterBudget = new IterationBudget({
          maxIterations: 90,
          freeToolCalls: ['execute_code'],
        });
```

- [ ] **Step 4: Add budget check in the agent runner wrapper**

Find the fallback chain wrapper (around line 1182). Before `result = await agentRunner(agentConfig);`, add budget exhaustion check:

```typescript
        // Check iteration budget before each agent call
        if (iterBudget.exhausted) {
          // Budget exhausted — return accumulated content
          break;
        }
        iterBudget.tick();
```

After the agent runner returns (after the model switch notification block), inject budget pressure into the next tool result if needed. Find where tool results are added to messages and append:

```typescript
        // Inject budget pressure into response metadata
        const pressure = iterBudget.getPressureMessage();
        if (pressure) {
          sendEvent('step', { content: pressure.trim() });
        }
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project packages/server/tsconfig.json`
Expected: Zero errors.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/local/routes/chat.ts
git commit -m "feat(chat): wire iteration budget + smart routing into chat route"
```

---

### Task 5: Add config fields for budget settings

**Files:**
- Modify: `packages/core/src/config.ts:19-35` (ConfigData interface)
- Modify: `packages/core/src/config.ts:112+` (after budget threshold methods)
- Test: `packages/core/tests/config.test.ts`

- [ ] **Step 1: Write failing test**

Add to `packages/core/tests/config.test.ts` in the existing "Model Pilot config fields" describe block:

```typescript
  it('returns 90 as default maxIterations', () => {
    const config = new WaggleConfig(tmpDir);
    expect(config.getMaxIterations()).toBe(90);
  });

  it('persists maxIterations', () => {
    const config = new WaggleConfig(tmpDir);
    config.setMaxIterations(50);
    config.save();
    const config2 = new WaggleConfig(tmpDir);
    expect(config2.getMaxIterations()).toBe(50);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/tests/config.test.ts -t "maxIterations" --reporter=verbose`
Expected: FAIL — methods don't exist.

- [ ] **Step 3: Add fields to ConfigData and methods to WaggleConfig**

In `packages/core/src/config.ts`, add to ConfigData interface (after `budgetThreshold`):

```typescript
  /** Agent Intelligence: max LLM iterations per conversation. Default 90. */
  maxIterations?: number;
```

Add methods after the Model Pilot section:

```typescript
  // --- Agent Intelligence ---

  getMaxIterations(): number {
    return this.data.maxIterations ?? 90;
  }

  setMaxIterations(max: number): void {
    this.data.maxIterations = Math.max(5, Math.min(500, max));
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/tests/config.test.ts -t "maxIterations" --reporter=verbose`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/config.ts packages/core/tests/config.test.ts
git commit -m "feat(config): add maxIterations field for agent iteration budget"
```

---

### Task 6: Final Verification

**Files:** None (verification only)

- [ ] **Step 1: TypeScript compilation — all packages**

```bash
npx tsc --noEmit --project packages/core/tsconfig.json
npx tsc --noEmit --project packages/agent/tsconfig.json
npx tsc --noEmit --project packages/server/tsconfig.json
```

Expected: All zero errors.

- [ ] **Step 2: Run all related tests**

```bash
npx vitest run packages/agent/tests/iteration-budget.test.ts packages/agent/tests/smart-router.test.ts packages/core/tests/config.test.ts --reporter=verbose
```

Expected: All tests pass (8 + 11 + existing = ~30 total).

- [ ] **Step 3: Run full test suite for regression check**

```bash
npm run test -- --run 2>&1 | tail -5
```

Expected: Same pass/fail ratio as before (no regressions).

- [ ] **Step 4: Verify prompt caching works (manual)**

If Anthropic proxy is running, send a multi-turn conversation and check response headers for `anthropic-cache-creation-tokens` or `anthropic-cache-read-tokens` in the proxy response.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: Agent Intelligence Phase 1 — prompt caching, iteration budget, smart model routing"
git push origin main
```
