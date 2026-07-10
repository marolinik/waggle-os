# Adversarial Verifier Verdict — Tier 2 Steal Arc (#6 #7 #9 #10 #11 + SSRF)

**Date:** 2026-07-11
**Branch:** `feat/steals-tier2` (worktree `.claude/worktrees/steals-t2`), 7 commits on `0d78d2a0`.
**Contract:** `docs/plans/STEALS-TIER2-ARC-2026-07-10.md` (decisions D6.*/D7.*/D9.*/D10.*/D11.*).
**Method:** read-only adversarial review + gate re-run. Default skeptical; reject on any CRITICAL/HIGH.

## VERDICT: APPROVE

No CRITICAL or HIGH findings. All load-bearing security guarantees hold. One **MEDIUM**
(pre-existing, out of the newly-written code but inside D11.6's remediation surface) and three
LOW/informational notes, none blocking. Recommend landing with the MEDIUM tracked as a fast-follow.

---

## Findings

| # | Sev | Area | Finding |
|---|-----|------|---------|
| F1 | MEDIUM | SSRF (D11.6 completeness) | `POST /api/marketplace/security-check` (`packages/server/src/local/routes/marketplace.ts:~529`) constructs `MarketplaceInstaller` **without** `guardedFetch`. `scanOnly → resolveContent → fetchContent(manifest.skill_url)` therefore fetches remote skill content through the **unguarded** default fetch. Blind SSRF: a package whose `skill_url` is an internal/link-local address (169.254.169.254, RFC1918) is fetched when scanned. **Pre-existing** (this route predates the arc — `git blame` → `01076b75`), but D11.6's remediation enumerated "installer.ts fetchContent" and the install/uninstall/sync/cron/background sites were all guarded — this one route was missed, so the "fetchContent guarded" claim is incomplete. Blast radius bounded: (a) blind — the response body is not reflected; heuristic findings echo only `match[0]` against a fixed security-token regex set (`security.ts` WAG-00x), a low-bandwidth oracle, not arbitrary content; (b) requires a package with an internal `skill_url` already in the DB (via a user-added malicious custom source or a compromised registry). **Fix:** `new MarketplaceInstaller(db, {…}, guardedFetch)` at the security-check site. |
| F2 | LOW | #11 held-action | `install-url` passes `body.workspaceId` unvalidated into `enqueueHeldAction`; at execute time it becomes `path.join(dataDir,'workspaces',wsId,'files')` (`held-action-executor.ts:186`). Inert for this route: `create_skill` writes via `writeSkill` to `~/.waggle/skills/` with its own name-escape regex, independent of that path — a `../` workspaceId only mis-selects the file-tool root, and no write in this flow honors it. Defense-in-depth: the route could validate `workspaceId`. |
| F3 | LOW | #10 status | `/api/embedding/status` surfaces raw provider `err.message` as `lastError` (`embedding-provider.ts:440/465/488`). No evidence any provider echoes the API key (sent in the Authorization header, not in fetch/SDK error strings), and the payload reaches only the same local user who owns the key. Non-issue under the local-sidecar threat model; noted for hygiene. |
| F4 | INFO | #7 hot-reload | `refreshMcpIfChanged` sha256's the whole `.mcp.json` when mtime changes; no size cap. Gated behind the mtime fast-path (`mcp-config.ts:261`) so it is NOT per-list, and `.mcp.json` is a local user-owned file — no meaningful DoS. |

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

### #9 Tiered loop breaker (67cfba06) — PASS
- Tier check order **T3→T1→T2→T4** correct (`loop-guard.ts:121-186`); T3 hard-abort (8 same-tool consecutive failures) wins over T4 (6) in a single call. T3 is reachable as the backstop: block nudges don't reset the same-tool streak (only a success or different tool breaks it), so a model ignoring the T4 "try a different tool" nudge climbs to 8 → abort.
- Abort fires **before** tool execution (`tool-executor.ts:219-222`) → no half-finished stream; `agent-loop.ts:518` calls `onGiveUp` and exits; `chat.ts:1485` surfaces the give-up copy to the user via `sendEvent('step')`.
- `guard.record` called on **both** success and failure (`tool-executor.ts` try/catch). History trimmed to `historyCap` default 50 (`record()` splice) — no unbounded growth. All new config fields have backward-compatible defaults; existing `check()`/window heuristics preserved.

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
**APPROVE / mergeable.** Land F1 (one-line `guardedFetch` at the security-check installer site) as a fast-follow to complete the D11.6 SSRF surface; F2/F3/F4 are defense-in-depth hygiene, no action required to ship.
