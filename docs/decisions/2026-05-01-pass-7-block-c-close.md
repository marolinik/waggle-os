# LOCKED Decision — Pass 7 + Block C Close (Track A apps/web Pre-Launch Closure)

**Date:** 2026-05-01
**Status:** LOCKED
**Author:** PM (decision memo authored retroactively 2026-05-05 to close decisions/ folder gap iz consolidation 2026-05-04)
**Ratified by:** Marko (implicit ratification via PM walkthrough Pass 7 PASS 9/9 verdict + production state Block C restore confirmation; explicit "uradi to sve" 2026-05-05 to author missing decision memos)
**Binds:** Track A apps/web shipping-ready status, Day-2 backlog priorities, pre-launch sequencing Track A row 🟢
**Cross-references:**
- `briefs/2026-04-30-cc-sesija-A-waggle-apps-web-integration.md` (predecessor sprint scope)
- `decisions/2026-04-30-pre-launch-sprint-consolidation-LOCKED.md` (binds Track A to pre-launch sprint)
- Memory entry `project_pass7_block_c_closed_2026_05_01.md` (point-in-time observation, primary source)
- waggle-os commits `f4e3591` / `4874f15` / `6dfa5da` (Phase 1 features), `f97b782` (Day-2 backlog), `447f5ac` (current `feature/apps-web-integration` HEAD as of 2026-05-05)

---

## §1 — Šta je ratifikovano

Track A apps/web layer je **production-ready** za Day 0 launch. Konkretno:

1. **Pass 7 walkthrough verdict PASS 9/9.** PM (kroz Computer Use + Chrome MCP tab 1596059029) verifikovao svih 9 koraka onboarding wizard-a sa `?forceWizard=true` na onboarding-test backup state. Wizard renders alone (FR#33 round 3 final), Tour fires post-completion sa 4-dot coachmark "Type / for 22 powerful commands", Settings → Advanced → Help & Tutorials sadrži Replay tour i Replay wizard buttons (Phase 1 #6), Memory app pokazuje import reminder banner iznad tabs sa 17 platformi (Phase 1 #7), Open Harvest retire-uje banner permanently, reload persistuje retirement, removeItem → reload vraća banner, X dismiss postavlja `waggle:import-banner-dismissed-at` ISO timestamp za 7-day silence.

2. **Block C state restore CLOSED 2026-05-01 ~03:11 CET.** Test stub data (~/.waggle 0 frames + 237KB mind) zamenjeno production backup-om (`~/.waggle.backup-onboarding-test-2026-04-30` → `~/.waggle`, 205MB restored). Sub-paths verified: workspaces, vault.json, personal.mind, skills, plugins, models, audit.db. Backend `btmoe23pb` na `:3333` pokrenut sa `WAGGLE_PROMPT_ASSEMBLER=1` flag-om (GEPA Faza 1 +12.5pp production runtime). `GET /health` → 200 sa frameCount 9 (production data) + embeddingCoverage 100% + LiteLLM healthy na `:4000` + defaultModel `claude-sonnet-4-6`. Time to ready 17s (well under 60s halt threshold).

3. **Twelve commits u sesiji 2026-05-01 S1.** Block A friction batch (5 commits) + Block B Phase 1 features (2 commits: f4e3591, 4874f15) + design docs + Day-2 backlog (3 commits) + FR#33 final rounds (2 commits). Cumulative 25/25 friction reports closed across all PM walkthroughs Pass 1-7. Spend ~$0 (pure code + docs + routine creation, well under $25/$20 cap).

---

## §2 — Šta je deferred (Day-2 backlog, NOT launch blocker)

Tri friction notes locked u `docs/DAY-2-BACKLOG-2026-05-01.md` commit `f97b782`:

- **FR Pass7-A (P2):** Replay tour iz Settings dok je `?forceWizard=true` ili pre-wizard-completion incorrectly resetuje `waggle:onboarding.completed=false` umesto da takne samo tour state. Edge case — happy path Settings-only access iz completed-wizard state radi clean.

- **FR Pass7-B (P3 cosmetic):** Settings + Memory window state persistuje preko page reload-a — trebalo bi da resetuje na clean Desktop pri app boot-u.

- **FR Pass7-C (P3 cosmetic):** Window stacking — Memory window otvara layered preko Dashboard-a umesto last-opened-foregrounds paradigm.

Sve tri su tracked u Day-2 backlog-u, ne blokiraju launch.

---

## §3 — Posledice za pre-launch sprint

1. Track A status u pre-launch sprint memoriji ide na 🟢 SHIPPING-READY.
2. Critical path se pomera ka Track D (landing v3.2 → apps/www Next.js port) kao sledeći gate za Day 0.
3. `feature/apps-web-integration` grana **NE merge-uje se u main** (per branch architecture Opcija C i Track A merge gate u CLAUDE.md amendment 2026-05-05); ostaje izolovana do dan pre Day 0 kad dobije freeze tag `v0.1.0-track-a-rc1` (per `briefs/2026-05-05-day-0-minus-1-runbook.md` §3).
4. Production backend ostaje running, dev server independent. CC stand-down iz sesije 2026-05-01 S1.
5. Pre-launch Wave 1 (apps/web polish) substantially done. Preostali tracks: Track D landing v3.2, Track G persona scripte update, Track H Hermes intel canonical integration, Track I Stripe/Legal Marko-side, plus Wave 1.5 Memory architecture audit gaps (P0+P1 deferred to dedicated brief).

---

## §4 — Routine reminder

Routine `trig_01JK3YuVe6bAsJvcMBbKfUJ4` armed za 2026-05-08T07:00:00Z (Phase 1 health check + Wave priority recommendation). Sledeća PM sesija u tom prozoru triggers proactively bez Marko initiation.

---

## §5 — Authoring trace

Ova decision memo je autorizovana **retroactively 2026-05-05** kao deo pop-up-a četiri-fajla decisions/ folder gap-a koji je flagovan u `project_execution_state.md` snapshot 2026-05-04 weekly brief refresh. Sadržaj reflektuje point-in-time observation iz `project_pass7_block_c_closed_2026_05_01.md` memorije, plus git verification SHA `447f5ac` na `feature/apps-web-integration` HEAD verified 2026-05-05 via `git rev-parse`.

Razlog za retroaktivnu autorizaciju: per CLAUDE.md decision memo discipline, svaka LOCKED odluka mora imati matching `decisions/<date>-<topic>.md` fajl. Bez ove memo-e, audit trail je nepotpun. Memorija postoji ali memorija nije auditable artifact (živi u Cowork space-u, nije u git-u).

**END DECISION MEMO.**
