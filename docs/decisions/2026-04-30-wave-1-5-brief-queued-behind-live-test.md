# LOCKED — Wave 1.5 Memory Architecture Fix Brief — QUEUED iza Live Test sesije

**Datum:** 2026-04-30
**Autor:** PM
**Status:** LOCKED ("stavi u red, prvo testirmo pa onda dalje")
**Cross-reference:** `feedback_memory_systems_coexistence.md` + `D:\Projects\memory-architecture-audit-2026-04-29.md` (audit sa 10 gap-ova G1-G10)

---

## Odluka

Wave 1.5 brief authoring se **ne pokreće** dok PM i Marko ne završe dedicated live test sesiju (ili više njih) na Marko-ovoj mašini, gde verifikujemo:

1. **Coexistence verifikaciju:** Claude Code MEMORY.md fajl-bazirana memorija + hive-mind sqlite memorija rade paralelno bez konflikta tokom live CC sesije
2. **Mirror hook bridge mehanizam:** hash-file portability između dva sistema radi clean preko Win32 platforme; bez race conditions, bez tihih fail-ova
3. **G1-G10 audit gap-ovi u praksi:** koji su replicable na Marko-ovoj mašini, koji su artifact prethodne sesije, koji su edge cases koji se ne pojavljuju u standard workflow-u
4. **Workflow patterns u Claude Code-u:** kako Marko realno koristi MEMORY.md vs hive-mind kroz dan, šta zaista live u kojoj memoriji i kada

Na osnovu real findings sa live test sesije, Wave 1.5 brief se autorize-uje sa eksplicitnim §0 gate koji referencira live test session report (datum + nalaz po nalazu).

---

## Razlog

Pre-launch stakovi su previsoki da bi se Wave 1.5 P0 brief autorizovao "sa CC strane" bez verifikovane osnovice. Audit dokument (G1-G10) je tvoj observation-based snimak — ali audit je iz 2026-04-29, bridge mehanizam se evoluirao kroz CC Sesija B Wave 1 cleanup (627-line bundled hook asset, postinstall.cjs fix, hive-mind-cli doctor smoke), pa je deo gap-ova možda već uklonjen u međuvremenu. Drugo, scope coexistence constraint (LOCKED 2026-04-30) menja kako se neki od gap-ova adresiraju — npr. G7 hash-file portability je sad load-bearing, što u original audit dokumentu nije bio prioritet.

Bolja sekvenca je: (a) live test session nam daje verified gap inventory + verifikovanu workflow taksonomiju + verifikovani coexistence patterns; (b) tek onda Wave 1.5 brief sa real evidence i jasnim definition-of-done; (c) CC kickoff sa §0 gate koji blokira ako brief ne odražava live findings.

---

## Šta NE radimo dok ne završimo live test

- Ne autorize-uje Wave 1.5 brief
- Ne pokreće CC stream za hive-mind side memory polish
- Ne menja Track G persona scripte u smeru memory walkthrough (čeka real workflow patterns)
- Ne lock-uje arxiv §5.4 dogfood paragraf koji opisuje memory layer (čeka workflow validaciju)
- Ne lock-uje KVARK pitch slide o memory differentiator-u (čeka workflow validaciju)

---

## Šta radi paralelno (ne blokirano live testom)

- CC A integration sprint priprema (kad bude trigger, post Wave 1.5)
- Track A UI/UX Pass 2 review na updated Claude Design prototype (čim Marko ratifikuje fix preporuke iz Pass 1)
- arxiv §1-§3 + §5.1-§5.3 + §6-§10 finalize (memory dogfood §5.4 ostaje placeholder)
- Landing v3 finalize (proof card 1 ima Faza 1 brojeve, ne traži memory dogfood data)
- Stripe products + Egzakta legal kickoff (Marko-side)
- Hermes intel integration u canonical competitive doc

---

## Live test sesija — operativni format (PM predlog)

**Trajanje:** 60-90 min PM + Marko, sinhrono na Marko-ovoj mašini kroz Computer Use ili screen-share equivalent
**Preduslovi:** clean Claude Code sesija + hive-mind installed sa najsvežijom Wave 1 cleanup verzijom (CC B branch a10867c ili merged main posle integration sprint)
**Skripta:** PM autoring dan pre sesije, 8-10 koraka koji systematic-ally prolaze kroz svih 10 audit gap-ova + coexistence patterns + tipičan dnevni workflow (3-4 tasks)
**Output:** session report sa tabelom (G# × replicable yes/no/partial × notes) + workflow log + screenshot capture × kritični trenuci + Wave 1.5 P0 / P1 / P2 razrešenje na bazi findings

**Predlog za zakazivanje:** Marko bira slot u sledećih 48-72h (1-3 svibnja). PM priprema skriptu 24h pre slot-a.

---

## Audit trail anchors

- Coexistence LOCK: `feedback_memory_systems_coexistence.md`
- Audit dokument source: `D:\Projects\memory-architecture-audit-2026-04-29.md`
- CC B closure: `project_cc_sesija_b_closed_2026_04_30.md` (Wave 1 cleanup u §2.4)
- Pre-launch sprint context: `decisions/2026-04-30-pre-launch-sprint-consolidation-LOCKED.md`
- This decision: `decisions/2026-04-30-wave-1-5-brief-queued-behind-live-test.md`

---

**End of decision. Wave 1.5 brief on hold pending live test slot Marko ratifikacija.**
