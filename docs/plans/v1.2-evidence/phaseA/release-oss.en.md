# Phase A — revalidation of the `release-oss` group at revision `2af0904df01ca3d374cc78ba95b60dc579dd6a7a`

> **English translation** of [release-oss.md](release-oss.md) (Serbian original, same folder). The Serbian original is authoritative; report any discrepancy. Dates are written DD.MM.YYYY; "wd" means working days.

Check date: 2026-09-27. The repo `D:/Projects/waggle-os` was treated as read-only. `git status --porcelain` at the start and at the end: only two untracked `.docx` files (`docs/Waggle_FRD_v1.1_2026-09-27.docx`, `docs/Waggle_PRD_v1.1_2026-09-27.docx`) — working tree == HEAD for all cited files. `HEAD == origin/main == 2af0904d` (0 ahead / 0 behind).

Statuses per BRIEF §2.2. All `path:line` references are at revision `2af0904d`, except where explicitly marked "live GitHub configuration (27.09.2026)" — that is the state of the service, not of the repo.

S1 findings covered: spot-check "618/560 commits, 360 runtime files", C22, A1, A28, A29, the "OSS gate" row, W8 (release part), W3 (the part about the `feature/harness-sota-bench` branch), plus the C5 premise ("private repo") because it directly changes the OSS gate.

---

## 0. Short summary (for writers)

| ID | S1 claim | Status | One sentence |
|---|---|---|---|
| F-REL-01 | C22 doc drift (e4bf403e/b07a6173 vs c4e6a515; b07a6173 is not an ancestor) | CONFIRMED AT REVISION (+ new drift) | All three revisions are named exactly that way; `b07a6173` is GitHub's PR test-merge commit (same tree as `e4bf403e`), and 09-LAUNCH/README claim PR #83 "is not merged" even though it is (`44baa77d`, 2026-09-09). |
| F-REL-02 | Spot-check: main is 618/560 commits past the candidate, 360 runtime files, no carry-forward | CONFIRMED (numbers 618/560), PARTIAL (360) | 355 files in total since `e4bf403e`, of which 116 are non-test runtime sources and 41 are on covered surfaces (chat/persona/memory/routing) — the "no carry-forward" conclusion holds. |
| F-REL-03 | A1 receipts per wave (installer 64/64, router, persona 30, 3 auth canary, crash-injection) | PARTIAL/UNWIRED | Tools for 4 of 5 receipts exist; the router and auth-canary scripts have neither an npm nor a CI caller; crash-injection receipt tool NOT FOUND; the "3–4 days" estimate is UNKNOWN. |
| F-REL-04 | A28 SBOM + THIRD_PARTY_NOTICES; native binaries without license text | CONFIRMED AT REVISION | There is no SBOM/THIRD_PARTY file at all; `bundle-native-deps.mjs` copies only binaries; the `onnxruntime-node` and `sqlite-vec-windows-x64` npm packages have no LICENSE file at all; certify checks only `NODE-LICENSE` and npm `LICENSE`. |
| F-REL-05 | A28 "CI audit is continue-on-error" + OSS gate "license CI (npm+cargo)" | CONFIRMED (npm audit) / NOT FOUND (license CI) | `ci.yml:108-110` `npm audit` is `continue-on-error: true`; no license check of any kind exists in any workflow or in the `package.json` scripts. |
| F-REL-06 | A29 `cost-tracker.ts:28` Opus 4.8 $15/$75 vs $5/$25 on the branch | CONFIRMED AT REVISION (broader than S1) | Official price (platform.claude.com, 27.09.2026): Opus 4.8/4.7/4.6 = $5/$25, Sonnet 5 = $2/$10; main overstates 4 rows (3×/1.5×), the fallback and the test lock in the wrong value; the branch is also wrong for 4.7; the table feeds the hard daily budget (product impact). |
| F-REL-07 | OSS gate: `oss-drift-check.mjs` state | CONFIRMED (exists and works) / FINDING — TO VERIFY | Run read-only: exit 1, 22 known blockers, **3** unreviewed (2 BASELINE-DRIFT + `harvest/raw-turns.ts`), 0 forbidden; 09-LAUNCH:104-105 says "one unreviewed". |
| F-REL-08 | C5/OSS gate: "private repo", "licensing decision is the blocker" | PARTIAL/UNWIRED (premise outdated) | Repo `marolinik/waggle-os` is **PUBLIC** (authenticated and unauthenticated API), root MIT; but `packages/optimizer/LICENSE` and `packages/weaver/LICENSE` say "proprietary and confidential" alongside `"license": "MIT"` in package.json; 3 hive-mind NOTICE files declare agent/evolution/vault/tiers/Tauri/WaggleDance proprietary and reference a nonexistent `EXTRACTION.md`; 9 workspace manifests lack a `license` field. |
| F-REL-09 | W8 `release.yml` signing chain, guards, `WINDOWS_PUBLIC_RELEASE_AUTHORIZED`, `production` env | CONFIRMED (code) / FINDING — TO VERIFY (live config) | The chain and guards exist and are fail-closed; live: the var `WINDOWS_PUBLIC_RELEASE_AUTHORIZED` is not defined (publish blocked), the `production` env exists without protection rules, `main` has no branch protection/rulesets, secret scanning and push protection are disabled on the public repo, the `v*` glob also catches historical non-release tags (5 failed runs). |
| F-REL-10 | W8/CI: `ci.yml` branch filter without `integration/**` | CONFIRMED AT REVISION | `ci.yml:3-6` only `[main]`; no `integration/*` branch exists on origin, so today it has no consequences, but a plan with integration branches would have no CI. |
| F-REL-11 | W8 Authenticode + Deep Security as external gates | UNKNOWN / CONFIRMED (open) | No signed artifact, no "Codex Security" workflow, either in the repo or registered dynamically; code scanning `not-configured`. |
| F-REL-12 | W3 branch `feature/harness-sota-bench` (2022 commits stale; rebase) | CONFIRMED (2022 / 66) + inventory for cherry-pick | 66 commits, 121 files, +21435/−4; 117 A-files absent on main (additive); conflict certain only for `cost-tracker.ts` (+ test) — do not rebase, skip `fe7804bf`. |

