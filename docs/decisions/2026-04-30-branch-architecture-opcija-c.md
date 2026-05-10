# LOCKED Decision — Branch Architecture (Phase 5 Baseline) + Opcija C Ratifikacija

**Date:** 2026-04-30
**Status:** LOCKED
**Author:** PM
**Ratified by:** Marko (paste action sequence executed 2026-04-30 morning)
**Supersedes:** none — first formal branch architecture decision
**Binds:** Phase 5 deployment baseline + future cross-stream integration policy

---

## §1 — Discovery (Marko 2026-04-30 morning kickoff)

Tokom Phase 5 §0 preflight setup, otkrivene su tri strukturalne anomalije u repo state-u:

1. **Faza 1 manifest v7 SHA terminus iz memorije bio pogrešan.** PM (ja) sam u Faza 1 closure decision memo i Phase 5 brief referencirao `fa716ff9` kao SHA terminus. Stvarna realnost: `fa716ff9` ne postoji u `.git/objects` (`fatal: Not a valid object name`). Pravi terminus je `6bc2089` — Checkpoint C closure ("held-out validation 15/15; §F.5 condition_2 — 2/3 PASS, gpt::gen1-v2 OVERFIT exposed"). PM hallucinated SHA bez verifikacije pri zatvaranju Faza 1.

2. **Faza 1 commits su bili dangling (orphaned).** Ceo Faza 1 commit chain (Amendments 7-11 + Checkpoint B + Checkpoint C + bf9219a Gen 1 close) postojao je u `.git/objects` ali nije bio reachable iz nijedne grane (lokalne ili remote). `git branch --contains 6bc2089` vraća prazno output. Garbage collection bi trajno izgubio Faza 1 evidence. Spaseno akcijom `git branch gepa-faza-1 6bc2089`.

3. **Tri paralelna stream-a su divergentna.** Pri inspekciji grana otkriveno:
   - `main` (origin/main): Sprint 12 Task 1 finalized work (taxonomy + stats + B2 LOCK + smoke). HEAD = `5ec069e`.
   - `feature/c3-v3-wrapper`: CC-1 Phase 4 closure. HEAD = `c9bda3d` (Phase 4.7).
   - `gepa-faza-1` (novo kreirana): CC-GEPA Faza 1 closure. HEAD = `6bc2089` (Checkpoint C).
   - Niko od tri grana nije sadržao oba druga rada. Stream-ovi su radili paralelno bez integration sprint-a posle zatvaranja.

---

## §2 — Decision

**Phase 5 baseline = `gepa-faza-1` grana (`6bc2089`).** Nova grana `phase-5-deployment-v2` kreirana iz `gepa-faza-1` kao Phase 5 deployment branch. Stara `phase-5-deployment` (na Phase 4.7 + 1 forward-port commit `ee946d1`) obrisana — sadržaj forward-port commit-a već je u Faza 1 grani kao native Amendment 8 commit `4d43141`.

`phase_5_pre_deployment_sha` = `6bc20897d3851072eda34e80070faf39772bee66` (skraćeno `6bc2089`).

---

## §3 — Trade-off acknowledgment (Opcija C consequences)

**Phase 5 grana inherits:**
- Faza 1 manifest v7 + Amendments 1-11 (full GEPA evolution work)
- gen1-v1 shape definicije (claude::gen1-v1, qwen-thinking::gen1-v1)
- registerShape canonical API (Amendment 8 native)
- Checkpoint B + C evaluation infrastructure
- run-checkpoint-c.ts held-out validation runner

**Phase 5 grana DOES NOT inherit:**
- CC-1 Phase 4 long-task agent fixes (failure classifier, reporting module, messages-array compression, runRetrievalAgentLoopWithRecovery). Ti fix-evi su za production reliability long-task (multi-step research) execution. Phase 5 deployment GEPA-evolved variants su pre svega za simple-medium task profile; long-task fixovi mogu biti merged u Phase 5 granu kasnije ako monitoring (§3 brief) pokaže da je production traffic dominantno long-task.
- Sprint 12 Task 1 main work (benchmark taxonomy + stats infrastructure). To je za benchmark execution, ne za production deployment monitoring.

