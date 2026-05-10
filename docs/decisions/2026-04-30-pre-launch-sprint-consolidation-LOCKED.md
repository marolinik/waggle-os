# LOCKED Decision — Pre-Launch Sprint Consolidation

**Date:** 2026-04-30
**Status:** LOCKED
**Author:** PM
**Ratified by:** Marko (2026-04-30: "sve yes potvrdjeno", konsolidovan plan + 5 benchmark portfolio asks + Interpretacija A repo arhitektura + paralelizacija svih track-ova pre launch)
**Supersedes:** Phase 5 canary deployment semantika (preserved infrastructure stays kao reusable artifacts)
**Binds:** Pre-launch sprint Days 1-12 + post-launch 12-week sequencing
**Cross-references:**
- `decisions/2026-04-29-phase-5-scope-LOCKED.md` (preserved scope: claude::gen1-v1 + qwen-thinking::gen1-v1)
- `decisions/2026-04-29-phase-5-brief-LOCKED.md` (preserved infrastructure)
- `decisions/2026-04-30-phase-5-cost-amendment-LOCKED.md` (preserved cost amendment)
- `decisions/2026-04-30-branch-architecture-opcija-c.md` (preserved branch architecture)
- `briefs/2026-04-29-benchmark-portfolio-refresh-2026-venues.md` (5 ratifikacija sve YES)

---

## §1 — Strateški reset (zašto)

Phase 5 brief je bio izveden iz Faza 1 thinking-a koji je pretpostavljao production traffic za canary staged rollout. Realnost je da Waggle nije launchovan — nema production traffica. Canary semantika je strukturalno pogrešna u pre-launch kontekstu.

PM (ja) je ovo trebao da flaguje pre nego što je Phase 5 brief LOCKED 2026-04-29. Marko je ispravno korigovao 2026-04-30 nakon što je CC emit-ovala "PHASE 5 CANARY DAY 0 LIVE" sa expectation produkcionog traffic-a koji ne postoji.

Reset: Phase 5 §1-§5 implementacija (manifest, monitoring infrastructure, canary toggle, 2609 testova) je preserved kao reusable infrastructure za extended e2e validation (Gaia2 + custom workload). Canary semantika dropped. Pre-launch fokus je na pet stvari paralelno koje vode ka Day 0 launch unutar 8-12 dana.

---

## §2 — Dva proizvoda, ne tri (Interpretacija A repo arhitektura)

**Waggle** — consumer agent product, desktop app (Tauri 2.0), korisnik kupuje za Solo $19 / Pro $49. Ima u sebi GEPA-evolved harness (Faza 1 validovan, +12.5pp Pass II preko Claude/Qwen/GPT shapes), Memory app, Wiki app, dock, sve user-facing. Ide na Stripe + landing + launch.

**hive-mind** — OSS substrate + svi klijenti zajedno. Apache 2.0 license, foundational tehnologija + arxiv paper. Memory layer (sqlite + bitemporal KG + MPEG-4 frame compression) + svi hooks adapter packages (Claude Code + Cursor + Hermes + OpenClaw + Codex + Claude Desktop + Codex Desktop) + CLI + MCP server + wiki compiler. Distribuirano kroz npm packages + GitHub repo. OSS Day 0 push sa SOTA claim.

**Drop hive-mind-clients kao zaseban concept.** Sav sadržaj migrira u `D:\Projects\waggle-os\packages\hive-mind-*\` monorepo strukturu. Korisnik vidi jedan brand "hive-mind" sa slojevima.

**Repo struktura — jedan repo waggle-os:**

```
waggle-os/
  apps/
    web/         — Waggle desktop UI (Tauri 2.0)
    agent/       — Waggle agent loop
  packages/
    hive-mind-core/                 — substrate (sqlite + KG + frame compression)
    hive-mind-cli/                  — CLI (migrated from D:/Projects/hive-mind/packages/cli)
    hive-mind-hooks-claude-code/    — Wave 1 patch
    hive-mind-hooks-cursor/         — Wave 2
    hive-mind-hooks-hermes/         — Wave 3
    hive-mind-hooks-openclaw/       — Wave 3
    hive-mind-hooks-codex/          — Wave 3
    hive-mind-hooks-claude-desktop/ — Wave 3
    hive-mind-hooks-codex-desktop/  — Wave 3
    hive-mind-wiki-compiler/        — postojeći iz hive-mind repo
    hive-mind-mcp-server/           — postojeći iz hive-mind repo
    agent/                          — postojeći (Waggle agent harness package)
    core/                           — postojeći (Waggle core package)
    [ostali postojeći waggle-os packages]
