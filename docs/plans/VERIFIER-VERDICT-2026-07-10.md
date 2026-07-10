# Adversarial Verifier Verdict — Self-Evolution Arc (steals #2 + #3 v1)

**Date:** 2026-07-10 · **Auditor:** Fable adversarial verifier (read-only) · **Branch:** `feat/steals-2-3`
**Under audit:** `d07fb03b` (Wave 2), `ce9f67ea` (Wave 1), plan `docs/plans/SELF-EVOLUTION-ARC-2026-07-10.md`

## VERDICT: REJECTED

One HIGH finding blocks approval. The core trust boundary (no *autonomous* disk/skill/memory
write when disabled or unapproved) **holds and is well-tested** — the rejection is about the
*quality of the human approval* the whole design leans on, plus follow-ups. The fix is small and
frontend-only; this is a cheap bounce, not a redesign.

---

## What is CORRECT and safe (verified, not assumed)

- **Default OFF.** `self-evolution.json` absent/corrupt/array/partial ⇒ merged onto `DEFAULT_CONFIG`
  with `enabled:false`; `tick()` returns 0 before enumerating (`idle-watcher.ts:120-131,214`).
  Tested: absent, corrupt, disabled, partial-merge all assert disabled/no-op.
- **VITEST guard + onClose stop** wired (`index.ts:2239-2244`). Single-flight `ticking` guard tested.
- **Watcher → reviewer wiring is fail-safe.** `runReviewTurn` always sends `proposeHeld:true` and
  **no `autonomy`** ⇒ chat defaults `autonomyLevel:'normal'` (`chat.ts:564`, `chat-client.ts:76-82`).
- **create_skill is gated at normal** (`confirmation.ts:16-26` `ALWAYS_CONFIRM`) ⇒ it reaches the
  `proposeHeldTurn` intercept (`chat.ts:1171-1189`) and is **held**, never executed inline. The
  intercept runs **before** the grant-store and auto-approve checks, so a saved "Always allow"
  cannot leak a headless write. Any *other* gated tool in a review turn is `cancel:true` denied.
- **Reviewer's effective tool pool = reads + create_skill only.** `applyPersonaToolFilter` allowlist
  = `tools[] ∪ ALWAYS_AVAILABLE_TOOLS`, then `disallowedTools` strips the re-adds. `save_memory`,
  `delete_skill`, `install_capability`, `acquire_capability`, `add_task`, `correct_knowledge`,
  `spawn_agent`, `bash`, file/git writes, `execute_step`, `compose_workflow` are all explicitly
  disallowed and **stripped** — locked by `session-reviewer-persona.test.ts:39-56`. Connectors carry
  dynamic names in neither `tools[]` nor `ALWAYS_AVAILABLE`, so the allowlist already excludes them.
  The non-create_skill survivors are all reads (jailed to workspace `files/`), harmless to run inline.
- **User manually selecting `session-reviewer` in normal chat** is safe: no `proposeHeld`, so
  create_skill takes the normal interactive approval path — the user approves their own write. Not
  surfaced in `persona-tier.ts` (no ref) so it is not offered in the PersonaSwitcher/onboarding.
- **Held execution is defended twice:** `enqueueHeldAction` scans args + refuses critical/non-proposable;
  `executeHeldAction` re-scans + re-checks critical at execute time + atomic idempotent claim gate;
  runs the REAL create_skill tool through the sanctioned, backup-protected `writeSkill`
  (`skill-write-service.ts:168-200`, `invalidName` blocks path traversal, `stashBackup` before overwrite).
- **Anti-nag gate** namespaces dedupeKeys (`prompt_optimization:<ws>`, `monthly_assessment`,
  `self-evolution:<session>`) — no cross-source collision; corrupt/array store recovers to "notify";
  LRU-capped at 200. The "Action awaiting your approval" notification is emitted **without** a
  dedupeKey, so a real proposal notification is never suppressed. Tests are thorough and real.
- **Memory-write lint** correctly routes symptoms to `recordCapabilityGap` + cancels; conservative
  empty/non-string ⇒ allow; sentence-scoped to avoid cross-sentence combination.

---

## FINDINGS

### [HIGH] F1 — ApprovalsApp shows the human NOTHING about a held `create_skill`'s content

`apps/web/src/components/os/apps/ApprovalsApp.tsx:62-74` (`summarizeInput`) + `:244-251`.

`summarizeInput` only surfaces `to/recipient`, `path/file_path/target_workspace_id`, `command`,
`query`. A `create_skill` held action's args are `{name, content}` — **none of those fields match**,
so `inputSummary` is the empty string. The card then renders:
- `toolName`: `create_skill`
- `Automation:` line: `describeToolUse('create_skill') = "Creating skill: <name>..."` (`chat-helpers.ts:158-159`), CSS-`truncate`d
- **the skill body (`input.content`) is never shown, and there is no expand/inspect affordance.**

`/api/approval/pending` DOES return the full `input` (`approval.ts:82-92`, `safeParseArgs`), so the
data is present — the FE simply doesn't render it.