**Mitigation za missing Phase 4 long-task fixes:**
- Phase 5 §3 monitoring infrastructure aktivno prati `error_rate` (loop_exhausted, timeout, parse_fail). Ako loop_exhausted rate prelazi 5% baseline, halt-and-PM trigger sa "long-task fixes potrebni" rationale.
- Selective cherry-pick mogućnost (commits c9bda3d, be8f702, e906114, 4d0542f, 8b8a940 iz Phase 4 chain) ostaje opcija ako monitoring pokaže potrebu.

---

## §4 — Hindsight lessons + future binding

### §4.1 — SHA verifikaciona disciplina

**Lekcija:** Pri zatvaranju Faza 1, PM (ja) je referencirao SHA terminus iz memorije bez `git rev-parse` ili `git log` verifikacije. Rezultat: pogrešan SHA propagiran u dva decision memo + Phase 5 brief + memory entry.

**Future binding:** Bilo koji SHA reference u decision memo, brief, ili memory entry MORA biti verifikovan pre commit-a sa explicit `git rev-parse` ili `git log` output zalepljen u audit trail. Forbidden: "from memory" SHA references.

Memory entry: `feedback_sha_verification_discipline.md` (mirror: `D:/Projects/PM-Waggle-OS/memory-mirror/feedback_sha_verification_discipline.md`).

### §4.2 — Integration sprint policy

**Lekcija:** Tri paralelna CC stream-a (CC-1 Phase 4 + CC-GEPA Faza 1 + Sprint 12 Task 1) su zatvorena nezavisno bez integration sprint-a. Rezultat: divergent grane, dangling commits, manuelna orchestration potrebna pre Phase 5 deployment.

**Future binding:** Posle zatvaranja bilo koja dva stream-a koji rade na zajedničkim packages (`packages/agent`, `packages/core`), integration sprint je obavezan pre dalje stream-specific rada. Integration sprint deliverables: merge-back u main + cross-stream test harmonizacija + branch hygiene check.

Memory entry: `feedback_integration_sprint_policy.md` (mirror: `D:/Projects/PM-Waggle-OS/memory-mirror/feedback_integration_sprint_policy.md`).

### §4.3 — Dangling commit hygiene

**Lekcija:** Faza 1 commits su bili dangling jer grana sa kojom su radjeni nije ostala u repo (verovatno deleted post-merge ili nikad pushed). Bez `git branch --contains` provere, commits su mogli biti garbage collected.

**Future binding:** Posle zatvaranja sprint-a sa significant commit chain, kreiraj backup granu (`<sprint-name>-archive`) kao protection od GC. Jednostavna komanda u session_end_protocol checklist.

---

## §5 — Integration sprint deferred to post-Phase-5 production-stable

Posle Phase 5 production-stable transition (~6-8 nedelja od kick-off-a, per Phase 5 brief §4.3 definicija), zaseban integration sprint:

1. Merge `gepa-faza-1` (sa Phase 5 production deployments) u `main`
2. Merge `feature/c3-v3-wrapper` (Phase 4 long-task fixes) u `main` — ili selective cherry-pick ako Phase 5 monitoring pokaže da nisu potrebni
3. Resolve merge konflikte u `packages/agent`
4. Cross-stream test harmonizacija (kombinovani test count target)
5. Brief + decision memo za integration sprint closure

Prio: medium (ne blokira Phase 5, blokira post-Phase-5 development).

---

## §6 — Audit trail anchors

- Phase 5 baseline grana: `phase-5-deployment-v2` (head `6bc2089`)
- Faza 1 archive grana: `gepa-faza-1` (head `6bc2089`, identican sa baseline po definiciji)
- Faza 1 closure decision memo: `decisions/2026-04-29-gepa-faza1-results.md` (treba SHA fix)
- Phase 5 brief: `briefs/2026-04-29-phase-5-deployment-brief-v1.md` (treba SHA + branch fix)
- Phase 5 brief LOCKED memo: `decisions/2026-04-29-phase-5-brief-LOCKED.md` (treba SHA + branch fix)
- Phase 5 scope LOCKED memo: `decisions/2026-04-29-phase-5-scope-LOCKED.md` (no fix needed)
- Stara phase-5-deployment grana: deleted (was `ee946d1`, redundant sa `4d43141`)

---

**End of LOCKED decision. Phase 5 baseline ratifikovano. SHA fix propagacija + brief update u toku.**
