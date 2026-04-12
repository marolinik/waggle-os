# Model Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 3-lane model fallback system (Primary / Fallback / Budget) with automatic failover, budget-aware switching, and a visual Model Pilot card in Settings.

**Architecture:** Progressive enhancement — a new `ModelPilotCard` component sits above the existing `ModelsSection` in Settings > Models. Backend adds fallback chain logic wrapping the existing `agentRunner()` call in `chat.ts`. Config gains 3 new fields. SSE events notify the frontend on model switches.

**Tech Stack:** React + TypeScript (frontend), Fastify + Node.js (backend), existing `WaggleConfig` for persistence, existing `/api/providers` for model catalog, existing SSE streaming for switch notifications.

---

### Task 1: Add fallback/budget fields to WaggleConfig

**Files:**
- Modify: `packages/core/src/config.ts:19-35` (ConfigData interface)
- Modify: `packages/core/src/config.ts:106-112` (after dailyBudget methods)
- Test: `packages/core/tests/config.test.ts`

- [ ] **Step 1: Write failing tests for new config fields**

Add to `packages/core/tests/config.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WaggleConfig } from '../src/config.js';

describe('Model Pilot config fields', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-config-pilot-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null for fallbackModel when not set', () => {
    const config = new WaggleConfig(tmpDir);
    expect(config.getFallbackModel()).toBeNull();
  });

  it('persists fallbackModel', () => {
    const config = new WaggleConfig(tmpDir);
    config.setFallbackModel('qwen/qwen3.6-plus:free');
    config.save();

    const config2 = new WaggleConfig(tmpDir);
    expect(config2.getFallbackModel()).toBe('qwen/qwen3.6-plus:free');
  });

  it('returns null for budgetModel when not set', () => {
    const config = new WaggleConfig(tmpDir);
    expect(config.getBudgetModel()).toBeNull();
  });

  it('persists budgetModel', () => {
    const config = new WaggleConfig(tmpDir);
    config.setBudgetModel('deepseek/deepseek-chat-v3-0324:free');
    config.save();

    const config2 = new WaggleConfig(tmpDir);
    expect(config2.getBudgetModel()).toBe('deepseek/deepseek-chat-v3-0324:free');
  });

  it('returns 0.8 as default budgetThreshold', () => {
    const config = new WaggleConfig(tmpDir);
    expect(config.getBudgetThreshold()).toBe(0.8);
  });

  it('persists budgetThreshold', () => {
    const config = new WaggleConfig(tmpDir);
    config.setBudgetThreshold(0.6);
    config.save();

    const config2 = new WaggleConfig(tmpDir);
    expect(config2.getBudgetThreshold()).toBe(0.6);
  });

  it('clearFallbackModel removes the field', () => {
    const config = new WaggleConfig(tmpDir);
    config.setFallbackModel('test-model');
    config.save();
    config.clearFallbackModel();
    config.save();

    const config2 = new WaggleConfig(tmpDir);
    expect(config2.getFallbackModel()).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/core/tests/config.test.ts -t "Model Pilot" --reporter=verbose`
Expected: FAIL — methods `getFallbackModel`, `setBudgetModel`, etc. do not exist.

- [ ] **Step 3: Implement the config fields**

In `packages/core/src/config.ts`, add to the `ConfigData` interface (after line 25):

```typescript
  /** Model Pilot: fallback model when primary fails (429/500/timeout) */
  fallbackModel?: string;
  /** Model Pilot: budget-saver model when daily spend hits threshold */
  budgetModel?: string;
  /** Model Pilot: budget threshold as 0.0-1.0 fraction. Default 0.8 */
  budgetThreshold?: number;
```

Add methods after the `setDailyBudget` method (after line 112):

