# Personas Card Copy Refinement — Brand Voice Second Pass

**Author:** PM
**For:** Marko ratifikacija pre CC React implementation
**Date:** 2026-04-22
**Parent:** `briefs/2026-04-22-brand-bee-personas-card-spec.md` — scaffold spec sa first-pass copy
**Scope:** Second-pass brand voice review 13 role titles + one-line JTBD copy. Spec scaffold layout + grid + component contract stoje netaknuti; samo copy se iterira.

---

## Brand voice criteria lock

Ratifikovano 2026-04-15 u `docs/BRAND-VOICE.md`:

- **Declarative first** — tvrdnja, ne aforizam. "X does Y" > "X is the kind of bee who does Y".
- **Warm tone** — prijateljski, ne prodajni. Smart colleague explains the team.
- **Minimal adjective density** — jedan priverak po iskazu max. Ne "deeply thoughtful analytical researcher".
- **Quiet competence** — bez superlatives, "best", "ultimate", "world-class".
- **No LLM jargon** — "cognitive layer", "bitemporal KG", "RAG" su out.
- **Syllable economy** — kraći iskaz > duži iskaz pod istim semantic load-om.

---

## First-pass copy audit (13 role titles + JTBD)

Skala: ✓ = brand voice PASS, ~ = mixed signal, ✗ = brand voice FAIL.

| # | Slug | First-pass title + JTBD | Score | Note |
|---|---|---|---|---|
| 1 | hunter | **The Hunter** — Tracks down the source material you forgot you had. | ~ | "material" je tautološki. "the source you forgot you saved" je tighter i aktivnije. |
| 2 | researcher | **The Researcher** — Goes deep on topics that matter, brings back a verdict. | ~ | "topics that matter" je slabashno. Drop it. |
| 3 | analyst | **The Analyst** — Finds the pattern in what you keep saying the same way. | ✗ | Aforistički. "Sees the shape of what keeps repeating" je declarative. |
| 4 | connector | **The Connector** — Links yesterday's thought to tomorrow's decision. | ✓ | Declarative, warm, elegantan. Keep. |
| 5 | architect | **The Architect** — Maps structure onto chaos so you can reason about it. | ~ | "so you can reason about it" je mikro-sycophantic. "Gives chaos a structure you can reason about" flipuje control ka bee. |
| 6 | builder | **The Builder** — Turns specs into working artifacts that ship. | ~ | "that ship" je insider-y. "Turns a spec into something that ships" je cleaner. |
| 7 | writer | **The Writer** — Shapes the story the memory wants to tell. | ✓ | Evokativno ali declarative. "wants to tell" je warm personification koja fit-uje bee-as-character framing. Keep. |
| 8 | orchestrator | **The Orchestrator** — Coordinates agents, tools, and memory into one flow. | ~ | "one flow" je klišej. "Coordinates the agents, tools, and memory" je dovoljno. |
| 9 | marketer | **The Marketer** — Translates what you do into what matters to them. | ✓ | Declarative, tighter. Keep. |
| 10 | team | **The Team** — Many hands, one hive, shared context. | ~ | "shared context" je LLM jargon. Drop. "Many hands, one hive" je enough. |
| 11 | celebrating | **The Milestone** — Marks the moment when the work compounds. | ✓ | Declarative, eliptičan, sa ritmom. Keep. |
| 12 | confused | **The Signal** — Raises a flag when memory and reality disagree. | ✓ | Declarative, precise. Keep. |
| 13 | sleeping | **The Night Shift** — Consolidates while you rest — the hive never closes. | ✓ | Keep u celini. "— the hive never closes" je brand-payoff linija koja vezuje persona u šire brand obećanje. |

**Audit score:** 6/13 PASS, 6/13 mixed, 1/13 fail. ~50% polish yield opravdava drugi prolaz.

---

## Second-pass copy (RATIFICATION-READY)

Kanonska lista za Marko ratifikaciju. Promene od first-pass eksplicitno označene strikethrough / dopuna.

| # | Slug | Role Title | One-line role |
|---|---|---|---|
| 1 | hunter | **The Hunter** | Finds the source you forgot you saved. |
| 2 | researcher | **The Researcher** | Goes deep and brings back a verdict. |
| 3 | analyst | **The Analyst** | Sees the shape of what keeps repeating. |
| 4 | connector | **The Connector** | Links yesterday's thought to tomorrow's decision. |
| 5 | architect | **The Architect** | Gives chaos a structure you can reason about. |
| 6 | builder | **The Builder** | Turns a spec into something that ships. |
| 7 | writer | **The Writer** | Shapes the story the memory wants to tell. |
| 8 | orchestrator | **The Orchestrator** | Coordinates the agents, tools, and memory. |
| 9 | marketer | **The Marketer** | Translates what you do into what matters to them. |
| 10 | team | **The Team** | Many hands, one hive. |
| 11 | celebrating | **The Milestone** | Marks the moment when the work compounds. |
| 12 | confused | **The Signal** | Raises a flag when memory and reality disagree. |
| 13 | sleeping | **The Night Shift** | Consolidates while you rest — the hive never closes. |

**Token count check:** prosek je pao sa ~11 reči po JTBD na ~8 reči. Grid tile copy layout ostaje nepromenjen (Inter 13/400, max 2 linije u renderu na 1024px).

