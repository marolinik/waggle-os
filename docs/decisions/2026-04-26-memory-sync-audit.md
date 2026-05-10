# Memory Sync Audit — waggle-os ↔ hive-mind Divergence

**Date:** 2026-04-26
**Author:** PM
**Status:** Audit complete; 3-step sync repair plan ratified by Marko
**Decision:** Sync repair authorized (Step 1 → Step 2 → Step 3) via parallel CC-2 sesija

---

## §1 — Trigger

Marko 2026-04-26 zatražio sync verifikaciju nakon agent fix sprint kickoff-a:
> "memorija u waggle os i u hive memo mora biti uvek sinhronizovana, trebalo bi da bude da je to reseno kroz CI CD ali... proveri sve... Mozda moze cak i paralelno u paralelnoj cc sesiji"

PM verifikacija: **CI/CD sync mehanizam ne postoji** ni u jednoj formi. EXTRACTION.md je dao static map koji file mapuje gde, ali sync workflow nikada nije implementiran. Bidirektivni gap-ovi između repoa su otkriveni file-by-file (file size diff) i potvrđeni git log analizom.

---

## §2 — Realna istorija (git log evidence)

**Hive-mind je extraction artifact + par post-extraction fixes:**

Wave 1A → Wave 6 chronological extraction iz waggle-os (15-19. april 2026), zatim:
- Wave 1A 87562eb: schema.ts (scrubbed OSS subset)
- Wave 1B caae523: db.ts (MindDB standalone) + smoke tests
- Wave 2A cd61dca: embedding providers (scrubbed)
- Wave 2B aae8bbd: FrameStore + SessionStore (verbatim)
- Wave 2C a4d82df: HybridSearch + scoring layer
- Wave 2D 4d86015: KnowledgeGraph + Ontology + ConceptTracker
- Wave 2E 29afce3: IdentityLayer + AwarenessLayer
- Wave 2F 24a41bb: reconcile.ts (mind substrate complete)
- Wave 3A → 3C: harvest foundation + 9 adapters + claude-code adapter
- Wave 4 9f774f7: @hive-mind/wiki-compiler
- Wave 5A 74f2b76: WorkspaceManager + MultiMindCache
- Wave 5B a30d04a: @hive-mind/mcp-server
- Wave 6 6c32987: @hive-mind/cli + harvest dedup fix (H-34)
- Release prep d85f290: v0.1.0 ship-prep
- CI fixes b66c151 / 2db2f5f / 9d681d4: package-lock, lint script removal, typecheck removal
- 471a840: Node 22→24 + cross-platform matrix + first-run smoke
- Persona facing: 6c0752c, f04434d (CLI commands)
- 9ec75e6: **Stage 0 root cause fix** (timestamp persist)
- 0bbdf7a: **Stage 0 Task 0.5 fix** (content preview cap 2000→10000)
- 742ed75: awareness expiry ISO-8601 fix
- c363257: ClaudeAdapter 2026-04-22 export streams coverage

**Waggle-os je live development:**

Most recent mind/ commits (newest top):
- a748f8f: C5 atomic PATCH /api/memory/frames/:id/access (server feature)
- 3d43a26: awareness expiry ISO-8601 fix (manual cherry-pick from hive-mind)
- fc5d728: PA v5 WAGGLE_EVAL_MODE tier bypass (Waggle-only)
- 8666883: e2e fix
- 61651e2: AI Act compliance ship-blockers (Waggle-only per EXTRACTION.md)
- b8ffe8e: Day-1-PM correctness cluster
- 21621c6: Skills 2.0 scope + promotion foundations (agent feature)
- 2f1f067: evolution run store (NOT extracted per EXTRACTION.md)
- 65faecb: execution trace recorder (NOT extracted per EXTRACTION.md)
- db1c257: shared team memory (Teams tier, Waggle-only)
- 63ef881: findDuplicate JS trim fix
- dd9eb9a: harvest parent session creation fix
- 803c6f6: harvest_import dedup uses frame id (memory-mcp)