```typescript
  // --- Model Pilot ---

  getFallbackModel(): string | null {
    return this.data.fallbackModel ?? null;
  }

  setFallbackModel(model: string): void {
    this.data.fallbackModel = model;
  }

  clearFallbackModel(): void {
    delete this.data.fallbackModel;
  }

  getBudgetModel(): string | null {
    return this.data.budgetModel ?? null;
  }

  setBudgetModel(model: string): void {
    this.data.budgetModel = model;
  }

  clearBudgetModel(): void {
    delete this.data.budgetModel;
  }

  getBudgetThreshold(): number {
    return this.data.budgetThreshold ?? 0.8;
  }

  setBudgetThreshold(threshold: number): void {
    this.data.budgetThreshold = Math.max(0.5, Math.min(0.95, threshold));
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/core/tests/config.test.ts -t "Model Pilot" --reporter=verbose`
Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/config.ts packages/core/tests/config.test.ts
git commit -m "feat(config): add fallbackModel, budgetModel, budgetThreshold fields for Model Pilot"
```

---

### Task 2: Expose new fields in Settings API

**Files:**
- Modify: `packages/server/src/local/routes/settings.ts:63-93` (PUT handler)
- Modify: `packages/server/src/local/routes/settings.ts:14-61` (GET handler)

- [ ] **Step 1: Update GET /api/settings to return new fields**

In `packages/server/src/local/routes/settings.ts`, inside the `GET /api/settings` handler (around line 52), add the new fields to the return object:

```typescript
    return {
      defaultModel: config.getDefaultModel(),
      fallbackModel: config.getFallbackModel(),
      budgetModel: config.getBudgetModel(),
      budgetThreshold: config.getBudgetThreshold(),
      providers,
      mindPath: config.getMindPath(),
      dataDir: server.localConfig.dataDir,
      litellmUrl: server.localConfig.litellmUrl,
      dailyBudget: config.getDailyBudget(),
      onboardingCompleted,
    };