---

## 1. Ancestry and release evidence

### F-REL-01 — C22: doc drift around the candidate (CONFIRMED AT REVISION + additional drift)

**S1 claim (C22, L47):** "launch record names e4bf403e / b07a6173, CLAUDE.md names c4e6a515, and b07a6173 is not an ancestor of main."

**Commit reviewed:** `2af0904df01ca3d374cc78ba95b60dc579dd6a7a` (2026-09-27T05:08:21+02:00).

**Paths/symbols and input → output:**

| Check | Command (read-only) | Output |
|---|---|---|
| `c4e6a515…` ancestor of HEAD? | `git merge-base --is-ancestor c4e6a5157310876215d20c5e5f059f26ea1f4ba4 HEAD` | **YES**; `git rev-list --count c4e6a515..HEAD` = **618**; date 2026-09-07 "fix(build): patch Tauri browser metadata" |
| `e4bf403e` ancestor? | same | **YES**; `rev-list --count e4bf403e..HEAD` = **560**; 2026-09-09 "test(personas): adjudicate grounded Qwen responses" |
| `b07a6173` ancestor? | same | **NO**; `merge-base b07a6173 HEAD` = `e4bf403e`; `rev-list --count HEAD..b07a6173` = 1; the commit is `Merge e4bf403e… into 1d25361d…` (2026-09-09) — a synthetic PR test-merge |
| Tree equality | `git rev-parse 'e4bf403e^{tree}' 'b07a6173^{tree}'` | both `5a42a0b9ad0937408fafc8180ad6738b6bd16bce` — identical to what 09-LAUNCH:18,21 states |
| Relationship c4e6a515 ↔ e4bf403e | `git merge-base --is-ancestor c4e6a515 e4bf403e` | YES; 58 commits in between |
| Who names what | `CLAUDE.md:89` → `c4e6a515…` ("current controlled-internal-test candidate"); `docs/production-readiness/09-LAUNCH_RECOMMENDATION.md:17` → `e4bf403e…`, `:19-20` → `b07a6173…`; `README.md:19-21` → e4bf403e + b07a6173 |
| PR #83 status | `gh pr view 83 --json state,mergedAt` | **MERGED 2026-09-09T20:28:43Z**, head `4f7901e8` (ancestor of main; it is also the last commit that changed 09-LAUNCH: "docs(release): seal Windows Solo pilot evidence"); merge commit `44baa77d Merge pull request #83 …` |
| What the documents claim | `09-LAUNCH:22` "pushed private draft PR #83; mergeable, not merged to private main"; `README.md:19-20` "has not been merged to private main" | **outdated** — the PR was merged the same day the doc was sealed |

**Current output:** three documents name three different revisions as the "candidate", and one of them (`b07a6173`) by construction can never be an ancestor of `main` (it is `refs/pull/83/merge`). Confusing, but **not a contradiction in code**: `b07a6173` and `e4bf403e` are the same tree.

**Repro/limit:** git commands above; no test. The date when the repo became public was not established (no `PublicEvent` in the last 100 events).

**Expected:** one authoritative record (BRIEF §15.4, C22 "ACCEPT"): runtime `e4bf403e` (tree `5a42a0b9`), merged via `44baa77d`; `b07a6173` described as a PR test-merge with the same tree, not as "PR merge candidate used by packaging"; `c4e6a515` as an older ancestor with no validity of its own; and explicitly "no receipt covers `2af0904d`".

**Smallest change:** doc-only update of `09-LAUNCH_RECOMMENDATION.md` (§Frozen candidate, §Test evidence), `CLAUDE.md` §1 (line 84 "remains private" and 89), `AGENTS.md:68`, `README.md:19-21,110,118`. No runtime change. **Related AT:** AT-30.

### F-REL-02 — spot-check: commit gap and number of runtime files (CONFIRMED / PARTIAL)

**S1 (L18):** "main `2af0904d` is 618 commits past c4e6a515 and 560 past e4bf403e, with 360 runtime files changed. No receipt can be carried forward."

- 618 and 560: **reproduced exactly** (above).
- "360 runtime files": `git diff --name-only e4bf403e HEAD | wc -l` = **355** (from `c4e6a515`: 405). Of those 355, non-test sources under `packages/*/src`, `sidecar/`, `app/src-tauri/`, `apps/web/src/`, `scripts/` = **116**; of those, on covered receipt surfaces (chat/persona/router/provider/memory/orchestrator/tool-context/llm/proxy/auth/budget/cost) = **41**, including `packages/server/src/local/routes/chat.ts`, 30+ `chat-*.ts` modules (TD-CHAT-3 extraction), `packages/agent/src/orchestrator.ts`, `memory-*.ts`, `persona-tool-filter.ts`, `routes/personas.ts`, `routes/litellm.ts`, `routes/memory.ts`, `evolution-llm-wiring.ts`.
- **The S1 conclusion holds:** persona/router/auth/installer receipts bound to `e4bf403e`/`b07a6173` do not cover `2af0904d`; a bounded no-impact attestation per CLAUDE.md §1 is not possible because the chat, persona, memory and routing surfaces have changed.

