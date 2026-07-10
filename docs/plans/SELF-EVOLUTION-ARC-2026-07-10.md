# Self-Evolution Arc — Steals #2 + #3 (CowAgent teardown)

**Date:** 2026-07-10 · **Branch:** `feat/steals-2-3` (worktree channels-arc) · **Orchestration:** Fable plans/verifies, Opus executes.
**Source:** `docs/analysis/cowagent-vs-waggle-2026-07-09.md` §2 items 2–3; handoff 0709 S1 steal specs.

## Scope

**Steal #2 — anti-nag material-change gate + "fix the source, not the symptom"**
Proactive/self-review outputs only notify when a real artifact changed; "capability X failed" observations route to the improvement-signal path instead of durable memory.

**Steal #3 — runtime idle-triggered self-evolution (v1 = review-before-apply only)**
60s daemon scans sessions; fires on idle+turns; spawns a restricted reviewer through loopback `/api/chat`; reviewer proposes skill patches / finishes promised-but-undelivered deliverables via the held-action approval queue; skill writes gain backup+undo. **No autonomous disk writes in v1** — every apply goes through ApprovalsApp (founder-ratified trust boundary from 0709 handoff).

## Verified primitives (recon 2026-07-10, 3-agent Opus sweep)

- Notification chokepoint: `emitNotification` `packages/server/src/local/routes/notifications.ts:50` (persist→SSE); cron fan-out `packages/agent/src/cron-delivery-router.ts:93`. **No dedupe/material check anywhere today.** Nag sources: proactive handlers (`proactive-handlers.ts:113/186/221/245`), `prompt_optimization` + `monthly_assessment` cron cases (`index.ts:1805/2055`) emit unconditionally.
- Memory-lint seam: `tool-executor.ts:182-197` fires `pre:memory-write` with cancel support; handler registered `routes/chat.ts:227` (currently warn-only). Fix-or-flag sink exists: `recordCapabilityGap` (`improvement-detector.ts:58`) → `ImprovementSignalStore` (threshold capability_gap:2) → awareness summary → `acquire_capability`. Cognify writes bypass this hook (accepted v1 gap).
- Sessions: `dataDir/workspaces/<ws>/sessions/<id>.jsonl`; last-activity = mtime; turns = `readSessionMeta().messageCount` (NOTE: has lazy-backfill side effect — watcher uses raw stat+line count). Scheduler pattern to mirror: `LocalScheduler` (`cron.ts:68`, 60s setInterval, single-flight `ticking` guard). Wire after `scheduler.start()` (`index.ts:2183`), guard `process.env.VITEST` like ChannelManager (`:2391`).
- Loopback agent turn: `runChannelChatTurn` (`channels/chat-client.ts:61`) — POST `127.0.0.1:<port>/api/chat` `{message, workspace, session, persona, autonomy}`, inherits injection scan/persona/governance/memory. Reviewer uses dedicated `evolve-<sessionId>` session id, never the user's.
- Restriction: `applyPersonaToolFilter` (`persona-tool-filter.ts:82`) allowlist→denylist→readonly-strip; `ALWAYS_AVAILABLE_TOOLS` re-adds save_memory etc — must be explicitly disallowed. Spawn intersection cannot escape persona pool.
- Review-before-apply EXISTS: held-action queue (`held-action-executor.ts` — `isProposableTool:35`, `enqueueHeldAction:64`, `executeHeldAction:105` with execute-time re-validation) + `ApprovalsApp.tsx` + `routes/approval.ts`.
- Skill writes: single seam `skill-write-service.ts:105 writeSkill` (redact/provenance/audit) — **no .bak today**; `deleteSkill:159` no trash. Skill change detection: `SkillHashStore.checkAll` (`core/skill-hashes.ts:39`). Skill audit machinery (synth-test/judge/rewrite/demote, all fail-safe) already in `skill-audit.ts` — reuse, don't rebuild.
- Deterministic no-invention summary reference: `dream-journal.ts:72 composeSummary`.

## Phases

### Wave 1 (parallel, disjoint files)

**P-A. Notification material-change gate** — `packages/server/src/local/notification-gate.ts` (new)
- `materialFingerprint(parts: unknown): string` — sha256 over canonical JSON.
- `NotificationGate` — persistent last-hash per `dedupeKey` (JSON store `dataDir/notification-fingerprints.json`, immutable update, corrupt-file tolerant). `shouldNotify(key, hash)` → boolean + record.
- `emitNotification` gains optional `{dedupeKey, materialHash}` — unchanged hash ⇒ suppress (no row, no SSE), return `{suppressed: true}`. Callers without keys behave exactly as today.
- Wire fingerprints into nag sources: morning briefing / stale workspaces / pending tasks / capability suggestions (fingerprint = ids+counts+relevant mtimes), `prompt_optimization` (correction-rate bucket + period), `monthly_assessment` (period + counters). Suppression logged at debug level.
- Tests: gate unit (new key fires; same hash suppresses; changed hash fires; corrupt store recovers), emitNotification opt-in behavior, one proactive-source integration test.

