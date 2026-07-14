# Tier 3 Steal Arc — Adversarial Verification Verdict (2026-07-15)

Branch `feat/steals-tier3` (commits `2d4b0ca2..f322cc2c` + fix commit below).
Verifier fleet: 6 agents (workflow `wf_ac6e9d94-dd9`); 4 completed, 2 (verify:17, verify:cross)
died on API safeguard false-positives — **those two audits were re-executed inline by the
orchestrator** (findings below marked [inline]).

## Verdicts

| Item | Fleet verdict | After fixes |
|---|---|---|
| S1 sanitizer | APPROVE (0 C/H) | APPROVE |
| #13 automation gate | **BLOCK — 1 HIGH** | fixed → APPROVE |
| #15 skill badges | APPROVE (0 C/H) | APPROVE |
| #12 compaction persist | **BLOCK — 1 HIGH + 1 MEDIUM** | fixed → APPROVE |
| #17 ai_task | [inline] **2 findings (1 HIGH-class SEC, 1 MEDIUM)** | fixed → APPROVE |
| cross-cutting | [inline] no blocking findings | APPROVE |

## Fixed in the post-verdict commit

1. **#13 HIGH — error-path transcript dump (chat.ts:2160).** The #3 launch-blocker raw-turn
   persistence in the outer catch was not gated: an automated review turn failing on
   context_length (likeliest failure for transcript-embedding turns) persisted the ENTIRE
   review instruction + session transcript as a `user_stated` frame, then memory-lane cron
   would LLM-amplify it. Fix: `&& !isAutomatedTurn`.
2. **#12 HIGH — cross-mind destructive overwrite (orchestrator.ts).** `compactionFrameIds` is
   keyed by sessionId while persist routes by active mind; after a workspace switch the same
   rowid can be an unrelated user frame in the new mind, and `frames.update()` overwrote it.
   Verifier demonstrated with a repro test. Fix: update-in-place only when the existing frame's
   content starts with this session's `[Session summary — <key>]` marker; else create fresh.
   Regression test added (foreign frame with colliding id survives untouched).
3. **#12 MEDIUM — sign-gate over-trigger.** `isSelfIncapacityAssertion` over the whole
   multi-section summary downgraded the entire session gist to `temporary` (recall-invisible)
   whenever one boilerplate "you'll need to run X" line appeared — silently no-op'ing the
   feature for long sessions. Fix: no sign-gate on compaction summaries (importance always
   `normal`, provenance `source='system'`); D1 ruling amended.
4. **#12 LOW — seam consistency.** Persist now also gated `!hasCustomRunner` like every sibling
   write-back seam.
5. **[inline] #17 SEC — deliverTo smuggling via job_data.** `create_schedule`'s free-form
   `job_data` JSON could set `mode:'ai_task'` + `deliverTo:{platform,chatId}` (with or without
   the `prompt` param), routing scheduled agent output to an arbitrary, unpaired chat — bypassing
   the trusted-origin-snapshot design. Fix: `mode`/`deliverTo`/`once` are always stripped from
   parsed job_data (settable only via the typed param path). Test added.
6. **[inline] #17 MEDIUM — firesTooOften bypass.** Range (`1-59 * * * *`) and step-on-range
   (`0-59/2`) minute fields passed the guard. Fix: allowlist (fixed minute | `*/N` N≥5 | ≤12-item
   fixed list); everything else rejected. Bypass exprs added to the test matrix. (Damage was
   already bounded by the daily cap — verified ALIVE, not dead code: `executeJob`/`tick` →
   `onJobComplete` → `makeRecordExecutionCallback` → `cronStore.recordExecution` fires for every
   run mode-agnostically, filling exactly the table `countExecutionsToday` reads; the
   cron-ai-task test seeds that table and observes the skip.)

## Residual findings — documented, NO action (LOW/NIT)

- **S1 MEDIUM (pre-existing, out of scope):** 4th legacy sanitizer copy in
  `packages/server/src/local/routes/memory.ts:102` (`scope=global` UI search) still zeroes
  Cyrillic/diacritic queries — pre-existing (blame 2026-04-12), not benchmark-affecting.
  **Backlog: 3-line swap to `buildFtsOrQuery` (needs barrel export from hive-mind-core).**
- S1 LOW ×3: mixed CJK+stopword queries reach LIKE fallback with stopword noise (narrow trigger,
  fusion dampens); CJK terms silently dropped from mixed queries when ASCII tokens survive
  (documented tradeoff, vector lane compensates, v2 = per-token LIKE augmentation); pure-CJK
  still `[]` in MultiMind.ftsSearch / raw-detail-lane (per spec, not a regression).
- #13 LOW: `NOT LIKE '[Loop:%'` is ASCII case-insensitive in SQLite — a user frame starting
  `[loop:` is also excluded from lane amplification (stays recallable; bounded).
- #13 NIT ×2: `origin` is self-inflicted opt-out only (localhost+auth, no escalation); auto
  skill-capture heuristic (`sessionToolSequences`) not gated for automated turns.
- #15 LOW ×2: vault-POST cache invalidation is a near-no-op today (env/vault checks are uncached;
  only bin lookups cache) — harmless, kept as forward-compat; YAML sequence form (`- KEY`) under
  `requires:` not parsed (only inline `[a, b]` / comma form) — document the supported grammar.
- #15 NIT: `k in process.env` walks the prototype chain (cosmetic false-positive edge).
- #12 LOW/NIT: `frames.update()` leaves stale `memory_frame_chunks` rows under
  `WAGGLE_CHUNK_RETRIEVAL=1` (off by default); injection scan threshold 0.7 lets single-category
  signals through (tool-output provenance is `source='system'`, not user-trusted).

## Gate status after fixes

agent tsc 0 · server tsc clean via paths-harness · fix-affected suites 36/36
(cron-tools incl. new SEC + range-bypass cases, compaction-persist incl. cross-mind guard +
no-downgrade cases, cron-ai-task daily-cap alive). Full suites re-run pre-push.

**FINAL: APPROVE** — all HIGH resolved, 0 CRITICAL, residuals are LOW/NIT/pre-existing.