**Smallest change:** no code change; in the plan, replace "360 runtime files" with "355 files, 116 runtime sources, 41 on covered surfaces" and require a new candidate SHA + fresh receipts. **AT:** AT-30.

### F-REL-03 — A1: receipt tools per freeze (PARTIAL/UNWIRED)

**S1 (A1, L54):** "Each freeze costs about 3-4 days of evidence: installer 64/64, router, 30-result persona set, 3 auth canaries, plus a crash-injection receipt."

| Receipt | Tool at `2af0904d` | Callers (grep) | Status |
|---|---|---|---|
| Installer (64/64) | `scripts/certify-windows-installer.ps1` (3422 lines) | `.github/workflows/release.yml:1884,1900`; `tauri-build-pr.yml:202`; `CLAUDE.md:298`; `AGENTS.md:274` | CONFIRMED exists and wired |
| Router | `scripts/qualify-smart-router.ts` + `qualify-smart-router.test.ts` | no `package.json` script, no workflow | exists, **unwired** (manual) |
| Persona 30/30 | `scripts/seal-persona-acceptance.ts` (`npm run persona:seal`, `package.json:48`), `tests/vision/persona-acceptance-seal.ts`, `persona-scorer.ts`, `personas.spec.ts`, `scripts/persona-reactor-workflow.mjs` | npm script | exists, manual |
| 3 auth canary | `scripts/test-windows-official-auth-canaries.ps1` (param `-ExpectedHead ^[0-9a-f]{40}$`, `-ReceiptDir`, `-ClaudeModel`, `-CodexModel`) | no workflow/npm caller | exists, **unwired** |
| Crash-injection receipt | `git grep -l -i "crash.injection" -- ':!docs'` → **nothing**; there are unit tests with kill/recovery (`packages/agent/tests/long-task-recovery.test.ts`, `long-task-checkpoint.test.ts`, `sidecar-owned-process.test.ts`) but no receipt over the packaged installer | — | **NOT FOUND** (checked by capability: `crash`, `SIGKILL`, `process.kill(`) |
| Receipt outputs | `output/` is gitignored (`.gitignore:227`), 0 tracked files | — | receipts live outside the repo; hashes only in 09-LAUNCH |

**Current output:** a freeze requires ≥3 manual runs (router, canary, persona) + CI certify; "3–4 days" is an estimate with no measurement in the repo → UNKNOWN.

**Expected (BRIEF §15.4, A1 "ACCEPT WITH BATCHING"):** a list of covered surfaces per wave and the number of freezes derived from dependencies; crash-injection on the packaged Windows candidate (§15.4 explicitly).

**Smallest change:** (1) an npm/pwsh entry point for the router and canary scripts (no logic change); (2) a crash-injection step in `certify-windows-installer.ps1` or a separate receipt script — new work, not existing; (3) a receipt manifest that pins the SHA. **AT:** AT-07, AT-30.

---

## 2. Licenses, SBOM, notices

### F-REL-04 — A28: SBOM, THIRD_PARTY_NOTICES, native binaries (CONFIRMED AT REVISION)

**S1 (A28, L125):** "SBOM plus aggregated THIRD_PARTY_NOTICES, checked by `certify-windows-installer.ps1`. Native binaries (onnxruntime, sqlite-vec) currently ship without license text. Model weights and the Ollama runtime go in the provenance inventory."

**Input → output:**

- `git ls-files | grep -iE "(LICENSE|NOTICE|THIRD[_-]PARTY|SBOM)"` → root `LICENSE` (MIT), `vendor/pptxgenjs/LICENSE`, per-package LICENSE for 13 `hive-mind-*` + `memory-mcp`, `optimizer`, `weaver`; NOTICE only in `hive-mind-cli`, `hive-mind-mcp-server`, `hive-mind-wiki-compiler`. **No** `THIRD_PARTY_NOTICES*`, **no** SBOM (`git grep -il "cyclonedx|spdx|\bsbom\b|syft"` hits only docs/marketplace sync, which reads GitHub `license.spdx_id`).
- `scripts/bundle-native-deps.mjs:113-130` copies `better_sqlite3.node`, `vec0.dll`, `onnxruntime-node/bin/napi-v3/<os>/<arch>/*` — **no** LICENSE/NOTICE.
- `node_modules/onnxruntime-node@1.21.0` (`"license": "MIT"`) and `node_modules/sqlite-vec-windows-x64@0.1.9` (`"license": "MIT OR Apache"`) **do not contain a LICENSE file** in the npm package (`ls` → only README/package.json/bin/dist/lib); `better-sqlite3@12.6.2` has `LICENSE`. So even `stage-sidecar-deps.mjs` (in which "third-party packages retain their published runtime layout", `:16-18`) cannot ship license text for onnxruntime and sqlite-vec — it must be generated from upstream sources.
- `scripts/certify-windows-installer.ps1:2596-2600` checks only `NODE-LICENSE` and `node_modules\npm\LICENSE` in the bundled Node runtime; there is **no** check for third-party notices.
- `app/src-tauri/tauri.conf.json` `bundle` has no `licenseFile`; `resources` = `resources/*`, `resources/native/*`, `resources/native/onnxruntime/*`, `resources/node_modules/**/*`.
- Model/runtime provenance: `packages/server/src/local/managed-ollama-runtime.ts:28-29` (`OLLAMA_TARGET_VERSION='0.32.3'`, rollback `0.32.0`), `:160-184` pins `url` + `sha256` per platform; managed model digest in the receipt (`09-LAUNCH:47-48`). It exists **in code**, not as an inventory document.
- `docs/production-readiness/04B-SECRETS_DEPS.md` and `docs/TECH-DEBT.md`: zero hits for `licen|sbom|notice|third.party` (except the word "licence" in a different sense) → the debt is not even recorded.