---

## §3 — Real production bugs (Marko Y/N input needed)

### 3.1 — Stage 0 root cause: timestamp not persisted ❌

Hive-mind ima fix (`9ec75e6`):
```
fix(harvest-local): persist item.timestamp to memory_frames.created_at (Stage 0 root cause)
```

Waggle-os **NEMA** taj fix. Production Tauri desktop koji koristi `packages/core/src/mind/frames.ts` + harvest pipeline ima isti bug. To znači:

- Harvest-ovani items nemaju ispravan `created_at` field u `memory_frames` table
- Temporal queries protiv harvest-ovanih frames vraćaju netačne timestamps
- Bitemporal KG queries (event-time vs state-time) potencijalno daju netačne rezultate
- Stage 0 LoCoMo benchmark koji je radio sa waggle-os mind/ je radio sa ovim bug-om

Severity: **production bug, ne demonstration bug**. Fix je trivijalan (1 line change verovatno) ali nije back-portovan.

### 3.2 — Content preview cap too low ⚠

Hive-mind ima fix (`0bbdf7a`):
```
fix(harvest-local): raise content preview cap 2000 → 10000 chars (Stage 0 Task 0.5)
```

Waggle-os **NEMA** taj fix. Harvest content preview je truncated na 2000 chars u waggle-os-u. Manje kritično ali utiče na harvest UX.

### 3.3 — Manualno back-portovan fix (✓ partial credit)

Awareness expiry ISO-8601 fix postoji u oba repoa sa istim commit message-om ali različitim SHA:
- waggle-os 3d43a26
- hive-mind 742ed75

Manualno cherry-picked. Što potvrđuje da NIJE bilo automated sync — neko je rukom kopirao. Mehanizam fragile.

### 3.4 — Waggle-os fixes koji možda treba u hive-mind (PM rec audit)

Dva commit-a u waggle-os koja touch-uju "shared substrate" patterns:
- `63ef881`: "fix(frames): findDuplicate must use JS trim, not SQLite trim" — POTENCIJALNO bug i u hive-mind frames.ts (hive-mind frames.ts je 16969 bytes, ima više content-a, treba check)
- `803c6f6`: "fix(memory-mcp): harvest_import / ingest_source dedup detection uses frame id, not timestamp" — touch-uje memory-mcp koji JESTE extracted u hive-mind kao mcp-server package

Plus possibly:
- `b8ffe8e`: "fix(agent,core): Day-1-PM correctness cluster from orchestrator review" — touches agent + core, treba diff audit šta tačno u core/mind/

---

## §4 — Test coverage gap

`hive-mind/packages/core/src/mind/` ima test coverage:
- awareness.test.ts
- concept-tracker.test.ts
- db.test.ts
- embedding-provider.test.ts
- entity-normalizer.test.ts
- frames.test.ts (7383 bytes)
- identity.test.ts
- inprocess-embedder.test.ts
- knowledge.test.ts
- litellm-embedder.test.ts
- ontology.test.ts
- reconcile.test.ts
- scoring.test.ts
- search.test.ts
- sessions.test.ts

`waggle-os/packages/core/src/mind/` **NEMA** test files (verified via Get-ChildItem listing — only .ts source files, no .test.ts files in mind/ folder; tests možda postoje na drugoj lokaciji).

**Implikacije:**

1. Production code (Tauri desktop konzumira waggle-os mind/) nema test coverage tu gde memorija stvarno radi
2. Tests su rađene u hive-mind što je extraction artifact, ne live production code
3. Pilot 2026-04-26, Stage 3 v6 LoCoMo, sva production validation = waggle-os mind/ runtime BEZ test coverage
4. "7 dana testova" Marko-vog priznanja = realan rad ali primenjen na pogrešnu code path

