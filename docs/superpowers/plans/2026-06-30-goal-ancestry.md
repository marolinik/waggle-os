# Goal-Ancestry Context Chain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inject a durable "why" breadcrumb (`# Why You're Here` — project + goal) into the agent system prompt each run, complementing recall and the live awareness task state.

**Architecture:** A `GoalAncestry` type (4 optional levels) + a pure `renderGoalAncestry()` helper + an `Orchestrator.setGoalAncestry()` setter and a cached `# Why You're Here` section in `buildSystemPrompt()`. The chat handler populates `project` from the active workspace name; `goal` lights up wherever an `AgentDef.goal` is in play (agent runs).

**Tech Stack:** TypeScript, Vitest. No new deps, no UI, no persistence, no feature flag.

## Global Constraints

- **Pure renderer.** `Orchestrator`/`renderGoalAncestry` never reach into the DB for ancestry — they render what they're handed.
- **No duplication.** The live current task stays in the self-awareness section; goal-ancestry omits `task`.
- **Self-suppressing.** Empty/absent ancestry ⇒ renders `''` ⇒ filtered out ⇒ prompt byte-identical to today.
- **Truncate** each level to ≤200 chars so a verbose goal can't bloat every turn.
- **Order:** the section renders levels mission→project→goal→task, and sits **after identity, before self-awareness** in `buildSystemPrompt()`.
- **Gates:** `tsc --noEmit` 0 (shared/agent/server); new units RED→GREEN; existing orchestrator suite green.

---

### Task 1: `GoalAncestry` type

**Files:**
- Modify: `packages/shared/src/types.ts`
- Test: covered transitively (type-only; exercised by Tasks 2–3).

**Interfaces:**
- Produces: `interface GoalAncestry { mission?: string; project?: string; goal?: string; task?: string }`.

- [ ] **Step 1: Add the type** — append near the other agent/task types in `packages/shared/src/types.ts`:

```ts
/**
 * AI-OS #6 — durable "why" injected into the agent system prompt each run
 * (the purpose above the current turn; complements recall + live awareness).
 * All levels optional. Today `project` (workspace) and `goal` (agent goal) are
 * populated; `mission` (no workspace-charter field yet) and `task` (already in
 * the self-awareness section) are reserved/omitted.
 */
export interface GoalAncestry {
  mission?: string;
  project?: string;
  goal?: string;
  task?: string;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit --project packages/shared/tsconfig.json`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types.ts
git commit -m "feat(shared): GoalAncestry type (#6)"
```

---

### Task 2: `renderGoalAncestry` pure helper

**Files:**
- Create: `packages/agent/src/goal-ancestry.ts`
- Modify: `packages/agent/src/index.ts` (export)
- Test: `packages/agent/tests/goal-ancestry.test.ts`

**Interfaces:**
- Consumes: `GoalAncestry` (Task 1) from `@waggle/shared`.
- Produces: `renderGoalAncestry(a: GoalAncestry | null | undefined): string`.

- [ ] **Step 1: Write the failing test** — `packages/agent/tests/goal-ancestry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderGoalAncestry } from '../src/goal-ancestry.js';