**Repro/limit:** no installer was built (prohibited); the conclusion about package contents comes from the build scripts + certify checks, not from a disassembled `.exe`.

**Expected (BRIEF §12.3, A28 "ACCEPT", FRD FR-OSS-04/-11, AT-30 "notices"):** SBOM + aggregated notices that match the package actually shipped; certify checks their presence; the inventory (repo/version/commit/hash/license) includes Node, npm, onnxruntime, sqlite-vec, better-sqlite3, the Ollama zip + model weights.

**Smallest change:** (1) a notices generator over the `resources/node_modules` closure + manual entries for onnxruntime/sqlite-vec/Ollama/model; (2) `bundle-native-deps.mjs` to place the LICENSE text alongside the binaries; (3) one `Assert-True` group in certify for `THIRD_PARTY_NOTICES` and SBOM; (4) an inventory file (FRD FR-OSS-04). Note: a change to the notices changes the installer SHA → new certification (S1 OSS gate row, correct). **AT:** AT-30.

### F-REL-05 — A28 "CI audit blocking" / OSS gate "license CI" (CONFIRMED / NOT FOUND)

- `.github/workflows/ci.yml:108-110`: `Security audit (informational)` → `npm audit --audit-level=high` with `continue-on-error: true` — **CONFIRMED** as S1 says.
- `ci.yml:154` `continue-on-error: true` on `e2e` (advisory by design, comment `:112-119`) — unrelated to licenses.
- License CI: `rg -il "licen|sbom|cargo (audit|deny)|licensee|license-checker" .github/workflows/` → **no** hit (the initial `-l` hit in `ci.yml` was on the word "audit"); `git ls-files | grep -iE "deny.toml|about.toml|license-checker|licensee"` → nothing; root `package.json` scripts contain no `licen|sbom` (only `"license": "MIT"` at `:51`). **NOT FOUND** for either npm or cargo.
- Dependabot: `.github/dependabot.yml` exists (versions), but live `dependabot_security_updates: disabled`.

**Smallest change:** a new CI step (blocking) for a license allowlist over `npm ls --json --omit=dev` and `cargo` (e.g. `cargo-deny`/`cargo-about`) — the tool per the Build-vs-Borrow record (BRIEF §14), not selected here. `npm audit` may remain advisory or become blocking per decision; S1 asks for blocking. **AT:** AT-30.

### F-REL-08 — C5 premise and license consistency (PARTIAL/UNWIRED; AUDIT FINDING — TO VERIFY)

**S1 (C5, L30):** "'Free/open-source for individuals' vs a private repo … `hive-mind-cli/NOTICE` declaring the agent runtime, evolution and traces proprietary … while the repo is private, GitHub attestation and `publish-windows` are disabled."

**Live check (27.09.2026, not the repo state):**
- `gh api repos/marolinik/waggle-os` → `private:false, visibility:"public", license:"MIT"`; unauthenticated `curl https://api.github.com/repos/marolinik/waggle-os` → HTTP 200, `"private": false`. **The repo is public.** `marolinik/hive-mind` is also public, Apache-2.0.
- Consequence for `release.yml`: the `attest-windows` condition `github.event.repository.private == false` (`:2058`) is now **true**; `publish-windows` (`:2210-2213`) still requires `vars.WINDOWS_PUBLIC_RELEASE_AUTHORIZED == 'true'`, which is **not defined** (`gh variable list` → only `AZURE_CLIENT_ID`, `AZURE_SUBSCRIPTION_ID`, `AZURE_TENANT_ID`). The S1 sentence "attestation … disabled while private" no longer holds for attest; it holds for publish, via the var.

**State at revision `2af0904d`:**
- `LICENSE` (root) = MIT, `package.json:51` `"license": "MIT"`, `README.md:190-194` "MIT except hive-mind-* = Apache-2.0".
- `packages/optimizer/LICENSE` and `packages/weaver/LICENSE`: "Copyright (c) 2026 Marko Markovic. All rights reserved. This software is proprietary and confidential…" (both from `01076b75`, 2026-03-26), while `packages/optimizer/package.json` and `packages/weaver/package.json` say `"license": "MIT"` → **internal contradiction on a public repo**.
- `packages/hive-mind-cli/NOTICE:12-21` (identical in `hive-mind-mcp-server/NOTICE`, `hive-mind-wiki-compiler/NOTICE`): "intentionally NOT part of this distribution and remain proprietary to Egzakta Group: compliance/*, packages/agent/*, self-evolution engine…, vault, tier/billing, Tauri shell and web UI, WaggleDance…" and "See EXTRACTION.md in the repository root" — `EXTRACTION.md` **does not exist** in this repo (it exists at `D:/Projects/hive-mind/EXTRACTION.md`). The text was written for the mirror, but it also ships from this (now public, MIT) repo.
- Without a `license` field: `packages/admin-web`, `packages/server`, `packages/shared`, `packages/waggle-dance`, `packages/worker`, `apps/web`, `apps/www`, `app`, `sidecar` (9 manifests).
- `CLAUDE.md:84`, `AGENTS.md:68`, `README.md:110,118`: "repository remains private until an explicit open-source and licensing decision is made" — **outdated**.
- `.gitignore:288` ignores `AI API KEYS.txt`; the file does not exist in the working tree (the earlier memory note about the risk is closed).

