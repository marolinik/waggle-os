# Waggle OS Polish Plan — Technical Specification
## Ship-Ready Polish Sprint (Full Scope)
### Date: 2026-04-05 | Score: 87/100 → Target: 95/100

---

## Context

After 5 hours of E2E testing (15+ Playwright sessions, 200+ API calls), the consolidated
report scored Waggle OS at 87/100. Two waves of 9 deep-dive code audit agents verified
every finding against the actual codebase. This spec covers all confirmed issues plus
newly discovered gaps.

### What the test report got wrong (verified by code audit):
- **Connector PATCH 404**: Routes ARE registered. POST /connect works. Issue is silent error swallowing.
- **Marketplace 404**: 15 endpoints exist and are registered. Tester used wrong URL (`/plugins` vs `/packs`).
- **Light mode "coming soon"**: Already works. Toggle in sidebar.

### What the test report got right:
- LockedFeature has ZERO imports in main app (10+ surfaces need gating)
- Health check cache bug (reads empty env var instead of vault)
- 187 console errors (27 instances of key={i}, 19 high-risk)
- Workspace creation silently swallows 403

### Newly discovered:
- Silent error handling epidemic (6+ locations with `catch { /* silent */ }`)
- /spawn command ungated (available to SOLO, should be BASIC+)
- Custom Skill creation ungated
- Connector limit has no visual indicator for SOLO
- Workspace switcher has no visible UI trigger

---

## Phase 1: Backend Fixes (no frontend dependencies)

### 1.1 Health Check Cache Bug

**Files:** `packages/server/src/local/index.ts`, `packages/server/src/local/routes/settings.ts`

**Root cause:** Three compounding bugs:
1. `validateAnthropicKey()` (index.ts:1449) reads `process.env.ANTHROPIC_API_KEY` which is empty — keys are stored in vault
2. `keyValidationCache` (index.ts:1435) has 30s TTL but is NOT invalidated when key changes via PUT /api/settings
3. Once marked degraded (index.ts:1561), writes permanently to `server.agentState.llmProvider.health`

**Changes:**

**index.ts:1438-1467** — Fix validateAnthropicKey():
- Read key from vault first: `server.vault?.get('anthropic')?.value`
- Fall back to process.env only if vault empty
- Add key hash to cache structure so key changes invalidate automatically
- Expose `keyValidationCache` on server instance so settings route can reset it

**settings.ts:~90** — After vault.set() for provider keys:
- Invalidate keyValidationCache: `(server as any)._keyValidationCache = null`
- Reset agentState if degraded: set health back to 'healthy' with 're-validating' detail

**Test:** `POST /api/settings` with new anthropic key → `GET /health` → assert `llm.health !== 'degraded'`

### 1.2 Marketplace Redirect

**File:** `packages/server/src/local/routes/marketplace.ts`

**Change:** Add catch-all for common wrong endpoint names:
```typescript
fastify.get('/api/marketplace/plugins', async (_req, reply) => {
  reply.code(301).send({
    error: 'Endpoint renamed. Use /api/marketplace/search or /api/marketplace/packs',
    redirect: '/api/marketplace/search',
  });
});
```

**Test:** `GET /api/marketplace/packs` → 200, `GET /api/marketplace/plugins` → 301 with redirect hint

### 1.3 Knowledge Graph Fallback

**File:** `packages/server/src/local/routes/knowledge.ts` (line 20-21)

**Change:** Replace 404 with empty graph when workspace not found:
```typescript
// Before (line 20-21):
if (!ws) {
  return reply.status(404).send({ error: 'Workspace not found' });
}
// After:
if (!ws) {
  return { entities: [], relations: [] };
}
```

**Test:** `GET /api/memory/graph?workspace=nonexistent` → 200 with `{ entities: [], relations: [] }`

### 1.4 Test Data Cleanup