**Tests treba portovati u waggle-os.** Gde tests pass = APIs match hive-mind, dobri smo. Gde tests fail = ili waggle-os ima bug koji hive-mind nema (fix), ili waggle-os ima Waggle-specific extension koja je legitno drugačija (dokumentuj).

---

## §5 — Zašto file size diff nije katastrofa per se

`schema.ts` waggle-os 11150 bytes vs hive-mind 5882 bytes — **OČEKIVANO**. Wave 1A commit message: "extract schema.ts (scrubbed OSS subset)". Filtering tokom ekstrakcije je uklonio Waggle-specific schema (compliance, tier, telemetry tabele). Razlika 90% u size-u je posledica filtering-a, ne bug-ova.

`embedding-provider.ts` waggle-os 16694 vs hive-mind 11047 — **OČEKIVANO**. Wave 2A commit: "extract embedding providers (scrubbed)". Waggle-specific config + telemetry uklonjen.

`frames.ts` hive-mind 16969 vs waggle-os 14825 — **NIJE očekivano**. Wave 2B: "extract FrameStore + SessionStore (verbatim)" — verbatim ekstrakcija znači size-ovi su trebali da ostanu blizu. Razlika od 14% u korist hive-mind-a sugerišje da hive-mind ima post-extraction additions ili bug fixes koji nisu vraćeni u waggle-os. Treba diff audit.

`knowledge.ts` hive-mind 11393 vs waggle-os 9531 — verovatno isti razlog kao frames.ts. Verbatim ekstrakcija + post-extraction fixes only u hive-mind.

---

## §6 — 3-step sync repair plan (RATIFIED 2026-04-26)

### Step 1 — Back-port 2 hive-mind bug fixes u waggle-os ✅ ratified

Cherry-pick u waggle-os mind/ + harvest/:
1. `9ec75e6` — Stage 0 root cause (timestamp persist)
2. `0bbdf7a` — Content preview cap 2000→10000

Plus audit: da li findDuplicate JS trim fix (waggle-os 63ef881) treba u hive-mind, da li harvest_import frame-id dedup (waggle-os 803c6f6) treba u hive-mind. Bidirektioni audit.

Effort: 1-3h CC-2 work
Acceptance: tests pass on both repos posle back-port; commit dual-PR or coordinated commits

### Step 2 — Port hive-mind tests u waggle-os ✅ ratified

Kopiraj svih `*.test.ts` iz `hive-mind/packages/core/src/mind/` u waggle-os equivalent location (treba odlučiti convention: `__tests__/` adjacent ili separate `tests/mind/` folder per existing waggle-os pattern).

Run vitest. Klasifikuj outcomes:
- PASS: API match, test je validno za waggle-os
- FAIL — bug u waggle-os: cherry-pick fix iz hive-mind ako postoji, ili identifikuj kao standalone bug
- FAIL — API mismatch: waggle-os ima Waggle-specific extension; dokumentuj test ne primenjuje se ili treba prilagoditi
- FAIL — test depends on hive-mind-only utility: skip ili adapter

Effort: 4-8h CC-2 work
Acceptance: dokumentovano per-test outcome; svaki FAIL ima ratifikaciju da li je bug, extension, ili adapter need

### Step 3 — CI/CD sync workflow ✅ ratified

Dva GitHub Actions deliverable:

**3.1 — `mind-parity-check` u waggle-os/.github/workflows/ci.yml:**
- Trigger: PR + push na main koji touch-uje `packages/core/src/mind/` ili `packages/core/src/harvest/`
- Job: clone hive-mind master, copy hive-mind tests u waggle-os checkout, run vitest na waggle-os
- Pass criteria: hive-mind tests pass na waggle-os codebase (or explicit allowlist of failing tests dokumented kao Waggle-specific extensions)
- Fail = block merge