**Expected (D-01, BRIEF §12.3, §20.3 "Licensing implementation" remains open):** one decision on ownership and final texts; NOTICE/LICENSE without contradictions; publication mechanics recorded according to the actual state (public), not according to the S1 snapshot.

**Smallest change:** doc/license files only — do not change third-party licenses; do not reopen D-01. This is a **decision-queue item**, not implementation. **AT:** AT-30 (notices).

### F-REL-07 — OSS gate: `scripts/oss-drift-check.mjs` (CONFIRMED exists / FINDING — TO VERIFY)

- `scripts/oss-drift-check.mjs` (570 lines) + `scripts/oss-drift-baseline.json` (schemaVersion 1): `parityPaths` 5, `intentionalAdaptations` 38, `knownReviewedBlockers` 22, `unreviewedDifferences` 1 (`harvest/raw-turns.ts`), `forbiddenExports.paths` = `mind/evolution-runs.ts`, `mind/execution-traces.ts`, `mind/improvement-signals.ts`; `pathPrefixes` `vault.ts`, `compliance/`, `governance/`; markers `install_audit`/`ai_interactions` in `mind/db.ts`/`mind/schema.ts` (`:22-36`).
- Callers: documentation only (`CLAUDE.md` §7.5, `AGENTS.md`, `packages/hive-mind-core/CONTRIBUTING.md`, `README.md`, `docs/ARCHITECTURE.md`) — **not in CI**, a manual gate before an OSS release.
- **Read-only run** `node scripts/oss-drift-check.mjs D:/Projects/hive-mind` (checkout on branch `fix/mcp-shutdown-before-init` = `origin/master` `34103278` + 1 commit that touches only `packages/mcp-server/src/core/*` and does not touch the three disputed files): **exit 1**; KNOWN REVIEWED BLOCKERS 22; **UNREVIEWED DIFFERENCES 3** — `BASELINE-DRIFT harvest/url-egress-guard.ts` and `BASELINE-DRIFT mind/transformers-model-load.ts` (reviewed adaptation bytes changed) + `harvest/raw-turns.ts`; FORBIDDEN EXPORTS 0. Full output: `docs/plans/v1.2-evidence/phaseA/oss-drift-check-output.txt`. Monorepo `git status` unchanged after the run.
- `09-LAUNCH:104-105`: "still reports reviewed blockers and one unreviewed difference" → now 3 (two are drift of the canonical tree from the baseline, i.e. changes in the monorepo since 2026-08-27 that nobody re-baselined).
- `mind-parity-check.yml` / `sync-mind.yml` — deprecated, trigger paths `packages/core/src/mind/**` do not exist (confirmed `:33-37`, `sync-mind.yml:52-53`) — as in CLAUDE.md §7.5.

**Expected:** before any OSS release: reconcile the 22 blockers or re-baseline with maintainer review; the 3 unreviewed must be classified. It does not block the Windows Solo candidate (same conclusion as 09-LAUNCH), but it blocks the next hive-mind package.

**Smallest change:** review + `oss-drift-baseline.json` update (maintainer), an optional CI job that runs the checker over a fresh clone of the mirror (read-only). **AT:** — (OSS acceptance in FRD §19).

---

## 3. Release workflow and CI

### F-REL-09 — W8: `release.yml` guards and live GitHub configuration (CONFIRMED code / FINDING — TO VERIFY live)

**Code at `2af0904d` (`.github/workflows/release.yml`, 2562 lines):**
- Trigger `:12-15`: `push: tags: ['v*']`. `permissions: contents: read` (`:17-18`).
- `build-windows-prebuilt` (`:28`) guard `:44-62`: `GITHUB_REPOSITORY == 'marolinik/waggle-os'`, `GITHUB_REF_TYPE == 'tag'`, `HEAD == GITHUB_SHA`, clean checkout, tag == `v<tauri.conf.json version>` (`0.2.0` → the only valid tag is `v0.2.0`), `git merge-base --is-ancestor $GITHUB_SHA origin/main`.
- Chain: `prepare-windows-signing` (`:176`) → `sign-windows` (`:936`, `id-token: write`, **without** `environment`) → `certify-windows` (`:1548`, calls `scripts/certify-windows-installer.ps1` `:1884,1900`) → `attest-windows` (`:2056`, `if: github.event.repository.private == false`, `environment: production`, `attestations: write`) → `publish-windows` (`:2208`, `if: vars.WINDOWS_PUBLIC_RELEASE_AUTHORIZED == 'true' && private == false && startsWith(ref,'refs/tags/v')`, `contents: write`).
- Versions: `tauri.conf.json:4` `0.2.0`, `Cargo.toml:3` `0.2.0`, root `package.json:3` `0.1.0` (the root version is not in the guard).

