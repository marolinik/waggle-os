# LOCKED — Personas Card Copy (13 role titles + JTBD)

**Ratified by:** Marko Marković
**Date:** 2026-04-22
**Brief source:** `briefs/2026-04-22-personas-card-copy-refinement.md` (second-pass)
**Applied to:** `briefs/2026-04-22-brand-bee-personas-card-spec.md` §13 Persona Definitions

---

## Decision

All 13 role titles + one-line JTBD copy accepted per second-pass brand voice review. No revisions requested. No alternative variants selected. High-confidence anchor set (6 personas) confirmed robust across iterations.

---

## Canonical copy (authoritative from this date)

| # | Slug | Role Title | One-line JTBD |
|---|---|---|---|
| 1 | hunter | The Hunter | Finds the source you forgot you saved. |
| 2 | researcher | The Researcher | Goes deep and brings back a verdict. |
| 3 | analyst | The Analyst | Sees the shape of what keeps repeating. |
| 4 | connector | The Connector | Links yesterday's thought to tomorrow's decision. |
| 5 | architect | The Architect | Gives chaos a structure you can reason about. |
| 6 | builder | The Builder | Turns a spec into something that ships. |
| 7 | writer | The Writer | Shapes the story the memory wants to tell. |
| 8 | orchestrator | The Orchestrator | Coordinates the agents, tools, and memory. |
| 9 | marketer | The Marketer | Translates what you do into what matters to them. |
| 10 | team | The Team | Many hands, one hive. |
| 11 | celebrating | The Milestone | Marks the moment when the work compounds. |
| 12 | confused | The Signal | Raises a flag when memory and reality disagree. |
| 13 | sleeping | The Night Shift | Consolidates while you rest — the hive never closes. |

---

## Brand voice compliance

Ratified copy passes all six clauses from `docs/BRAND-VOICE.md` (2026-04-15):
- Declarative first — all 13 iskaza su tvrdnja, ne aforizam
- Warm tone — prijateljski, ne prodajni
- Minimal adjective density — max one priverak po iskazu
- Quiet competence — bez superlatives
- No LLM jargon — "cognitive layer", "RAG", "embedding" odsutno
- Syllable economy — prosek 8 reči po JTBD (pao sa 11 u first-pass)

---

## Scope of use

Copy is authoritative for:
- `apps/www/src/components/BrandPersonasCard.tsx` React component data source
- `apps/www/src/data/personas.ts` canonical data export (single source of truth)
- Future marketing materials, internal brand reference documents
- Any landing-level or product-level reference to bee persona roles

Copy MUST NOT be inline-rewritten in individual consumer contexts. Changes require new LOCKED decision in this folder.

---

## Downstream actions unblocked

1. CC React component implementation — `BrandPersonasCard.tsx` može da se piše sa ratified copy-om
2. Landing IA integration spec — copy je stable reference za section-level positioning decisions
3. Product-wide nomenclature layer (pending landing IA Decision 3 ratification) — ako Opcija 3 prolazi, ovaj copy je seed za onboarding/tooltip/empty-state strings

---

## Related

- `briefs/2026-04-22-personas-card-copy-refinement.md` — second-pass audit sa per-change rationale
- `briefs/2026-04-22-brand-bee-personas-card-spec.md` — scaffold spec sa updated §13
- `docs/BRAND-VOICE.md` — brand voice contract (2026-04-15)
- `strategy/2026-04-22-landing-personas-integration.md` — landing IA integration (separate LOCKED decision)

---

**LOCKED. Authoritative from 2026-04-22.**