describe('renderGoalAncestry', () => {
  it('renders a heading + one line per present level, in mission→project→goal→task order', () => {
    const out = renderGoalAncestry({ project: 'Acme', goal: 'Ship the pane', mission: 'Win', task: 'x' });
    expect(out).toBe("# Why You're Here\nMission: Win\nProject: Acme\nGoal: Ship the pane\nTask: x");
  });

  it('renders only the present levels', () => {
    expect(renderGoalAncestry({ project: 'Acme' })).toBe("# Why You're Here\nProject: Acme");
  });

  it('returns empty string for null / undefined / all-empty', () => {
    expect(renderGoalAncestry(null)).toBe('');
    expect(renderGoalAncestry(undefined)).toBe('');
    expect(renderGoalAncestry({})).toBe('');
    expect(renderGoalAncestry({ goal: '' })).toBe('');
  });

  it('truncates an over-long level to 200 chars', () => {
    const long = 'x'.repeat(300);
    const out = renderGoalAncestry({ goal: long });
    const line = out.split('\n')[1];
    expect(line.length).toBeLessThanOrEqual('Goal: '.length + 200);
    expect(line.endsWith('...')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/agent/tests/goal-ancestry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** `packages/agent/src/goal-ancestry.ts`:

```ts
/**
 * AI-OS #6 — pure renderer for the goal-ancestry "# Why You're Here" prompt
 * section. Total (never throws); returns '' when there is no durable "why" so
 * the section self-suppresses and the prompt stays byte-identical to today.
 */
import type { GoalAncestry } from '@waggle/shared';

const MAX = 200;
const cap = (s: string): string => (s.length > MAX ? s.slice(0, MAX - 3) + '...' : s);

export function renderGoalAncestry(a: GoalAncestry | null | undefined): string {
  if (!a) return '';
  const lines: string[] = [];
  if (a.mission) lines.push(`Mission: ${cap(a.mission)}`);
  if (a.project) lines.push(`Project: ${cap(a.project)}`);
  if (a.goal) lines.push(`Goal: ${cap(a.goal)}`);
  if (a.task) lines.push(`Task: ${cap(a.task)}`);
  if (lines.length === 0) return '';
  return "# Why You're Here\n" + lines.join('\n');
}
```

- [ ] **Step 4: Export + run** — add to `packages/agent/src/index.ts`:

```ts
export { renderGoalAncestry } from './goal-ancestry.js';
```

Run: `npx vitest run packages/agent/tests/goal-ancestry.test.ts`
Expected: PASS (4 cases).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit --project packages/agent/tsconfig.json
git add packages/agent/src/goal-ancestry.ts packages/agent/src/index.ts packages/agent/tests/goal-ancestry.test.ts
git commit -m "feat(agent): renderGoalAncestry pure helper (#6)"
```

---

### Task 3: Orchestrator — setter + cached section

**Files:**
- Modify: `packages/agent/src/orchestrator.ts`
- Test: `packages/agent/tests/orchestrator-goal-ancestry.test.ts`

**Interfaces:**
- Consumes: `renderGoalAncestry` (Task 2), `GoalAncestry` (Task 1).
- Produces: `OrchestratorConfig.goalAncestry?: GoalAncestry`; `Orchestrator.setGoalAncestry(a: GoalAncestry | null): void`; a `# Why You're Here` section in `buildSystemPrompt()`.

- [ ] **Step 1: Write the failing test** — `packages/agent/tests/orchestrator-goal-ancestry.test.ts` (mirror the existing orchestrator test's MindDB setup — import `MindDB` + a mock embedder from the sibling tests; the minimal harness is `new Orchestrator({ db, embedder })`):

```ts
import { describe, it, expect } from 'vitest';
import { MindDB } from '@waggle/core';
import { Orchestrator } from '../src/orchestrator.js';

// Mock embedder — orchestrator construction needs one but buildSystemPrompt doesn't embed.
const embedder = { embed: async () => [0], dimensions: 1 } as unknown as ConstructorParameters<typeof Orchestrator>[0]['embedder'];

function orch() {
  return new Orchestrator({ db: new MindDB(':memory:'), embedder });
}

describe('buildSystemPrompt goal-ancestry (#6)', () => {
  it('renders the "Why You\'re Here" section after setGoalAncestry', () => {
    const o = orch();
    o.setGoalAncestry({ project: 'Acme Redesign', goal: 'Ship the live-output pane' });
    const prompt = o.buildSystemPrompt();
    expect(prompt).toContain("# Why You're Here");
    expect(prompt).toContain('Project: Acme Redesign');
    expect(prompt).toContain('Goal: Ship the live-output pane');
  });

  it('omits the section entirely when no ancestry is set', () => {
    const prompt = orch().buildSystemPrompt();
    expect(prompt).not.toContain("# Why You're Here");
  });

  it('accepts goalAncestry via the constructor config', () => {
    const o = new Orchestrator({ db: new MindDB(':memory:'), embedder, goalAncestry: { project: 'P' } });
    expect(o.buildSystemPrompt()).toContain('Project: P');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/agent/tests/orchestrator-goal-ancestry.test.ts`
Expected: FAIL — `setGoalAncestry`/`goalAncestry` not defined.

- [ ] **Step 3: Implement** in `packages/agent/src/orchestrator.ts`:

(a) Imports — add the helper + type:

```ts
import { renderGoalAncestry } from './goal-ancestry.js';
import type { GoalAncestry } from '@waggle/shared';
```

(b) `OrchestratorConfig` (after `reranker?: Reranker;`, before the closing brace at line ~85):

```ts
  /** AI-OS #6 — durable "why" breadcrumb injected into buildSystemPrompt. */
  goalAncestry?: GoalAncestry;
```

(c) Field + constructor (beside `private skills: string[];` add the field; in the constructor beside `this.skills = config.skills ?? [];` add the assignment):

```ts
  private goalAncestry: GoalAncestry | null = null;
```
```ts
    this.goalAncestry = config.goalAncestry ?? null;
```

(d) Setter (place near `setWorkspaceMind` — mutable like it):

```ts
  /** AI-OS #6 — set/replace the goal-ancestry breadcrumb for the next prompt build. */
  setGoalAncestry(ancestry: GoalAncestry | null): void {
    this.goalAncestry = ancestry;
  }
```

(e) Cached section in `buildSystemPrompt()` — after the `identitySection` block, before the `awarenessSection` block:

```ts
    // ── GOAL ANCESTRY (the durable "why"; changes only when re-set) ──
    const goalAncestrySection = this.cachedSection(
      'goal_ancestry',
      JSON.stringify(this.goalAncestry) || 'empty',
      () => renderGoalAncestry(this.goalAncestry),
    );
```

(f) Insert into the parts array (was `[identitySection, awarenessSection, contextSection]`):

```ts
    const parts = [identitySection, goalAncestrySection, awarenessSection, contextSection].filter(Boolean);
```

- [ ] **Step 4: Run test + existing orchestrator suite**

Run: `npx vitest run packages/agent/tests/orchestrator-goal-ancestry.test.ts && npx vitest run packages/agent/tests/orchestrator.test.ts`
Expected: PASS (new 3 + existing orchestrator suite green).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit --project packages/agent/tsconfig.json
git add packages/agent/src/orchestrator.ts packages/agent/tests/orchestrator-goal-ancestry.test.ts
git commit -m "feat(agent): orchestrator goal-ancestry setter + cached section (#6)"
```

---

### Task 4: Chat wiring — populate `project` from the active workspace

**Files:**
- Modify: `packages/server/src/local/routes/chat.ts` (the local `buildSystemPrompt`, around the `orch.buildSystemPrompt()` call at line ~301)
- Test: `packages/server/tests/chat-api.test.ts` (extend) OR a focused assertion that the system prompt carries the workspace name.

**Interfaces:**
- Consumes: `Orchestrator.setGoalAncestry` (Task 3); the workspace-name resolver (`server.agentState.listWorkspaces?.().find(w => w.id === <wsId>)?.name`, the pattern at chat.ts:1811).

- [ ] **Step 1: Locate + read** the local `buildSystemPrompt(orch, workspacePath, sessionId, historyLen, effectiveWorkspace, personaOverride, assembled)` function (chat.ts ~252–305). Confirm `effectiveWorkspace` (workspace id) and `server` are in scope.

- [ ] **Step 2: Write the failing test** — extend `chat-api.test.ts`: drive a chat turn in a named workspace and assert the streamed/assembled system context references the workspace name. (If the test harness doesn't expose the system prompt, add a focused unit around a small extracted `resolveChatAncestry(server, effectiveWorkspace)` helper instead — see Step 3.)

```ts
// Focused unit (preferred — no need to crack open the SSE turn):
import { resolveChatAncestry } from '../src/local/routes/chat.js';
it('resolves project from the active workspace name', () => {
  const fakeServer = { agentState: { listWorkspaces: () => [{ id: 'ws1', name: 'Acme Redesign' }] } };
  expect(resolveChatAncestry(fakeServer as never, 'ws1')).toEqual({ project: 'Acme Redesign' });
  expect(resolveChatAncestry(fakeServer as never, 'missing')).toEqual({});
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run packages/server/tests/chat-api.test.ts -t "project from the active workspace"`
Expected: FAIL — `resolveChatAncestry` not exported.

- [ ] **Step 4: Implement** in `packages/server/src/local/routes/chat.ts`:

Add a tiny exported helper near the top of the route module (keeps the wiring testable + DRY):

```ts
/** AI-OS #6 — resolve the durable goal-ancestry for a chat turn. `project` is
 *  the active workspace name; `goal` is omitted in chat (personas carry no goal
 *  — it lights up for agent runs that carry an AgentDef.goal). */
export function resolveChatAncestry(
  server: { agentState?: { listWorkspaces?: () => Array<{ id: string; name: string }> } },
  workspaceId: string | undefined,
): import('@waggle/shared').GoalAncestry {
  const name = workspaceId
    ? server.agentState?.listWorkspaces?.().find((w) => w.id === workspaceId)?.name
    : undefined;
  return name ? { project: name } : {};
}
```

Then, in the local `buildSystemPrompt`, immediately before `prompt += assembled?.system ?? orch.buildSystemPrompt();`:

```ts
    orch.setGoalAncestry(resolveChatAncestry(server, effectiveWorkspace));
```

- [ ] **Step 5: Run test to verify it passes + server suite sanity**

Run: `npx vitest run packages/server/tests/chat-api.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck + commit**

```bash
npx tsc --noEmit --project packages/server/tsconfig.json
git add packages/server/src/local/routes/chat.ts packages/server/tests/chat-api.test.ts
git commit -m "feat(server): chat populates goal-ancestry project from workspace (#6)"
```

---

### Final Gate

- [ ] **Full typecheck:** `npx tsc --noEmit --project packages/shared/tsconfig.json && npx tsc --noEmit --project packages/agent/tsconfig.json && npx tsc --noEmit --project packages/server/tsconfig.json` → 0.
- [ ] **Touched suites:** `npx vitest run packages/agent/tests/goal-ancestry.test.ts packages/agent/tests/orchestrator-goal-ancestry.test.ts packages/agent/tests/orchestrator.test.ts packages/server/tests/chat-api.test.ts`
- [ ] **Lint** touched files.

## Fast-follow (documented, NOT silently dropped)

**Agent-run `goal` wiring.** The `goal` level is designed to carry `AgentDef.goal`, but chat
personas have no goal field, so chat populates only `project`. Lighting up `goal` requires calling
`orch.setGoalAncestry({ project, goal: agentDef.goal })` on the **agent-run** path (fleet spawn /
`runAgentLoop`), which constructs/uses its own orchestrator. That path is a clean additive follow-up
(same setter, same renderer) — it is intentionally out of this S-scoped plan, not overlooked.

## Self-Review

**Spec coverage:** §3 Unit A → Task 1 · Unit B → Tasks 2–3 · Unit C → Task 4 · §5 truncation/empty → Task 2 tests · §6 testing → each task's TDD + Final Gate. The §2 `goal`-for-agent-runs mapping is delivered for the *renderer/setter* (Tasks 2–3) and its chat half (Task 4 `project`); the agent-run `goal` populate is explicitly logged as a fast-follow (no silent cap).

**Placeholder scan:** Task 4 Step 1 is a *read-to-confirm* step (not a code placeholder); every code step ships real code. No TBD/TODO.

**Type consistency:** `GoalAncestry` (Task 1) is consumed unchanged in Tasks 2–4. `renderGoalAncestry(a)` (Task 2) is called in Task 3. `setGoalAncestry`/`goalAncestry` names match across Tasks 3–4. `resolveChatAncestry(server, workspaceId)` returns `GoalAncestry`, consumed by `setGoalAncestry`.
