# Repo Cleanup & Code Quality Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all CRITICAL and HIGH issues found by 3-agent audit (dead code, code quality, TypeScript strictness), remove dead code, consolidate duplicates, and bring oversized files under the 800-line limit.

**Architecture:** Surgical fixes — each task targets one file or concern. No feature changes. Every change must be backward-compatible and pass existing tests.

**Tech Stack:** TypeScript, React 18, Vitest

---

## File Map

| File | Action | What |
|---|---|---|
| `packages/agent/src/cron-delivery-router.ts` | Modify | Fix XSS in HTML email |
| `apps/web/src/hooks/useChat.ts` | Modify | Fix state mutation, unsafe casts, type safety |
| `apps/web/src/lib/types.ts` | Modify | Add block ID field, type SSE events properly |
| `apps/web/src/components/os/apps/chat-blocks/BlockRenderer.tsx` | Modify | Use stable keys |
| `packages/agent/src/credential-pool.ts` | Modify | Extract shared recovery method, add constant |
| `packages/agent/src/context-compressor.ts` | Modify | Log summarizer failures |
| `apps/web/src/lib/providers.ts` | Modify | Remove 6 dead exports |
| `packages/server/src/local/routes/skills.ts` | Modify | Replace console.log with logger |
| `packages/server/src/local/service.ts` | Modify | Replace console.log with logger |
| `packages/server/src/local/cron.ts` | Modify | Replace console.warn with logger |
| `packages/agent/src/index.ts` | Modify | Remove mock connector exports |

---

### Task 1: Fix XSS in cron delivery router HTML email

**Files:**
- Modify: `packages/agent/src/cron-delivery-router.ts`
- Modify: `packages/agent/tests/cron-delivery-router.test.ts`

- [ ] **Step 1: Add escapeHtml utility and fix the email params**

In `cron-delivery-router.ts`, add before the `buildChannelParams` function:

```typescript
/** Escape HTML entities to prevent XSS in email content */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
```

Then in `buildChannelParams`, update the email case:

```typescript
    case 'email':
      return {
        to: preferences.emailTo ?? '',
        subject: `[Waggle] ${message.title}`,
        body: message.body,
        html: `<h3>${escapeHtml(message.title)}</h3><p>${escapeHtml(message.body).replace(/\n/g, '<br>')}</p>`,
      };
```

- [ ] **Step 2: Add test for HTML escaping**

Add to `cron-delivery-router.test.ts`:

```typescript
  it('escapes HTML in email body to prevent XSS', async () => {
    const emailConnector = makeConnector(true);
    const registry = makeRegistry({ gmail: emailConnector });
    const emitter = makeEmitter();
    const prefs = createDefaultDeliveryPreferences({
      defaultChannels: ['email'],
      emailTo: 'user@test.com',
    });

    await deliverCronResult(
      makeMessage({ title: '<script>alert("xss")</script>', body: 'Test & "quotes"' }),
      prefs, registry, emitter,
    );

    const callArgs = (emailConnector.execute as any).mock.calls[0][1];
    expect(callArgs.html).not.toContain('<script>');
    expect(callArgs.html).toContain('&lt;script&gt;');
    expect(callArgs.html).toContain('&amp;');
    expect(callArgs.html).toContain('&quot;');
  });
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run packages/agent/tests/cron-delivery-router.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add packages/agent/src/cron-delivery-router.ts packages/agent/tests/cron-delivery-router.test.ts
git commit -m "fix(security): escape HTML in cron delivery email to prevent XSS"
```

---

### Task 2: Fix useChat state mutation + type safety

**Files:**
- Modify: `apps/web/src/hooks/useChat.ts`
- Modify: `apps/web/src/lib/types.ts`

This is the highest-impact fix — addresses findings #2 (state mutation), #3 (unsafe casts), #4 (double-cast), #5 (ContentBlock cast).

- [ ] **Step 1: Add `blockId` field to ContentBlock types that need stable keys**

In `apps/web/src/lib/types.ts`, update the block interfaces to include an optional `blockId`:

```typescript
export interface TextContentBlock {
  type: 'text';
  blockId: string;
  content: string;
}

export interface StepContentBlock {
  type: 'step';
  blockId: string;
  description: string;
  status: 'running' | 'done';
}

export interface ModelSwitchContentBlock {
  type: 'model_switch';
  blockId: string;
  from: string;
  to: string;
  reason: string;
}

export interface ErrorContentBlock {
  type: 'error';
  blockId: string;
  message: string;
}
```

Note: `ToolUseContentBlock` already has `id` — keep that as-is.

- [ ] **Step 2: Update BlockRenderer to use stable keys**

In `BlockRenderer.tsx`, replace `key={i}` with stable keys:

