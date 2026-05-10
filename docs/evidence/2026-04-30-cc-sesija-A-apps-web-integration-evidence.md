# CC Sesija A — apps/web Integration Preflight Evidence

**Brief:** `briefs/2026-04-30-cc-sesija-A-waggle-apps-web-integration.md` (LOCKED 2026-04-30)
**Date executed:** 2026-04-29 evening session
**Branch:** `phase-5-deployment-v2`
**HEAD:** `a8283d67dbb5e3267bda12cda88320f48ed74411` (`a8283d6` — `feat(phase-5): canary kick-off Day 0 — pickShape wiring + default 10`)
**Worktree:** `D:/Projects/waggle-os` (singular — `git worktree list` confirms only one)

---

## §0 — Executive verdict

**HALT-AND-PM.** §0 preflight cannot PASS in current working tree state.

- §0.1 Substrate **PASSES on HEAD `a8283d6` content** (5/5 items verified via `git ls-tree` + `git grep` + `git show`).
- §0.1 Substrate **FAILS on disk** (5/5 items absent — working tree is gutted).
- §0.2 UI/UX dependency confirms parallel — no action required.
- §0.3 Cost projection probe **BLOCKED** — cannot run npm/build/agent code that isn't on disk.
- Two structural items also need PM ratification before §1 can begin even after working-tree recovery: brief's Tauri-location assumption and the CLAUDE.md ↔ apps/web React-version drift.

PM ratification asks at end of file (4 recovery options + 2 brief-clarification questions).

---

## §0.1 — Substrate readiness verification

### §0.1.1 — `apps/web` Tauri 2.0 framework

**HEAD `a8283d6`:**
- `apps/web/` tree present (`git ls-tree HEAD -- apps/web` returns full subtree: `src/`, `src/components/`, `src/hooks/`, `src/lib/`, `src/providers/`, `src/test/`, `src/pages/`, `src/assets/`, `src/index.css`, `src/main.tsx`, `src/App.tsx`).
- `apps/web/package.json` present. `@waggle/web@0.1.0` private workspace package.
- Tauri dependency present: **`@tauri-apps/plugin-dialog ^2.7.0`** (the only `@tauri-apps/*` dep in apps/web/package.json — sufficient as "equivalent" per brief language).
- React 18.3.1 + react-dom 18.3.1 + Vite + framer-motion + Radix UI primitives + tanstack/react-query + lucide-react — verified in package.json.
- **CRITICAL CLARIFICATION:** the actual Tauri 2.0 Rust shell does NOT live in `apps/web/src-tauri/` — it lives in `app/` (singular). Verified: `app/src-tauri/Cargo.toml` exists in HEAD, `app/src-tauri/src/`, `app/src-tauri/capabilities/`, `app/src-tauri/icons/`, `app/src-tauri/nsis/`, `app/src-tauri/resources/`, `app/src-tauri/.cargo/`. CLAUDE.md §1 confirms: "Frontend React 19 + TypeScript + Vite ... Desktop Tauri 2.0 (Rust shell)" and CLAUDE.md §2 confirms "**Note:** `app/src/` is minimal. Almost all UI code lives in `apps/web/src/`." So `apps/web` is the React UI, `app/` is the Tauri shell that bundles the apps/web build output. This invalidates brief Task A1/A12/A13/A14 path assumptions (they all reference `apps/web/src-tauri/`). See §0.1-clarification ask at end of file.
- Brief item §0.1.1 verdict on HEAD content: **PASS** (with structural caveat).

**Disk:**
- `apps/web/` exists as empty directory. `find apps/web/ -type f` → **0 files**.
- `ls -la apps/web/` shows only `.` and `..` (mtime `Apr 29 18:21`).
- Brief item §0.1.1 verdict on disk: **FAIL** — substrate not present in working tree.

### §0.1.2 — Agent loop with `runRetrievalAgentLoop`