**Action:** One-time SQL execution:
```sql
DELETE FROM memory_frames WHERE content LIKE '%BENCHMARK%' OR content LIKE '%BENCH-SECRET%';
```

**Test:** `GET /api/memory/search?q=BENCHMARK` → empty results

---

## Phase 2: Tier Gating (LockedFeature wiring)

### 2.1 Mission Control → TEAMS

**File:** `app/src/views/MissionControlView.tsx`

**Change:** Wrap entire view content with LockedFeature:
```tsx
import { LockedFeature } from '@/components/LockedFeature';
// Inside return:
<LockedFeature requiredTier="TEAMS" featureName="Mission Control">
  {/* existing content */}
</LockedFeature>
```

**Test:** SOLO user navigates to Mission Control → sees lock overlay with "Upgrade to Teams"

### 2.2 Custom Skill Creation → BASIC

**File:** `app/src/views/CapabilitiesView.tsx`

**Change:** Wrap "Create Skill" button and creation form (~line 750):
```tsx
<LockedFeature requiredTier="BASIC" featureName="Custom Skills">
  <button onClick={...}>+ Create Skill</button>
  {showCreateSkill && <CreateSkillForm ... />}
</LockedFeature>
```

**Test:** SOLO user sees lock overlay on Create Skill button. BASIC+ sees button normally.

### 2.3 /spawn Command Gating → BASIC

**Files:** `app/src/App.tsx` (~line 565), `app/src/components/GlobalSearch.tsx` (~line 42)

**Change:** Filter /spawn from command list when tier < BASIC:
```tsx
const { tier } = useTier();
const visibleCommands = ALL_COMMANDS.filter(cmd => {
  if (cmd.name === '/spawn' && !tierSatisfies(tier, 'BASIC')) return false;
  return true;
});
```

Also: in chat command dispatch, if user types /spawn on SOLO, respond with upgrade message
instead of executing.

**Test:** SOLO user types "/" in chat → /spawn not in list. Types "/spawn" directly → gets upgrade message.

### 2.4 Connector Limit Indicator → SOLO

**File:** `app/src/views/CockpitView.tsx` (ConnectorsCard section)

**Change:** Add limit badge using tier context:
```tsx
const { tier, capabilities } = useTier();
const limit = capabilities.connectorLimit;
// In ConnectorsCard header:
{limit > 0 && (
  <span className="text-xs text-muted-foreground">
    {connectors.filter(c => c.status === 'connected').length}/{limit}
  </span>
)}
```

When limit reached, disable connect button and show LockedFeature upgrade card.

**Test:** SOLO user with 10 connected connectors → sees "10/10" badge, connect button disabled.

### 2.5 Sidebar Nav Gating

**File:** `app/src/components/AppSidebar.tsx`

**Change:** Add tier badge/lock icon to Mission Control nav item for SOLO/BASIC:
```tsx
{view === 'mission-control' && !tierSatisfies(tier, 'TEAMS') && (
  <span className="text-[10px]">🔒</span>
)}
```

**Test:** SOLO user sees lock icon next to Mission Control in sidebar.

---

## Phase 3: UX Fixes

### 3.1 Silent Error Handling (6 locations)

**Pattern applied to all locations — replace empty catch with error state:**

| File | Line | Action | Error State Variable |
|------|------|--------|---------------------|
| `CockpitView.tsx` | 283 | Connector connect | `connectError` |
| `CockpitView.tsx` | 298 | Connector disconnect | `connectError` |
| `CockpitView.tsx` | 245 | Schedule toggle | `scheduleError` |
| `CockpitView.tsx` | 262 | Schedule trigger | `scheduleError` |
| `OnboardingWizard.tsx` | 254 | Workspace creation | `createError` |
| `App.tsx` | 855 | Workspace creation | Return error to dialog |

Each location:
1. Parse error response: `const data = await res.json().catch(() => ({}))`
2. Set error state: `setXxxError(data.error ?? 'Operation failed')`
3. Display error in UI near the action that failed
4. Clear error on next attempt

