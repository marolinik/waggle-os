# LOCKED — Engineering Audit Findings → Track 1 Backlog

**Date:** 2026-04-19
**Status:** LOCKED
**Source:** briefs/2026-04-19-engineering-audit-pre-benchmark.md

---

## Decision

Pre-benchmark audit oba repo-a je izvršen read-only. Svih sedamnaest Critical nalaza iz `cowork/Code-Review_*.md` serije verifikovano je kao zatvoreno u izvoru, sa eksplicitnim `Review Critical #N` / `Review C1` / `Review C2` markerima koji imenuju originalni failure mode i novo rešenje. Hot path je čist.

Audit je identifikovao **dva Must-Fix pre-benchmark item-a** koji ulaze u Track 1 backlog pre nego što Track 2 (tri benchmarka paralelno) može da krene.

---

## Must-Fix pre-benchmark (ulazi u Track 1)

**H-AUDIT-1 — Minimum viable trace IDs u hot-path logger pozivima.**
Half-day estimat. Thread-ovati `turnId` (UUID v4 generisan na ulazu orchestrator/agent-loop/chat-route) kroz postojeće `logger.*` pozive u `orchestrator.ts`, `cognify.ts`, `tools.ts`, `combined-retrieval.ts`, `prompt-assembler.ts`, agent-loop. Append kao strukturni field. Nije OpenTelemetry, samo correlation ključ. Bez ovoga, Track 2 debug petlje postaju open-ended 1-2 engineer-day po non-obvious failure-u.

**H-AUDIT-2 — Bench measurement decision: cognify wall-clock vs recall correctness only.**
Nije code fix, bench-spec odluka. Ako bench scoring rubric uključuje wall-clock latency po cognify ciklusu, Cognify Major #2 O(E²) relation-side query path će skeweovati broj. Ako merimo samo recall correctness, O(E²) ostaje Track 3 concern.

**Preporuka:** Odluči. Ako wall-clock → fiksiraj Cognify Major #2 (1 dan, batch relation lookups u jedan `WHERE source_id IN (...)`). Ako correctness only → dokumentuj u bench README kao known measurement caveat (10 minuta).

Ovo je bench-design poziv Marka ili bench owner-a pre nego što Track 2 starta. **Nije opciono za deferovanje.**

---

## Ukupni Must-Fix obim

**Dva item-a, jedan engineering dan u najgorem slučaju.** Half-day trace IDs + (0 ili 1 dan) bench fix zavisno od H-AUDIT-2 odluke.

Claude Code može apsorbovati H-AUDIT-1 u postojeći Polish PR ciklus. H-AUDIT-2 je 30-minutni design razgovor + implementaciona posledica.

---

## Should-Fix tokom UI/UX prozora (Track 3)

Ne blokiraju Track 2, ali trebaju da budu rešeni pre launch copy lock-a:

- **T3-AUDIT-1:** Compliance test suite u `packages/core/tests/compliance/` (644 linija audit-critical koda bez dediciranih testova). Half-day do 1 dan. Kritično za EU AI Act regulatorno pozicioniranje u launch copy-u.
- **T3-AUDIT-2:** `npm audit --workspaces` pass (2h).
- **T3-AUDIT-3:** Cognify O(E²) relation-side fix (1 dan) — samo ako H-AUDIT-2 kaže bench meri wall-clock.

---

## Post-launch backlog (T+30)

- `riskClassifiedAt: null` placeholder u `report-generator.ts:52`
- `tokensUsed: 0` stub u `fleet.ts:32`
- WebSocket gateway TODO u `gateway.ts:91`
- Unifikacija design system-a između `apps/web` i `apps/www`
- Logger evolucija iz `console.*` wrapper-a u Pino + file rotation + optional telemetry sink
- Re-evaluacija `evolution-gates` modula prema Track 3 user feedback-u
- Decommission `cachedSection` indirection ako se drugi consumer ne pojavi do v1.1
- React 18.3 + RTL 16 `renderHook` mismatch (jedan failing test, kozmetika)

---

## Why

Read-only audit je bio deo three-track sequencing-a (LOCKED 2026-04-19) upravo da bi se ova tačka odluke legitimno zatvorila pre nego što benchmarkovi krenu. Bez toga, Track 2 broj bi mogao biti kompromitovan tihim bug-om, što bi onda uništilo SOTA-gated launch commitment (LOCKED 2026-04-18).

Bottom line: Codebase je u materijalno boljem stanju nego u trenutku code review faze. Track 2 dobija zeleno svetlo čim H-AUDIT-1 i H-AUDIT-2 budu u redu.

---

## How to apply

1. H-AUDIT-1 ide u Polish PR redosled pre H-35 binary smoke final. Claude Code ga može preuzeti odmah.
2. H-AUDIT-2 je Markov poziv (ili bench owner-a ako je delegiran). Pitanje: "Da li bench scoring ukljucuje wall-clock po cognify ciklusu ili samo recall correctness?" Odgovor diktira sledeći korak.
3. Kada oba budu zatvorena, Track 2 H-42/H-43/H-44 kreću paralelno na Qwen/Qwen3.6-35B-A3B engine-u, sa judge ensemble iz original decision file-a.
4. T3 stavke ulaze u UI/UX prozor koji već teče paralelno.

Svako buduće pomeranje ove sekvence zahteva novu LOCKED odluku.
