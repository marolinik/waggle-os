# CC Brief — Sprint 10 Parallel Close-Out (Task 1.1 + Task 1.5)

**Author:** PM
**For:** Claude Code (waggle-os repo)
**Date:** 2026-04-22
**Sprint:** 10 (Day-3+)
**Trigger:** Task 2.2 CLOSED κ=0.8784 STRONG (commit 6a26c08); Marko ratification 2026-04-22 late — push remaining 2/7 tasks paralelno.

---

## Context (brief)

Sprint 10 je na 5/7 CLOSED posle Task 2.2 close-out-a (Fleiss' κ=0.8784 strong). Ostaju dva taska koja su supstrat-ortogonalna i mogu da se izvrše paralelno bez interleave risk-a:

- **Task 1.1** — live-run Qwen3.6 thinking-mode stability matrix preko OpenRouter bridge-a. Scaffold verifikovan Day-2, methodology stack verifikovan Day-3. Sada ide live execution.
- **Task 1.5** — implementacija fresh Claude.ai export bundle handling-a (verification-first inspection). Bundle dostavljen 2026-04-22 jutros.

Oba su Sprint 10 exit-gate items. Paralelni push je odobren jer:
1. Task 1.1 radi na live API (OpenRouter), Task 1.5 radi na lokalnom file system / harvest adapter layer-u
2. Nijedan ne deli mutable state sa drugim
3. Budget partition je clean ($1.50 za 1.1, ~$0 za 1.5 jer verification-first ne trigger-uje API calls)

---

## Task 1.1 — Qwen3.6 Stability Matrix Live Run

**Scope:** Execute pre-registered 40-cell stability matrix on `qwen3.6-35b-a3b-via-openrouter` per Day-3 brief (`briefs/2026-04-22-cc-sprint-10-day-3.md` §1.1).

**Cells (40 total):**
- Thinking mode: on / off (×2)
- max_tokens: 8K / 16K / 32K / 64K (×4)
- Prompt shape variants: 5 (baseline, reformulated, compressed, anchor-forward, null-constructed)

**Acceptance (HARD GATE):**
- **PASS** — ≥1 safe config row sa ≥70% converged completion rate. Safe config = (thinking, max_tokens, prompt_shape) triplet koji vraća non-loop output za 7/10 pokušaja.
- **FAIL** — Zero safe config rows → **HARD STOP** na Stage 2 LoCoMo full-run pending stability remediation. HARD STOP znači da LoCoMo main run dobija dodatni pre-uslov rešavanja (alternative model backend, prompt shape engineering, ili vendor escalation).

**Budget:** $1.50 cap, hard alarm $2.00.

**Wall-clock estimate:** 30-60 min.

**Artifact:** `preflight-results/qwen36-stability-matrix-2026-04-22.md` + raw run JSON `preflight-results/qwen36-stability-matrix-<ISO>.json`.

**Exit ping:** `sessions/2026-04-22-sprint-10-task-1-1-exit.md`.

**Escalation triggers:**
1. OpenRouter bridge schema drift ili auth failure → **IMMEDIATE PM ping**, do not retry >2×
2. Budget alarm > $2.00 hit → **IMMEDIATE PM ping**, pause run
3. Zero-safe outcome → report HARD STOP, stage contingency options (see §Contingency)

**Anti-pattern check:**
- Ne menjati pre-registered matrix cells bez PM OQ
- Ne reformulisati acceptance criteria post-run (Workflow Reality Check anti-pattern #4)
- Ne scope-creepuj u prompt shape engineering u ovom task-u — to je Sprint 11 rad ako stability matrix signalira

---

## Task 1.5 — Fresh Claude.ai Export Implementation

**Scope:** Verification-first inspection + harvest adapter extension per Marko input response template (`sessions/2026-04-22-marko-input-response-templates.md`).

**Phase 1 — Verification (MANDATORY FIRST, zero API spend):**
1. Marko deliverable expected at `D:\dogfood-exports\2026-04-22\claude-ai\` (ili alternativna putanja po Marko specifikaciji)
2. Verify zip structure: `conversations.json`, `users.json`, potencijalno `projects/`, `artifacts/` folderi
3. **Critical verification** — da li fresh zip sadrži artifacts folder (structured .md/.docx files linked via `computer://` URLs)? Ovo je direktna odgovor na Stage 0 substrate failure mechanism #3 (artifact corpus completeness)
4. Report findings u `preflight-results/claude-ai-export-verification-2026-04-22.md` sa:
   - Zip structure tree
   - Artifact folder present yes/no
   - Sample artifact count ako present
   - conversation→artifact link mechanism analysis (computer:// URL parsing feasibility)

**Phase 2 — Decision gate (PM-level):**
Ako artifacts folder PRESENT → proceed to Phase 3 (adapter implementation).
Ako artifacts folder ABSENT → STOP, report, await PM decision on alternative data supply (Anthropic API, Computer Use scraping, manual artifact export strategy).

**Phase 3 — Adapter extension (only if Phase 2 go):**
1. Extend ClaudeAdapter u hive-mind da čita artifacts folder
2. Link conversation frames to artifact content via computer:// URL resolution
3. Ensure artifact content lands u harvested substrate sa proper timestamp attribution
4. Write unit tests (≥5 novih) covering: artifact ingest, URL resolution, timestamp attribution, conversation-artifact linking, error handling na missing artifacts
5. Integration test: re-run Stage 0 Q1 query (Legat trilogy) i verify artifact anchors (sedam manastira, three-book katarza) sada surface u top-20

**Budget Phase 1+2:** $0 (file inspection only).
**Budget Phase 3:** ≤ $0.50 (test run API calls if Integration test trigger).

**Wall-clock estimate:** Phase 1+2 ~15-30 min; Phase 3 ~2-4h if triggered.

**Artifact:**
- Phase 1+2: `preflight-results/claude-ai-export-verification-2026-04-22.md`
- Phase 3: hive-mind commit + test suite diff + `preflight-results/stage-0-q1-re-run-artifact-adapter-2026-04-XX.md`

**Exit ping:** `sessions/2026-04-22-sprint-10-task-1-5-exit.md`.

**Escalation triggers:**
1. Phase 2 → artifacts ABSENT → **PM ping for decision gate** (do not proceed to Phase 3 autonomously)
2. Phase 3 → hive-mind test suite regression → **IMMEDIATE PM ping**, stash uncommitted work
3. Phase 3 → integration test Q1 re-run anchors DO NOT surface despite artifacts harvested → **PM ping**, ne treat kao task FAIL (mogu biti dodatni substrate mehanizmi)

**Anti-pattern check:**
- Ne scope-creep u light variant bee gen ili KVARK bridge work
- Ne push hive-mind commits bez PM ratifikacije (hive-mind je strict read-only za PM-Waggle-OS side; PM mora ratifikovati svaki hive-mind commit before push)

---

## Parallel Execution Protocol

1. **Start order:** Task 1.5 Phase 1 PRVO (~5 min, zero API, pure file inspection) — early verification informs whether Task 1.1 HARD STOP contingency needs artifacts adapter remediation kao part of Stage 2 pre-uslov
2. **Task 1.1 KICK-OFF:** Posle Task 1.5 Phase 1 CLOSE, kick Task 1.1 live-run. Task 1.5 Phase 2 decision gate i Phase 3 rad paralelno tokom Task 1.1 wall-clock-a
3. **Critical path:** Task 1.1 completion je Sprint 10 full-close gate. Task 1.5 može da ide u Sprint 11 backlog ako Phase 3 overflow-uje preko Sprint 10 deadline-a, ali Phase 1+2 moraju CLOSE pre Sprint 10 full-close

---

## Budget Consolidation

- Task 1.1: $1.50 cap (hard alarm $2.00)
- Task 1.5 Phase 1+2: $0
- Task 1.5 Phase 3: ≤ $0.50 (conditional trigger)
- **Parallel total ceiling:** $2.00
- **Sprint 10 cumulative projected:** $0.28 (current) + $2.00 = $2.28 / $15 (15.2%) — headroom ample

---

## Sprint 10 Full-Close Gate Definition

Sprint 10 CLOSES kad:
1. Task 1.1 exit ping posted sa PASS ili HARD STOP verdict
2. Task 1.5 Phase 1+2 exit ping posted sa verification report + Phase 2 decision
3. Sprint 10 close-out report updated `docs/plans/SPRINT-10-CLOSEOUT-2026-04-22.md` sa finalnim task status-om (all 7 accounted for)
4. Origin/main push sa svim artifactima

Task 1.5 Phase 3 NIJE Sprint 10 close-gate — tretira se kao Sprint 11 carry-over ako Phase 2 decision gate flip-uje na GO i Phase 3 overflow-uje.

---

## Contingency — Task 1.1 Zero-Safe Outcome

Ako stability matrix vrati zero safe config rows, Stage 2 LoCoMo main run dobija pre-uslov rešavanja. Opcije koje se stage-uju (PM odlučuje posle HARD STOP report-a):

1. **Prompt shape engineering** — proširena matrix sa 3-5 dodatnih prompt shape varijanti, budget +$1.50
2. **Alternative model backend** — test Qwen3.6 preko alternativnog provider-a (DashScope direct ako token sada radi, Groq ako availability) — cross-provider stability signal
3. **Vendor escalation** — OpenRouter support ticket za thinking-mode inference stability na Qwen3.6-35B-A3B
4. **Model swap** — fallback na Qwen3-235B-A22B ili alternativu ako 35B-A3B inherently unstable on thinking-mode

Kontingencija se NE izvršava autonomno. CC reportuje zero-safe, PM bira opciju, PM drafta follow-up brief.

---

## Exit Checklist

- [ ] Task 1.5 Phase 1 CLOSE + verification report posted
- [ ] Task 1.5 Phase 2 decision gate reported (PM review)
- [ ] Task 1.1 live-run CLOSE + stability matrix artifact posted
- [ ] Task 1.1 exit ping sa verdict (PASS / HARD STOP)
- [ ] Task 1.5 Phase 3 ili carried to Sprint 11 ili CLOSE
- [ ] Sprint 10 close-out report finalized
- [ ] Origin/main push sa komplet artifactima
- [ ] PM receives exit ping sa Sprint 10 full-close verdict

---

## Related

- `briefs/2026-04-22-cc-sprint-10-day-3.md` — Day-3 parent brief
- `briefs/2026-04-22-cc-brief-task-2-2-ratified.md` — Task 2.2 brief (closed chain)
- `docs/plans/SPRINT-10-CLOSEOUT-2026-04-22.md` — Sprint 10 close-out running document
- `sessions/2026-04-22-marko-input-response-templates.md` — Marko input templates (Task 1.5 basis)
- `.auto-memory/project_cc_sprint_active_2026_04_20.md` — Sprint state canonical record

---

**End of brief. CC owns full chain to Sprint 10 full-close. PM on call for escalation triggers only.**
