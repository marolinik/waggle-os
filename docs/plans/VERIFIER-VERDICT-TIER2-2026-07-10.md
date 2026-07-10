# Adversarial Verifier Verdict — Tier 2 Steal Arc (#6 #7 #9 #10 #11 + SSRF)

**Date:** 2026-07-11
**Branch:** `feat/steals-tier2` (worktree `.claude/worktrees/steals-t2`), 7 commits on `0d78d2a0`.
**Contract:** `docs/plans/STEALS-TIER2-ARC-2026-07-10.md` (decisions D6.*/D7.*/D9.*/D10.*/D11.*).
**Method:** read-only adversarial review + gate re-run. Default skeptical; reject on any CRITICAL/HIGH.

## VERDICT: REQUEST CHANGES — block on #9; #6/#7/#10/#11 + SSRF approve

**Correction to the first-pass verdict (was APPROVE).** A multi-agent cross-check surfaced, and I
then independently confirmed, a **HIGH functional defect in #9** that my first pass missed: the T3
hard-abort is **dead code under the default thresholds**. The security guarantees of #6/#7/#10/#11 +
SSRF all hold and those five ship; **#9 must be fixed before it lands** because its headline
deliverable (graceful give-up) never fires in the real execution path, and its tests give false
confidence by bypassing the gate that breaks it.

- **#6, #7, #10, #11, SSRF remediation → APPROVE** (with F1 MEDIUM as a fast-follow).
- **#9 tiered loop breaker → BLOCK** (H1 HIGH; M2 MEDIUM compounds it).

---

## Findings

| # | Sev | Area | Finding |
|---|-----|------|---------|
| H1 | **HIGH** | #9 T3 unreachable | The T3 hard-abort (8 same-tool consecutive failures → give-up + loop termination, D9.2) **can never fire in the real flow** under default thresholds. `checkTiered` runs *before* execution; a `block` verdict short-circuits and **does not `record()`** (`tool-executor.ts:224-225` — recording happens only in the execute branch at `:232/:236`). T4 blocks at `sameToolFailures >= 6` and T2 at `identicalFailures >= 3`, both *below* T3's `>= 8`. So the same-tool failure count freezes at ≤6 (varying args, T4) or ≤3 (identical args, T2): the 7th attempt is blocked, never executes, never records, and the history tail can never advance to 8. `onGiveUp`, the give-up copy, and the `agent-loop.ts:518` abort-termination are **dead code**; the loop instead runs to `maxTurns`. Not a *safety* regression (the loop still terminates and T1/T2/T4 still curb tight loops), but the primary specified behavior of the steal is non-functional. **Tests mask it:** `loop-guard.test.ts:52-59` seeds 8 failures via direct `guard.record()` (`recordFailures`, `:44`), proving `checkTiered`'s logic in isolation but never exercising the executor flow that freezes the counter. **Fix:** make T3 reachable — e.g. record blocked failures too, or reorder so T4 cannot short-circuit before T3 (T4 threshold > T3, or escalate off the frozen count), and add an integration test that drives failures *through the executor*, not `record()`. |
| M2 | MEDIUM | #9 success mis-count | `guard.record(fnName, fnArgs, true)` is unconditional when `tool.execute()` **resolves** (`tool-executor.ts:231-232`), even when the result is an `"Error: …"` string — which is the codebase's own failure convention (`chat.ts:1502` `isError = result.startsWith('Error:')`). Error-by-return-string tools are recorded as successes, so the failure tiers (T2/T4, and the already-dead T3) under-fire. Matches D9.1's literal "pass/fail from try/catch" but materially weakens failure detection given how many tools signal errors by return value. Consider treating an `Error:`-prefixed result as a failure for loop-guard purposes. |
| F1 | MEDIUM | SSRF (D11.6 completeness) | `POST /api/marketplace/security-check` (`packages/server/src/local/routes/marketplace.ts:~529`) constructs `MarketplaceInstaller` **without** `guardedFetch`. `scanOnly → resolveContent → fetchContent(manifest.skill_url)` therefore fetches remote skill content through the **unguarded** default fetch. Blind SSRF: a package whose `skill_url` is an internal/link-local address (169.254.169.254, RFC1918) is fetched when scanned. **Pre-existing** (this route predates the arc — `git blame` → `01076b75`), but D11.6's remediation enumerated "installer.ts fetchContent" and the install/uninstall/sync/cron/background sites were all guarded — this one route was missed, so the "fetchContent guarded" claim is incomplete. Blast radius bounded: (a) blind — the response body is not reflected; heuristic findings echo only `match[0]` against a fixed security-token regex set (`security.ts` WAG-00x), a low-bandwidth oracle, not arbitrary content; (b) requires a package with an internal `skill_url` already in the DB (via a user-added malicious custom source or a compromised registry). **Fix:** `new MarketplaceInstaller(db, {…}, guardedFetch)` at the security-check site. |
| F2 | LOW | #11 held-action | `install-url` passes `body.workspaceId` unvalidated into `enqueueHeldAction`; at execute time it becomes `path.join(dataDir,'workspaces',wsId,'files')` (`held-action-executor.ts:186`). Inert for this route: `create_skill` writes via `writeSkill` to `~/.waggle/skills/` with its own name-escape regex, independent of that path — a `../` workspaceId only mis-selects the file-tool root, and no write in this flow honors it. Defense-in-depth: the route could validate `workspaceId`. |
| F3 | LOW | #10 status | `/api/embedding/status` surfaces raw provider `err.message` as `lastError` (`embedding-provider.ts:440/465/488`). No evidence any provider echoes the API key (sent in the Authorization header, not in fetch/SDK error strings), and the payload reaches only the same local user who owns the key. Non-issue under the local-sidecar threat model; noted for hygiene. |
| F4 | LOW | #7 hot-reload | Two notes: (a) a VALID empty `mcpServers{}` or a DELETED `.mcp.json` → desired-empty → removes ALL servers (consistent with boot semantics, but deletion-tears-down may surprise; distinct from the corrupt-file protection, which correctly keeps servers). (b) `refreshMcpIfChanged` sha256's the whole file when mtime changes with no size cap — gated behind the mtime fast-path (`mcp-config.ts:261`) so NOT per-list, local user-owned file, no meaningful DoS. (c) invoked from `GET /api/mcps` with no mutex — concurrent GETs can interleave at awaits; second pass sees runtime already == desired → benign near no-op. |

