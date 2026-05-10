# LOCKED Decision — Track H Hermes Intel Canonical Integration

**Date:** 2026-05-02
**Status:** LOCKED
**Author:** PM (decision memo authored retroactively 2026-05-05 to close decisions/ folder gap iz consolidation 2026-05-04)
**Ratified by:** Marko (Track H ratifikacija u pre-launch sprint Day 2; explicit "uradi to sve" 2026-05-05 to author missing decision memos)
**Binds:** Day 0 launch messaging discipline, KVARK pitch deck slide 3 (Related Work), arxiv §6 Related Work, landing trust signals (Trust Band Card 6 fast-follow), marketing communication discipline (no Twitter/HN engagement sa Hermes maintainers)
**Cross-references:**
- `strategy/competitive/2026-04-30-hermes-agent-intel-update.md` (intel update, primary source)
- `research/2026-04-22-hive-mind-positioning/04-competitive-landscape.md` (canonical competitive doc, target za 6 surgical edits)
- `decisions/2026-04-30-pre-launch-sprint-consolidation-LOCKED.md` (Track H sequencing)
- `briefs/2026-04-29-benchmark-portfolio-refresh-2026-venues.md` (peer-reviewed benchmark portfolio strategy = unbridgeable moat za 2026)
- `handoffs/2026-05-02-day-0-readiness-checklist.md` (Track H row update target)
- Memory entry `project_track_h_closed_2026_05_02.md` (point-in-time observation, primary source)

---

## §1 — Trigger

Hermes Agent novi competitor pojavio se 25. februara 2026 sa ~110.000 GitHub stars 10 nedelja post-launch (arhitektura: closed learning loop, MEMORY.md/USER.md prompt memory + SQLite FTS5 episodic + auto-generated procedural skills, Nous Research). Pre 2026-04-30, canonical competitive doc je pominjao "Hermes" SAMO u kontekstu Nous Hermes AI coding client (consumer of MCP servers — friendly distribution, ne competitor). Pre-launch sprint Track H ratifikovao integraciju Hermes Agent kao closed learning loop competitor sa direct architectural-philosophy overlap (self-improving agent narrative).

---

## §2 — 6 surgical edits ratifikovani

### Edit 1 — Header naming disambiguation

Razdvajanje:
- **"Hermes"** = Nous coding client, consumer of MCP, *friendly distribution channel*
- **"Hermes Agent"** = Nous closed learning loop product, *competitor*

Konzistentno korišćenje ova dva termina kroz canonical doc.

### Edit 2 — §1.11 Hermes Agent profile (NEW)

Pun profile sa:
- **Architecture:** closed learning loop sa MEMORY.md/USER.md prompt memory + SQLite FTS5 episodic + auto-generated procedural skills
- **Launch date:** 25. februar 2026
- **Adoption velocity:** ~110K stars za 10 nedelja
- **Benchmark claim:** internal-only "40% speedup", no peer-reviewed engagement
- **Threat level:** MEDIUM-HIGH

### Edit 3 — §2.1 Positioning Matrix update

Hermes Agent ide u **"Pure Local-first + Flat/Vector"** cell (alongside Basic Memory i Claude Memory Tool). Ne contests "Pure Local-first + Graph/Structured" quadrant gde hive-mind sedi. Competes through *narrative overlap* ne *architectural overlap* — to je strateški značajno jer naš odbrambeni argument ne sme biti "mi smo isti, samo bolji" nego "mi smo strukturalno drugačiji".

### Edit 4 — §3 SWOT Threats (added Hermes Agent threat point)

Šest unaddressed structural moats koje hive-mind ima a Hermes Agent nema:
1. Bitemporal graph
2. I/P/B framing (MPEG-4 inspired frame model)
3. MPEG-4 compression metafora i implementacija
4. Modular npm packages (selektivna instalacija)
5. EU AI Act audit triggers
6. Peer-reviewed benchmark portfolio (LoCoMo + GEPA + forthcoming Gaia2 + τ³-bench banking_knowledge)

