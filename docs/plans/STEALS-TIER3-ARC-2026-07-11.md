# Steals Tier 3 Arc — 2026-07-11

CowAgent teardown Tier 3 items (#12–17, `docs/analysis/cowagent-vs-waggle-2026-07-09.md` §2).
Branch `feat/steals-tier3` off `origin/main 89329f99` (worktree `.claude/worktrees/steals-t3`).
Recon: 6 parallel agents 2026-07-11 (workflow `wf_00fd5d2e-2da`), every claim grounded in file:line reads.
**D-rulings below are binding for executors.** Founder may override any ruling; overrides re-open only the affected item.

## Scorecard

| # | Item | Verdict | Effort | Substrate/OSS |
|---|------|---------|--------|----------------|
| 12 | Dual-use compaction summary → memory frame | **BUILD** | S/M ~90 LOC | none |
| 13 | Automation-origin memory write-back gate | **BUILD** | S/M ~90–130 LOC | none |
| 14 | Retrieval-time temporal decay | **SKIP — already shipped** | 0 | n/a |
| 15 | Skill requirement badges (`requires.env/bins`) | **BUILD (badge-only v1)** | S ~180 LOC | none |
| 16 | CJK trigram FTS cascade | **DEFER** | — | would be maximal |
| S1 | (found by #16 recon) Unicode FTS sanitizer fix | **BUILD** | S ~30 LOC ×3 + routing | **YES — forward-port required** |
| 17 | `ai_task` scheduler mode + origin-channel delivery | **BUILD** | M ~300–400 LOC | none |

## #14 — SKIP (teardown was wrong)

Exponential 30d-half-life decay at score-fusion time **already exists**: `packages/hive-mind-core/src/mind/scoring.ts:37,52-63` (`HALF_LIFE_DAYS=30`, `Math.pow(0.5, days/30)`, 7d plateau), write-time anchored (`created_at`, W4.2 bug-#3 fix), applied in fusion `finalScore = rrf * relevance` with temporal weight 0.4 under default `'balanced'` profile (`search.ts:266-293`), default ON for every `recallMemory`. Regression-locked (`search.test.ts:219-221`, `scoring.test.ts:33`). Published in the paper. CowAgent's pure-multiplicative form would be a **regression** (crushes old-but-important frames — the property behind our +30.84pp LoCoMo temporal lead).
**Action:** housekeeping only — amend teardown doc item #14 to "already shipped — scoring.ts:52-63". Do NOT build configurable half-life (flagged arbitrary 2026-04-26, no need materialized since).

## #16 — DEFER trigram; S1 sanitizer fix instead

Teardown's own gate ("only if non-Latin markets") unmet; full cascade = M substrate work across 5 packages, second FTS index + backfill migration + dual-write at ~10 sites + GDPR erasure surface. DEFER.

**But recon found the real bug is upstream of the tokenizer**: the JS sanitizer `w.replace(/[^\w]/g,'')` strips ALL non-ASCII letters — Cyrillic and Latin diacritics too, not just CJK. A query "Београд" (or č/ć/ž/š/đ terms) reduces to empty → `keywordSearch` returns `[]` at `search.ts:347` before FTS5 or the LIKE fallback ever run. unicode61 itself handles Cyrillic/diacritics fine. Hits the Adriatic market.

### S1 spec (BUILD — substrate)
- 3 sanitizer copies: `mind/search.ts:338-347`, `multi-mind.ts:187-194`, `mind/raw-detail-lane.ts:75-82`. Unify into one exported helper (new `mind/fts-sanitize.ts` or export from search.ts) using `.replace(/[^\p{L}\p{N}_]/gu,'')`.
- In `keywordSearch`: when sanitized query is empty but raw query non-empty (pure-CJK etc.), route to existing `likeFallbackSearch` (`search.ts:393-422`) instead of returning `[]`.
- Tests: Cyrillic query matches Cyrillic frame; diacritic (č/ž) query matches; CJK query reaches LIKE fallback and matches; **English-query scoring byte-identical regression lock** (LoCoMo invariance — benchmark is pure-ASCII so `\w`→`\p{L}` is a no-op there, lock it anyway).
- **OSS impact:** search.ts / multi-mind.ts / raw-detail-lane.ts are mirrored substrate → monorepo-first here, curated forward-port to `marolinik/hive-mind` required before next OSS release push (record in handoff as mandatory follow-up; run `scripts/oss-drift-check.sh` after).

## #12 spec — dual-use compaction summary (BUILD)

The compaction summarizer's output (one existing LLM call, `context-compressor.ts:236-297` w/ `COMPACTION_PROMPT`) is re-injected into live context but never persisted — session gist dies with the process-local `compressionSummaries` Map (`chat.ts:289`). Steal = persist half, zero extra LLM cost (cognify is regex).

- `orchestrator.ts` (~:862, beside `autoSaveFromExchange`): new public
  `persistCompactionSummary(summary, sessionKey, priorFrameId?) : Promise<number|null>` —
  blank→null; importance `'normal'` with `isSelfIncapacityAssertion` downgrade to `'temporary'` (memory-sign-gate);
  target = workspaceLayers ?? personal (mirrors save_memory);
  content `[Session summary — ${sessionKey}]\n\n${summary}`;
  if priorFrameId exists → `frames.update()` in place, else `cognify.cognify(content, imp, undefined, undefined, 'system')`.
- `chat.ts` inside `compressionResult.compressed` block (:1424-1430): `scanForInjection` guard on summary (verify return shape first) → skip persist if flagged; fail-soft try/catch with `isClosedDbError` logging (copy :1786 pattern); new `compactionFrameIds Map<string,number>` at :289; evict in DELETE /api/chat/history (:2118). Emit `step` event "Session summary saved to memory".
- **Interplay with #13:** persist is gated `if (!isAutomatedTurn)` — automated turns never persist compaction summaries.
- Tests: new-frame save w/ source `'system'`; update-in-place on 2nd compaction; sign-gate downgrade; workspace routing; server test — exactly one frame across two compactions (mock summarizer).

**D-rulings:** D1 importance=`normal`, ~~+sign-gate~~ **NO sign-gate (amended 2026-07-15 verifier: `.some()` over a multi-section aggregate downgrades the whole gist to `temporary` on one boilerplate line — no-ops the feature).** D2 one frame/session update-in-place **ONLY when the existing frame's content starts with this session's marker (cross-mind rowid-collision guard, verifier HIGH).** D3 scanForInjection only (no sign-gate). D4 chat route only — long-task surface (`retrieval-agent-loop.ts:614`) explicitly deferred v2. D5 workspace-first-else-personal. **Persist gated `!hasCustomRunner && !isAutomatedTurn` (seam parity).**

## #13 spec — automation-origin write-back gate (BUILD)

Live pollution path exists today: IdleSessionWatcher review turns run the FULL /api/chat pipeline via loopback; their output matches `INLINE_DECISION_PATTERNS` → pattern write-back frames, KG entities, **false correction signals** (transcript's old "no, that's wrong" lines re-analyzed as fresh). Second path: memory-lane cron LLM-amplifies `[Loop:]` tick frames.

- POST /api/chat body (+~:525): `origin?: 'automation'`; `const isAutomatedTurn = origin==='automation' || !!proposeHeldTurn` (belt-and-braces for shipped idle-watcher).
- `ChannelTurnRequest` (`channels/chat-client.ts`) gains `origin`, forwarded in body. **IM channel adapters do NOT set it** (real user turns — must keep saving); document on the type.
- Idle-watcher caller (`index.ts:2227-2248`) sets `origin:'automation'`.
- Gate 4 seams in chat.ts under `if (!isAutomatedTurn)`: autoSaveFromExchange (:1769), skill-distillation signal (:1806), KG auto-extraction (:1827), correction detection (:1856). Execution traces + improvement-signal surfacing untouched (review turn intentionally feeds self-evolution).
- `memory-lane-cron.ts:78`: add `AND content NOT LIKE '[Loop:%'` (same idiom as `[mind-%` exclusion).
- Tests: automated POST w/ decision-pattern reply → 0 frames/entities/correction-signals; idle-watcher request carries origin; lane-cron skips `[Loop:` frame; inbound IM turn does NOT carry origin (still saves).

**D-rulings:** skip entirely (not down-weight). `[Loop:]` frames stay recallable (founder Loops decision), only lane amplification excluded. JSONL origin stamping DEFERRED (no history-level flush exists — simplicity-first). No `FrameSource` enum change (substrate untouched — deliberate).

## #15 spec — skill requirement badges, v1 badge-only (BUILD)

Frontmatter `requires: { env: [...], bins: [...] }` → presence check → amber "setup needed" badge in Skills Hub. **No prompt gating in v1** (nothing to "auto-enable" — all non-draft skills are already always-on; gating would auto-DISABLE working skills on false negatives from GUI-installed/WSL bins). Founder may upgrade to hard-gate v2 (needs the 8-site reload unification — noted, not built).

- `skill-frontmatter.ts`: `requires?: {env?: string[]; bins?: string[]}` parsed like the nested `permissions:` block; serializer emits it.
- NEW `packages/agent/src/skill-requirements.ts` (~110 LOC): `extractSkillRequirements`, `checkSkillRequirements(reqs, deps)` with injectable `{hasEnv, hasBin}`; default hasBin = where.exe/which shim (export `defaultPathFromEnv` from tool-detection.ts:132-145 or copy); TTL cache (~5 min) on bin lookups. Presence booleans only, never values. Barrel-export.
- `routes/skills.ts` GET /api/skills: annotate each skill `requirements: {satisfied, missingEnv, missingBins} | null`; `hasEnv = k in process.env || server.vault.has(k)`.
- POST /api/vault (`routes/vault.ts:141-146`): invalidate/recheck so adding key updates badge on next fetch.
- UI: `types.ts` Skill += requirements; `SkillRow.tsx` amber StatusBadge "setup needed" + tooltip "Missing: OPENAI_API_KEY (env), ffmpeg (binary)".
- Tests: frontmatter roundtrip ×4; checker w/ injected deps + cache ×8; route w/ vault+env stub ×4; badge render ×3 (mirror skill-row-verified-badge.test.tsx).

**D-rulings:** D1 badge-only v1. D2 env = process.env ∪ vault.has. D3 tooltip-only. D4 install-time surfacing deferred v1.5.

## #17 spec — ai_task scheduler mode (BUILD)

~70% exists (cron-tools.ts agent tools, agent_task executor, runChannelChatTurn loopback with two shipped precedents). Steal = full-agent-turn upgrade + origin-channel delivery + once mode.

- Origin capture: chat.ts publishes `server.agentState.turnOrigin = {session, workspace, channel?: {platform, chatId}}` at turn start, cleared in the same finally as spawnSecurityContext (:1665/:2091 pattern). Read synchronously at tool-execute time (race window documented).
- `cron-tools.ts` `createCronTools(opts?: {getTurnOrigin?})`: create_schedule gains `prompt` (required for agent_task), `once` (bool), `deliver` (`'origin'|'notification'`, default origin). Composes `jobConfig = {prompt, mode:'ai_task', once?, deliverTo: originSnapshot}`. **No new job_type, no migration** (job_config is schemaless TEXT). Min-interval guard: reject cron exprs firing < every 5 min (next-two-runs delta).
- Executor (`index.ts:1964-2047`): `mode==='ai_task'` → `runChannelChatTurn({port, message: prompt, workspace, session: \`schedule-${id}\`, proposeHeld: true, origin: 'automation'})` — **requires #13 built first** (scheduled turns must not pollute memory). Legacy rows without mode keep old toolless path — zero behavior change.
- Delivery: `deliverTo.channel` → NEW `ChannelManager.sendTo(platform, chatId, text)` (~15 LOC public wrapper over private adapters + chunkText). deliverTo stamped ONLY from captured origin, never free-form tool args (pairing-allowlist trust boundary). Web origin → result persists in `schedule-<id>` session + notification deep-link; never appended to live session.
- Once mode: successful run w/ `once:true` → `cronStore.update(id, {enabled:false})` (row kept for history).
- Recursion breaker: sessions starting `schedule-` get create_schedule/trigger_schedule stripped from tool pool (chat.ts pool assembly).
- Daily cap: executor counts today's executions for the schedule (existing execution history); >= 24/day → skip + log.
- Tests: tool args/origin snapshot; executor ai_task-vs-legacy branch; sendTo chunking; once-disable; min-interval rejection; recursion strip; daily cap.

**D-rulings:** extend create_schedule (no new tool name). mode-flag rollout, legacy untouched. Dedicated `schedule-<id>` session for web delivery. Once → disable not delete. Daily cap 24/schedule. Recursion tools stripped.

## Execution plan

Wave A (parallel, disjoint files): **A1=#15** (agent skill-*, routes/skills.ts, web UI) · **A2=S1** (hive-mind-core only). No commits by A agents — Fable commits after.
Wave B (sequential — all touch chat.ts): **B1=#13 → B2=#17 → B3=#12**. Each B agent commits its own explicit paths (`git add <paths>` — NEVER `-A`; A's uncommitted files must not be swept).
Then: #14 teardown amendment (Fable inline) → full gates (tsc agent/server/web/marketplace/hive-mind-core + vitest agent/server/marketplace/hive-mind-core suites) → adversarial verifier → founder-visible merge report.

Gates baseline (Tier 2 close): agent 3151/3151 · marketplace 158/158 · tsc 0×3 + server via paths-harness.
