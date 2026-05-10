# Day 0 Readiness Checklist — 2026-05-02 Jutro

**Datum:** 2026-05-02 jutro CET
**Status:** Sprint Day +2 od pre-launch konsolidacionog memo (2026-04-30)
**ETA Day 0:** 6-10 dana (8-12. maj prozor)
**Cilj ovog dokumenta:** vidljivost svih 9 paralelnih track-ova + jasna preporuka šta ide sledeće danas

---

## 9 paralelnih track-ova — status

| Track | Naziv | Status | Action owner | ETA |
|-------|-------|--------|--------------|-----|
| **A** | apps/web (Workspace OS) | 🟢 SHIPPING-READY | — | done (Pass 7 + Block C) |
| **B** | hive-mind monorepo OSS | 🟡 Push gate parkiran do Day 0 minus 1 | **MARKO** | 30-60 min Day 0 prep |
| **C** | Gaia2 ARE | ⚫ Post-launch deferred | — | not v1 |
| **D** | Landing v3.2 → apps/www port | 🟡 §1+§2 done (commit c4b0c04), §3 i18n+Stripe+Lighthouse u toku | CC + PM standby | ~60-90 min remaining |
| **E** | Arxiv preprint | 🟢 7-decision RATIFIED CLOSED 2026-05-02; A+D path locked; drafting can start, ne blokira Day 0 | **MARKO sutra** Pavlukhin EVOLVESCHEMA + PM drafting | 7-9 dana drafting + 5-6 dana endorsement (Path A) |
| **F** | UI/UX Pass 1+2 | 🟢 Done | — | done |
| **G** | E2E persona scripte | 🟡 Scripte ready, kreće posle apps/www live | PM (post-D) | tbd |
| **H** | Hermes intel canonical doc | 🟢 CLOSED 2026-05-02 sa 6 surgical edits u canonical doc | — | done |
| **I** | Stripe + legal pages | 🟡 Stripe sutra ponedeljak (finance ekipa), legal Marko-side TBD | **MARKO ponedeljak+** | varies |
| **NEW** | **Methodology markdown doc** (Path D Trust Band swap target) | 🟡 Mora biti live u OSS repo pre Day 0 | **PM** | 30-45 min draft |

**Legenda:** 🟢 done · 🟡 in-flight ili pending · 🔴 blocked · ⚫ deferred

---

## Šta je smart paralelno DANAS (dok CC u Sesija D)

### Marko-side action queue (može odmah, ne čeka mene)

1. **Track B push gate** (5 min) — `cd D:\Projects\waggle-os && git push`. To ti je urađeno za apps/www port, ali subtree split scripts za hive-mind OSS mogu se izvršiti paralelno. Plus PR #1 (sibling sync hook) za merge u hive-mind. Non-blocking ali bolje da zatvorimo pre Day 0 checkliste.

2. **Track I Stripe keys** (15-30 min) — paste real Stripe live keys u Vercel env (ili wherever production env lands). CC u Sesija D koduje internal /api/stripe/checkout sa placeholders; tvoja akcija je da prebaci pk_test_REPLACE_ME → pk_live_xxx + sk_test_REPLACE_ME → sk_live_xxx pre nego što landing ide live.

3. **Track I legal pages** (1-2h) — privacy.md, terms.md, cookies.md, EU AI Act statement. Mogu biti templated iz Egzakta Group postojećih advisorska legal materijala. CC pravi /app/(legal)/ folder strukturu u Sesija D, ali content stringovi su Marko-side (jurisdikcija + Egzakta entity references).

### PM-side queue (ja vodim solo dok CC radi)

4. **Track H Hermes intel integration** (30-45 min) — autorajem update postojećeg canonical competitive doc-a sa Hermes findings. Tightens competitive moat narrative pre Day 0. Cilj: Hermes findings live u canonical reference koji se koristi za KVARK pitch + arxiv §6 + landing trust signals.

5. **Memory entry consolidation** (15 min) — MEMORY.md indeks sad raste, treba pruning + reorganizacija po prioritetu. Cleanup batch zadatak.

### Interactive queue (treba Marko bandwidth)

6. **Track E arxiv 7-decision ratification** (30-45 min) — slično kao landing v3.2 sesija danas, ja izvučem 7 decisions iz arxiv skeleton, ti ratifikuješ jednu po jednu, output je v1 ratified arxiv outline spreman za section-by-section drafting. Pre-launch dependent (arxiv preprint link je u Trust Band card u landing-u).

7. **Memory live test sesija** (60-90 min) — skripta iz overnight 2026-04-30 spremna, čeka tvoj slot. Output je session report koji postaje §0 evidence base za Wave 1.5 brief.

8. **Wave 1.5 Memory Architecture Fix brief** (45-60 min) — može doći posle memory live test, ja autorajem brief za P0+P1 memory architecture audit gaps. Gate za clean memory story Day 0.

---

## Moja preporuka za sledeći potez

**Tri stvari u paraleli (ti + ja, dok CC dovršava §1-§4 apps/www port):**

1. **Marko:** kreni Track I Stripe keys (15 min) i Track B push gate (5 min) odmah. To je ~20 min Marko-side rada, niko te ne blokira, neutralizuje 2 launch-blocking stavke.

2. **PM (ja):** krećem Track H Hermes intel integration (30-45 min) odmah. Ne treba tvoja bandwidth, izvedem self-contained, output je gotov updated competitive doc.

3. **Posle ~30-45 min** — sastajemo se za Track E arxiv 7-decision ratifikaciju (30-45 min interactive). Do tog momenta CC će biti negde u §2 component port (50-70% kroz total). Ti vidiš CC progress notif paralelno.

**Posle arxiv ratifikacije** (~12:00-13:00 ako krećemo sad oko 9-10 ujutro), zavisno od CC stage:
- Ako CC završio Sesija D → krećemo PM Pass 8 + memory live test slot
- Ako CC još u toku → memory live test može da krene, Pass 8 sutra ujutro

**Ne sad:** Track G E2E persona scripte (čeka apps/www live), Wave 1.5 Memory brief (čeka memory live test findings), Track C Gaia2 (post-launch).

---

**Pitanje za tebe:** krećemo paralelno (ti Stripe+push, ja Hermes intel)? Ili predlažeš drugačiji order?
