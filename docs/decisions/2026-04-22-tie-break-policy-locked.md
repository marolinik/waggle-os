# Tie-break Policy — LOCKED

**Datum:** 2026-04-22
**Sprint:** 11 · Track B · Task B2 prerequisite
**Authority:** PM (Cowork, Claude Opus 4.7), confirmed by Marko 2026-04-22
**Effect:** B2 implementation UNBLOCKED. CC-1 cleared za `packages/server/src/benchmarks/judge/ensemble-tiebreak.ts` merge.
**Supersedes:** brief §3 B2 placeholder "Sonnet 4.6 kao fourth vendor" — fourth vendor is now `xai/grok-4.20`.

---

## 0. Verdict

**LOCKED.** Tie-break ladder za multi-vendor judge ensemble je trovrsta:

1. **3-0 consensus** → no tie-break, verdict trivijalan.
2. **2-1 majority** → no tie-break, verdict je majority.
3. **1-1-1 split** → trigger **quadri-vendor call** na `xai/grok-4.20`. Verdict je 2-vote majority među četiri glasa.
4. **1-1-1-1 four-way split** (sva četiri vendor-a različita) → **PM escalation** sa full vote vector dump i artefakt path.

Audit alarm: ako tie-break path (case 3 ili 4) prelazi **15% Stage 2 pitanja**, hard stop sa PM ping. Razlog: signal da osnovna trojka nije dovoljno diversifikovana ili da rubrika nije dovoljno deterministička — oba scenarija invalidiraju Sprint 10 Task 2.2 Fleiss' κ=0.8784 metodologiju.

---

## 1. Vendor matrica nakon LOCK-a

| Pozicija | Slug | Provider | LiteLLM route | Uloga |
|---|---|---|---|---|
| Judge 1 | `claude-opus-4-7` | Anthropic | `anthropic/claude-opus-4-20260201` | Primary |
| Judge 2 | `gpt-5.4-pro` | OpenAI | `openai/gpt-5.4-pro` | Primary |
| Judge 3 | `gemini-3.1-pro` | Google | `google/gemini-3.1-pro` | Primary |
| Judge 4 (tie-break only) | `grok-4.20` | xAI | `xai/grok-4.20` | Quadri-vendor on 1-1-1 |

**Vendor diversifikacija:** Anthropic + OpenAI + Google + xAI. Četiri nezavisna training lineage-a, nula provider-overlap-a. Konsistentno sa Sprint 10 LOCK odlukom da je Claude-only trio (Opus 4.7 + Sonnet 4.6 + Haiku) odbijen zbog homogene pristrasnosti.

---

## 2. Zašto Grok 4.20, ne Sonnet 4.6

Originalna Opcija 3 u brief §3 B2 navodila je `claude-sonnet-4-6` kao fourth vendor. Marko je 2026-04-22 redirektovao odluku: četvrti sudija mora da dođe iz potpuno nezavisne provider-familije.

**Šta bi se dogodilo da je Sonnet 4.6 ostao:**
- Tie-break poziv pravi 4-vendor ensemble strukture **2 Anthropic + 1 OpenAI + 1 Google**.
- Anthropic dobija 50% težine na rezolucijama gde drugi vendor-i ne mogu da se slože.
- Opus i Sonnet dele velike delove istog post-training corpus-a; verovatnoća da glasaju identično na rubrically-amibiguous case-u je strukturalno viša nego za par iz različitih familija.
- To je tačno suprotno od onoga što Sprint 10 LOCK-ovani princip ("multi-vendor zbog bias diversification") traži.

**Zašto Grok 4.20:**
- Released 2026-03-31, 2M context, lowest hallucination rate on market u nezavisnom benchmark-u koji smo verifikovali tokom PA v5 rada.
- Već wired u `D:\Projects\waggle-os\litellm-config.yaml` kao deo PA v5 frontier judge ensemble-a (commit od 2026-04-17).
- xAI key (`XAI_API_KEY`, 84 chars) potvrđen u `D:\Projects\waggle-os\.env`.
- Nula nove infrastrukture, nula novog troška za setup.

**Zašto ne Grok 4.3 Beta ili Grok 5:**
- Grok 4.3 Beta locked iza SuperGrok Heavy tier ($300/mo). Dodatni op-cost neopravdan za tie-break path koji se očekuje u <15% slučajeva.
- Grok 5 i dalje u training-u per public xAI roadmap (May 2026 ETA).
- Grok 4.20 je "latest available" za production use bez tier upgrade-a.

