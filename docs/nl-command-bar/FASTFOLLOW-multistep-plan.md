# Fast-follow: multi-step plan execution for the NL Command Bar

**Opened:** 2026-06-27 · **Status:** open · **Owner:** TBD

## Context
The Tier 1 NL intent resolver (`POST /api/command/interpret`) ships in v1 with
**single-action + approval** only (per the brief's §2 "v1 = single-action").
The `plan` kind is **typed but not executed**:

- `command-intent.ts` carries `InterpretResult.steps?: ResolvedAction[]`.
- `command-interpret.ts` collapses a 1-step plan to a single action and
  **downgrades a multi-step plan to `clarify`** ("This needs multiple steps: …
  Want me to start with the first?"), offering only the first step.

## Scope of this ticket
Execute a validated multi-step plan end-to-end:
1. Sequential execution of `steps[]` with a per-step preview (reuse the approval
   surface for each side-effect step; reads/navs run inline).
2. Stop-on-failure + partial-progress reporting.
3. A plan review surface in the palette (list the steps, let the user drop/reorder
   before running) — or hand off to the chat/agent loop for true orchestration.
4. Decide ownership: a multi-step plan may belong to the **agent loop**
   (`agent-loop.ts`) rather than the command bar, since it already has
   step/confirmation/loop-guard machinery. Evaluate routing `plan` → a scoped
   agent run instead of bespoke palette orchestration.

## Guardrails (unchanged)
- Closed registry only — every step is a registry action id, server-validated.
- Destructive steps always approve (D4 / `confirmation.ts`), every autonomy level.
- Tier gate applies per step.