**Why HIGH.** The entire safety story of steal #3 v1 is "review-before-apply — every apply goes
through ApprovalsApp." A skill is a *persistence primitive*: once approved it is written to disk and
injected into every future agent turn's prompt. The reviewer is fed an attacker-influenceable
session transcript (see F-note below), and its one write is exactly this. A human clicking
"Approve & run" sees only a skill name and a truncated verb phrase — they cannot see the instructions
they are persisting. That converts the human control from "review" into "approve-blind" for the one
vehicle this arc adds. (`write_file` held actions at least show the target path via
`summarizeInput`; `create_skill` shows neither location nor content.)

**Mitigations that keep this out of CRITICAL:** default OFF; `enqueueHeldAction` injection-scans the
args (overt payloads refused); `redactSkillContent` on write; human approval still required (no
autonomous write). But a benign-looking-but-adversarial skill body evades the injection scanner.

**Required fix (FE-only, small):** in ApprovalsApp render the held `create_skill` `input.name` and a
content preview with an expander (or a "view full skill" panel) so the approver sees the exact bytes
that `writeSkill` will persist. Optionally extend `summarizeInput` to surface `input.name` for
`create_skill`. Add a test asserting a held create_skill card exposes its content.

### [MEDIUM] F2 — memory-write lint false-positives lose legitimate preference/dependence memories

`packages/agent/src/memory-write-lint.ts:34-61,93-106`. The classifier fires on *(capability noun AND
failure verb in the same sentence)*, and `FAILURE_VERB` includes bare `cannot|can't`. Realistic
LEGIT memories are misclassified as `capability_symptom` and **cancelled**:
- `"User's main tool is Figma; they cannot stand Sketch."` → `tool` + `cannot` ⇒ blocked (it's a preference).
- `"User can't work without their Jira integration."` → `integration` + `can't` ⇒ blocked (it's a dependence, positive).
- `"Our API is down for maintenance this weekend."` → `API`+`is down` ⇒ blocked (a legit business fact).

The module's own docstring promises "User preferences / opinions about tools MUST pass" — these
violate that stated constraint, and CLAUDE.md §coding-style values not losing data. Because
save_memory is the sink (cognify bypasses the hook per the declared v1 gap), the loss is bounded to
explicit agent save_memory calls, and the agent receives a cancel reason it could act on — hence
MEDIUM, not HIGH. **Fix/follow-up:** require the failure to predicate on the *capability* (not the
user) — e.g. exclude when the subject of the failure verb is a person/pronoun, or drop bare
`cannot/can't` from the generic-noun path and keep it only for the connection-failure path.

### [MEDIUM] F3 — the `proposeHeldTurn` intercept branch itself is not directly tested

The plan promised an "end-to-end route test with mocked loopback (reviewer proposes → held action
exists → approve → skill written with backup)." The two halves exist —
`session-reviewer-persona.test.ts` (tool filter) and `held-action-executor.test.ts:153-165`
(create_skill held → executes via sanctioned path) — but the security-critical `chat.ts:1171-1189`
branch (convert a live gated create_skill into `enqueueHeldAction`, and `cancel:true`-deny every
*other* gated tool during a review turn) has **no direct test**. The branch is simple and composes
tested pieces, so this is a coverage gap, not a known break. **Follow-up:** add a route test with
`proposeHeld:true` asserting (a) a create_skill call becomes a held row and (b) a second gated tool
(e.g. write_file) is denied with no side effect.

### [LOW] F4 — meta lazy-backfill elsewhere can trigger a spurious re-review

`idle-watcher.ts:169-177` keys the fired-set on `sessionId:mtimeMs`. The watcher itself is pure, but
if any *other* subsystem calls `readSessionMeta` (which lazily backfills a title/summary and writes
the file — the documented side effect the watcher avoids) on an already-reviewed idle session, its
mtime advances, the fired key changes, and the session **re-fires one review with no new user
content**. Bounded by `maxReviewsPerDay`. Cost/nuisance only. Follow-up: key on last-message content
hash or line count instead of mtime, or persist the fired-set.

### [LOW] F5 — daily cap + fired-set are RAM-only (declared) 

`dayCount`/`firedKeys` reset on restart (`idle-watcher.ts:87-89`), so a crash-loop could exceed the
intended 5/day and a restart could re-fire recently-reviewed sessions. Declared as an accepted v1
deviation; acceptable given default-OFF and small cap. Note only.

### [LOW] F6 — NotificationGate load→save is non-atomic

`notification-gate.ts:86-91` reads the whole store then writes it; concurrent emits can race and lose
a fingerprint update. Worst case is one duplicate/missed suppression — never a security effect. Note only.

---

## Declared deviations — assessment

- **Transcript embedded in the review message (vs "reviewer has read tools + workspace binding").**
  Sound: `read_file` is jailed to workspace `files/` (`resolveSafe`) so the reviewer cannot open the
  session JSONL; embedding is the reliable path. The embedded transcript passes through
  `scanForInjection(message,'user_input')` at `chat.ts:617` — a ≥0.7 payload blocks the whole review
  (fail-safe), a weaker one can steer the reviewer but its only write is the held, human-approved
  create_skill. Acceptable, and it is what makes F1 the load-bearing control.
- **RAM daily cap / fired-set** — acceptable (F5).
- **Persona 22→23** — session-reviewer added, excluded from onboarding + PersonaSwitcher; create_skill
  still gates even if selected. Acceptable.

## Path to APPROVED
Fix **F1** (render held create_skill content in ApprovalsApp + a test). F2/F3 are strongly
recommended before shipping self-evolution to users but can be listed follow-ups. F4-F6 are notes.