### Edit 5 — §5 Bottom Line update

Hermes Agent consideration paragraf, defensible response = peer-reviewed-style benchmark portfolio. Day 0 launch mora **explicitly** pokriti svih 6 differentijatora — bez toga, prvi Hacker News thread sa "isn't this just Hermes Agent?" comments hits Day 0 sales without prepared counter-message.

### Edit 6 — §6 Sources (added Hermes Agent reference)

Reference na intel update file path + benchmark portfolio brief reference.

---

## §3 — Marketing communication discipline

Per §3.2 intel update, sledeća pravila su LOCKED:

1. **Do NOT release Hermes-specific marketing copy** that compares feature-by-feature publicly. Lead with positive Waggle positioning.
2. **Mention Hermes only u technical contexts** — arxiv §6 Related Work, KVARK pitch slide 3 Related Work. Ne u landing copy, ne u social posts.
3. **Do NOT engage Hermes maintainers u Twitter/X/Hacker News threads.** No subtweet, no quote-RT, no comment-section presence.
4. **Lead sa positive Waggle positioning** — naš narativ je "memorijski substrate sa peer-reviewed dokazom", a *ne* "smo bolji od Hermes-a".

---

## §4 — Posledice za Day 0 i downstream

1. **KVARK pitch deck slide 3 (Related Work):** copy 6 differentijatora iz §3 Threats Hermes Agent paragraf, format kao two-column comparison sa Hermes Agent. Action item za KVARK sprint Weeks 8-12.

2. **Arxiv §6 Related Work:** Hermes Agent sa 110K stars je MUST-mention u Related Work, citation za Nous Research launch + comparison vs hive-mind methodology. Ulazi u drafting per `decisions/2026-05-02-track-e-arxiv-7-decisions.md`.

3. **Landing trust signals (apps/www CC Sesija D Phase 2 fast-follow):** opcional addition Trust Band sixth signal *"Independently benchmarked vs OSS peers"* sa link na arxiv preprint koji explicitly compares vs Hermes Agent. Fast-follow, ne Day 0 blocker.

4. **Pre-launch sprint Track H status:** sad CLOSED. Pre-launch sprint memorija `project_pre_launch_sprint_2026_04_30` Track H entry refreshovan u sledećem sprint update-u sa CLOSED status. Day 0 readiness 1-pager `handoffs/2026-05-02-day-0-readiness-checklist.md` Track H row update sa 🟢 done.

---

## §5 — Strateški closure

Day 0 messaging mora **pre-empted** da pokrije svih 6 differentijatora. Prvi Hacker News thread će *zagarantovano* sadržati "isn't this just Hermes Agent?" comment. Bez Track H integration, taj komentar je oblak nad celim Day 0 ciklusom — sa Track H-em, taj komentar je *ranije već dosegnut* od strane našeg pripremljenog narativa.

`+12.5pp / Qwen 35B / LoCoMo benchmark portfolio = unbridgeable moat za 2026.` Hermes Agent ne može da reproducira peer-reviewed benchmark seriju za 6+ meseci. To je naš sigurnosni jastuk dok se peer-review prozor zatvara.

---

## §6 — Authoring trace

Ova decision memo je autorizovana **retroactively 2026-05-05** kao deo pop-up-a četiri-fajla decisions/ folder gap-a koji je flagovan u `project_execution_state.md` snapshot 2026-05-04. Sadržaj reflektuje point-in-time observation iz `project_track_h_closed_2026_05_02.md` memorije.

Razlog za retroaktivnu autorizaciju: per CLAUDE.md decision memo discipline, svaka LOCKED odluka mora imati matching `decisions/<date>-<topic>.md` fajl. Memorija postoji ali memorija nije auditable artifact (živi u Cowork space-u, nije u git-u).

**END DECISION MEMO.**