**3.2 — `mind-sync-pr` u waggle-os/.github/workflows/sync-mind.yml (new file):**
- Trigger: push na main u waggle-os koji touch-uje `packages/core/src/mind/` ili `packages/core/src/harvest/`
- Job: filter diff exluding Waggle-specific files (per EXTRACTION.md "NOT extracted" list — vault.ts, evolution-runs.ts, execution-traces.ts, improvement-signals.ts, compliance/), open PR u marolinik/hive-mind sa diff applied to hive-mind/packages/core/src/mind/
- PR review: manual approval u hive-mind (GitHub PR review process)
- Auto-tag PR sa "auto-sync from waggle-os@{sha}"

Effort: 3-5h CC-2 work
Acceptance: oba workflows running u CI; test sync end-to-end (push test commit u waggle-os mind/ on test branch, verify auto-PR opens u hive-mind)

### Sequencing

Step 1 ide odmah (parallel sa agent fix Phase 1.x koja ne touch-uje mind/). Step 2 sledi posle Step 1 verifikacije. Step 3 sledi posle Step 2.

CC-2 sesija paralelna sa CC-1 agent fix sprintom — independent code paths, no merge conflict expected.

---

## §7 — Šta NE radimo (rejected alternatives)

- **Radikalan refactor** (waggle-os consumes @hive-mind/core via npm dep, Opcija B from prior PM proposal): rejected. Ima legitimne razloge da postoje obe verzije (Waggle-specific schema + compliance + telemetry u waggle-os/mind/, scrubbed OSS subset u hive-mind/mind/). Refactor bi bio 2-4 nedelje rada za marginal benefit. Sync workflow daje 90% benefita za 10% effort-a.

- **Git submodule** (Opcija C from prior PM proposal): rejected. Sprečava clean Apache-2.0 npm publish; submodule nameni se za internal dependencies, ne za public release artifacts.

- **Auto-merge bidirectional** (no manual review): rejected. Waggle-specific code može slučajno da uđe u hive-mind public release; manual PR review u hive-mind je essential safety check.

---

## §8 — Implications za 14-step launch plan (post-sync repair)

- **Korak 1.5 (Memory sync repair)** je sad konkretizovan: 3-step plan, ratified, paralelni CC-2 sesija u progress
- **Korak 2 (retrieval V2)** će se raditi u oba repoa simultaneously preko sync workflow-a (Step 3 enabled)
- **Korak 8 (open source repos public)** — hive-mind v0.1.0 release artifact ostaje validan, ali Step 3 sync workflow garantuje da budući commits konsistentno propagiraju
- **Korak 12 (substrate integrity audit)** mora da uključi sync verification: test parity check + git divergence check pre arxiv submission

---

## §9 — Audit trail

- Git log evidence: `D:\Projects\PM-Waggle-OS\tmp_git_audit.txt` (temporary, biće obrisan po završetku audit-a)
- File size comparison: prikazana u prethodnom PM message-u (svih 19 mind/ files DIFF, 3 waggle-only files, 0 hive-mind-only files)
- File comparison metodologija: SHA256 hash + size + LastWriteTime, no content read (preserved confidentiality)
- EXTRACTION.md: `D:\Projects\hive-mind\EXTRACTION.md` (16-line static map, no sync mechanism)

---

## §10 — Cross-references

- `D:\Projects\PM-Waggle-OS\decisions\2026-04-26-pilot-verdict-FAIL.md` (pilot used waggle-os in-tree mind/)
- `D:\Projects\PM-Waggle-OS\research\2026-04-26-arxiv-paper\01-paper-skeleton.md` (substrate claim — 74% oracle ceiling — must be pinned to specific waggle-os HEAD SHA + sync verified pre arxiv submission)
- `D:\Projects\PM-Waggle-OS\briefs\2026-04-26-memory-sync-repair-cc2-brief.md` (CC-2 paste-ready brief, authored next)
- `D:\Projects\hive-mind\BACKLOG.md` (P1 entry: ClaudeAdapter coverage — sync timing TBD)