**P-B. Memory-write lint** — `packages/agent/src/memory-write-lint.ts` (new)
- Deterministic classifier (regex/heuristic, no LLM): `lintMemoryWrite(content, type) → {verdict: 'allow' | 'capability_symptom', capability?: string, reason?: string}`. Symptom shapes: tool/skill/connector/capability + failure verbs ("failed", "doesn't work", "unavailable", "errors when", "cannot", "broken"). Conservative: ambiguous ⇒ allow (memory loss is worse than one nag).
- Extend `chat.ts:227` handler: on `capability_symptom` ⇒ `cancelled: true` + `recordCapabilityGap(...)` into ImprovementSignalStore + cancel message instructing agent to fix or flag (acquire_capability), not memorize.
- Tests: classifier table-driven (symptoms caught, real facts pass, edge: user preference about a tool passes), hook integration (cancel + signal recorded).

**P-C. Skill backup + undo** — `packages/agent/src/skill-write-service.ts`
- Before overwrite in `writeSkill`: stash old bytes to `<skillsDir>/.backups/<name>-<ISO-ts>.md`; keep newest 5 per skill. `deleteSkill`: same stash (trash instead of hard loss).
- New `undoSkillWrite(name)` — restore newest backup via the same sanctioned write path (provenance-stamped `restored-from-backup`, audited), returns restored ts.
- `.backups/` excluded from `loadSkills`/hygiene scans (verify loaders ignore subdirs; fix if not).
- Tests: backup created on overwrite, cap enforced, undo restores exact bytes, delete stashes, loaders ignore `.backups`.

### Wave 2 (single lane, depends on Wave 1)

**P-D. IdleSessionWatcher + restricted reviewer + proposal path**
- `packages/server/src/local/idle-watcher.ts` (new): `start(intervalMs=60_000)/stop()/tick()` single-flight; enumerate sessions (pure stat+line-count, skip `channel-*` and `evolve-*` prefixed, skip turnCount<minTurns); fire when `now-mtime ≥ idleMs` AND `turnCount ≥ minTurns`; RAM fired-set keyed `sessionId:mtimeMs` so a session refires only after advancing.
- Config `dataDir/self-evolution.json`: `{enabled: false, idleMinutes: 15, minTurns: 6, maxReviewsPerDay: 5}` — **default OFF** (founder opt-in), corrupt/absent ⇒ defaults. Daily cap enforced.
- Reviewer persona `session-reviewer` in `persona-data.ts`: tools = read-only set + `read_skill` + `propose_*`-capable writes routed to held queue; `disallowedTools` explicitly: `save_memory`, `delete_skill`, `install_capability`, bash/exec, connectors. System prompt: examine transcript for (1) promised-but-undelivered deliverables, (2) recurring capability failures fixable by a skill patch; default SILENT — output `NOTHING_TO_DO` unless a material, actionable finding exists; never invent.
- Fire: `runChannelChatTurn`-style loopback with `session: evolve-<sessionId>`, `persona: session-reviewer`, `autonomy` default (approval-gated). Proposals: extend `isProposableTool` to accept `create_skill`; held actions land in ApprovalsApp; `executeHeldAction` executes through `writeSkill` (now backup-protected).
- Notify on proposal via gated `emitNotification` (`dedupeKey: self-evolution:<sessionId>`, hash of proposal set) — silent when reviewer found nothing.
- Wire in `index.ts` after scheduler start; `onClose` stop; VITEST guard.
- Tests: watcher fire-condition matrix, fired-set no-refire, config default-off, daily cap, enumerate skips channel/evolve sessions, isProposableTool create_skill, end-to-end route test with mocked loopback (reviewer proposes → held action exists → approve → skill written with backup).

### Wave 3 — adversarial verifier (Fable-side gate)
Read-only Opus verifier: spec-vs-implementation audit + security review (trust boundary: no autonomous writes when disabled or unapproved; loopback confinement; ALWAYS_AVAILABLE leak check; path traversal in backups; fingerprint store injection). VERDICT format. Bounce loop until APPROVED.

## Gates per wave
`npx tsc --noEmit` on packages/agent + packages/server (+ apps/web if touched) · targeted vitest for new/changed files · Wave 3: full server + agent suites. Commit per wave (conventional commits).

## Residuals (declared, not in v1)
Auto-apply mode behind additional founder opt-in · cognify-path lint coverage · Settings UI toggle for self-evolution · reviewer completing deliverables beyond skill proposals (drafting files into workspace) — v1 proposals only.