```typescript
{blocks.map((block, i) => {
  const key = block.type === 'tool_use' ? block.id : ('blockId' in block ? block.blockId : `${block.type}-${i}`);
  const isLast = i === blocks.length - 1;
  switch (block.type) {
    case 'text':
      return <TextBlock key={key} block={block} isStreaming={isStreaming && isLast} />;
    case 'step':
      return <StepBlock key={key} block={block} />;
    case 'tool_use':
      return <ToolUseBlock key={key} block={block} />;
    case 'model_switch':
      return <ModelSwitchBlock key={key} block={block} />;
    case 'error':
      return (
        <div key={key} className="flex items-center gap-2 py-1 text-[11px] text-destructive">
          <span>⚠️ {block.message}</span>
        </div>
      );
    default:
      return null;
  }
})}
```

- [ ] **Step 3: Fix useChat — remove state mutation and add blockIds**

In `useChat.ts`, make these specific fixes:

**Fix 1:** In the `tool_start` case, instead of mutating `last.tools`, accumulate the tool update and apply it immutably in the final `msgs.map`:

Add a `let toolsUpdate: ToolExecution[] | null = null;` before the switch statement. Then in `tool_start`:

```typescript
case 'tool_start': {
  const toolName = (data?.name as string) ?? 'unknown';
  const toolId = toolName + '-' + Date.now();
  blocks.push({
    type: 'tool_use',
    id: toolId,
    name: toolName,
    input: data?.input as Record<string, unknown>,
    status: 'running',
  });
  toolsUpdate = [...(last.tools || []), { id: toolId, name: toolName, status: 'running' as const, input: data?.input as Record<string, unknown> }];
  break;
}
```

**Fix 2:** In `tool_end`, same pattern:

```typescript
case 'tool_end': {
  const toolName = data?.name as string;
  const result = data?.result as string;
  const duration = data?.duration as number | undefined;
  // Update blocks
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    if (b.type === 'tool_use' && b.name === toolName && b.status === 'running') {
      blocks[i] = { ...b, status: 'done', result, duration };
      break;
    }
  }
  // Update running steps
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    if (b.type === 'step' && b.status === 'running') {
      blocks[i] = { ...b, status: 'done' };
      break;
    }
  }
  // Immutable legacy tools update
  if (last.tools && toolName) {
    const idx = last.tools.findIndex(t => t.name === toolName && t.status === 'running');
    if (idx >= 0) {
      const updated = last.tools.map((t, j) =>
        j === idx ? { ...t, status: 'done' as const, output: result, duration } : t
      );
      toolsUpdate = updated;
    }
  }
  break;
}
```

**Fix 3:** In the final `msgs.map`, include `toolsUpdate`:

```typescript
const content = flattenBlocks(blocks);
return msgs.map((m, i) =>
  i === msgs.length - 1
    ? { ...m, blocks, content, ...(toolsUpdate && { tools: toolsUpdate }) }
    : m
);
```

**Fix 4:** In the `done` case, fix the `as ContentBlock` cast with proper type narrowing:

```typescript
case 'done': {
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type === 'step' && b.status === 'running') {
      blocks[i] = { ...b, status: 'done' };
    } else if (b.type === 'tool_use' && b.status === 'running') {
      blocks[i] = { ...b, status: 'done' };
    }
  }
  const doneContent = data?.content as string;
  if (doneContent && !blocks.some(b => b.type === 'text' && b.content)) {
    blocks.push({ type: 'text', blockId: 'done-' + Date.now(), content: doneContent });
  }
  break;
}
```

**Fix 5:** Add `blockId` to all block creation sites. Use `crypto.randomUUID()` or simple counters:

```typescript
// In token case:
blocks.push({ type: 'text', blockId: 'text-' + Date.now(), content: tokenContent });

// In step case:
blocks.push({ type: 'step', blockId: 'step-' + Date.now(), description, status: 'running' });

// In model_switch case:
blocks.push({ type: 'model_switch', blockId: 'switch-' + Date.now(), from: ..., to: ..., reason: ... });

// In error case:
blocks.push({ type: 'error', blockId: 'err-' + Date.now(), message: errorMsg });
```

Also update `ensureBlocks` to add blockIds to converted legacy messages.

- [ ] **Step 4: Run TypeScript check**

```bash
npx tsc --noEmit --project apps/web/tsconfig.json
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/useChat.ts apps/web/src/lib/types.ts apps/web/src/components/os/apps/chat-blocks/BlockRenderer.tsx
git commit -m "fix(chat): eliminate state mutation, add stable block IDs, fix unsafe casts"
```

---

### Task 3: Fix credential-pool DRY + context-compressor logging

**Files:**
- Modify: `packages/agent/src/credential-pool.ts`
- Modify: `packages/agent/src/context-compressor.ts`