---

## Per-steal checklist (all PASS unless noted)

### #11 Multi-source skill installer (highest risk) — PASS (+ F1/F2)
- **Zip-slip:** `extractSkillMd` validates **EVERY** entry with `isSafeZipEntry` *before* the junk/directory filter and *before* any read; whole archive rejected on any traversal entry (`multi-source.ts:224-228`). `isSafeZipEntry` rejects posix/windows absolute paths, any `..` segment, and enforces a resolved-path `dest === root || startsWith(root + sep)` boundary (correct on both separators). **Nothing is ever extracted to disk** — only the picked SKILL.md's bytes are read into a string — so zip-slip and **symlink entries are inert** (no filesystem materialization).
- **SSRF:** every resolver fetch goes through injected `installUrlFetch = guardedFetch = safeFetch`. `safeFetch` follows redirects with `redirect:'manual'` and re-validates **every hop** via `assertUrlAllowed` (`url-egress-guard.ts:295-296`), which does DNS resolution + IPv6-bracket handling + per-address private/loopback/link-local classification. GitHub/owner-repo grammar always targets the fixed public host `raw.githubusercontent.com`; path traversal in the URL path cannot change the host. Non-http(s) schemes, `git@`, tar/tgz rejected at `classifySource`.
- **No approval bypass:** the route **never** calls `writeSkill`. It enqueues a held `create_skill` (`enqueueHeldAction`) → `executeHeldAction` runs only on human approval, with an idempotent atomic claim, TTL expiry guard, and **execute-time re-validation** (`isCriticalNeverAutopass` + `scanForInjection` on args_json again) → real `create_skill` tool → `writeSkill` seam (backup + provenance + audit). `create_skill` is on the `isProposableTool` allowlist.
- **Name sanitization:** route `SAFE_SKILL_NAME` (`/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/`) matches `writeSkill`'s own regex; empty-after-sanitize → 422. `validateSkillMd` guarantees `metadata.name` when `valid` (no 500 path).
- **sha256:** body format-validated (`/^[a-fA-F0-9]{64}$/`); `enforceSha` enforced-when-provided over the correct bytes (zip bytes for zip sources, md bytes for markdown).
- **Injection:** `scanForInjection(content,'tool_output')` on resolved content (422), again on args_json at enqueue and at execute.
- **Test hygiene:** `multi-source.test.ts` fully hermetic (injected `fetchImpl` + `zipExtractor`); `marketplace-install-url.test.ts` uses `mkdtempSync` temp dirs + stubbed DB — checked-in `marketplace.db` seed not mutated.

