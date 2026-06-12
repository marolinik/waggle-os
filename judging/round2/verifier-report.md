# Round-2 Verifier Report — commits 72fedf7 + 0ffd938

**Verifier:** fresh-context, 2026-06-12. HEAD at verification time = `0ffd938` (working tree matches the commits under review; only untracked `judging/crops/`, `judging/round2/`).

## VERDICT: PASS

All changes trace to judge complaints or the mission. No new dependencies, no flags/shims, no unrelated refactoring. All four gates green on a fresh run, including the marketplace-sync suite the commit message flagged as flaky. Security posture of the new chat-markdown renderer is sound and test-locked. Three minor, non-blocking notes below.

---

## 1. Scope tracing (every hunk → complaint or mission)

### 72fedf7 (42 files, +1251/−202)

| Change | Traces to |
|---|---|
| `LoginBriefing.tsx` — `lastActive` from workspace store (`ws.lastActive`) not `ctx.lastActive`; honest empty-workspace nudge | Recency contradiction ("active yesterday" vs "away 10 days") — machine cron writes no longer count as user activity |
| `briefing-highlights.ts` — dedup by normalized first line, keep higher-importance then earliest timestamp | Same memory shown twice with two different ages |
| `AppShell.tsx` — LoginBriefing gated to `/home`; `OnboardingTooltips suppressed={ov.showGlobalSearch}` | Modal overlaying Memory/Skills; Ctrl+K tip painting over the open palette |
| `home.ts` — `SUGGESTION_MAX_IDLE_DAYS = 30` filter on suggested actions | Stale test prompts recommended as today's actions |
| `workspace-context.ts` — `SYSTEM_JOB_TYPES` filter on `buildUpcomingSchedules` | "Up next" showing the janitor's calendar (verified: "Marketplace sync" and "Index reconciliation" both run as `job_type='memory_consolidation'` per `setup-crons.ts:22,29`, so the filter catches every item the judges named) |
| `render-markdown.ts` + `TextBlock.tsx` — `renderChatMarkdown` | Literal `## DECISION 1` / `**bold**` noise in chat |
| `login-briefing-brag.ts` — "people, projects & things it knows" | entities/relations jargon |
| `ChatApp.tsx` / `AgentDetail.tsx` — Ask first / Trusted / Autopilot **display labels only**; internal `'normal'|'trusted'|'yolo'` values untouched | YOLO jargon — explicitly *not* a compat shim |
| `dock-tiers.ts` `description` + `AppShell` HintTooltip | Opaque nav labels ("Waggle Dance", "MCP Hub") |
| `activity-labels.ts` (new, 37 lines + test) | `tool_result: create_skill` machine vocabulary in the activity rail |
| `WorkspaceDesktopApp.tsx` — humanize summaries, "1 memory"/"1 session" plurals | Jargon + grammar complaints |
| `AgentsApp.tsx` — empty state lists built-in workspace assistants | "No agents yet" while an agent demonstrably worked (contradiction) |
| `EvolutionTab.tsx` — default filter `'all'` + plain-language primer | Agent-evolution invisibility |
| `AutomationCenterApp.tsx` — Next-up / Recent-results overview panels | Three stat tiles over a void; no answer to "what runs next / how did it go" |
| `skills.ts` + `types.ts` — absent provenance ⇒ `'built-in'` | Unfalsifiable provenance badge (stock skills attributed to the user) |
| `identity.ts` — merge-on-update | Partial identity write wiping stored fields |
| `profile.ts` — `deleteByContentPrefix('User identity: ')` before re-create | Profile-frame duplication root cause |
| `monthly-assessment.ts` — frames stamped source `'system'` | Provenance lie (agent report stamped user_stated) |
| `ImportStep.tsx` hints, `onboarding-profile.ts` greeting preview | Onboarding export how-tos + "real greeting preview" complaints |
| `HomeCockpit.tsx` `upNext ?? []` | Boundary hardening for an absent field (system-boundary validation — in-spec) |
| `judging/*.md` (5 judge verdicts, round1-fixes, verifier report) | Mission evidence artifacts, not code |
| Test updates (`phase3b/3c` MemoryRouter wrap, copy assertions) | Direct consequence of `useNavigate` in the new AgentsApp empty state |