**Live configuration (27.09.2026):**
- `gh variable list` → `WINDOWS_PUBLIC_RELEASE_AUTHORIZED` **not defined** → `publish-windows` fail-closed ✓.
- Repo public → `attest-windows` would execute on a `v0.2.0` tag; `production` environment: `protection_rules: []`, `deployment_branch_policy: null`, `can_admins_bypass: true` → **no human approval**; its only function is the OIDC `environment` claim (as CLAUDE.md §2 says).
- `gh api repos/.../branches/main/protection` → 404 "Branch not protected"; `rulesets` → `[]`. The "ancestor of origin/main" guard relies on the integrity of `main`, which is not protected.
- `security_and_analysis`: `secret_scanning`, `secret_scanning_push_protection`, `dependabot_security_updates` — **disabled**; code scanning default setup `not-configured`.
- Historical tags `v0.1.0-*` and `v1.0-*` (18 tags, 10 with the `v` prefix) triggered `Release Build` 5 times (10–29 May 2026), all `failure` — the `v*` glob also catches non-release tags; the version guard stops them, but they consume Actions budget (see memory "CI Actions budget").
- `sign-windows` depends on an Azure federated credential scoped to the exact tag ref (CLAUDE.md §2); not verifiable here → UNKNOWN.

**Expected (BRIEF §12.3, §15.4, W8):** a publication path that does not depend on the outdated "private" premise; an explicit human gate (environment reviewers or a ruleset on `v*` tags) before attest/publish; protection of `main`; secret scanning enabled on the public repo.

**Smallest change:** GitHub settings (not code): required reviewers on `production`, a ruleset for `main` and `refs/tags/v*`, enable secret scanning/push protection; optionally narrow the trigger to `v[0-9]+.[0-9]+.[0-9]+`. All of these are **operational decisions of the repo owner**, not a PR. **AT:** AT-30.

### F-REL-10 — CI branch filter (CONFIRMED AT REVISION)

- `.github/workflows/ci.yml:3-6`: `push: branches: [main]`, `pull_request: branches: [main]`. `integration/**` **absent**. Same for `tauri-build-pr.yml` (main + paths), `deploy-www.yml` (main + paths); `hive-mind-cli-cross-platform.yml` additionally has `feature/**` (push, paths).
- `git branch -r | grep -i integration` → only `origin/chore/deps-integration-0919` (not `integration/*`). Today there is no branch that the filter would miss.
- Blocking gates on a `main` PR: `build:packages`, `typecheck:web`, `typecheck:server-tests`, `lint`, `tsc -p app/tsconfig.json`, root vitest with a coverage threshold for `chat*.ts`, `apps/web` vitest, `e2e-smoke` (`:120-146`) — `e2e` (`:148-198`) and `npm audit` are advisory.

**Smallest change:** if the plan (BRIEF §15.3 "hotspot merge owner") introduces integration branches, add them to `branches:` in both workflows; otherwise nothing. **AT:** —.

### F-REL-11 — W8: Authenticode and Deep Security (UNKNOWN / open)

- `09-LAUNCH:35` Authenticode `NotSigned`; `:109-118` 4 GO blockers; `README.md:15` "If it does not say GO…". No evidence of a signed artifact at `2af0904d`.
- "Managed Codex Security workflow / sealed Deep Security report": `rg -i "codex.security|deep.security"` hits only `CLAUDE.md:76,86`, `09-LAUNCH:115`, `10-SECURITY_REVIEW_2026-08-11.md:10,64` ("No sealed managed Codex Security report exists"). `gh api repos/.../actions/workflows` → 9 workflows (8 from `.github/workflows` + `Dependabot Updates`), **none of them security-related**. Whether an external managed pipeline exists — **UNKNOWN** from the repo.
- Local signing scripts `app/scripts/sign-windows-*.ps1`, `new-windows-signing-handoff.ps1` exist, but CLAUDE.md §2 prohibits their use for a release artifact.

**Smallest change:** in the plan, list these two gates under G3 as external dependencies with an owner and evidence of status (BRIEF §15.3), not as engineering work.

---

## 4. Pricing

### F-REL-06 — A29: pricing table (CONFIRMED AT REVISION, broader than S1)

**S1 (A29, L126):** "`cost-tracker.ts:28` Opus 4.8 at $15/$75 conflicts with the $5/$25 on the benchmark branch."

**State at `2af0904d` — `packages/agent/src/cost-tracker.ts`:**
```
24: /** Default pricing for common models (per 1K tokens). Model IDs cross-checked
25:  *  against litellm-config.yaml (repo root) — the canonical router catalog. */
27:   // ── Anthropic Claude — Opus class ($15/$75 per 1M) ──
28:   'claude-opus-4-8': { inputPer1k: 0.015, outputPer1k: 0.075 },
29:   'claude-opus-4-7': { inputPer1k: 0.015, outputPer1k: 0.075 },
30:   'claude-opus-4-6': { inputPer1k: 0.015, outputPer1k: 0.075 },
32:   'claude-sonnet-5': { inputPer1k: 0.003, outputPer1k: 0.015 },
66:   if (m.includes('opus')) return { label: 'Opus', pricing: { inputPer1k: 0.015, outputPer1k: 0.075 } };
```
- `litellm-config.yaml` has **no** cost fields (grep `cost|price` → 0 relevant), so the comment at `:25` does not describe the source of the prices.
- Test `packages/agent/tests/cost-tracker.test.ts:54-55` locks in `claude-opus-4-8` = `{0.015, 0.075}`.
- `benchmarks/harness/config/models.json:88-89` (`claude-opus-4-6` 15/75) and the `claude-opus-4-7` row (15/75) — the same error in the benchmark manifest.

**Branch `origin/feature/harness-sota-bench` (`fe7804bf`):** `claude-opus-4-8` = `{0.005, 0.025}` ✓, `claude-opus-4-7` = `{0.015, 0.075}` ✗ (comment "Opus 4.7 stays at the 4.6 list price").