---

## 3. Implementaciona obaveza za CC-1 (B2)

Brief §3 B2 ostaje na snazi sa jednom delta-om:

**Delta:** Svaki references na `claude-sonnet-4-6` ili `Sonnet 4.6` u tie-break path-u → zameniti sa `grok-4.20` (LiteLLM route `xai/grok-4.20`).

Konkretno:

- Funkcija `resolveTieBreak(votes: Vote[])` u `packages/server/src/benchmarks/judge/ensemble-tiebreak.ts`:
  - Quadri-vendor branch poziva `xai/grok-4.20` (ne Sonnet 4.6).
  - `TieBreakResult.path = 'quadri-vendor'` ostaje isti string token (path semantika nepromenjena).
- 4 unit testa ostaju isti scenariji:
  1. **1-1-1 split** → trigger quadri-vendor call na grok-4.20, verifikuj da je tie-break-call poslat sa correct system prompt + rubric payload.
  2. **1-1-2 split** → already majority, no tie-break call.
  3. **2-1-1 split** → majority wins (2 glasa = verdict), no tie-break call.
  4. **3-0 consensus** → trivijalan verdict, no tie-break call.
- Observability: pino log `tie_break.path` ∈ `{none, majority, quadri-vendor, pm-escalation}` per case + `tie_break.fourth_vendor_slug` kad path = quadri-vendor (uvek `grok-4.20` u Sprint 11 scope-u, ali field je future-proof).
- Budget cap **nepromenjen na $0.20** za grok-4.20 calls u unit testu. xAI pricing comparable Anthropic Sonnet, no cost surprise.
- Wall-clock estimate **nepromenjen na 2-3h**.

PM LOCK ovog dokumenta precedes B2 merge per brief §6 exit criterion #5.

---

## 4. Anti-patterns (HARD STOP signali za CC-1)

1. **Predlozi da se Opus 4.7 koristi kao tie-break umesto grok-4.20** → HARD STOP. Opus je već Judge 1 — vraća na 2 Anthropic problem.
2. **Predlozi da se preskoči quadri-vendor i odmah ide na PM escalation za 1-1-1** → HARD STOP. PM escalation je rezervisana samo za 1-1-1-1 (četiri različita verdikta), ne za 1-1-1 (gde tri vendor-a već definišu pasterijski 3-element vote vector).
3. **Predlozi da se Grok 4.3 Beta ili Grok 5 koristi** → HARD STOP. Nije dostupan na našem tier-u, validacija budžeta i SLA su nedovršene.
4. **Predlozi da se reasoning_content fid u tie-break payload** → HARD STOP. Preusmerava na A2 anti-pattern §4 ratifikacionog dokumenta.

---

## 5. Audit threshold (15% trigger)

Ako tokom Stage 2 full-run-a (H-42a/b) tie-break path (quadri-vendor + pm-escalation cumulative) prelazi **15% od ukupnih pitanja**, harness HALT i ping PM. Tri moguća uzroka i odgovor:

- **Trojka osnovni vendor-a previše divergentna** → revisit rubric kalibracija pre nastavka.
- **Sample skew (pitanja na granici domena rubrike)** → curate sample, dokumentuj u decision doc, re-run.
- **Stvarna meta-disagreement na rubric-edge case-ovima** → eskalacija u Sprint 12 rubric refresh.

Nijedan od ova tri scenarija nije fail-state — svi su signal da metodologija traži update pre launch claim publication.

---

## 6. Reference

- Sprint 11 brief §3 B2: `briefs/2026-04-22-cc-sprint-11-kickoff.md`
- Sprint 10 multi-vendor scope LOCK (Claude-only trio rejected): `decisions/2026-04-22-sprint-11-scope-locked.md` (relevantni odeljak iz Sprint 10 carry-over)
- LiteLLM route file (grok-4.20 wired): `D:\Projects\waggle-os\litellm-config.yaml`
- xAI key live: `D:\Projects\waggle-os\.env` (`XAI_API_KEY`, 84 chars, present 2026-04-22)
- Sprint 10 Task 2.2 Fleiss' κ=0.8784 metodologija (mora ostati na snazi): `project_sprint_10_scope_locked.md` (.auto-memory)
- A1 ratifikacioni doc (paralelni LOCK na A2 reasoning_content scope): `decisions/2026-04-22-h-audit-1-design-ratified.md`

---

**Sign-off:** PM (Cowork, Claude Opus 4.7) on behalf of Marko Marković, 2026-04-22.