### SSRF remediation (5f4bf994) — PASS (+ F1)
- Agent barrel re-exports `safeFetch`/`assertUrlAllowed` (`agent/src/index.ts:527`). `sync.ts` has **zero** remaining raw `fetch(` — all sites use `this.fetchImpl`; `installer.fetchContent` uses `this.fetchImpl`. Server injects `guardedFetch` at install, uninstall, `/sources` sync, `/sync`, cron (`local/index.ts`), and background sync (`marketplace-background-sync.ts`).
- `POST /api/marketplace/sources` now `assertUrlAllowed(body.url)` pre-persist (a stored bad source can't re-fire on every sync).
- Remaining raw `fetch(` are non-issues: `installer.ts:773` `notifyServer` → localhost sidecar; `security.ts:336` gen-trust-hub → disabled config URL (all install paths set `enable_gen_trust_hub:false`).
- **Gap = F1** (security-check site not guarded).

### #9 Tiered loop breaker (67cfba06) — BLOCK (H1 + M2)
- Tier check *logic* is correct in isolation: `checkTiered` evaluates **T3→T1→T2→T4** (`loop-guard.ts:121-186`) and, given a seeded history of ≥8 same-tool failures, T3 aborts and wins over T4. Abort wiring is also correct **if it ever fires**: abort fires before execution (`tool-executor.ts:219-223`, no half-stream), `agent-loop.ts:518` calls `onGiveUp` and exits, `chat.ts:1485` surfaces give-up copy via `sendEvent('step')`. History trimmed to `historyCap` 50; backward-compatible defaults; existing `check()`/window heuristics preserved.
- **H1 (HIGH):** but the give-up path is **dead code in the real flow** — a `block` verdict doesn't `record()`, so the same-tool failure count freezes at ≤6 (T4) / ≤3 (T2) and never reaches T3's 8. My first pass wrongly assumed the streak keeps growing under a block; it does not, because blocked calls never execute and thus never record. Confirmed against `tool-executor.ts:224-236` + `loop-guard.test.ts:52-59` (tests seed history via direct `record()`, bypassing the executor gate that freezes the counter).
- **M2 (MEDIUM):** error-by-return-string tools recorded as success (`tool-executor.ts:231-232`), further weakening the failure tiers.
- **To clear:** make T3 reachable (record blocked failures, or reorder T4/T3, or escalate off the frozen count) + add an integration test that drives failures through the executor, not `record()`. Then treat `Error:`-prefixed results as failures (M2).

### #6 On-demand MCP tool retrieval (df4ea90b) — PASS
- **Built-ins never gated:** retrieval operates only on `mcpRuntime.getAllTools()` (MCP set); built-in `effectiveTools` untouched.
- **Mock/no-embedder degrade:** `rankByKeyword` and `rankByEmbedding` both `.slice(0, topK)`; keyword fallback requires a token hit — **never full-dumps** above the count>20 threshold. Any exception path returns the accumulated set only (turn never breaks).
- **Persona rails:** `selectedMcp` passed through `filterMcpToolsForPersona` (`persona-tool-filter.ts:122`) before joining the pool — read-only personas (planner/verifier) get **[]** MCP tools; `disallowedTools` enforced. Applied after `filterAvailableTools`, before conversational narrowing/spawn-allowlist snapshot.
- **Union accumulator bounded:** LRU ≤200 conversations; per-conversation set is union-only but bounded by the finite running-MCP-tool count.

### #7 MCP hot-reload (4a19c6a9) — PASS (+ F4 info)
- Corrupt `.mcp.json` → warn + **keep running servers**, record signature, no teardown (`mcp-config.ts:289-299`). Never throws (`statSync` guarded; documented invariant).
- mtime fast-path short-circuits before sha256 (`:261`); sha256 only on mtime change — no per-`GET /api/mcps` DoS.
- Changed server re-registered and **restarted only if it was running**; removed server `removeServer` stops the process (no orphan); additions registered stopped.

### #10 Embedding provider routing (2b1071b0) — PASS (+ F3 info)
- **Tier-gate SERVER-SIDE:** `POST /api/embedding/provider` reads effective tier from config and rejects `!TIER_CAPABILITIES[tier].embeddingProviders.includes(provider)` with **403 before persist** (`embedding.ts:108-120`) — not UI-only. (Tier is read from local `config.json`, consistent with the app's existing soft-tier model on the local sidecar; real enforcement is license-side elsewhere — not a #10 regression.)
- `mock` unselectable: Zod `z.enum(SELECTABLE_PROVIDERS)` excludes it → 400.
- Env override (`EMBEDDING_PROVIDER`) → **409**, refuses to persist; status payload flags `envOverride`.

---

## Gates (re-run by test-runner sub-agent)

All 10 gates reported clean: multi-source 22/22, install-url route 10/10, marketplace package suite, loop-guard, mcp-config/mcps route, embedding-routing, mcp-tool-retrieval, full `packages/agent`; `tsc --noEmit` agent + marketplace 0 errors. Known noise excluded per contract: parallel-run `marketplace.db` seed corruption and marketplace-sync 30s timeouts are pre-existing/environmental, not arc-induced; server tsc's baileys optional-dep error is pre-existing.

## Recommendation
**REQUEST CHANGES.** Ship **#6, #7, #10, #11 + SSRF** (with F1 as a fast-follow — one-line `guardedFetch` at the security-check installer site). **Block #9** until H1 is fixed (T3 hard-abort is non-functional under default thresholds) and M2 addressed; the current #9 tests pass but validate `checkTiered` in isolation, not the executor integration that breaks it, so a green suite here is not evidence the feature works. F2/F3/F4 are defense-in-depth hygiene, no action required.

**Verdict integrity note:** this doc supersedes a first-pass APPROVE. The #9 T3-reachability defect was surfaced by a parallel review agent and then independently reproduced against the committed code before this revision — recording it transparently rather than silently amending.
