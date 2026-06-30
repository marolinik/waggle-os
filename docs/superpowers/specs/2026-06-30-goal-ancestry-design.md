# Goal-Ancestry Context Chain — Design

**Date:** 2026-06-30 · **Author:** Claude Opus 4.8 (1M) · **Owner:** Marko (founder)
**Arc:** AI-OS external-agent recon · STEAL NOW item **#6** from
`docs/analysis/external-agent-launching-and-memory-comparison-2026-06-29.md`
**Effort:** S · **Branch:** `feat/goal-ancestry-context`

---

## 1. Goal & Non-Goals

**Goal.** Give every agent run a durable sense of **why it exists** — a short "ancestry"
breadcrumb (the purpose above the current turn) injected into the system prompt, complementing
(not duplicating) hive-mind recall and the live AwarenessLayer task state. Paperclip supplies a
mission→project→goal→task chain each run; this is Waggle's honest equivalent.

**Non-goals (YAGNI):**
- No new persistence / data model. No workspace "charter/mission" field (reserved for later).
- No UI. No feature flag (purely additive — renders nothing when there's no "why").
- The `Orchestrator` does **not** reach into the DB for ancestry — it renders what it's handed.
- The live current task stays in the existing self-awareness "Active Tasks" section (no dup).

## 2. Honest Mapping (founder-approved 2026-06-30)

Waggle has no mission→project→goal→task hierarchy. The durable "why" sources are:

| Level | Waggle source | Included? |
|---|---|---|
| `mission` | *(no workspace-charter field exists yet)* | reserved — omitted today |
| `project` | active **workspace** name (+ template) — the durable container | **yes** |
| `goal` | **`AgentDef.goal`** / persona goal — the agent's declared purpose | **yes** |
| `task` | already rendered by the self-awareness "Active Tasks" section | omitted (no dup) |

All four levels exist in the type for future-proofing; only `project` + `goal` are populated now.

## 3. Architecture — pure renderer + caller populates

**Unit A — `GoalAncestry` type (`packages/shared/src/types.ts`).**
```ts
/** Durable "why" injected into the agent system prompt (AI-OS #6). All optional. */
export interface GoalAncestry {
  mission?: string;  // reserved — no workspace charter field yet
  project?: string;  // workspace name (+ template)
  goal?: string;     // agent's declared goal / persona purpose
  task?: string;     // omitted today (lives in the awareness section)
}
```

**Unit B — Orchestrator renders it (`packages/agent/src/orchestrator.ts`).**
- `OrchestratorConfig.goalAncestry?: GoalAncestry`; stored as `private goalAncestry: GoalAncestry | null`.
- A pure helper `renderGoalAncestry(a: GoalAncestry | null): string` returns a `# Why You're Here`
  block listing only the present levels as `Label: value` lines, or `''` when nothing is present.
- `buildSystemPrompt()` adds a **cached** section (keyed on `JSON.stringify(goalAncestry) || 'empty'`,
  same pattern as the identity section) inserted **after identity, before self-awareness** — purpose
  frames capability/awareness. The empty result is filtered out by the existing `.filter(Boolean)`.

Render format (only present levels):
```
# Why You're Here
Project: Acme Redesign (engineering)
Goal: Ship the launcher live-output pane and keep tests green
```

**Unit C — Caller populates (`packages/server/src/local/index.ts`, the per-session orchestrator).**
- Build a `GoalAncestry` from available context at construction: `project` ← active workspace
  name (+ template if present), `goal` ← the resolved persona/agent goal for the session.
- `mission`/`task` left undefined. When neither `project` nor `goal` is known (e.g. bare personal
  chat), pass `undefined` → section renders nothing → byte-identical to today.

## 4. Data Flow
```
session construct (local/index.ts) ── workspace + persona/agent ──▶ GoalAncestry { project, goal }
  └▶ new Orchestrator({ ..., goalAncestry })
       └▶ buildSystemPrompt() ── cachedSection('goal_ancestry') ──▶ "# Why You're Here\nProject: …\nGoal: …"
            (empty ancestry ⇒ '' ⇒ filtered out ⇒ prompt unchanged)
```

## 5. Error Handling / Edge Cases
- All levels optional; missing → omitted line. All-empty → no section (no heading, no blank).
- Long values: truncate each level to a sane cap (≤200 chars) so a verbose goal can't bloat every turn.
- The renderer is total (never throws); a malformed ancestry object just yields the lines it can.

## 6. Testing (TDD)
- `renderGoalAncestry`: full ancestry → heading + one line per present level, in mission→project→goal→task order;
  partial (only `goal`) → just that line; empty/`null` → `''`; over-long value → truncated.
- `buildSystemPrompt`: with ancestry → section present and ordered after identity / before self-awareness;
  without → section absent (prompt unchanged); cache hit on unchanged ancestry (no recompute).
- Caller wiring: a session with workspace + persona goal yields a populated `goalAncestry`; bare session yields none.

**Gates:** `tsc --noEmit` 0 (shared/agent/server); new units RED→GREEN; existing orchestrator suite green.

## 7. File Change List
| File | Change |
|---|---|
| `packages/shared/src/types.ts` | add `GoalAncestry` interface |
| `packages/agent/src/orchestrator.ts` | `OrchestratorConfig.goalAncestry`, field, `renderGoalAncestry`, cached section in `buildSystemPrompt` |
| `packages/server/src/local/index.ts` | populate `goalAncestry` for the per-session orchestrator |
| tests (2) | `orchestrator` goal-ancestry unit tests + (light) caller-wiring assertion |

## 8. Open Questions
- **None blocking.** Mapping founder-approved. `mission` + a workspace-charter field is a separate future item.