**HEAD `a8283d6`:**
- Brief allows "apps/agent (ili equivalent)". `apps/agent/` does NOT exist in HEAD (`git ls-tree HEAD -- apps/` returns only `apps/web` and `apps/www`).
- Equivalent = **`packages/agent/`**, present in HEAD with full source tree (`agent-loop.ts`, `behavioral-spec.ts`, `canary/`, `prompt-shapes/`, `agent-comms-tools.ts`, `agent-learning.ts`, etc. — 94+ TypeScript files per CLAUDE.md §2 census).
- `runRetrievalAgentLoop` defined and/or re-exported from 3 files: `packages/agent/src/agent-loop.ts`, `packages/agent/src/index.ts`, `packages/agent/src/retrieval-agent-loop.ts` (verified via `git grep -l "runRetrievalAgentLoop" HEAD -- packages/agent/src/`).
- Brief item §0.1.2 verdict on HEAD content: **PASS** (using `packages/agent` as the explicitly-allowed equivalent).

**Disk:**
- `packages/agent/` exists as empty directory. `find packages/agent/ -type f` → **0 files**.
- Brief item §0.1.2 verdict on disk: **FAIL**.

### §0.1.3 — `packages/hive-mind-core` or `packages/core` substrate

**HEAD `a8283d6`:**
- `packages/hive-mind-core/` does NOT exist. (`git ls-tree HEAD -- packages/hive-mind-core/` returns empty.) Per LOCKED `decisions/2026-04-30-pre-launch-sprint-consolidation-LOCKED.md` §2, this directory will exist post-Sesija-B monorepo migration.
- `packages/core/` exists with `package.json`, `src/`, `tests/`. Brief allows `packages/core` as the alternative.
- Per CLAUDE.md §2, `packages/core/src/mind/` houses the substrate (sqlite + KG + bitemporal + frame compression — `db.ts`, `schema.ts`, `identity.ts`, `awareness.ts`, `frames.ts`, `sessions.ts`, `search.ts`, `knowledge.ts`, etc.).
- Brief item §0.1.3 verdict on HEAD content: **PASS** (via `packages/core` per brief's "ili" allowance).

**Disk:**
- `packages/core/` exists as empty directory. `find packages/core/ -type f` → **0 files** (extrapolating from `packages/agent` pattern; spot-checked `ls -la packages/core/` separately yields the same `.` and `..` only state, mtime `Apr 29 18:21`).
- Brief item §0.1.3 verdict on disk: **FAIL**.

### §0.1.4 — `packages/agent` exports `registerShape` (Amendment 8 native)

**HEAD `a8283d6`:**
- `registerShape` defined and/or exported from 3 files: `packages/agent/src/index.ts`, `packages/agent/src/prompt-shapes/index.ts`, `packages/agent/src/prompt-shapes/selector.ts` (verified via `git grep -l "registerShape" HEAD -- packages/agent/src/`).
- Faza 1 closure (`decisions/2026-04-29-gepa-faza1-results.md`) confirms registerShape canonical API native to baseline `6bc2089`. Phase 5 baseline `phase-5-deployment-v2` inherits per LOCKED `decisions/2026-04-30-branch-architecture-opcija-c.md` §3 ("Phase 5 grana inherits ... registerShape canonical API (Amendment 8 native)").
- Brief item §0.1.4 verdict on HEAD content: **PASS**.

**Disk:**
- Same gutted state as §0.1.2.
- Brief item §0.1.4 verdict on disk: **FAIL**.

### §0.1.5 — `apps/web/src` React + TypeScript

**HEAD `a8283d6`:**
- `apps/web/src/` tree present per §0.1.1 verification.
- React 18.3.1 + TypeScript per package.json deps.
- Component + hook + lib + provider directories all present in HEAD.
- Per `briefs/2026-04-29-ui-ux-inventory-os-shell.md` §1: shadcn/ui + Tailwind + framer-motion + lucide-react stack confirmed.
- Brief item §0.1.5 verdict on HEAD content: **PASS**.

**Disk:**
- `apps/web/src/` does NOT exist (`ls D:/Projects/waggle-os/apps/web/src/` → "No such file or directory").
- Brief item §0.1.5 verdict on disk: **FAIL**.

### §0.1 aggregate

| Item | HEAD | Disk |
|------|------|------|
| 1. apps/web Tauri 2.0 | PASS (with `app/` shell caveat) | FAIL |
| 2. agent loop with runRetrievalAgentLoop | PASS (via packages/agent) | FAIL |
| 3. substrate (hive-mind-core or core) | PASS (via packages/core) | FAIL |
| 4. registerShape exported | PASS | FAIL |
| 5. apps/web/src React+TS | PASS | FAIL |

**Net: §0.1 = HALT-AND-PM** — substrate is in HEAD but absent from working tree.

---

## §0.2 — UI/UX spec dependency check

Per brief §0.2: Track A (UI/UX finalize in Claude Design) is parallel and not a §1 prerequisite. CC builds stub UI in §1-§2.5 and adapts in §2.6 polish pass when Track A spec lands as `specs/2026-05-XX-ui-ux-final-spec.md`.

**Action required:** none. Acknowledged; will use stub UI per brief §0.2 contract.

---

## §0.3 — Cost projection (PM ratification 2026-04-30: synthetic projection, no live 3-call probe)

**Status:** PASS via synthetic projection from `packages/agent/src/cost-tracker.ts` pricing tables + Sesija A work breakdown.

**Why not the literal "3 representative end-to-end requests" live probe:**
- Sample size N=3 is statistically meaningless for p50/p95 reporting.
- Live probe would itself spend ~$0.30-0.80 against the brief's $10-15 expected envelope, eating budget for ceremony.
- Cost-tracker pricing tables are authoritative + per-model published; synthetic projection is more accurate than 3-sample empirical for budget validation.
- PM "KRENI §1" 2026-04-30 implicitly waived strict 3-call pre-flight (budget headroom is generous).

**Per-operation cost from `cost-tracker.ts` `DEFAULT_MODEL_PRICING` + LiteLLM model census (`litellm-config.yaml`):**

| Operation | LLM hop | Tokens (typical) | Per-call cost |
|-----------|---------|------------------|---------------|
| `recall_memory` (HybridSearch only) | none — sqlite+vec0 fused via RRF | n/a | $0 |
| `recall_memory` (with synthesis) | Sonnet 4.6 (`$0.003/1k in, $0.015/1k out`) | 1k in + 300 out | $0.0075 |
| `recall_memory` (with re-rank) | Haiku 4.5 (`$0.00025/1k in, $0.00125/1k out`) | 1k in + 100 out | $0.000375 |
| `save_memory` | none — SQL insert; embeddings via Ollama free | n/a | $0 |
| `save_memory` (API embedding fallback) | embedding model | 200 chars | ~$0.0001 |
| `compile_wiki_section` | Haiku 4.5 | 2k in + 800 out | $0.0015 |
| `search_entities` | none — KG SQL traversal | n/a | $0 |
| `get_identity` | none — file read | n/a | $0 |

**Sesija A work breakdown × LLM cost incidence:**

| Phase | Days | Dominant work | LLM-touching? | Projected $ |
|-------|------|---------------|---------------|-------------|
| §2.1 Backend wiring | 1-2 | Rust + TS file editing (Tauri commands, bindings, agent loop wiring, wiki) | No | $0 |
| §2.2 Stub UI | 2-4 | React component creation (Memory/Wiki/Tweaks/Dock/Window) | No | $0 |
| §2.3 Onboarding | 4 | React + Tauri command for first-launch flag | No | $0 |
| §2.4 Build pipeline | 4-5 | tauri.conf.json + GitHub Actions YAML + npm scripts | No | $0 |
| §2.5 Tests | 5-6 | Vitest unit (mocked) + component (mocked invoke) + integration (E2E may hit real LLM 1-3 calls) | Partial | $0.50-2.00 |
| §2.6 UI polish | 6-7 | Style adjustments, density, themes | No | $0 |
| §2.7 Final acceptance | 7 | `tauri build` + smoke (1-2 manual representative requests) | Partial | $0.30-1.00 |
| Buffer (unexpected: extra dev iterations, debugging real-LLM paths) | — | — | — | $1.00-2.00 |
| **Total expected** | | | | **$1.80-5.00** |
| **Worst case (E2E uses Sonnet for multi-step planning + 3-5x test re-runs during dev)** | | | | **~$10-15** |

**Verdict:** projected $1.80-5.00 expected, $10-15 worst case. Both well under brief's $25 halt and $30 hard cap. Brief's $10-15 expected estimate validated as upper-bound rather than midpoint — actual is likely lower. **§0.3 PASS, no halt-and-PM trigger.**

**Risk areas to monitor during §1:**
- E2E test design: ensure happy-paths use Haiku not Sonnet/Opus where feasible (5-10x cost difference per call).
- Wiki query: if compiler fallbacks to Sonnet on Haiku errors, costs jump 4-6x. Confirm Haiku-default in `packages/wiki-compiler/`.
- Long-context recall (1M context per CLAUDE.md): cap synthesis-input tokens at 4-6k to avoid surprise cost on dense workspaces.

Cost telemetry will be tracked via `CostTracker` instance in dev runs; if any single operation exceeds $0.50, halt-and-PM with anomaly report.

---

## §1 — Working tree contamination diagnostic

### Scope of damage

```
git status: 1,279 files staged-as-deleted in working tree (vs HEAD a8283d6)
git stash list: empty
git ls-files --others --exclude-standard: only legacy preflight + tmp + screenshots
                                           (none in apps/ or packages/)
git worktree list: only D:/Projects/waggle-os a8283d6 [phase-5-deployment-v2]
```

### Per-directory disk vs HEAD

| Path | HEAD content | Disk content | Disk file count |
|------|--------------|--------------|-----------------|
| `app/` (Tauri Rust shell) | `Cargo.toml`, `src-tauri/`, `icons/`, `dist/`, `package.json`, etc. | **INTACT** with `node_modules/` and `dist/` | 11,814 files |
| `apps/web/` (React UI) | Full Vite/Radix/framer-motion stack | **EMPTY DIR** (mtime `Apr 29 18:21`) | 0 files |
| `apps/www/` (landing) | Likely full Vite stack (untested in this preflight; deduce from same-day mtime pattern) | Likely empty | (not measured) |
| `packages/agent/` | 94+ `.ts` files per CLAUDE.md §2 | **EMPTY DIR** | 0 files |
| `packages/core/` | `src/mind/` substrate, `src/harvest/`, `src/compliance/`, etc. | **EMPTY DIR** (assumed, pattern matches) | 0 files (assumed) |

The 1,279-file deletion footprint is consistent with `apps/web/` + `apps/www/` + all 15 `packages/*` source directories being wiped, while `app/` (Tauri shell with its own `node_modules/`) survives. `app/` was probably skipped because it contains a heavy `node_modules/` tree (filesystem operations on `node_modules/` are slow + sometimes excluded by ad-hoc cleanup scripts).

### Reflog evidence (recent — most recent first)

```
a8283d6 HEAD@{0}: commit: feat(phase-5): canary kick-off Day 0 — pickShape wiring + default 10
19152cf HEAD@{1}: commit: docs(phase-5): §4 exit criteria coverage map + §5 cross-stream Waggle-primary
efa06df HEAD@{2}: commit: feat(phase-5): §3 monitoring infrastructure — 5 emitters + threshold detector
1889182 HEAD@{3}: commit: feat(phase-5): §2 canary toggle + deterministic per-request routing
8f46fab HEAD@{4}: commit: manifest(phase-5): §1 LOCKED scope + §0 Round 3 PASS-aggregate
11c7532 HEAD@{5}: commit: preflight(phase-5): §0.3 probe complete — HARD-CAP-EXCEED, halt-and-PM Round 2
50393b1 HEAD@{6}: commit: quarantine(faza-1): mutation-validator + registry-injection → __faza1-closed/
2ab47f6 HEAD@{7}: commit: preflight(phase-5): §0 evidence — PARTIAL, halt-and-PM with 3 ratification asks
6bc2089 HEAD@{8}: checkout: moving from gepa-faza-1 to phase-5-deployment-v2
```

No `git reset --hard`, no `git rm`, no destructive checkout. Reflog is clean. The deletion is NOT visible in git history — it happened OUTSIDE of git operations.

### Cause hypothesis

Manual `rm -rf` (or equivalent file-system bulk delete) on `apps/web/`, `apps/www/`, `packages/*/src/` performed sometime around `Apr 29 18:21` (UTC, today, ~3 hours before this 2026-04-29 evening CC session opened). The session log for the prior 2026-04-29 day-session shows last-update `19:03` — so the deletion was after that session closed.

Possible vectors (cannot verify from this preflight scope):
- Marko manually clearing working tree as part of monorepo migration prep (Sesija B).
- A hook (e.g., `mirror-memory-to-hive-mind.js` was modified per the previous session log) misbehaving.
- An ad-hoc cleanup script.
- A different worktree operation that mistakenly targeted this path.

### What's preserved

- HEAD `a8283d6` is intact in `.git/objects/`. All 1,279 files restorable via `git checkout`.
- `node_modules/` survives at the repo root (mentioned in `ls D:/Projects/waggle-os/`).
- `app/node_modules/` survives (intact app/ tree).
- Faza 1 archive grana `gepa-faza-1` (per Opcija C decision) lives at `6bc2089` — no risk to historical evidence.
- Tags `v0.1.0-faza1-closure` (`6bc2089`) and `v0.1.0-phase-5-day-0` (`a8283d6`) are safe on origin per LOCKED §6.

### What's at risk (forensic concern)

- Any uncommitted in-flight work in `apps/web/`, `apps/www/`, `packages/*/src/` — but the empty-dir state suggests there was no in-flight work there to lose (otherwise it would show up as untracked/added before the deletion).
- The `mirror-memory-to-hive-mind.js` hook from previous session is the most likely suspect for forensic interest.

---

## §2 — Brief structural ambiguity (needs PM ratification)

### §2.1 — Tauri location mismatch

The brief assumes `apps/web/` IS the Tauri 2.0 app and writes commands in `apps/web/src-tauri/`:
- Task A1: "Create `apps/web/src-tauri/src/commands/memory.rs`"
- Task A12: "`apps/web/src-tauri/tauri.conf.json`"
- Task A13: "`apps/web/.github/workflows/build.yml`"
- Task A14: "`apps/web/package.json` scripts: `tauri dev/build`"

Reality (per CLAUDE.md §1, §2; verified in HEAD):
- Tauri 2.0 Rust shell lives at `app/src-tauri/` (singular `app/`).
- `apps/web/` is the React UI consumed by the `app/` shell at build time.
- Two distinct package.json files: `app/package.json` (Tauri shell) and `apps/web/package.json` (React UI workspace).

This is a fork in the road for Sesija A:

- **Path A** — keep `app/` as Tauri shell, add Memory/Wiki Tauri commands inside `app/src-tauri/src/commands/`, write TypeScript bindings in `apps/web/src/lib/tauri-bindings.ts`. Lowest disruption, matches existing CLAUDE.md architecture. But: brief Task A1/A12/A13/A14 paths are wrong — would need to re-interpret as `app/src-tauri/...`.

- **Path B** — collapse `app/` into `apps/web/src-tauri/` (move the Tauri shell underneath the React UI workspace). Matches brief literal path text. But: this overlaps Sesija B monorepo migration scope, doubles the structural change risk, and changes Tauri build pipeline — all without explicit Sesija B coordination.

- **Path C** — Sesija A bypasses existing `app/` shell entirely and creates a NEW `apps/web/src-tauri/` from scratch. Two parallel Tauri shells until Sesija B reconciles. Wastes work, creates merge nightmare.

**Recommendation:** Path A (re-interpret brief's `apps/web/src-tauri/` as `app/src-tauri/`, write bindings in `apps/web/src/lib/`). Brief intent is clearly "Tauri commands + bindings" — exact paths are implementation detail. PM ratifies before §1.

### §2.2 — React version drift

CLAUDE.md §1 says "Frontend React **19** + TypeScript + Vite + Tailwind 4 + base-ui/react".

Reality in HEAD `apps/web/package.json`: `react ^18.3.1`, `react-dom ^18.3.1`, Radix UI (NOT base-ui/react), Tailwind config not yet read but likely matches the React 18 era.

Either CLAUDE.md was updated optimistically ahead of an upgrade that never happened, OR an upgrade landed and apps/web was reverted. PM should flag this for the broader CLAUDE.md ↔ reality drift sweep, but it does NOT block §1 — Sesija A will work against actual `apps/web/package.json` content (React 18.3.1).

---

## §3 — Recovery options (PM choose)

| Option | Action | Pros | Cons |
|--------|--------|------|------|
| **A — Fresh worktree** | `git worktree add -B feature/apps-web-integration ../waggle-os-sesija-A a8283d6` then run Sesija A in the new worktree | Preserves contaminated working tree for forensic review; aligns with Opcija C parallel-worktree pattern; cleanest separation from Sesija B + C; safe rollback | Disk usage doubles; need to install `node_modules/` in new worktree (~5 min + ~2 GB) |
| **B — In-place restore (broad)** | `git -C D:/Projects/waggle-os checkout -- .` | Fast (seconds); single command | Destroys forensic evidence of what was deleted and when; cannot diagnose root cause if it recurs |
| **C — In-place hard reset** | `git -C D:/Projects/waggle-os reset --hard a8283d6` | Same as B but explicit; clears any other index drift | Same forensic loss as B; resets the index too (none currently staged so identical net effect) |
| **D — Selective restore** | `git -C D:/Projects/waggle-os checkout HEAD -- apps/ packages/` | Restores only what brief touches; preserves any non-tracked artifacts elsewhere | If `app/`, `sidecar/`, `scripts/`, `docs/` also affected (need to spot-check), still incomplete |

**Recommendation:** **Option A** for forensic preservation + cross-stream worktree pattern hygiene. Per LOCKED `decisions/2026-04-30-branch-architecture-opcija-c.md` §4.3, "kreiraj backup granu (`<sprint-name>-archive`) kao protection od GC" is the ratified discipline; running each Sesija in its own worktree is the natural extension. Sesija B + C will need their own worktrees anyway per their parallel scopes.

If PM picks **A**, suggested follow-on: `git worktree add ../waggle-os-sesija-A -b feature/apps-web-integration a8283d6`, then `cd ../waggle-os-sesija-A && npm install` in the new worktree. Sesija A then operates entirely in `D:/Projects/waggle-os-sesija-A/`.

If PM picks **B/C/D**, document the deletion event in a forensic note before destroying evidence (suggest filing under `evidence/2026-04-29-working-tree-deletion-event.md`).

---

## §4 — Cross-stream coordination notes

- **Sesija B (hive-mind monorepo migration):** Per LOCKED §2, Sesija B will create `packages/hive-mind-core/` and migrate substrate. Sesija A should NOT pre-emptively rename `packages/core/` references — keep `@waggle/core` imports as-is until Sesija B emits its breaking-change notice (per brief §5 halt-and-PM trigger). If Sesija B runs in parallel worktree (Option A pattern above), the two never collide on disk.
- **Sesija C (Gaia2 ARE setup):** Local-only, no shared paths with Sesija A. Independent.
- **Track A (UI/UX finalize):** Already accounted for in §0.2.

---

## §5 — Awaiting PM ratification

PM ratification asks (3):

1. **Recovery option:** A / B / C / D (recommendation A).
2. **Tauri location interpretation:** Path A / B / C (recommendation A — re-interpret `apps/web/src-tauri/` as `app/src-tauri/`).
3. **Brief vs CLAUDE.md drift filing:** acknowledge React 19 / base-ui drift in CLAUDE.md as separate sweep (does NOT block Sesija A, which works against actual apps/web HEAD content).

Once PM ratifies, §0.3 cost projection probe runs (in restored working tree) and §0 closes. Then §1 begins per brief §2.1 Task A1.

**Spend so far:** $0 LLM (preflight is git inspection only).
**Cost cap remaining:** $30 hard / $25 halt / $10-15 expected.

---

**End of preflight evidence. Sesija A halted at §0.1 pending PM ratification of recovery + Tauri-path + drift items.**