Special case for 403 (workspace limit):
```tsx
if (res.status === 403) {
  const data = await res.json();
  setCreateError(`${data.error}`);
  // Show upgrade CTA
}
```

**Test:** Trigger each error condition → verify error message appears in UI.

### 3.2 React Key Warnings (19 high-risk fixes)

**Strategy: content-derived keys for dynamic data, stable prefixed keys for semi-dynamic:**

**HIGH priority (fix first):**

| File | Line | Current | Fix |
|------|------|---------|-----|
| `ChatArea.tsx` | 296 | `key={i}` on hints | `key={\`hint-${hint.slice(0,30)}-${i}\`}` |
| `ChatArea.tsx` | 346 | `key={i}` on decisions | `key={\`decision-${i}\`}` (sliced, stable within render) |
| `ChatArea.tsx` | 418 | `key={i}` on memories | `key={\`memory-${memory.date}-${i}\`}` |
| `ChatArea.tsx` | 436 | `key={i}` on static parts | `key={\`part-${i}\`}` |
| `ChatArea.tsx` | 462 | `key={i}` on static items | `key={\`item-${i}\`}` |
| `ChatArea.tsx` | 612 | `key={i}` on prompts | `key={\`prompt-${prompt.slice(0,20)}-${i}\`}` |
| `ChatMessage.tsx` | 371 | `key={i}` on steps | `key={\`step-${step.type ?? 'think'}-${i}\`}` |
| `ContextPanel.tsx` | 233 | `key={i}` on memories | `key={\`mem-${mem.date}-${i}\`}` |
| `WorkflowSuggestionCard.tsx` | 38 | `key={i}` on tools | `key={\`tool-${tool}-${i}\`}` |
| `CapabilitiesView.tsx` | 996 | `key={i}` on errors | `key={\`err-${i}\`}` |
| `CapabilitiesView.tsx` | 1378 | `key={i}` on steps | `key={\`step-${i}\`}` |
| `CapabilitiesView.tsx` | 1480 | `key={i}` on prompts | `key={\`guide-${i}\`}` |
| `HooksSection.tsx` | 69 | `key={idx}` on rules | `key={\`rule-${rule.id ?? idx}\`}` |

**MEDIUM priority:**

| File | Line | Current | Fix |
|------|------|---------|-----|
| `DiffViewer.tsx` | 107, 129, 144 | `key={i}` on diff lines | `key={\`diff-${i}\`}` |
| `CodePreview.tsx` | 41, 52 | `key={i}` on code lines | `key={\`line-${i}\`}` |
| `PersonaSwitcher.tsx` | 335 | `key={i}` on bestFor | `key={\`use-${use.slice(0,15)}\`}` |
| `VaultSection.tsx` | 247 | `key={i}` on steps | `key={\`setup-${i}\`}` |
| `BackupSection.tsx` | 415 | `key={i}` on errors | `key={\`restore-err-${i}\`}` |

**LOW priority (skip — static/skeleton):** CockpitView, SettingsView, MemoryBrowser, OnboardingWizard skeleton loaders.

**Test:** Open app → navigate all views → console shows zero "same key" warnings.

### 3.3 Onboarding Skip Button Prominence

**File:** `app/src/components/onboarding/OnboardingWizard.tsx` (~line 789)

**Change:** Replace subtle underlined text with proper Button component:
```tsx
<Button variant="outline" size="sm" onClick={() => goToStep(6)} className="mt-3 w-full">
  Skip — I'll configure later
</Button>
<p className="text-xs text-muted-foreground/70 mt-1.5 text-center">
  Using Ollama or a local model? Skip this step — Waggle auto-detects.
</p>
```

**Test:** Visual snapshot of API Key step showing prominent skip button.

### 3.4 Workspace Switcher Trigger

**File:** `app/src/components/AppSidebar.tsx`