```

- [ ] **Step 2: Update PUT /api/settings to accept new fields**

In the PUT handler (around line 66), update the body type and handling:

```typescript
  server.put<{
    Body: {
      defaultModel?: string;
      fallbackModel?: string | null;
      budgetModel?: string | null;
      budgetThreshold?: number;
      providers?: Record<string, unknown>;
      dailyBudget?: number | null;
    };
  }>('/api/settings', async (request) => {
    const config = new WaggleConfig(server.localConfig.dataDir);
    const { defaultModel, fallbackModel, budgetModel, budgetThreshold, providers, dailyBudget } = request.body;

    if (defaultModel) {
      config.setDefaultModel(defaultModel);
    }

    // Model Pilot fields
    if (fallbackModel !== undefined) {
      if (fallbackModel === null) {
        config.clearFallbackModel();
      } else {
        config.setFallbackModel(fallbackModel);
      }
    }
    if (budgetModel !== undefined) {
      if (budgetModel === null) {
        config.clearBudgetModel();
      } else {
        config.setBudgetModel(budgetModel);
      }
    }
    if (budgetThreshold !== undefined) {
      config.setBudgetThreshold(budgetThreshold);
    }
```

The rest of the PUT handler (providers loop, config.save(), response) stays unchanged.

- [ ] **Step 3: Verify with curl**

Run: `curl -s http://127.0.0.1:3333/api/settings | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d);console.log('fallback:',j.fallbackModel,'budget:',j.budgetModel,'threshold:',j.budgetThreshold)})"`
Expected: `fallback: null budget: null threshold: 0.8`

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/local/routes/settings.ts
git commit -m "feat(settings): expose fallbackModel, budgetModel, budgetThreshold in GET/PUT /api/settings"
```

---

### Task 3: Add getDailyTotal to CostTracker

**Files:**
- Modify: `packages/agent/src/cost-tracker.ts:84-93`
- Test: `packages/agent/tests/cost-tracker.test.ts`

- [ ] **Step 1: Write failing test**

Add to `packages/agent/tests/cost-tracker.test.ts`:

```typescript
describe('getDailyTotal', () => {
  it('returns total cost across all models for current session', () => {
    const tracker = new CostTracker();
    tracker.addUsage('claude-sonnet-4-6', 1000, 500);
    tracker.addUsage('claude-sonnet-4-6', 2000, 1000);
    const total = tracker.getDailyTotal();
    expect(total).toBeGreaterThan(0);
    expect(total).toBe(tracker.getStats().estimatedCost);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/agent/tests/cost-tracker.test.ts -t "getDailyTotal" --reporter=verbose`
Expected: FAIL — `getDailyTotal` does not exist.

- [ ] **Step 3: Implement getDailyTotal**

Add to `packages/agent/src/cost-tracker.ts` after the `getWorkspaceCost` method (after line 93):

```typescript
  /** Get total estimated cost for the current session (proxy for daily total). */
  getDailyTotal(): number {
    return this.getStats().estimatedCost;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/agent/tests/cost-tracker.test.ts -t "getDailyTotal" --reporter=verbose`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/cost-tracker.ts packages/agent/tests/cost-tracker.test.ts
git commit -m "feat(cost-tracker): add getDailyTotal() for Model Pilot budget check"
```

---

### Task 4: Fallback chain in chat route

**Files:**
- Modify: `packages/server/src/local/routes/chat.ts:604-607` (model resolution)
- Modify: `packages/server/src/local/routes/chat.ts:1150-1157` (agent runner call)

- [ ] **Step 1: Add isRetryableError helper**

At the top of `packages/server/src/local/routes/chat.ts` (after the imports, around line 30), add:

```typescript
/** Check if an LLM error is transient and worth retrying with a fallback model. */
function isRetryableError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    // HTTP status codes embedded in error messages
    if (/\b(429|500|502|503)\b/.test(msg)) return true;
    // Network errors
    if (msg.includes('etimedout') || msg.includes('econnrefused') || msg.includes('econnaborted')) return true;
    if (msg.includes('rate limit') || msg.includes('too many requests')) return true;
    if (msg.includes('overloaded') || msg.includes('capacity')) return true;
  }
  // Check for status property on error objects
  const status = (err as { status?: number })?.status;
  if (status === 429 || status === 500 || status === 502 || status === 503) return true;
  return false;
}
```

- [ ] **Step 2: Update model resolution to include fallback/budget awareness**

Replace line 604-607 in `chat.ts`:

```typescript
      // ── Model Pilot: resolve model with fallback chain ──
      const config = new WaggleConfig(server.localConfig.dataDir);
      const wsModelConfig = workspace ? server.workspaceManager?.get(workspace)?.model : undefined;
      const primaryModel = model ?? wsModelConfig ?? config.getDefaultModel() ?? 'claude-sonnet-4-6';
      const fallbackModel = config.getFallbackModel();
      const budgetModel = config.getBudgetModel();
      const budgetThreshold = config.getBudgetThreshold();

      // Budget check: if daily spend exceeds threshold, use budget model
      let resolvedModel = primaryModel;
      let modelSwitchReason: string | null = null;

      const dailyBudget = config.getDailyBudget();
      if (dailyBudget && dailyBudget > 0 && budgetModel) {
        const spent = costTracker.getDailyTotal();
        if (spent / dailyBudget >= budgetThreshold) {
          resolvedModel = budgetModel;
          modelSwitchReason = `Budget ${Math.round(budgetThreshold * 100)}% reached ($${spent.toFixed(2)}/$${dailyBudget.toFixed(2)})`;
        }
      }
```

Add the `WaggleConfig` import at the top of the file if not already present:

```typescript
import { WaggleConfig } from '@waggle/core';
```

- [ ] **Step 3: Wrap agentRunner call with fallback retry**

Replace the agent runner call at line 1150-1157:

```typescript
        // ── Run agent with fallback chain ──
        let result;
        try {
          result = await agentRunner({ ...agentConfig, model: resolvedModel });
        } catch (primaryErr) {
          // If retryable and fallback available, try fallback model
          if (isRetryableError(primaryErr) && fallbackModel && resolvedModel !== fallbackModel) {
            modelSwitchReason = `${resolvedModel} failed (${(primaryErr as { status?: number }).status ?? 'timeout'})`;
            resolvedModel = fallbackModel;
            result = await agentRunner({ ...agentConfig, model: resolvedModel });
          } else {
            throw primaryErr;
          }
        }

        // Notify client of model switch
        if (modelSwitchReason) {
          sendEvent('model_switch', { model: resolvedModel, reason: modelSwitchReason, primary: primaryModel });
          sendEvent('step', { content: `⬡ Switched to ${resolvedModel} — ${modelSwitchReason}` });
        }

        // Unregister the per-request approval hook
        if (unregisterHook) unregisterHook();

        // Track cost with the ACTUALLY used model
        costTracker.addUsage(resolvedModel, result.usage.inputTokens, result.usage.outputTokens, effectiveWorkspace);
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project packages/server/tsconfig.json 2>&1 | head -5`
Expected: No errors (or only pre-existing ones unrelated to this change).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/local/routes/chat.ts
git commit -m "feat(chat): add Model Pilot fallback chain — retry with fallback on 429/500/timeout, budget-aware switching"
```

---

### Task 5: Handle model_switch SSE event in frontend

**Files:**
- Modify: `packages/ui/src/hooks/useChat.ts:47-80` (processStreamEvent)
- Modify: `app/src/App.tsx` (toast on model switch)

- [ ] **Step 1: Add model_switch to processStreamEvent**

In `packages/ui/src/hooks/useChat.ts`, add a case to the `processStreamEvent` switch (after the `step` case, around line 62):

```typescript
    case 'model_switch':
      // Model Pilot: backend switched to a different model
      // The step event with the inline message is handled by the 'step' case above.
      // This event carries structured data for the frontend toast.
      break;
```

- [ ] **Step 2: Expose model_switch event to the chat consumer**

In the `useChat` hook's streaming loop (around line 219-237), add handling for the `model_switch` event. Add a callback prop to `useChatOptions`:

In the `useChatOptions` interface (or wherever chat options are defined), add:

```typescript
  onModelSwitch?: (data: { model: string; reason: string; primary: string }) => void;
```

Then in the streaming loop (around line 222):

```typescript
        // Model Pilot: notify parent on model switch
        if (event.type === 'model_switch' && onModelSwitch) {
          onModelSwitch(event as unknown as { model: string; reason: string; primary: string });
        }
```

- [ ] **Step 3: Wire toast in App.tsx**

In `app/src/App.tsx`, update the `useChat` call (around line 387) to add the `onModelSwitch` handler:

```typescript
  const {
    messages,
    setMessages,
    isLoading,
    sendMessage,
  } = useChat({
    service,
    workspace: activeWorkspace?.id ?? 'default',
    session: activeSessionId ?? undefined,
    workspacePath: activeWorkspace?.directory,
    onFileCreated: handleFileCreated,
    onModelSwitch: useCallback((data: { model: string; reason: string; primary: string }) => {
      setToasts(prev => [...prev, {
        id: `model-switch-${Date.now()}`,
        title: `⬡ Switched to ${data.model}`,
        description: data.reason,
        variant: 'warning' as const,
        action: {
          label: 'Resume primary',
          onClick: () => {
            // Force primary model for this session by sending a settings update
            fetch(`${SERVER_BASE}/api/settings`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ defaultModel: data.primary }),
            }).catch(() => {});
          },
        },
        duration: 8000,
      }]);
    }, [setToasts]),
  });
```

Note: The exact toast shape depends on the existing toast system. Check `useToastManager` for the `Toast` type and adapt the fields. If the toast system doesn't support `action`, add the "Resume primary" as a second line of the description.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project app/tsconfig.json 2>&1 | head -10`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/hooks/useChat.ts app/src/App.tsx
git commit -m "feat(ui): handle model_switch SSE event — toast + resume primary button"
```

---

### Task 6: ModelPilotCard component

**Files:**
- Create: `packages/ui/src/components/settings/ModelPilotCard.tsx`
- Modify: `packages/ui/src/components/settings/SettingsPanel.tsx:140-146`
- Modify: `packages/ui/src/components/settings/index.ts` (export)

- [ ] **Step 1: Create ModelPilotCard component**

Create `packages/ui/src/components/settings/ModelPilotCard.tsx`:

```tsx
/**
 * ModelPilotCard — 3-lane model selector with automatic fallback.
 *
 * Sits above ModelsSection in Settings > Models tab.
 * Reads model catalog from /api/providers, persists to /api/settings.
 */

import { useState, useEffect, useCallback } from 'react';

// ── Types ──────────────────────────────────────────────────────────────

interface ProviderModel {
  id: string;
  name: string;
  cost: '$' | '$$' | '$$$';
  speed: 'fast' | 'medium' | 'slow';
}

interface Provider {
  id: string;
  name: string;
  badge: string | null;
  hasKey: boolean;
  models: ProviderModel[];
}

interface ModelPilotCardProps {
  defaultModel: string;
  fallbackModel: string | null;
  budgetModel: string | null;
  budgetThreshold: number;
  dailyBudget: number | null;
  onUpdate: (fields: {
    defaultModel?: string;
    fallbackModel?: string | null;
    budgetModel?: string | null;
    budgetThreshold?: number;
  }) => void;
  /** Server base URL for /api/providers */
  serverUrl?: string;
  /** Navigate to vault tab to add missing key */
  onNavigateToVault?: () => void;
}

type Lane = 'primary' | 'fallback' | 'budget';

const LANE_CONFIG: Record<Lane, { label: string; color: string; bgColor: string; borderColor: string; description: string }> = {
  primary: {
    label: 'PRIMARY',
    color: '#22c55e',
    bgColor: 'rgba(34,197,94,0.08)',
    borderColor: 'rgba(34,197,94,0.25)',
    description: 'Your daily driver. Used for all chats by default.',
  },
  fallback: {
    label: 'FALLBACK',
    color: '#eab308',
    bgColor: 'rgba(234,179,8,0.08)',
    borderColor: 'rgba(234,179,8,0.25)',
    description: 'Auto-activates if primary fails or hits rate limit.',
  },
  budget: {
    label: 'BUDGET SAVER',
    color: '#3b82f6',
    bgColor: 'rgba(59,130,246,0.08)',
    borderColor: 'rgba(59,130,246,0.25)',
    description: 'Activates when daily budget threshold is reached.',
  },
};

const COST_TOOLTIPS: Record<string, string> = {
  '$': '~$0.001 per message',
  '$$': '~$0.01 per message',
  '$$$': '~$0.05 per message',
};

const SPEED_TOOLTIPS: Record<string, string> = {
  fast: '< 2 seconds',
  medium: '2-8 seconds',
  slow: '8-30 seconds',
};

// ── Component ──────────────────────────────────────────────────────────

export function ModelPilotCard({
  defaultModel,
  fallbackModel,
  budgetModel,
  budgetThreshold,
  dailyBudget,
  onUpdate,
  serverUrl,
  onNavigateToVault,
}: ModelPilotCardProps) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [openPicker, setOpenPicker] = useState<Lane | null>(null);
  const [simpleMode, setSimpleMode] = useState(!fallbackModel && !budgetModel);

  const baseUrl = serverUrl ?? 'http://127.0.0.1:3333';

  // Fetch provider catalog
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`${baseUrl}/api/providers`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          setProviders(data.providers ?? []);
        }
      } catch { /* server not reachable */ }
    }
    load();
    return () => { cancelled = true; };
  }, [baseUrl]);

  // Find model info from catalog
  const findModel = useCallback((modelId: string | null): { model: ProviderModel; provider: Provider } | null => {
    if (!modelId) return null;
    for (const p of providers) {
      const m = p.models.find(mod => mod.id === modelId);
      if (m) return { model: m, provider: p };
    }
    return null;
  }, [providers]);

  const handleSelect = useCallback((lane: Lane, modelId: string) => {
    setOpenPicker(null);
    switch (lane) {
      case 'primary':
        onUpdate({ defaultModel: modelId });
        break;
      case 'fallback':
        onUpdate({ fallbackModel: modelId });
        setSimpleMode(false);
        break;
      case 'budget':
        onUpdate({ budgetModel: modelId });
        setSimpleMode(false);
        break;
    }
  }, [onUpdate]);

  const handleClear = useCallback((lane: 'fallback' | 'budget') => {
    if (lane === 'fallback') onUpdate({ fallbackModel: null });
    if (lane === 'budget') onUpdate({ budgetModel: null });
    if (!fallbackModel && !budgetModel) setSimpleMode(true);
  }, [onUpdate, fallbackModel, budgetModel]);

  const handleThresholdChange = useCallback((value: number) => {
    onUpdate({ budgetThreshold: value });
  }, [onUpdate]);

  // ── Render helpers ──────────────────────────────────────────────────

  function renderLane(lane: Lane, modelId: string | null, showClear: boolean) {
    const config = LANE_CONFIG[lane];
    const info = findModel(modelId);
    const isEmpty = !modelId || !info;

    return (
      <div
        style={{
          padding: '14px 16px',
          borderRadius: 10,
          background: config.bgColor,
          border: `1px ${isEmpty ? 'dashed' : 'solid'} ${config.borderColor}`,
          minHeight: 72,
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1.2px', color: config.color }}>
            {config.label}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            {showClear && !isEmpty && (
              <button
                onClick={() => handleClear(lane as 'fallback' | 'budget')}
                style={{ fontSize: 10, color: 'var(--hive-500)', background: 'none', border: 'none', cursor: 'pointer' }}
                title="Remove"
              >
                &times;
              </button>
            )}
            <button
              onClick={() => setOpenPicker(openPicker === lane ? null : lane)}
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: config.color,
                background: 'none',
                border: `1px solid ${config.borderColor}`,
                borderRadius: 4,
                padding: '2px 8px',
                cursor: 'pointer',
              }}
            >
              {isEmpty ? '+ Add' : 'Change'}
            </button>
          </div>
        </div>

        {isEmpty ? (
          <p style={{ fontSize: 11, color: 'var(--hive-500)', margin: 0 }}>
            {config.description}
          </p>
        ) : (
          <>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--hive-100)' }}>
              {info.model.name}
              {info.model.id.includes(':free') && (
                <span style={{
                  fontSize: 9, fontWeight: 700, marginLeft: 6, padding: '1px 5px',
                  borderRadius: 3, background: 'rgba(34,197,94,0.15)', color: '#22c55e',
                }}>
                  FREE
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--hive-400)', marginTop: 2 }}>
              <span>{info.provider.name}</span>
              <span style={{ margin: '0 6px' }}>&middot;</span>
              <span title={COST_TOOLTIPS[info.model.cost]}>{info.model.cost}</span>
              <span style={{ margin: '0 6px' }}>&middot;</span>
              <span title={SPEED_TOOLTIPS[info.model.speed]}>{info.model.speed}</span>
            </div>
          </>
        )}

        {/* Budget threshold slider */}
        {lane === 'budget' && !isEmpty && dailyBudget && dailyBudget > 0 && (
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, color: 'var(--hive-500)', whiteSpace: 'nowrap' }}>
              At {Math.round(budgetThreshold * 100)}% spend
            </span>
            <input
              type="range"
              min={50}
              max={95}
              step={5}
              value={Math.round(budgetThreshold * 100)}
              onChange={(e) => handleThresholdChange(Number(e.target.value) / 100)}
              style={{ flex: 1, accentColor: config.color }}
            />
          </div>
        )}

        {/* Picker dropdown */}
        {openPicker === lane && renderPicker(lane)}
      </div>
    );
  }

  function renderPicker(lane: Lane) {
    return (
      <div style={{
        position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, zIndex: 50,
        background: 'var(--hive-900)', border: '1px solid var(--hive-700)', borderRadius: 8,
        maxHeight: 300, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      }}>
        {providers.map(provider => (
          <div key={provider.id}>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.8px', color: 'var(--hive-400)',
              padding: '8px 12px 4px', textTransform: 'uppercase', borderTop: '1px solid var(--hive-800)',
            }}>
              {provider.name}
              {provider.badge && (
                <span style={{ marginLeft: 6, fontSize: 9, color: '#22c55e', fontWeight: 400 }}>
                  {provider.badge}
                </span>
              )}
            </div>
            {!provider.hasKey ? (
              <button
                onClick={() => { setOpenPicker(null); onNavigateToVault?.(); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '6px 12px',
                  fontSize: 11, color: 'var(--hive-600)', background: 'none', border: 'none', cursor: 'pointer',
                }}
              >
                Add key in Vault &rarr;
              </button>
            ) : (
              provider.models.map(m => (
                <button
                  key={m.id}
                  onClick={() => handleSelect(lane, m.id)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    width: '100%', textAlign: 'left', padding: '7px 12px',
                    fontSize: 12, color: 'var(--hive-100)', background: 'none', border: 'none',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'var(--hive-800)'; }}
                  onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'none'; }}
                >
                  <span>
                    {m.name}
                    {m.id.includes(':free') && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, marginLeft: 6, padding: '1px 4px',
                        borderRadius: 3, background: 'rgba(34,197,94,0.15)', color: '#22c55e',
                      }}>
                        FREE
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--hive-500)' }}>
                    {m.cost} &middot; {m.speed}
                  </span>
                </button>
              ))
            )}
          </div>
        ))}
      </div>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────

  return (
    <div style={{
      padding: '20px',
      borderRadius: 12,
      background: 'rgba(229,160,0,0.04)',
      border: '1px solid rgba(229,160,0,0.15)',
      marginBottom: 24,
      position: 'relative',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--hive-100)' }}>⬡ Model Pilot</span>
        </div>
        <span
          title="Model Pilot automatically switches models when your primary is rate-limited or your budget runs low. You'll see a notification when this happens."
          style={{ fontSize: 12, cursor: 'help', color: 'var(--hive-500)' }}
        >
          &#9432;
        </span>
      </div>

      {/* Lanes */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Primary + Fallback side by side */}
        <div style={{ display: 'grid', gridTemplateColumns: simpleMode ? '1fr' : '1fr 1fr', gap: 10 }}>
          {renderLane('primary', defaultModel, false)}
          {!simpleMode && renderLane('fallback', fallbackModel, true)}
        </div>

        {/* Budget lane full width */}
        {!simpleMode && renderLane('budget', budgetModel, true)}
      </div>

      {/* Simple mode toggle */}
      <div style={{ textAlign: 'center', marginTop: 12 }}>
        {simpleMode ? (
          <button
            onClick={() => setSimpleMode(false)}
            style={{ fontSize: 11, color: 'var(--hive-500)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}
          >
            Add fallback &amp; budget models
          </button>
        ) : (
          <button
            onClick={() => {
              onUpdate({ fallbackModel: null, budgetModel: null });
              setSimpleMode(true);
            }}
            style={{ fontSize: 11, color: 'var(--hive-500)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}
          >
            Just use one model &mdash; disable fallback &amp; budget
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Export from settings index**

In `packages/ui/src/components/settings/index.ts`, add:

```typescript
export { ModelPilotCard } from './ModelPilotCard.js';
```

- [ ] **Step 3: Wire into SettingsPanel**

In `packages/ui/src/components/settings/SettingsPanel.tsx`, add the import:

```typescript
import { ModelPilotCard } from './ModelPilotCard.js';
```

Then in the Models tab render (around line 140), add ModelPilotCard above ModelsSection:

```tsx
        {activeTab === 'models' && (
          <>
            <ModelPilotCard
              defaultModel={config.defaultModel ?? 'claude-sonnet-4-6'}
              fallbackModel={(config as any).fallbackModel ?? null}
              budgetModel={(config as any).budgetModel ?? null}
              budgetThreshold={(config as any).budgetThreshold ?? 0.8}
              dailyBudget={(config as any).dailyBudget ?? null}
              onUpdate={(fields) => onConfigUpdate(fields as Partial<WaggleConfig>)}
              serverUrl={baseUrl}
              onNavigateToVault={() => {
                const tabSetter = onTabChange ?? setInternalTab;
                tabSetter('vault');
              }}
            />
            <ModelsSection
              config={config}
              onConfigUpdate={onConfigUpdate}
              onTestApiKey={onTestApiKey}
            />
          </>
        )}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project packages/ui/tsconfig.json 2>&1 | head -10`
Expected: No errors (may need to add `fallbackModel`/`budgetModel`/`budgetThreshold` to the `WaggleConfig` type in `packages/ui/src/services/types.ts`).

- [ ] **Step 5: If WaggleConfig type needs updating**

Check `packages/ui/src/services/types.ts` for the WaggleConfig interface. Add:

```typescript
  fallbackModel?: string | null;
  budgetModel?: string | null;
  budgetThreshold?: number;
```

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/components/settings/ModelPilotCard.tsx packages/ui/src/components/settings/SettingsPanel.tsx packages/ui/src/components/settings/index.ts packages/ui/src/services/types.ts
git commit -m "feat(ui): add ModelPilotCard — 3-lane model selector with fallback and budget lanes"
```

---

### Task 7: Chat header model badge

**Files:**
- Modify: `app/src/views/ChatView.tsx:85-97` (persona chip area)

- [ ] **Step 1: Add model badge next to persona chip**

In `app/src/views/ChatView.tsx`, after the persona indicator button (around line 97), add:

```tsx
        {/* Model badge — shows active model, click to override for this workspace */}
        {agentModel && (
          <span
            className="text-[10px] font-mono px-2 py-0.5 rounded-full shrink-0 mr-2 cursor-default"
            style={{
              border: '1px solid var(--hive-700)',
              backgroundColor: 'var(--hive-850)',
              color: 'var(--hive-400)',
            }}
            title="Active model for this workspace. Change global defaults in Settings → Models."
          >
            {agentModel}
          </span>
        )}
```

This requires `agentModel` to be passed as a prop. Add it to `ChatViewProps`:

```typescript
  agentModel?: string;
```

And pass it from `App.tsx` where `ChatView` is rendered:

```tsx
  agentModel={agentModel}
```

`agentModel` is already tracked in App.tsx via `useAgentStatus`.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --project app/tsconfig.json 2>&1 | head -5`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/src/views/ChatView.tsx app/src/App.tsx
git commit -m "feat(chat): add model badge in chat header showing active model"
```

---

### Task 8: Final verification

**Files:** None (verification only)

- [ ] **Step 1: TypeScript compilation — all packages**

```bash
npx tsc --noEmit --project packages/core/tsconfig.json
npx tsc --noEmit --project packages/agent/tsconfig.json
npx tsc --noEmit --project packages/ui/tsconfig.json
npx tsc --noEmit --project app/tsconfig.json
```

Expected: All zero errors.

- [ ] **Step 2: Run unit tests**

```bash
npm run test -- --run
```

Expected: Same pass/fail ratio as before (no regressions from our changes).

- [ ] **Step 3: Manual smoke test**

1. Open Settings → Models tab → verify Model Pilot card appears at top
2. Click [Change] on Primary → verify grouped-by-provider picker with vault key status
3. Select "Qwen 3.6 Plus (Free)" as Fallback → verify it persists
4. Check chat header → verify model badge shows active model
5. Send a chat message → verify it uses the primary model

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: Model Pilot — 3-lane model fallback with automatic failover and budget-aware switching"
```
