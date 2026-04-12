# Model Pilot — Design Specification
## Automatic Model Fallback & Budget-Aware Switching
### Date: 2026-04-05 | Approach: Progressive Enhancement (B)

---

## Problem

Users set a single `defaultModel` in settings. If that model's API is down, rate-limited, or the key expires, chat fails silently. There's no fallback. Picking a model requires knowing model IDs. There's no cost awareness.

## Solution

**Model Pilot** — a 3-lane model configuration system with automatic failover:

- **Primary** — daily driver, used for all chats by default
- **Fallback** — auto-activates if primary returns 429/500/timeout
- **Budget Saver** — auto-activates when daily spend hits a configurable threshold

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Fallback visibility | Toast + inline chat message | Users see it immediately AND have permanent record |
| Budget activation | Auto at threshold with "Resume primary" override | Saves money by default, power users can force back |
| Layout | Top Hero card in Settings > Models | Most prominent, first thing users see |
| Model picker grouping | Grouped by provider | Users think "I want Anthropic" not "I want $$" |
| Workspace scope | Global + per-workspace primary override | Workspace model override already exists in config |
| Implementation | Progressive Enhancement | New card above existing ModelsSection, no rewrite risk |

---

## 1. Data Model

New fields in `config.json` (managed by `WaggleConfig`):

```typescript
// packages/core/src/config.ts — additions to ConfigData
interface ConfigData {
  // ... existing fields ...
  defaultModel: string;            // existing — serves as "primary"
  fallbackModel?: string;          // NEW — auto-activates on primary failure
  budgetModel?: string;            // NEW — auto-activates at budget threshold
  budgetThreshold?: number;        // NEW — 0.0-1.0, default 0.8 (80%)
}
```

No new tables, no new API endpoints. Three new fields on existing `GET/PUT /api/settings`. The `/api/providers` endpoint supplies the model catalog with vault key status.

---

## 2. Backend — Fallback Chain

### Model Resolution (chat.ts)

Current:
```
request param > workspace config > global default > "claude-sonnet-4-6"
```

New:
```
request param > workspace config > primary → [on failure] fallback → budget
```

### Implementation

In `packages/server/src/local/routes/chat.ts`, wrap the LLM call:

1. **Budget check first** — if `dailyBudget` is set AND `budgetModel` is configured AND `costTracker.getDailyTotal() / dailyBudget >= budgetThreshold`, use budget model instead of primary.

2. **Try active model** — run the agent loop with the selected model.

3. **On retryable failure** — if the error is 429 (rate limit), 500/502/503 (server error), network timeout, or ECONNREFUSED, AND a fallback model is configured AND we haven't already fallen back, retry with the fallback model.

4. **Emit switch notification** — if the model changed:
   - Yield an inline system message: `"⬡ Switched to {model} — {reason}"`
   - Yield an SSE event `model_switch` with `{ model, reason }` for the frontend toast

### isRetryableError

Checks for: HTTP 429, 500, 502, 503, network timeout (ETIMEDOUT, ECONNABORTED), ECONNREFUSED. Does NOT retry on 400 (bad request), 401 (auth), 403 (forbidden) — those indicate a configuration problem, not a transient failure.

---

## 3. Frontend — ModelPilotCard

### Location

`packages/ui/src/components/settings/ModelPilotCard.tsx` (~280 LOC)

Rendered in `SettingsPanel.tsx` above `ModelsSection` when `activeTab === 'models'`.

### Layout

```
┌─ ModelPilotCard ─────────────────────────────────────────┐
│  ⬡ Model Pilot                                    ⓘ     │
│                                                          │
│  ┌─ 🟢 PRIMARY ──────────┐ ┌─ 🟡 FALLBACK ─────────┐   │
│  │ Claude Sonnet 4.6      │ │ Qwen 3.6 Plus (Free)  │   │
│  │ Anthropic · $$ · med   │ │ OpenRouter · $ · fast  │   │
│  │                [Change]│ │                [Change]│   │
│  └────────────────────────┘ └────────────────────────┘   │
│                                                          │
│  ┌─ 🔵 BUDGET SAVER ────────────────────────────────┐   │
│  │ DeepSeek V3 (Free) · OpenRouter · $ · fast        │   │
│  │ Activates at 80% daily spend  [━━━━━○──] [Change] │   │
│  └───────────────────────────────────────────────────┘   │
│                                                          │
│  "Just use one model" — disable fallback & budget        │
└──────────────────────────────────────────────────────────┘
```

### Behaviors