**Change:** Add clickable workspace name in sidebar header:
```tsx
<button
  onClick={onToggleWorkspaceSwitcher}
  className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm hover:bg-secondary/50 transition-colors"
  title="Switch workspace (Ctrl+Tab)"
>
  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: 'var(--honey-500)' }} />
  <span className="truncate font-medium text-foreground">{activeWorkspaceName ?? 'Workspace'}</span>
  <span className="text-[10px] text-muted-foreground ml-auto font-mono">^Tab</span>
</button>
```

**Props update:** AppSidebar has `activeWorkspaceId` and `workspaces[]` but NOT `activeWorkspaceName` or `onToggleWorkspaceSwitcher`. Changes needed:
- Derive name: `const activeWs = workspaces.find(w => w.id === activeWorkspaceId)`
- Add `onToggleWorkspaceSwitcher` prop to AppSidebar interface (already exists in App.tsx:737 as `setShowWorkspaceSwitcher`)

**Test:** Click workspace name in sidebar → WorkspaceSwitcher overlay opens.

---

## Phase 4: Verification & Testing

### 4.1 TypeScript Compilation
```bash
npx tsc --noEmit --project packages/agent/tsconfig.json   # zero errors
npx tsc --noEmit --project app/tsconfig.json              # zero errors
```

### 4.2 New E2E Test: `tests/e2e/polish-verification.spec.ts`

```typescript
test.describe('Polish Plan Verification', () => {
  // Phase 1 — Backend
  test('health check returns healthy after key set', ...);
  test('marketplace /packs returns 200', ...);
  test('marketplace /plugins returns 301 redirect', ...);
  test('knowledge graph returns empty for nonexistent workspace', ...);
  test('no BENCHMARK data in memory', ...);

  // Phase 2 — Tier Gating
  test('SOLO: Mission Control shows lock overlay', ...);
  test('SOLO: Create Skill shows lock overlay', ...);
  test('SOLO: /spawn not in command list', ...);
  test('SOLO: connector limit badge visible', ...);
  test('SOLO: sidebar shows lock on Mission Control', ...);

  // Phase 3 — UX
  test('connector connect shows error on failure', ...);
  test('workspace creation shows error on 403', ...);
  test('onboarding skip button is visible Button component', ...);
  test('workspace switcher opens from sidebar click', ...);
  test('zero React key warnings in console', ...);
});
```

### 4.3 Visual Regression
Update visual baselines for:
- Onboarding API Key step (new skip button)
- Mission Control (lock overlay for SOLO)
- Cockpit connectors card (limit badge)
- Sidebar (workspace trigger + lock icon)

---

## File Change Summary

| Phase | Files Modified | Files Created |
|-------|---------------|--------------|
| Phase 1 | 3 (index.ts, settings.ts, marketplace.ts) | 0 |
| Phase 2 | 5 (MissionControlView, CapabilitiesView, App.tsx, GlobalSearch, AppSidebar) + CockpitView | 0 |
| Phase 3 | 8 (CockpitView, OnboardingWizard, App.tsx, ChatArea, ChatMessage, ContextPanel, DiffViewer, plus 5 more key fixes) | 0 |
| Phase 4 | 0 | 1 (polish-verification.spec.ts) |
| **Total** | **~20 files modified** | **1 file created** |

---

## Success Criteria

- [ ] `GET /health` returns `healthy` when API key is valid in vault
- [ ] SOLO user sees lock overlay on Mission Control, Create Skill
- [ ] SOLO user does NOT see /spawn in command palette
- [ ] Connector connect shows error message on failure (not silent)
- [ ] Workspace creation shows tier limit error on 403 (not silent)
- [ ] Onboarding API Key step has prominent "Skip" button
- [ ] Workspace switcher opens from sidebar click
- [ ] Console shows zero "same key" React warnings
- [ ] `npx tsc --noEmit` passes on both projects
- [ ] All existing E2E tests still pass (291/291)
- [ ] New polish-verification.spec.ts passes (15+ tests)