### 0ffd938 (14 files)
- `truncateHighlight` strips `**`/`#`/`` ` `` tokens — highlights render as text nodes, so raw markdown showed literally (judge complaint).
- `notes/judge-round1-patterns.md` + 13 recaptured screenshots — evidence, in-mission.

### Negative checks
- **No new dependencies:** `git diff 72fedf7~1 0ffd938 --stat -- '**/package.json' package.json package-lock.json bun.lock` → empty. `renderChatMarkdown` is hand-rolled (~40 lines) instead of pulling a markdown lib — consistent with the no-new-deps constraint.
- **No flags/shims:** the only new props/params (`suppressed`, injectable `now` for test determinism) are direct fix mechanics. Autonomy rename is display-only.
- **No unrelated refactoring:** the `escapeHtml`/`applyInline` extraction in render-markdown.ts is the minimal factoring required for `renderChatMarkdown` to reuse the escape-first pipeline; `buildProfilePreview` rewrite *is* the greeting-preview complaint.

## 2. Special-attention items

### renderChatMarkdown security posture — SOUND
- **Escape-first confirmed:** both renderers run `escapeHtml()` (escapes `&`, `<`, `>`, `"`) over the *entire input* before any tag is emitted; block parsing in `renderChatMarkdown` operates on already-escaped lines and routes all inline content through `applyInline(escaped)`.
- **Href allowlist confirmed:** only `^https?:\/\//i` becomes `<a>`; anything else (javascript:, data:, vbscript:) renders as inert `label (url)` text.
- **Tests lock the defenses** (`apps/web/src/lib/render-markdown.test.ts`, read in full): raw `<script>` escaped before tag emission; `javascript:` link refused (asserts no `<a ` emitted); quote-escape blocks attribute breakout (`onmouseover="` absent); raw HTML escaped in every chat line shape (heading and bullet). These are real assertions against the real module, not snapshots.
- **Adversarial probe (no failure found):** a backtick code-span inside a link URL (`` [x](https://a`payload`) ``) yields a malformed `<a>` whose junk attributes come from the *fixed* code-span class string; the attacker payload lands in text position with `<` and `"` pre-escaped — no executable vector. Single quotes are not escaped, but every emitted attribute is double-quoted, so no breakout. Cosmetic quirk only.
- Minor: `data:`/`vbscript:` have no dedicated test case (the allowlist makes them inert by construction; `javascript:` is the representative lock).

### Identity merge-on-update — explicit empty string still clears: CONFIRMED
`body.role ?? existing?.role ?? ''` — `''` is non-nullish, so an explicit empty string passes through and clears; only *omitted* (undefined) fields fall back to stored values. Test-locked in `packages/server/tests/local/identity.test.ts` ("an explicit empty string still clears a field": writes `{name, role}`, then `{role: ''}`, asserts `role === ''` and `name === 'Marko'`) via real Fastify inject + in-memory MindDB — exercises the route *and* IdentityLayer.

### profile.ts deleteByContentPrefix — does not delete non-identity frames: CONFIRMED
`deleteByContentPrefix` is **pre-existing** (W4.3, `packages/hive-mind-core/src/mind/frames.ts:343`), not added by these commits. It escapes LIKE metacharacters (`\ % _`) and matches the exact literal prefix `'User identity: '` — only frames in the identity-card namespace match. Same established pattern as `monthly-assessment.ts:307`. Routes through `delete(id)` so FTS/vec/KG indexes stay consistent. Residual theoretical risk (a harvested frame whose content *literally begins* with `User identity: ` would be swept) is inherent to the pre-existing primitive, namespaced, and consistent with prior usage — not a regression introduced here.

## 3. Gates (fresh run by this verifier, 2026-06-12 21:37–21:40)

| Gate | Result |
|---|---|
| `npx vitest run --root apps/web` | **943 passed (943)**, 91 files, 24.4s |
| `npx vitest run packages/server/tests/local --root .` | **919 passed (919)**, 76 files, 105.9s |
| `npx tsc --noEmit --project packages/server/tsconfig.json` | clean (exit 0) |
| `npx tsc -p apps/web/tsconfig.app.json --noEmit` | clean (exit 0) |

**Marketplace-sync adjudication:** `marketplace-sync.test.ts` **passed 12/12 in my run** (slow — 104s, network-dependent: "graceful errors" / multi-source aggregation cases each take 20–36s). Grep of both full diffs for `marketplace`: matches are only (a) a tooltip `description` string on the dock's Marketplace nav entry (UI-only, no runtime logic), (b) commit-message and judging-report prose. **No marketplace server code, routes, sync logic, or test files are touched by either commit — a timeout in that file cannot be caused by these changes.** The commit message's 917/919 claim is consistent with a transient network flake.

## 4. Test spot-checks (read in full, assert the new behavior)

1. **`render-markdown.test.ts`** — 12 tests; XSS locks detailed above plus block rendering (headings→block strongs, bullets, numbered lists, hr, inline-inside-heading, blank-line spacing). Asserts on real renderer output strings.
2. **`identity.test.ts`** — 2 new merge-on-update tests against a real Fastify instance + `MindDB(':memory:')`: partial write preserves `role`/`department` while updating `name`; explicit `''` clears. Exactly the regression the fix targets.
3. **`briefing-highlights.test.ts`** — dedup test feeds two identical-content frames (timestamps 2026-05-01 / 2026-06-11) + one distinct; asserts exactly one survivor carrying the **earliest** (learned) timestamp. Also updated the limit test to use distinct contents so it still measures the limit, not the dedup — correct test hygiene.

Also verified: `p2-home-desktop.test.tsx` (Up next omitted for `[]` *and* `undefined`, rendered with ≥1 item), `phase3b-agent-center.test.tsx` (empty state must show "Already working for you" + workspace names), `p5-skill-governance.test.ts` (no-frontmatter skill ⇒ `'built-in'`).

## 5. Findings (non-blocking)

1. **Test-coverage gaps on new server logic (minor spec deviation):** the 30-day suggested-actions window (`home.ts`), the `SYSTEM_JOB_TYPES` up-next filter (`workspace-context.ts` — `buildUpcomingSchedules` has pre-existing unit tests that were *not* extended for the new filter), and the `profile.ts` replace-on-update call have **no new tests**. The spec's "add tests for new interactive logic" was honored for FE logic and the identity route, but these three server behaviors ship test-uncovered. Each is a small pure filter / one-line integration over a tested primitive, so risk is low — but the job-type filter in particular is behavioral and cheap to lock.
2. **Stale comment/type nits:** `apps/web/src/lib/types.ts:529` doc comment still says "Absent/legacy ⇒ 'user'" while the union and server now say `'built-in'`; `CapabilitiesApp.tsx:165` inline cast still narrows `initiator` to `'agent' | 'user'`. Runtime is correct ('built-in' flows through; `SkillRow` badges only `'agent'`), tsc is clean — documentation drift only.
3. **Cosmetic renderer quirk:** backtick-in-link-URL produces a malformed (but safe) anchor — see §2. Not exploitable; fix only if it ever surfaces visually.

## Bottom line

Both commits are tightly scoped to the judge complaints and the mission, the three special-attention risk areas (XSS posture, empty-string clear, prefix-scoped delete) all hold under direct inspection and test reads, and every gate passes fresh. The marketplace-sync flake is conclusively unrelated. PASS.