- **[Change] button** — opens a dropdown grouped by provider. Only models with vault keys are clickable. Models without keys show grayed "Add key in Vault →" linking to the Vault tab.
- **ⓘ header tooltip** — "Model Pilot automatically switches models when your primary is rate-limited or your budget runs low. You'll see a notification when this happens."
- **Lane tooltips** — hover for cost estimates: `$ ~ $0.001/msg`, `$$ ~ $0.01/msg`, `$$$ ~ $0.05/msg` and speed: `fast < 2s`, `medium 2-8s`, `slow 8-30s`.
- **Budget slider** — only visible when budget model is set AND daily budget is configured. Range: 50%-95%.
- **"Just use one model"** — collapses to single-model mode (clears fallback + budget). Card shrinks to show only Primary lane.
- **Empty lane state** — Fallback and Budget show as dashed outline: "+ Add fallback model" / "+ Add budget model". Neither is required.
- **FREE badge** — OpenRouter free models get a green `FREE` badge in the picker.

### Data Flow

1. On mount, fetch `GET /api/providers` (model catalog + key status) and `GET /api/settings` (current config)
2. On lane change, call `PUT /api/settings` with updated `defaultModel` / `fallbackModel` / `budgetModel` / `budgetThreshold`
3. The `onConfigUpdate` prop propagates changes to the parent SettingsPanel

---

## 4. Chat Header Model Badge

A clickable pill in the chat header showing the active model:

```
[claude-sonnet-4.6 ▾]
```

- Click opens a compact grouped-by-provider picker (same data source as ModelPilotCard)
- Selecting a model sets a **workspace-level override** only — does not change global Model Pilot
- Shows `(workspace)` suffix if overridden
- Tooltip: "Model for this workspace. Change global defaults in Settings → Models."

### Location

Added to the existing chat header component in `app/src/`. If no dedicated ChatHeader component exists, add the badge inline where the workspace name is rendered.

---

## 5. Model Switch Toast

When the backend emits `model_switch` SSE event:

```
┌─────────────────────────────────────────┐
│ ⬡ Switched to Qwen 3.6 Plus            │
│   Primary rate-limited  [Resume primary]│
└─────────────────────────────────────────┘
```

- Bottom-right position, Hive DS styling (honey border accent)
- `[Resume primary]` temporarily forces primary for the current session (sets a runtime flag, not persisted to config)
- Auto-fades after 8s
- The inline system message in chat is separate and permanent

---

## 6. File Changes

| File | Change | Est. LOC |
|------|--------|----------|
| `packages/core/src/config.ts` | Add `fallbackModel`, `budgetModel`, `budgetThreshold` fields + getters/setters | ~25 |
| `packages/server/src/local/routes/settings.ts` | Read/write new fields in GET/PUT | ~10 |
| `packages/server/src/local/routes/chat.ts` | Fallback chain wrapper + `isRetryableError` + SSE `model_switch` event | ~40 |
| `packages/server/src/local/routes/providers.ts` | Already done — OpenRouter free models added | 0 |
| `packages/ui/src/components/settings/ModelPilotCard.tsx` | **NEW** — 3-lane hero card with grouped picker dropdown | ~280 |
| `packages/ui/src/components/settings/SettingsPanel.tsx` | Import + render ModelPilotCard above ModelsSection | ~5 |
| `app/src/views/ChatView.tsx` | Model badge pill in chat header with workspace override picker | ~60 |
| `app/src/App.tsx` | Handle `model_switch` SSE → toast + inline message | ~20 |
| **Total** | **7 modified, 1 new** | **~440** |

---

## 7. Out of Scope

- Per-workspace fallback/budget config (global only)
- Drag-and-drop lane reordering
- Model performance benchmarking or A/B testing
- Onboarding wizard integration (later sprint)
- Automatic model discovery from LiteLLM (uses static catalog from `/api/providers`)

---

## 8. Success Criteria

- [ ] Settings > Models shows Model Pilot hero card with 3 lanes
- [ ] Clicking [Change] opens grouped-by-provider picker with vault key status
- [ ] Free models show FREE badge
- [ ] Selecting a model persists to config.json and is used on next chat
- [ ] When primary model returns 429/500/timeout, fallback activates automatically
- [ ] Toast + inline message appear on model switch
- [ ] "Resume primary" in toast forces back to primary for current session
- [ ] Budget model activates when daily spend exceeds threshold
- [ ] Chat header shows clickable model badge with workspace override
- [ ] "Just use one model" collapses to single-lane mode
- [ ] TypeScript compiles with zero errors
- [ ] Existing tests still pass