```

**OSS distribution strategy:** `git subtree split` periodično iz waggle-os monorepo u zaseban javni GitHub repo (`github.com/marolinik/hive-mind` ili `github.com/egzakta/hive-mind`). Apache 2.0 license samo na packages/hive-mind-*. Apps/web + apps/agent ostaju proprietary u monorepo waggle-os.

---

## §3 — 9 paralelnih track-ova pre launch (Days 1-12)

**Track A — UI/UX finalize u Claude Design (PM kroz Computer Use + Marko reviewing):** Resume "waggle app" prototype review koji sam pauzirao. Detaljan UX critique sva states (Memory app full + Wiki app integracija + Tweaks panel sve opcije + dock pozicija centriran + onboarding flow + empty states + error states + accessibility). Iteracije sa Markom u istoj Claude Design sesiji. ETA 2-3 dana. Output: ratified UI/UX spec sa screenshots + interaction notes.

**Track B — CC Sesija A: Waggle apps/web backend integration:** Krene paralelno odmah sa stub UI komponentama. hive-mind substrate ↔ Waggle agent ↔ Memory app ↔ Wiki app wiring. Tauri 2.0 build pipeline za Win + macOS. Onboarding flow. Tests. Posle Track A ratifikuje spec, CC adapter UI komponente prema final design u poslednjoj iteraciji. ETA 5-7 dana. Output: instalabilan test build za Computer Use e2e.

**Track C — CC Sesija B: hive-mind monorepo migration:** Drop hive-mind-clients, konsolidacija u waggle-os/packages/hive-mind-* sa svim hooks adapter packages, Wave 1 cleanup brief execution (postinstall + hook root patch + dead-simple cross-platform), Apache 2.0 + CONTRIBUTING.md, OSS subtree split prep za GitHub. Tricky merge tri divergentne grane (gepa-faza-1 + feature/c3-v3-wrapper + main). ETA 3-5 dana. Output: konsolidovan repo + javni hive-mind GitHub spreman za Day 0 push.

**Track D — CC Sesija C: Gaia2 ARE setup + GEPA dry verification:** Setup `facebookresearch/meta-agents-research-environments` lokalno, verify GEPA-evolved `qwen-thinking::gen1-v1` runs against Search split bez harness modifikacije, ERL methodology integration plan u retrieval-agent-loop.ts, dry run cost validation (~$5-10). Paralelno sa Sesija A i B. ETA 1-2 dana. Output: spreman za post-launch Phase 3 sprint Week 4-8.

**Track E — Landing v3 draft (PM autoring):** Faza 1 brojevi u Proof Card 1, CTA (waiting list ili download), reference na hive-mind OSS. ETA 2-3 dana drafting. Output: spreman za Day 0 deploy.

**Track F — Arxiv skeleton + drafting (PM autoring + Marko ratifikacija):** Skeleton iz postojećeg outline + §5 refresh sa Faza 1 evidence + ERL methodology framing. Marko ratifikuje 7 decision points (10 min). PM drafting 7-9 dana. Marko review + revisions. Output: arxiv preprint spreman za Day 0 submit.

**Track G — Persona scripte za Computer Use e2e (PM autoring + execution):** Tri persona scripte (Solo + Pro + outlier) autoring odmah. Posle Track B daje build, ja prolazim kroz Computer Use, beleziim friction, iteriramo. Marko gleda finalni walkthrough kao reviewer. ETA 3-5 dana posle Track B.

**Track H — Hermes intel update (PM autoring):** Update Waggle Competitive Intelligence dokumenta sa Hermes Agent entry + 6 defensive Waggle differentiators. ETA 1 dan.

**Track I — Stripe + Egzakta legal (Marko-side, paralelno):** Stripe live mode setup (4 price IDs: Solo $19 / Teams $49 / annual variants). Egzakta legal kickoff (privacy policy + ToS + DPA + trademark Waggle/hive-mind/KVARK). Trajanje per Marko bandwidth.

---

## §4 — Day 0 launch deliverables

Sve sledeće deploy-uje se zajedno u jednom Day 0 prozoru per coupled launch sequencing iz benchmark portfolio brief-a:

1. **GitHub push hive-mind** (Apache 2.0, public repo sa SOTA claim u README + arxiv link + CONTRIBUTING.md)
2. **arxiv preprint live** (cs.AI primary, cs.CL secondary, sa Faza 1 + GEPA + ERL framing evidence)
3. **Waggle landing live** (Faza 1 brojevi u Proof Card 1, CTA download ili waiting list)
4. **Stripe products live** (4 price IDs aktivirani)
5. **Waggle desktop app** download (Win + macOS) — ako Track B + Track G zatvoreni; inače waiting list (Clerk) sa download link u email-u kad bude spreman

ETA: **8-12 dana od 2026-04-30** = 2026-05-08 do 2026-05-12 prozor.

---

## §5 — Post-launch 12-week sequencing (per benchmark portfolio brief §5)

**Weeks 2-4:** Hermes Agent competitive intel update u marketing materijale. Pitch deck slides re-run.

**Weeks 4-8: Phase 3 Gaia2 sprint.** Build na Gaia2 prep iz Track D. ARE platform već setup, qwen-thinking::gen1-v1 verifikovan na Search split. ERL-style heuristic retrieval wiring iz hive-mind u agent system prompt. N=200 dry run + full Search + Execution split sa ReAct baseline + ERL-augmented. Trio-strict + self-judge dual reporting. Submission MemAgents Workshop. Cost ~$25-40.

**Weeks 8-12: Phase 4 τ³-bench banking_knowledge sprint** (KVARK enterprise track). tau2-bench setup sa banking_knowledge extras. hive-mind retrieval pipeline kao RAG provider. N=200 full run sa frontier subject (Opus 4.7 + GPT-5.4) + Qwen subject za sovereignty story. Submission taubench.com community leaderboard. KVARK enterprise sales one-pager sa verifikovanim third-party broj. Cost ~$30-50.

Post-Phase-3-Phase-4 (post Week 12): integration sprint da merge tri divergentne grane u main + cross-stream test harmonizacija + branch hygiene check (per `decisions/2026-04-30-branch-architecture-opcija-c.md` §5).

---

## §6 — Šta je preserved iz Phase 5 work (ne baceno)

CC je radila §0 + §1-§5 implementaciju i emit-ovala "Phase 5 Day 0 LIVE". Ti artifacts ostaju kao reusable:

- **Phase 5 manifest.yaml** (315 linija, 22 KB) — formal deployment scope deklaracija. Reusable kao base za extended e2e validation manifest.
- **phase-5-router.ts + feature-flags.ts** (PHASE_5_CANARY_PCT, 29 tests) — feature flag infrastructure. Reusable za beta launch staged rollout post-launch.
- **phase-5-monitoring.ts** (5 emitters + rollback detectors, 33 tests, daily-summary CLI) — logging tooling. Reusable za extended e2e validation logging.
- **Phase 5 cost amendment** ($75 hard / $60 halt) — preserved kao precedent za future production deployment cost discipline.
- **Branch architecture Opcija C decision** — preserved kao binding rule za Phase 5 baseline.

Tagovi `v0.1.0-faza1-closure` (6bc2089) i `v0.1.0-phase-5-day-0` (a8283d6) safe na origin za immutable audit reference.

---

## §7 — Marko-side queue (ratifikacije + paralelni rad)

**Ratifikovano 2026-04-30 ("sve yes potvrdjeno"):**
1. ✅ Konsolidovan plan (5+9 paralelnih track-ova pre launch + 12-week post-launch)
2. ✅ Benchmark portfolio refresh — sve 5 ratifikacionih asks YES (Gaia2 + τ³ + ERL + Hermes intel + 12-week sequencing)
3. ✅ Interpretacija A repo arhitektura (drop hive-mind-clients, monorepo waggle-os/packages/hive-mind-*)

**Pending (kad bude bandwidth):**
4. Arxiv 7 decision points ratifikacija (10 min posle skeleton predaje)
5. UI/UX iteracije sa PM kroz Claude Design "waggle app" prototype (Track A reviewing)
6. Paste tri CC sesije (A + B + C) kad PM preda briefs
7. Stripe live mode setup (Track I)
8. Egzakta legal kickoff (Track I)
9. Final review e2e walkthrough na kraju (Track G)
10. Day 0 GitHub push + arxiv submit + landing deploy + Stripe activation

**Worktree cleanup deferred:** `D:\Projects\waggle-os-faza1-wt` ima modified/untracked files. `--force` ili manual review kad bude bandwidth. Nije launch blocker.

---

## §8 — Audit trail anchors

- Phase 5 reset: Phase 5 deployment v2 brief LOCKED + cost amendment + branch architecture sve preserved
- Benchmark portfolio: `briefs/2026-04-29-benchmark-portfolio-refresh-2026-venues.md`
- 9 paralelnih track-ova: this decision memo §3
- Day 0 deliverables: this decision memo §4
- Post-launch 12-week: this decision memo §5
- Repo state safe na GitHub: `marolinik/waggle-os` (4 grane + 2 tagova) + `marolinik/hive-mind` (3 grane synced)

---

**End of LOCKED decision. Pre-launch sprint AUTHORIZED. PM autoring batch (briefs + landing + arxiv + persona scripte + Hermes intel) krenuo 2026-04-30 evening session.**
