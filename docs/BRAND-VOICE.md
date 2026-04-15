# Waggle OS — Brand Voice Reference

**Status:** Inferred from CLAUDE.md + existing Marko-authored docs and ratified during the April 2026 competitive-brief review (`cowork/Waggle-OS_Competitive_Brief_BRAND-REVIEW.md`). This is the working voice contract for all Waggle-facing writing — website, product copy, research notes, launch materials, KVARK pitches.

**Scope:** External and internal writing. Applies when the audience is a reader who doesn't already know the product — buyers, developers, press, analysts, new hires.

---

## Voice attributes

| Attribute | We are | We are NOT | Sounds like | Does NOT sound like |
|---|---|---|---|---|
| **Precise** | numbers, verified facts, cited sources | vague, approximate, generic | "12 competitors across 4 tiers" | "many leading AI platforms" |
| **Builder** | written for people shipping product | written for decks or investors | "Ship Teams first and define shared-memory primitives." | "Empower teams to unlock synergies." |
| **Anti-hype** | no superlatives without evidence | superlatives, empty adjectives | "Notion's installed base is the moat." | "A category-defining, best-in-class platform." |
| **Direct** | imperatives, short declaratives, stated opinions | hedged, passive, committee-voiced | "Do not position against ChatGPT by brand." | "It may be worth considering positioning alternatives." |
| **Honest** | surfaces threats, limits, tradeoffs | omits inconvenient facts | "Waggle's biggest threat: Claude Cowork ships on Anthropic's distribution." | "Some headwinds exist." |

---

## What "Anti-hype" means in practice

These phrases are **banned** unless backed by a cited benchmark or number:

- "world-class" · "best-in-class" · "industry-leading" · "game-changing" · "category-defining"
- "seamless" · "intuitive" · "beautiful" · "powerful" · "cutting-edge"
- "revolutionary" · "transformative" · "next-generation" · "enterprise-grade" (without specifics)
- "the most dangerous / advanced / capable" superlatives without comparator

Replacements:

| Banned | Specific |
|---|---|
| "beautiful prosumer UX" | "system-audio capture avoids the 'bot has joined' moment" |
| "best-in-class voice" | "still the clearest desktop voice implementation per X survey" |
| "canonical content opportunity" | "highest-leverage content gap" |
| "unique sales geometry" | "a funnel no competitor can copy without rebuilding their stack" |
| "the most dangerous competitor" | "highest-threat competitor: ships on Anthropic's distribution" |

---

## Numerical claims require sources

Any numeric claim in external writing must have one of:
- a public citation (company announcement, SEC filing, Crunchbase, G2 review count)
- a link to the raw methodology (our own benchmark code + dataset)
- an explicit `[unverified — anecdotal]` annotation if the source is private

**Do not anchor marketing claims on numbers we can't defend.** A wrong number undermines the whole artifact.

Examples of claims that need sources or removal:
- "700M WAU" — cite or replace with "distribution at consumer scale"
- "30-40% POC conversion rate" — cite or drop
- "6-9 month competitive window" — explain basis (release cadence, etc.) or drop

---

## "Probability: high" is a reserved phrase

For competitor-roadmap speculation:
- Do **not** write "Probability: high" as if it's data. It's speculation dressed as measurement.
- Write instead: `"Likely within X months — based on [public signal / release cadence / hiring patterns]"`
- Never state a competitor's internal roadmap as a measurement. It's an inference and should read that way.

---

## Formatting

- **Em dash:** no spaces — tight typography. `X—Y` not `X — Y`. Exception: in sentences where a spaced em dash improves readability, prefer `X -- Y` (double hyphen) or rework.
- **Oxford comma:** always. `fast, reliable, and secure` not `fast, reliable and secure`.
- **Headings:** Sentence case. `## Why the KVARK motion works` not `## Why The Kvark Motion Works`.
- **URLs:** bare-form without `https://` in body copy. `waggle-os.ai` not `https://www.waggle-os.ai`. Use full URLs in tables and links.
- **Product names:** `Waggle OS` in titles, `Waggle` in running prose. `KVARK` is always capitalized. `hive-mind` is always lowercase (repo name convention).

---

## Honest-voice pattern

Surface the three most uncomfortable facts before anyone else does:

1. **Largest threat by impact** — name it, explain why, say what you're doing about it.
2. **Thing we can't do yet** — what's the gap to the strongest competitor on their strongest axis?
3. **Decision we might be wrong about** — a bet with visible downside.

Examples from the competitive brief:
- "Claude Cowork ships on Anthropic's distribution, brand, and frontier model." (threat)
- "No competitor has Solo→KVARK continuity." (strength claim; followed by "but none of the 12 surveyed do" — bounded)
- "Open-source Memory creates lock-in, but it also hands competitors our substrate." (honest tradeoff)

---

## What this file is NOT

- Not a style guide for code comments (that's CLAUDE.md §3.6-3.7 — default no comments).
- Not a marketing persona document (personas live in `docs/research/05-user-personas-ai-os.md`).
- Not a positioning framework (positioning lives in `docs/research/06-waggle-os-product-overview.md`).

This is the *voice* — the feel and cadence of how we speak as a product. Audiences and positioning are elsewhere.

---

## Ratifying this document

Adopted April 15, 2026. Basis: `cowork/Waggle-OS_Competitive_Brief_BRAND-REVIEW.md` voice-attribute table, scored 8/10 with three High-severity correction areas addressed.

Changes require a commit to this file. Disagreements surface in review of artifacts that violate the voice — flag + propose a rewrite + update this file if a pattern emerges.