---

## Rationale for specific changes

**#1 Hunter:** "source material you forgot you had" → "the source you forgot you saved". "Material" je redundantan jer "source" uključuje materijalni nivo. "Forgot you saved" je aktivniji glagol od "forgot you had" (save je čin, have je stanje). Preciznije vezan za actual memory harvest UX — user je nešto sačuvao (Claude conversation, email draft, PDF download) i zaboravio.

**#2 Researcher:** "topics that matter, brings back a verdict" → "goes deep and brings back a verdict". Drop "topics that matter" jer je filler — svaki topic koji korisnik zada je by-definition topic that matters. Elipsa jača iskaz.

**#3 Analyst:** "Finds the pattern in what you keep saying the same way" → "Sees the shape of what keeps repeating". Originalni je bio aforističan i tautološki ("saying the same way" = pattern by definition). Novi je declarative, vizuelan ("shape"), i precizniji na pattern recognition JTBD.

**#5 Architect:** "Maps structure onto chaos so you can reason about it" → "Gives chaos a structure you can reason about". Flipuje agency od bee to user. "Maps ... onto" je abstractniji od "gives ... a structure". Takođe drop "so you can" jer je mikro-sycophantic.

**#6 Builder:** "working artifacts that ship" → "a spec into something that ships". Drop "working artifacts" jer "ship" podrazumeva working. "Something" je namerno vague — builder se ne vezuje za artifact-tip (code, doc, chart).

**#8 Orchestrator:** "agents, tools, and memory into one flow" → "the agents, tools, and memory". Drop "into one flow" jer je klišej. Coordinate by-definition spaja, ne treba objaviti to.

**#10 Team:** "Many hands, one hive, shared context" → "Many hands, one hive". Drop "shared context" jer je LLM jargon i ne doprinosi iskazu. "Many hands, one hive" je sam po sebi potpun.

---

## Alternative copy variants (for sensitivity check)

Ako neki od gore polished JTBD-a ne prolazi kod Marko-a, evo alt varijanti koje sam konsidrrirao ali odbacio:

| # | Slug | Alt A | Alt B |
|---|---|---|---|
| 1 | hunter | Tracks down what you buried. | Brings back what you bookmarked and lost. |
| 3 | analyst | Finds the pattern you're too close to see. | Names the shape of what keeps coming back. |
| 5 | architect | Gives shape to the pile. | Turns a mess into a map. |
| 6 | builder | Turns a spec into a working thing. | Builds what the plan asks for. |
| 7 | writer | Writes what the memory wants to say. | Names the story already in the notes. |
| 11 | milestone | Marks the compounding work. | Says: this counts. |
| 13 | night shift | Consolidates through the night. | Does the inventory while you sleep. |

Ove varijante su submitted za sensitivity check — ne tvrdim da primary lista iznad je optimalna, tvrdim da je cleaner od first-pass.

---

## Copy that stays across both passes (high-confidence anchors)

Persona koje prolaze brand voice oba puta i koje smatram canon-spremne:

- Connector — "Links yesterday's thought to tomorrow's decision."
- Writer — "Shapes the story the memory wants to tell."
- Marketer — "Translates what you do into what matters to them."
- Milestone — "Marks the moment when the work compounds."
- Signal — "Raises a flag when memory and reality disagree."
- Night Shift — "Consolidates while you rest — the hive never closes."

Ovih 6 su robust-across-iterations. Ako drugi menjamo, ovi ostaju.

---

## Marko decision request

Molim ratifikaciju u tri koraka:

1. **Apruvni ili izmenjeni second-pass lista** — gore u §Second-pass copy tabeli. Ako ti nešto ne sedi, imenuj persona + predloženi change.
2. **Sensitivity check na alt varijante** — §Alternative copy variants. Ako neka alt ti više odgovara, označi.
3. **High-confidence anchor set** — §Copy that stays. Potvrđuješ da nijedan od ovih 6 ne treba da se menja?

Kad ratifikacija sedne, copy ide u `briefs/2026-04-22-brand-bee-personas-card-spec.md` kao UPDATE §13-Persona Definitions sekcije i CC može da gradi React component sa finalnim copy-om.

---

## Brand voice compliance note

Ova iteracija je izvedena potpuno u okviru brand voice kontrakta sa 2026-04-15. Nijedna izmena nije ušla u teritoriju:
- Feature claims (nijedan iskaz ne pominje Waggle features ili implementation detail)
- Superlatives ("best", "the only", "ultimate" sve odsutno)
- Jargon ("cognitive layer", "RAG", "embedding" sve odsutno)
- Adjective-density inflation (prosek adj per iskaz ostao ≤1)

Audit trail u ovom dokumentu je pun — svaki change je obrazlozen sa specifičnim brand voice clause-om koji je trigger.

---

## Related

- `briefs/2026-04-22-brand-bee-personas-card-spec.md` — scaffold spec (layout, component contract)
- `docs/BRAND-VOICE.md` — voice contract 2026-04-15 ratified
- `briefs/2026-04-20-claude-design-setup-submission.md` — blurb source (dual-axis framing basis)
- `.auto-memory/project_bee_assets_regen.md` — canon asset source

---

**End of copy refinement brief. Awaiting Marko ratifikacija na tri decision koraka iznad.**
