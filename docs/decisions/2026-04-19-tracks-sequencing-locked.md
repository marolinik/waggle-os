# LOCKED Decision — Three-Track Sequencing to Launch

**Date:** 2026-04-19
**Status:** LOCKED
**Decided by:** Marko Marković

---

## Decision

Pre-launch rad organizuje se u tri paralelna track-a sa eksplicitnim sequencing-om i jednim gate-om.

### Track 1 — Polish A+B + standing pool (sequential, blocker)

Claude Code zatvara Polish Phase A+B prvo (H-01..H-06, ~6-8h, 6 stavki), pa onda H-35 binary smoke test postaje moguć. Posle toga radi standing pool prema prioritetu: ~35 HIGH stavki (polish close + proofs + papers prep + launch prep, **bez harvest** — harvest stream ostaje PARKED do post-launch), ~50 MEDIUM, ~22 LOW. Track 1 mora da završi pre nego što Track 2 krene.

### Track 2 — Tri benchmark-a paralelno (gate)

Čim Track 1 polish blocker padne, kreću tri benchmark-a paralelno:
- **H-42 LoCoMo** na hive-mind repo-u (memory recall, target ≥91.6% Mem0 SOTA)
- **H-43 LongMemEval** na waggle-os repo-u (agent long-term memory, baseline Letta ~83%)
- **H-44 SWE-ContextBench** na waggle-os repo-u (verovatnoća top-3 plasmana 60-70%)

Sva tri sa istim engine-om (Qwen/Qwen3.6-35B-A3B per LOCKED 2026-04-19) i istim 4-judge ensemble-om (gemini-3.1-pro-preview, gpt-5, grok-4.20, MiniMax-M2.7 — bez Anthropic-a, vendor circularity guard).

Track 2 je gate za launch: launch ne kreće bez SOTA proof per LOCKED 2026-04-18 odluci.

### Track 3 — UI/UX polish + e2e testovi (continuous)

Tokom benchmark window-a (Track 2), continuous polish na UI/UX friction stavkama i e2e test scenariji (Marko kao user u browser-u, persona skripte, friction log). Track 3 ne blokira ništa, ne čeka ništa, radi se kontinuirano u backgroundu. Output: launch-ready demo + screenshot/video kapital.

### Post-Track 2 — Launch ili rework

Dva ishoda kad benchmark rezultati dođu:
- **Brojevi drže launch narativ** → memo + papers + announcement + launch
- **Brojevi ne drže** → vraćamo se na PA tuning ili rekalibracija headline-a, ne idemo u launch sa polovičnim brojevima (SOTA-gated commitment)

Papers/research memo zaista idu zadnji — T+3 do T+4 nedelje posle launch-a, kao credibility builder za KVARK enterprise pipeline.

## Engineering audit umetnut između Track 1 i Track 2

Pre nego što Track 2 krene, PM agent (ne Claude Code) radi cross-cut engineering assessment koristeći skill set (cto-advisor + engineering:architecture/tech-debt/code-review/testing-strategy/documentation). Output je `briefs/2026-04-19-engineering-audit-pre-benchmark.md` sa tri kategorije nalaza:
- **Must fix before benchmark** → ulazi u Track 1 kao formalne H-XX stavke
- **Should fix during UI/UX window** → ulazi u Track 3
- **Post-launch backlog** → parking lot za T+30

Estimat audit-a: 2-3h. Scope: waggle-os puni audit + hive-mind release health check (build, install path, basic API surface).

## Rationale

Polish-first sekvenca je metodološki ispravna jer (a) skida tehnički dug koji bi inače curio u svaku benchmark meru, (b) bez polished hive-mind v0.1.x H-35 binary smoke ne staje, (c) clean repo + clean install instrukcije = veća kredibilnost benchmark broja kad ga objavimo. Paralelizam Track 2 funkcioniše jer su dva repo-a fizički nezavisna codebase-a — LoCoMo testira hive-mind core, SWE-CB i LongMemEval testiraju Waggle agent harness.

Track 3 paralelan tokom benchmark-a iskorišćava window kad inženjeri inače čekaju eval rezultate — productive use of dead time.

Engineering audit umetnut pre Track 2 je jeftin (2-3h) a sprečava skup ishod (benchmark broj kompromitovan tihim bug-om koji niko nije video). Bez audit-a, polish backlog reflektuje samo ono što je nekome zabolelo dovoljno da napiše ticket — sve ostalo curi.

## What this is NOT

- Nije linearno waterfall — Track 3 ide paralelno
- Nije commitment na launch ako brojevi ne drže (SOTA-gate aktivan)
- Nije priznanje da Polish C (UI/UX) može da blokira benchmark — Track 3 namerno ne blokira
- Nije prepisivanje H-34 LOCKED odluke (hive-mind extraction je gotov, npm shipped 2026-04-19)

## Next actions

1. Marko šalje paste-ready handoff Claude Code-u (vidi `briefs/2026-04-19-handoff-claude-code.md`)
2. Claude Code kreće Polish A+B
3. PM agent kreće engineering audit paralelno
4. Audit nalazi → polish backlog ažuriran → Track 1 zatvoren → Track 2 i 3 kreću