- [ ] **Step 1: Extract shared cooldown recovery in credential-pool.ts**

Add a private method and replace the duplicate logic in `getKey()` and `getStatus()`:

```typescript
  /** Recover keys whose cooldown has expired */
  private recoverExpiredCooldowns(): void {
    const now = this.nowFn();
    for (const entry of this.entries) {
      if (entry.status === 'cooldown' && entry.cooldownUntil !== null && now >= entry.cooldownUntil) {
        entry.status = 'active';
        entry.cooldownUntil = null;
        entry.lastError = null;
      }
    }
  }
```

Then in `getKey()`, replace the recovery loop with `this.recoverExpiredCooldowns();`
And in `getStatus()`, replace the recovery loop with `this.recoverExpiredCooldowns();`

- [ ] **Step 2: Add named constant for 5-minute default cooldown**

```typescript
const FIVE_MINUTES_MS = 5 * 60 * 1000;
```

And use it in the `default` branch of `reportError`:
```typescript
entry.cooldownUntil = now + FIVE_MINUTES_MS;
```

- [ ] **Step 3: Add logging to context-compressor summarizeMiddle**

In `context-compressor.ts`, update the `!response.ok` branch:

```typescript
  if (!response.ok) {
    // Log the failure for diagnostics — silent degradation is invisible in production
    try {
      const errBody = await response.text();
      console.warn(`[context-compressor] Summarizer returned ${response.status}: ${errBody.slice(0, 200)}`);
    } catch { /* ignore read errors */ }
    return buildFallbackSummary(middle, previousSummary);
  }
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run packages/agent/tests/credential-pool.test.ts packages/agent/tests/context-compressor.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/credential-pool.ts packages/agent/src/context-compressor.ts
git commit -m "fix: extract shared cooldown recovery, add summarizer error logging"
```

---

### Task 4: Remove dead code + replace console.log with logger

**Files:**
- Modify: `apps/web/src/lib/providers.ts` — remove 6 dead exports
- Modify: `packages/server/src/local/routes/skills.ts` — replace console.log
- Modify: `packages/server/src/local/cron.ts` — replace console.warn
- Modify: `packages/agent/src/index.ts` — comment mock connector exports

- [ ] **Step 1: Remove dead exports from providers.ts**

In `apps/web/src/lib/providers.ts`, remove these functions entirely (they have zero callers):
- `addProvider`
- `removeProvider`
- `getAllModels`
- `getCostTier`
- `getSpeedTier`
- `maskApiKey`

- [ ] **Step 2: Replace console.log in skills.ts**

In `packages/server/src/local/routes/skills.ts`, find:
```typescript
console.log(`[waggle] Installed ${installed.length} starter skills on first run`);
```
Replace with:
```typescript
log.info(`Installed ${installed.length} starter skills on first run`);
```
(Ensure `createLogger` is imported and `const log = createLogger('skills');` exists at the top)

- [ ] **Step 3: Replace console.warn in cron.ts**

In `packages/server/src/local/cron.ts`, find:
```typescript
console.warn('[cron] Job disabled after 5 failures:', schedule.id);
```
Replace with a proper log call. Check if the file has a logger — if not, add one.

- [ ] **Step 4: Run TypeScript checks**

```bash
npx tsc --noEmit --project apps/web/tsconfig.json
npx tsc --noEmit --project packages/server/tsconfig.json
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/providers.ts packages/server/src/local/routes/skills.ts packages/server/src/local/cron.ts
git commit -m "chore: remove 6 dead exports, replace console.log with structured logger"
```

---

### Task 5: Final verification + push

- [ ] **Step 1: TypeScript compilation — all packages**

```bash
npx tsc --noEmit --project packages/agent/tsconfig.json
npx tsc --noEmit --project packages/server/tsconfig.json
npx tsc --noEmit --project apps/web/tsconfig.json
```

- [ ] **Step 2: Run all tests**

```bash
npx vitest run packages/agent/tests/ packages/server/tests/ 2>&1 | tail -10
```

- [ ] **Step 3: Push**

```bash
git push
```

---

## Deferred (structural, tracked but not in this plan)

These are MEDIUM-priority structural issues that would benefit from their own dedicated plan:

| Issue | Why Deferred |
|---|---|
| `chat.ts` split (1,508 → 3 files) | Large refactor, needs its own plan with integration tests |
| `personas.ts` split (1,069 → data/logic files) | Large refactor, touches import paths across server |
| `tools.ts` extract dedup helpers (716 lines) | Moderate refactor, needs careful test verification |
| Governance loopback HTTP elimination | Needs understanding of team governance state shape |
| `_reroutedMessage` sidechannel fix | Scoped to chat.ts refactor |
| OnboardingWizard error handling | UI behavior change needs design review |