**Official source (WebFetch `https://platform.claude.com/docs/en/about-claude/pricing.md`, 27.09.2026):** Opus 5 / **4.8 / 4.7 / 4.6** / 4.5 = **$5 / $25** per MTok; Opus 4.1 / 4 (retired) = $15/$75; **Sonnet 5 = $2 / $10** (footnote 3: the introductory price became the standard price; the increase to $3/$15 planned for 1.9.2026 will not happen); Sonnet 4.6 = $3/$15; Haiku 4.5 = $1/$5. (The `claude-api` skill's cached table from 2026-06-24 gives the same values.)

**Consequence:** main overstates Opus 4.6/4.7/4.8 **3×** and Sonnet 5 **1.5×**; the fallback for unknown Opus IDs (`:66`) is also 3×. The table is not only for reports: `CostTracker` is a `ModelSpendBudget` with reservations and `BudgetPricingUnavailableError`/`BudgetExceededError`; callers `packages/server/src/local/model-spend-meter.ts`, `packages/server/src/local/index.ts`, `packages/cli/src/repl.ts`, `packages/agent/src/index.ts`. The hard daily budget for an Opus user (BYOK, D-05) reserves 3× more and throws `BudgetExceededError` prematurely — **product impact**, not just the benchmark manifest (BRIEF §13.6, A29).

**Repro/limit:** code reading + the official page; no test was run (changes prohibited). Bedrock/Vertex prices differ and are not relevant here (the table is for first-party IDs).

**Expected:** correct prices with a provenance comment (URL + date), test updated, `models.json` aligned; do not carry over `fe7804bf` (wrong 4.7 + conflict with the reservation ledger).

**Smallest change:** 4 rows in `DEFAULT_MODEL_PRICING` (`:28-30,32`), fallback `:66`, comment `:24-27`, test `:54-57`, `models.json` Opus rows; no change to the `CostTracker` logic. **AT:** AT-28 (manifest/cost), AT-29.

---

## 5. Benchmark branch

### F-REL-12 — W3: `feature/harness-sota-bench` (CONFIRMED + inventory)

- The branch exists **only** as `origin/feature/harness-sota-bench` @ `18e5b36a` (2026-07-01); no local ref exists.
- `git rev-list --count main..origin/feature/harness-sota-bench` = **66**; `origin/feature/harness-sota-bench..main` = **2022** (S1 "2022 commits stale" is correct); merge-base `33a92354` (2026-06-13).
- `git diff --stat merge-base..branch`: **121 files, +21435 / −4**. Files of type M (exist on main): `benchmarks/harness/config/models.json`, `benchmarks/harness/package.json`, `benchmarks/harness/src/stats/index.ts`, `benchmarks/harness/tests/models-config.test.ts`, `benchmarks/harness/tests/preregistration.test.ts` (1 main commit since merge-base), `litellm-config.yaml` (+66), `packages/agent/src/cost-tracker.ts` (**8 main commits** since merge-base) and its test (**7**). All others are A (added) and **do not exist on main** → additive, no conflict.
- Certain conflict: `cost-tracker.ts` — the branch version would delete the reservation ledger (`ModelSpendBudget`, `BudgetPricingUnavailableError`, `resolveTrustedPricing`); **skip `fe7804bf`** and apply the prices manually (F-REL-06).
- Cherry-pick candidates (no rebase), grouped by commits:
  - τ² adapter: `7bec6062` (vendor pin, MIT), `56401547`, `daba32d6`, `9a653947`, `3a0842cc`, `227805a5`, `84527a87`, `9750ea3a`, `ca931116`, `cee97a47`, `be855789`, `cc580777` → `benchmarks/harness/src/tau2/{index,tau2-cli,tau2-emit,tau2-results,tau2-types,vendor-pin}.ts`, `benchmarks/tau2/bridge/{waggle-bridge-server,llm-client}.ts`, `benchmarks/tau2/agent/{register,waggle_tau2_agent,test_waggle_tau2_agent}.py`, `benchmarks/tau2/{VENDOR.md,scripts/vendor.sh,tsconfig.json,.gitignore}`, tests `benchmarks/harness/tests/tau2/*`, `benchmarks/tau2/tests/*`.
  - Leakage firewall: `37fa8142`, `68fb47e3`, `dc278462`, `44e7d50c`, `fc61c636`, `e2287e8d`, `8e0a2b3e` → `benchmarks/harness/src/firewall/*` + tests.
  - Gate: `0f7d82b3`, `83edcb50`, `4fdaa67a`, `787952a2`, `fab0f0f1`, `f07148da`, `024f3394` → `benchmarks/harness/src/gate/{preflight,prereg-checklist,ruler-validation,index}.ts` + fixtures.
  - Statistics: `967727b4`, `eb77bb7b`, `78072088`, `79381854`, `ced5a4b2` → `stats/equivalence-tost.ts` + test; `stats/index.ts` (1-line export, trivial merge).
  - Continual: `0404b106`, `4e8a6046`, `7a2e15ea`, `4d6a5c49`, `14b9bd1b`, `45fc53d4`, `19676850` → `benchmarks/harness/src/continual/*`.
  - Model registry/routes: `e251bf3c`, `ddb7f5b0`, `dcbc42a7`, `ea078769` → `models.json`, `litellm-config.yaml` (no main changes since merge-base → clean patch), but the prices in `models.json` should be corrected (F-REL-06).
  - **Do not carry over as a result:** `9eb454bd` ("qwen+stack beats opus+stack"), `16b4dc3d`, `df159ac2` (N=114, n.s.), `18e5b36a` — historical pilot artifacts; DIR-23 constraints. They may enter as archived `results-retail-pilot/*` labeled "difference not confirmed".
- Limitation: the Python files (`benchmarks/tau2/*.py`) are a dev/benchmark tool, not part of the no-Python Windows package — acceptable per BRIEF §14 as long as they do not enter the installer. Whether `waggle-bridge-server.ts` uses the **production** `/api/chat` path (DIR-22) — **UNVERIFIED** here (out of scope for release-oss; W3 group).

---

## 6. What already exists / exists-but-unwired (preserve)

| What | Path | Callers verified by grep |
|---|---|---|
| Release signing chain (6 jobs) + immutable boundary guards | `.github/workflows/release.yml:12-15,28,44-62,176,936,1548,2056-2059,2208-2213` | Trigger `push tags v*`; `certify-windows-installer.ps1` from `:1884,1900`; `WINDOWS_PUBLIC_RELEASE_AUTHORIZED` var gate |
| Installer certification | `scripts/certify-windows-installer.ps1` (3422 lines; NODE-LICENSE/npm LICENSE check `:2596-2600`) | `release.yml:1884,1900`, `tauri-build-pr.yml:202`, `CLAUDE.md:298`, `AGENTS.md:274` |
| Node runtime + license staging | `scripts/bundle-node.mjs:89,165-166,273` (`NODE-LICENSE`) | `release.yml:96,2518`, `tauri-build-pr.yml:104,270`, `app/package.json:12-18`; verified by `certify:2598-2600`, `stage-sidecar-deps.mjs:599-600` |
| Sidecar deps staging that preserves first-party LICENSE/NOTICE | `scripts/stage-sidecar-deps.mjs:16-18,111` | `release.yml:105,2527`, `tauri-build-pr.yml:113,279`, `app/package.json` |
| Native deps staging (without licenses) | `scripts/bundle-native-deps.mjs:113-130` | `release.yml:102,2524`, `tauri-build-pr.yml:110,276`, `app/package.json` |
| OSS drift checker + immutable baseline | `scripts/oss-drift-check.mjs`, `scripts/oss-drift-baseline.json` | Docs only (`CLAUDE.md` §7.5, `AGENTS.md`, `packages/hive-mind-core/CONTRIBUTING.md`, `README.md`) — **not in CI** |
| Ollama runtime version+sha256 pins | `packages/server/src/local/managed-ollama-runtime.ts:28-29,160-184` | `packages/server/src/local/routes/local-inference.ts` |
| MCP/marketplace `license` field | `packages/marketplace/src/mcp-registry.ts:80,116,152,190,227,320`, `sync.ts:122,174`, `cli.ts:308` | `packages/server/src/local/routes/mcps.ts`, `packages/marketplace/src/{index,db,install-security}.ts`, `packages/shared/src/mcp-catalog.ts`, `apps/web/.../connectors/{McpCatalog,McpServerCard}.tsx` |
| `CostTracker` reservation ledger (logic correct; only the table is wrong) | `packages/agent/src/cost-tracker.ts` | `packages/server/src/local/model-spend-meter.ts`, `packages/server/src/local/index.ts`, `packages/cli/src/repl.ts`, `packages/agent/src/index.ts` |
| Persona seal tool | `scripts/seal-persona-acceptance.ts`, `tests/vision/persona-acceptance-seal.ts`, `persona-scorer.ts` | `package.json:48` `persona:seal` |
| Router qualification tool | `scripts/qualify-smart-router.ts` (+ `.test.ts`) | **no** npm/CI caller — unwired |
| Auth canary tool | `scripts/test-windows-official-auth-canaries.ps1` | **no** npm/CI caller — unwired |
| License files (root MIT, hive-mind Apache-2.0 + NOTICE, vendor/pptxgenjs MIT) | `LICENSE`, `packages/hive-mind-*/LICENSE`, `packages/hive-mind-{cli,mcp-server,wiki-compiler}/NOTICE`, `vendor/pptxgenjs/LICENSE`, `README.md:190-194` | Read by GitHub (`licenseInfo: MIT`) and the `stage-sidecar-deps` pattern `:111` |
| Blocking CI gates | `.github/workflows/ci.yml:30-106,120-146` | PR/push to `main` |
| Dependabot versions | `.github/dependabot.yml` | GitHub "Dependabot Updates" dynamic workflow (active) |

---

## 7. Notes and limitations of the check

- No installer was built, no test was run, no file in the repo was changed. The only execution from the repo: `node scripts/oss-drift-check.mjs D:/Projects/hive-mind` (reads files and runs `git rev-parse/status` over the mirror checkout; monorepo `git status` unchanged after the run).
- Live GitHub data (visibility, vars, environments, branch protection, security features, PR #83, workflow runs) reflect the state as of 27.09.2026 and may change; they are not a property of the revision.
- The date the repo switched to public was not established (no `PublicEvent` in the available events).
- The `hive-mind` local checkout used for the drift check is `origin/master` + 1 commit that does not touch the disputed files; for a formal release gate, repeat over a clean `master`.
- The day estimates from S1 (OSS 9–11/4–5, W8 8–10/5–7, A1 "3–4 days per freeze") are not verifiable from the repo → UNKNOWN; per BRIEF §15.2 they are the starting input.
- Nothing here is an architecture recommendation; "smallest change" describes the minimal touch, and decisions remain with the writers and the founder (D-01 and §20.3 were not reopened).
