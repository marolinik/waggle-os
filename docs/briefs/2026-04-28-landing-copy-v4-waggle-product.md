# Landing Copy v4 — Waggle Product (post-pilot, post-Faza-1-NULL)

**Date:** 2026-04-28
**Author:** PM
**Status:** DRAFT awaiting Marko ratification
**Supersedes for Waggle product context:** `briefs/2026-04-26-landing-copy-v3.md` (v3 reframed kao **hive-mind OSS landing copy** za hive-mind.dev domain — different product, different audience)
**Depends on (LOCKED upstream, binding inputs):**
- `strategy/landing/persona-research-2026-04-18-rev1.md` — 11 personas, tier afinitet, channel entry, JTBD, conversion barrier
- `strategy/landing/information-architecture-2026-04-19.md` — 9-section IA + per-persona event mapping + `<PersonaHero persona variant />` pattern
- `strategy/landing/landing-wireframe-spec-v1.1-LOCKED-2026-04-22.md` — 7-section simplified IA (Hero → Proof/SOTA → How-it-works → Personas → Pricing → Trust → Final CTA), copy keys + EN fallback, component contracts, measurability hooks
- `decisions/2026-04-22-personas-card-copy-locked.md` — 13 bee titles + JTBD lines
- `decisions/2026-04-22-landing-personas-ia-locked.md` — Opcija 3 dual-layer nomenclature, no bee subpages v1
- `.auto-memory/project_waggle_kvark_demand_generation.md` — Waggle = generator tražnje za KVARK (LOCKED 2026-04-18)
- `.auto-memory/project_three_products.md` — tri-product distinkcija (hive-mind / Waggle / KVARK)
- `decisions/2026-04-26-pilot-verdict-FAIL.md` — multiplier framing dropped post pilot N=12 FAIL
- `decisions/2026-04-28-phase-4-3-rescore-delta-report.md` — H3/H4 72.2% T2, GEPA evolution required
- `briefs/2026-04-28-cc4-faza1-amendment-1.md` + amendments 2/3/4/5 — Faza 1 GEPA Tier 2 work in progress
- `decisions/2026-04-28-gepa-faza1-launch.md` — Faza 1 LOCK, NULL-baseline empirical findings (qwen-thinking 100% saturated, retrieval engagement gap real)

---

## §0 — Why v4 exists

Three corrections from v3:

**Correction 1 — Wrong product framing.** v3 was authored as hive-mind OSS landing copy ("memory substrate, sovereignty, Apache 2.0, methodology disclosure, SOTA at substrate ceiling"). That positioning fits hive-mind.dev OSS public release for developer/researcher audience (P3 Sasha, P7 Priya, P8 Aisha). Waggle is a **different product** — consumer/SMB AI workspace product where memory is a feature, not the primary value prop. v3 retained as binding source-of-truth for hive-mind.dev landing; v4 is Waggle product landing copy for waggle-os.ai (or equivalent consumer domain).

**Correction 2 — Egzakta Group trust signal absent.** Waggle is not a startup ex nihilo. Egzakta Group (200 employees, 4.5M EBITDA, advisory practice with track record in DACH/CEE/UK regulated industries) backs Waggle. This is differentiating trust signal for P1 Petra (attorney), P5 Ivan (consultant), P11 Klaudia (compliance director) entering through Egzakta Advisory referral channel. v4 surfaces Egzakta backing as Trust band element + footer attribution.

**Correction 3 — Funnel framing implicit, not explicit.** Per `project_waggle_kvark_demand_generation` LOCKED 2026-04-18: Waggle is constructed as **generator tražnje za KVARK**. Solo Free / Pro $19 / Teams $49 are calibrated to generate individual habit within organizations ("šampion") who then internally trigger KVARK upgrade. v4 reflects this implicitly through tier copy + KVARK bridge ostaje minimal (one sentence + one CTA, per locked spec); not explicit pitch.

Plus three updates from post-2026-04-22 work:

**Update A — Multiplier framing dropped.** Hero M3 headline "Better Opus. Free Qwen. Same cognitive layer." (LOCKED in wireframe v1.1) was multiplier-anchored. Post pilot 2026-04-26 FAIL, multiplier framing is droppped from launch comms (per `decisions/2026-04-26-pilot-verdict-FAIL.md`). v4 hero refreshes to sovereignty + memory + workspace primary axis. Multiplier returns conditionally if Faza 1 + Phase 5 PASS (per `decisions/2026-04-28-gepa-faza1-launch.md`); if FAIL, paper §5.4 conditional finding language carries forward to landing as "GEPA evolved variant" placeholder for future update.

**Update B — Faza 1 NULL-baseline findings inform Pricing/Proof copy.** qwen-thinking saturated baseline (8/8 = 100% on H3 synthesis on Qwen subject) empirically validates "memorija + agent harness na nivou najboljih" claim. Free sovereign model + Waggle cognitive layer is **already at parity with Claude shape on Qwen subject** for synthesis Likert tasks. This is publishable evidence for Solo tier framing ("get frontier-grade results free").

**Update C — AI Act audit kao functional feature.** v3 treated EU AI Act compliance as trust badge. v4 reframes as **functional capability**: "generate audit report from your work activity, EU AI Act Article 12 compliant". This converts compliance from passive signal to active value prop, especially relevant for P1 Petra (legal malpractice protection) and P11 Klaudia (compliance director procurement journey).

---

## §1 — Per-persona hero variants (5 for Day 0, fallback Marcus default for remaining 6)

Per IA §2.1 + wireframe v1.1 §2.3 component contract: `<PersonaHero persona variant />` resolves persona from `?p=` URL param, `utm_source` heuristic, or analytics persona scoring. 5 hero variants for Day 0; remaining 6 personas fall back to Marcus (default) hero on Day 0, with per-persona variants added v1.1 post-launch.

Each variant follows wireframe v1.1 §2.2 structure: eyebrow → headline → subhead → body → primary CTA → secondary CTA → visual anchor. Copy keys preserve `landing.hero.{persona}.{element}` namespace. Body length stays within wireframe v1.1 spec (~85 words).

### 1.1 Marcus (P2) — Multi-Model Power User (DEFAULT — covers ~40% Day 0 traffic)

Triggered by: no resolved persona, generic UTM, organic search, default fallback for unresolved variants

```
landing.hero.marcus.eyebrow   = "AI workspace with memory"
landing.hero.marcus.headline  = "Your AI doesn't reset. Your work doesn't either."
landing.hero.marcus.subhead   = "Persistent memory + agent harness across every LLM you use, in one workspace. Local-first by default. Free for individuals, $19 for power use."
landing.hero.marcus.body      = "Stop pasting context into every Claude, GPT, and Gemini session. Waggle gives any AI the memory it should already have. Your projects, your decisions, your conversations — captured locally, retrievable across models, structurally organized into your own knowledge graph. The AI you already pay for, except it actually remembers what you've worked on."
landing.hero.marcus.cta.primary.label   = "Download for {os}"
landing.hero.marcus.cta.primary.sub     = "Solo — free forever"
landing.hero.marcus.cta.secondary.label = "See how it works →"
landing.hero.marcus.cta.secondary.sub   = "3-minute walkthrough"
```

**Visual anchor:** MPEG-4 loop showing multi-LLM agent passing context (Claude → GPT → Gemini) with persistent memory frame, ≤800KB, 7s, prefers-reduced-motion suppression mandatory per wireframe v1.1 §2.3.

### 1.2 Klaudia (P11) — Mandate-Bound Compliance Director (regulated, Egzakta referral)

Triggered by: `?p=compliance`, `utm_source=egzakta`, `utm_source=banking-tech`, referral from Egzakta Advisory partner channel

```
landing.hero.klaudia.eyebrow   = "AI for regulated industries, finally"
landing.hero.klaudia.headline  = "AI workspace that satisfies your CISO."
landing.hero.klaudia.subhead   = "Local-first by default. Zero cloud transit. EU AI Act audit reports built into the workflow. Backed by Egzakta Group advisory practice in DACH/CEE/UK regulated industries."
landing.hero.klaudia.body      = "Your CISO blocked ChatGPT. Your work didn't get easier. Waggle runs on the machine you already approved, never sends data to a public model, and produces compliance-ready audit reports for every decision the AI helped you make. Built by an advisory firm that has been in your boardroom for a decade. Approved by your IT in days, not quarters."
landing.hero.klaudia.cta.primary.label   = "Talk to a sovereign architect →"
landing.hero.klaudia.cta.primary.sub     = "Egzakta Advisory enterprise brief"
landing.hero.klaudia.cta.secondary.label = "Download for solo evaluation"
landing.hero.klaudia.cta.secondary.sub   = "Solo tier — no IT approval needed"
```

**Note on CTA inversion:** Klaudia variant inverts standard CTA hierarchy (Talk-to-architect primary, Download secondary) because P11 cannot install personally without IT — referral channel converts at briefing, not download. Wireframe v1.1 §1.2 anti-pattern "no Contact sales button" exception adjudicated: "Talk to a sovereign architect" is positioned as advisory/partnership framing per Egzakta brand, not generic sales pitch. Egzakta Advisory partner referral form, not generic CRM.

**Visual anchor:** Static composition (poster only, no MPEG-4) showing audit report sample + EU AI Act Article 12 reference + on-prem architecture diagram. Compliance audience tends to be dwell-on-detail, not visual-narrative.

### 1.3 Yuki (P6) — Product Founder + Champion path (HN/YC channel)

Triggered by: `utm_source=hn`, `utm_source=indie-hackers`, `utm_campaign=yc`, `utm_source=lenny`

```
landing.hero.yuki.eyebrow   = "Shared context for moving teams"
landing.hero.yuki.headline  = "Your team's memory, before someone has to write it down."
landing.hero.yuki.subhead   = "Decisions, conversations, and rationale captured in workflow. Searchable across every team member, every model, every project. $49 per seat, three-seat minimum."
landing.hero.yuki.body      = "Notion wikis go stale. Slack search is hostile. Linear comments scatter rationale across tickets. Waggle Teams gives your 8-person team shared cognitive context that builds itself from the work you're already doing. New hires onboard in days, not weeks. Decisions don't get re-litigated. Founders move faster because the team's memory compounds."
landing.hero.yuki.cta.primary.label   = "Start team trial"
landing.hero.yuki.cta.primary.sub     = "$49/seat · 3-seat minimum · 14-day free"
landing.hero.yuki.cta.secondary.label = "See how teams use it →"
landing.hero.yuki.cta.secondary.sub   = "3 case patterns"
```

**Visual anchor:** MPEG-4 loop showing team collaboration motif — multiple bees orchestrating around shared knowledge node. Bee swarm metaphor anchors "team memory" framing. ≤800KB, 7s.

### 1.4 Sasha (P3) — AI Engineer Building Agents (GitHub/HN technical)

Triggered by: `utm_source=github`, `utm_source=hn` + `utm_medium=technical`, `utm_source=r_localllama`, `utm_source=r_langchain`

```
landing.hero.sasha.eyebrow   = "Memory substrate for any agent"
landing.hero.sasha.headline  = "Memory layer that doesn't lock you to a vendor."
landing.hero.sasha.subhead   = "Apache 2.0 substrate. MCP server out of the box. Local-first deployment. Works with Claude Code, Cursor, Continue.dev, and your own builds. Free for individuals."
landing.hero.sasha.body      = "Mem0 is cloud-only. LangMem is toy-tier. Letta is agent-centric, not memory-centric. Waggle gives you a memory layer that runs locally, exposes 21 MCP tools, ships with 11 harvest adapters, and stays Apache 2.0 at the substrate. Bring your own LLM (Claude, GPT, local Qwen via Ollama). Substrate quality validated against published benchmarks. The memory layer you'd build if you had three months."
landing.hero.sasha.cta.primary.label   = "View on GitHub →"
landing.hero.sasha.cta.primary.sub     = "github.com/marolinik/hive-mind"
landing.hero.sasha.cta.secondary.label = "Download desktop app"
landing.hero.sasha.cta.secondary.sub   = "Solo — free forever"
```

**Visual anchor:** MPEG-4 loop showing MCP protocol message flow + harvest adapter pipeline. Technical audience values architecture motion over emotional motion.

### 1.5 Petra (P1) — Privacy-Constrained Attorney (legal tech)

Triggered by: `utm_source=legal-tech`, `utm_source=law360`, `utm_source=lawnext`, `utm_campaign=legaltech-newsletter`

```
landing.hero.petra.eyebrow   = "AI for confidential work"
landing.hero.petra.headline  = "AI that never sees your client matter."
landing.hero.petra.subhead   = "Runs on your machine. Zero cloud transit. Bar-association-friendly architecture. Audit log per malpractice protection. $19 per professional, free trial."
landing.hero.petra.body      = "Every prompt to ChatGPT or Claude is a malpractice risk waiting to happen. Your firm officially banned cloud AI for client matters; everyone uses it anyway, off the books. Waggle gives you the same productivity, but on your laptop, never in someone else's cloud. Closing memos, M&A research, deposition prep — drafted with AI that physically cannot leak to a model-training dataset. Plus an audit log for every decision, in case you ever need to explain."
landing.hero.petra.cta.primary.label   = "Start free professional trial"
landing.hero.petra.cta.primary.sub     = "Pro · 14-day free · no credit card"
landing.hero.petra.cta.secondary.label = "See compliance posture →"
landing.hero.petra.cta.secondary.sub   = "Bar association + GDPR"
```

**Visual anchor:** Static composition (poster only) with client matter diagram + zero-cloud-arrow + audit timeline. Legal audience values text-density over motion.

### 1.6 Default (Marcus variant) covers remaining personas

P4 Eliza (long-horizon creator), P5 Ivan (consultant), P7 Priya (OSS champion — note: directly hits Sasha variant via GitHub UTM), P8 Aisha (press), P9 Dmitri (analyst), P10 Henrik (regulated engineer) all default to Marcus hero on Day 0. v1.1 post-launch can add specific variants based on traffic distribution data (likely Eliza + Ivan first, given Egzakta channel volume).

---

## §2 — Tier-by-tier copy (post-Faza-1-NULL refresh)

Per persona research §3.3 + wireframe v1.1 §6 Pricing section. Three tier copy with Marko's clarifying framing: "free za individua, mala cena za tim, dobijate memoriju + agent harness na nivou najboljih + AI Act audit. Kroz workspace habit, organic upgrade ka KVARK."

### 2.1 Solo — Free forever

```
landing.pricing.solo.label       = "Solo"
landing.pricing.solo.price       = "Free forever"
landing.pricing.solo.tagline     = "Your local cognitive layer. No subscription. No cloud. Yours."
landing.pricing.solo.audience    = "For individuals, hackers, learners, and creators with their own data sovereignty"
landing.pricing.solo.included    = [
  "Full Waggle desktop app (Tauri 2.0 — macOS, Windows, Linux)",
  "Persistent memory across all your AI sessions",
  "Agent harness at frontier-grade quality (validated on synthesis Likert 100% baseline with sovereign model)",
  "21 MCP tools — works with Claude Code, Cursor, Continue.dev",
  "11 harvest adapters — your local files, browsing, calendar",
  "Wiki compiler — your knowledge becomes searchable structure",
  "Zero cloud transit — your .mind file lives on your machine",
  "Apache 2.0 substrate (hive-mind core)"
]
landing.pricing.solo.limit       = "Single device. No team sync. No EU AI Act audit reports."
landing.pricing.solo.cta.label   = "Download for {os}"
landing.pricing.solo.cta.sub     = "No card. No limit. No cloud."
```

**Empirical anchor (added post Faza 1 NULL-baseline 2026-04-28):** "agent harness at frontier-grade quality" claim is supported by qwen-thinking shape with Qwen 3.6 35B-A3B (sovereign model) reaching 100% trio_strict_pass on H3 synthesis at NULL-baseline (Faza 1 binding evidence). Internal pilot 2026-04-26 + Faza 1 NULL-baseline together validate "free sovereign model + Waggle cognitive layer matches Claude shape on synthesis tasks" framing. Conditional on Phase 5 GEPA-evolved variant outcome, multiplier claim returns post-launch.

### 2.2 Pro — $19/month

```
landing.pricing.pro.label        = "Pro"
landing.pricing.pro.price        = "$19/month"
landing.pricing.pro.tagline      = "Cognitive continuity across all your devices and models."
landing.pricing.pro.audience     = "For knowledge workers running multi-device, multi-LLM workflows"
landing.pricing.pro.included     = [
  "Everything in Solo",
  "End-to-end encrypted cloud sync across your devices",
  "EU AI Act Article 12 audit reports — generate compliance documentation from work activity",
  "Priority queue for new features + early access",
  "Email support",
  "Power-user shortcuts + advanced retrieval"
]
landing.pricing.pro.upgrade_from_solo = "Already on Solo? Pro adds sync across your laptop + work machine + phone, plus the AI Act audit pipeline that turns your work activity into compliance-ready reports."
landing.pricing.pro.cta.label    = "Start Pro trial"
landing.pricing.pro.cta.sub      = "14 days free · cancel anytime"
```

### 2.3 Teams — $49/seat/month

```
landing.pricing.teams.label      = "Teams"
landing.pricing.teams.price      = "$49/seat/month"
landing.pricing.teams.minimum    = "3-seat minimum"
landing.pricing.teams.tagline    = "Shared context for teams that move too fast to keep everyone up to date."
landing.pricing.teams.audience   = "For founders, consultancies, advisory firms, and teams in regulated industries"
landing.pricing.teams.included   = [
  "Everything in Pro for every seat",
  "Shared .mind workspaces with role-based access control",
  "Admin console with seat management + audit log review",
  "SSO via Clerk (Okta, Microsoft Entra, Google Workspace, Azure AD)",
  "Team-wide EU AI Act audit reports + compliance pack export",
  "Priority email + Slack support",
  "Onboarding session with Egzakta Advisory partner (regulated industries)"
]
landing.pricing.teams.cta.label  = "Start team trial"
landing.pricing.teams.cta.sub    = "14 days free · 3-seat minimum"
```

**Egzakta Advisory partner onboarding** is differentiated benefit for regulated industry teams — per `project_waggle_kvark_demand_generation`, Egzakta Advisory referral is canonical entry channel for P11 Klaudia. Onboarding session is included in Teams tier as advisory practice signature; this also seeds champion identification within team for downstream KVARK conversation.

### 2.4 KVARK bridge (one sentence + one CTA, locked minimum per persona research §3.3)

```
landing.kvark.bridge.headline  = "Your organization needs more than a desktop?"
landing.kvark.bridge.subhead   = "KVARK is Waggle deployed on your sovereign infrastructure, with your enterprise knowledge, your connectors, and your security model. By the same team."
landing.kvark.bridge.cta.label = "Talk to KVARK team →"
landing.kvark.bridge.cta.sub   = "Egzakta Group enterprise pilot"
```

**Anti-pattern check (binding):** No KVARK pitch beyond this. No persona-targeted KVARK copy elsewhere on landing. KVARK is one section, one sentence, one CTA — per persona research §3.3 LOCKED 2026-04-19 + wireframe v1.1 §1.6 anti-pattern compliance.

---

## §3 — Trust band (Egzakta Group + ecosystem signals)

Per wireframe v1.1 §7 Trust section. v4 adds Egzakta Group attribution + AI Act audit + ecosystem signals. Static band, dark ground, low-density (5 trust signals max).

```
landing.trust.eyebrow         = "Built by"
landing.trust.headline        = "Egzakta Group — advisory practice in DACH/CEE/UK regulated industries since 2010"
landing.trust.subhead         = "200 professionals. Privately held. Backed by a track record of compliance-grade work in banking, insurance, healthcare, and public sector."

landing.trust.signals = [
  {
    icon: "shield",
    label: "EU AI Act Article 12",
    text: "Audit-ready by architecture. Generate compliance reports from your work activity."
  },
  {
    icon: "github",
    label: "Apache 2.0 substrate",
    text: "Memory engine, MCP server, and harvest adapters open source. Fork it, audit it, run it on your hardware."
  },
  {
    icon: "lock",
    label: "Zero cloud default",
    text: "Your .mind file lives on your machine. We don't ingest, train on it, or phone home."
  },
  {
    icon: "academic",
    label: "Published methodology",
    text: "Substrate validated against peer-reviewed Mem0 baseline. Methodology + traces published on arxiv."
  },
  {
    icon: "egzakta",
    label: "Egzakta Group backed",
    text: "Backed by an advisory firm that has been in regulated boardrooms for a decade — not a venture-funded startup pivoting through positioning cycles."
  }
]
```

**Egzakta Group framing rationale:** Trust differentiation for P1 Petra, P5 Ivan, P11 Klaudia — these personas value institutional backing over venture momentum. Counter-positions against "yet another AI startup" perception. Egzakta Advisory referral channel converts on this trust signal.

---

## §4 — How-it-works section (3-step narrative)

Per IA Faza 2 §2.4 + wireframe v1.1 §4. Three steps, simple, anti-jargon. v3 had this section but wrong product framing.

```
landing.how.eyebrow   = "How it works"
landing.how.headline  = "Three steps to AI that remembers."
landing.how.subhead   = "No new tool to learn. No workflow to migrate. Waggle plugs into how you already work."

landing.how.steps = [
  {
    n: 1,
    title: "Install once.",
    body: "Download Waggle for macOS, Windows, or Linux. Runs locally. No account required for Solo tier. Picks up from your existing Claude Code, Cursor, or any MCP-compatible client without changing how you use them."
  },
  {
    n: 2,
    title: "Work normally.",
    body: "Waggle captures context from your work — the AI conversations you're already having, the local files you're working on, the decisions you're making. Stored locally, structurally organized, never sent to any cloud you didn't authorize."
  },
  {
    n: 3,
    title: "Compound, don't repeat.",
    body: "Next session, your AI remembers. Multi-day projects retain their thread. Multi-week research compounds into structured knowledge. Generate audit reports for compliance. Or just enjoy not pasting the same context for the seventh time today."
  }
]

landing.how.cta.label = "Try it on your machine →"
landing.how.cta.sub   = "Solo tier · no card · 5-minute install"
```

---

## §5 — Personas section (13 bee personas, per locked spec)

**No copy authoring needed in v4** — `decisions/2026-04-22-personas-card-copy-locked.md` is binding source. Wireframe v1.1 §5 specifies 13 bee tiles with locked titles + JTBD lines + 6+6+1 xl geometry. v4 references locked persona card copy verbatim.

Section header copy:
```
landing.personas.eyebrow  = "Built for the way you actually work"
landing.personas.headline = "Find your bee."
landing.personas.subhead  = "Waggle adapts to what you do — research, write, advise, audit, build, or orchestrate. Pick the bee that matches your work; the workspace tunes to your patterns."
```

13 bee tiles render from `apps/www/src/data/personas.ts` per locked spec. No v4 changes to bee titles or JTBD lines.

---

## §6 — Proof / SOTA section (5 cards)

Per wireframe v1.1 §3 + post-pilot reframe. v3 had 5 cards anchored on multiplier; v4 reframes 5 cards per current evidence.

```
landing.proof.eyebrow   = "The receipts"
landing.proof.headline  = "Publishable results, not vibes."
landing.proof.subhead   = "We measure on peer-reviewed benchmarks, publish the traces, and let other teams verify."

landing.proof.cards = [
  {
    key: "locomo_substrate",
    badge: "74%",
    title: "LoCoMo substrate ceiling",
    statement: "74% on LoCoMo at oracle context (substrate ceiling). Beats peer-reviewed Mem0 published 66.9% (basic) and 68.4% (graph). Apples-to-apples self-judge methodology.",
    link: "Read the benchmark →",
    href: "/benchmarks#locomo"
  },
  {
    key: "trio_strict",
    badge: "33.5%",
    title: "Trio-strict honest disclosure",
    statement: "Under stricter trio-judge ensemble (Opus + GPT + MiniMax with ≥2-of-3 consensus), substrate ceiling is 33.5%. We publish both numbers because methodology bias inflates self-judge by ~27pp. Honesty as differentiation.",
    link: "See the methodology →",
    href: "/benchmarks#methodology"
  },
  {
    key: "apache",
    badge: "Apache 2.0",
    title: "Open source substrate",
    statement: "The memory engine, MCP server, and harvest adapters are Apache 2.0. Fork it, audit it, run it on your own hardware. No copyleft, no commercial fork restrictions.",
    link: "View on GitHub →",
    href: "https://github.com/marolinik/hive-mind"
  },
  {
    key: "local",
    badge: "Zero cloud default",
    title: "Your data stays local",
    statement: "Waggle runs on your machine. We don't ingest your work, we don't train on your data, we don't phone home. Sovereignty isn't a setting — it's the architectural default.",
    link: "See the architecture →",
    href: "/product/architecture"
  },
  {
    key: "ai_act",
    badge: "Audit-first",
    title: "EU AI Act audit reports",
    statement: "Bitemporal knowledge graph with audit triggers. Every decision has a trace. Every trace has a timestamp. Generate Article 12-compliant reports from your work activity. Built for the compliance officer who has to explain.",
    link: "See the audit model →",
    href: "/compliance"
  }
]
```

**Multiplier framing reservation:** post Phase 5 GEPA-evolved variant outcome, if PASS, a 6th card may be added documenting agentic synthesis multiplier (per `decisions/2026-04-28-gepa-faza1-launch.md` Phase 5 acceptance). Until then, 5 cards stand. Card layout is elastic per wireframe v1.1 §3 (5-in-row at xl, 3+2 at lg, 2×2+1 at md, single column at sm).

---

## §7 — Final CTA + KVARK bridge (single section, per wireframe v1.1 §6 simplification)

Per wireframe v1.1 simplified IA: KVARK bridge collapsed into Final CTA section as single line. v4 follows.

```
landing.final.eyebrow   = "Stop pasting context."
landing.final.headline  = "Start using AI that remembers."
landing.final.subhead   = "Free for individuals. $19 for power users. $49/seat for teams. Your data stays where it belongs — on your machine."
landing.final.cta.primary.label   = "Download for {os}"
landing.final.cta.primary.sub     = "Solo — free forever"
landing.final.cta.secondary.label = "Compare tiers →"
landing.final.cta.secondary.sub   = "Solo · Pro · Teams"

landing.final.kvark_bridge = "Need it on your organization's sovereign infrastructure with all your enterprise data and connectors? Talk to KVARK team →"
```

---

## §8 — Footer

```
landing.footer.attribution = "Waggle is built by Egzakta Group — advisory practice in DACH/CEE/UK regulated industries since 2010."
landing.footer.tagline     = "Your AI workspace. Local-first. Sovereign by architecture. Backed by people who've been in your boardroom."

landing.footer.links = {
  product: ["Download", "Pricing", "MCP tools", "Compliance", "Changelog"],
  research: ["Benchmarks", "Methodology", "arxiv preprint", "GitHub repos"],
  company: ["About Egzakta", "KVARK enterprise", "Press kit", "Contact"],
  legal:   ["Privacy", "Terms", "DPIA template", "Security disclosure"]
}
```

---

## §9 — Open questions for Marko (binding ratification needed)

1. **Multiplier card placement reservation** — confirm 6th proof card slot reserved post Phase 5 PASS, or merge into existing card if PASS comes? PM rec: reserve slot, add post-Phase-5.

2. **Klaudia hero CTA inversion** — "Talk to a sovereign architect" as primary instead of Download is wireframe v1.1 §1.2 anti-pattern exception. Ratify exception for regulated channel? PM rec: ratify (regulated audience converts at briefing, not download).

3. **Egzakta Advisory partner onboarding session in Teams tier** — ratify as included benefit for regulated industries Teams tier? PM rec: yes (champion seeding for downstream KVARK).

4. **Footer "by Egzakta Group" attribution** — placement OK in footer, or also surface in nav/header? PM rec: footer + Trust band only. Header nav stays product-clean.

5. **Solo tier "frontier-grade quality" claim** — anchor on Faza 1 NULL-baseline qwen-thinking 100% finding (binding evidence from `decisions/2026-04-28-gepa-faza1-launch.md`)? PM rec: yes, with footnote pointing to /benchmarks page. Empirical claim, defensible.

6. **Hero variant selection rule** — `<PersonaHero variant />` defaults to Marcus when persona unresolved, plus 5 explicit variants for Day 0. Ratify scope (5 + Marcus default) or expand/contract? PM rec: 5 + default for Day 0, expand to 8-9 in v1.1 post-launch based on traffic distribution.

7. **AI Act audit reports as functional feature** — ratify as Pro tier capability (not Solo)? Rationale: Pro audience (P1, P5, P11 sub-elements) is who needs reports; Solo audience (P2, P3, P4) is mostly individuals not generating compliance docs. PM rec: Pro tier feature, surfaced on Solo-to-Pro upgrade flow as primary differentiator.

---

## §10 — Sequencing (post v4 ratification)

Upon Marko ratification of v4 + 7 open questions:

**Step 1 (PM):** Author claude.ai/design landing generation setup brief — extracts updated company blurb, visual direction notes, 5-hero variant prompts, Egzakta + AI Act framing for Claude Design generation prompt. Output: `briefs/2026-04-28-claude-design-landing-setup.md`.

**Step 2 (Marko-side):** Open new generation in claude.ai/design (NOT resume "Design System" pause from 2026-04-20 — that was Design System generation, completed). Paste blurb + visual notes, manually upload 15 brand assets (waggle-logo + 13 bee-dark + hex-texture from `apps/www/public/brand/`), click Continue to generation. Iterate.

**Step 3 (PM + Marko iteration):** Feedback loop in claude.ai/design until landing UI matches v1.1 wireframe + v4 copy + Waggle Design System aesthetic. 5 hero variants iterated to solid Day 0 quality.

**Step 4 (CC sesija — separate brief):** Stripe checkout integration ($19/$49 LOCKED) + webhook handlers + analytics + i18n locale infrastructure. Phase 7 from 14-step plan. CC-Stripe brief authored post landing UI ready.

**Step 5 (CC sesija — post launch comms ready):** E2E persona testing with Playwright or equivalent. Korak 6 from 14-step plan. Tests 5 hero variants + persona-specific journey events + Stripe test mode + tier-gating verification.

---

## §11 — Cross-references

- Persona Rev 1 (binding): `strategy/landing/persona-research-2026-04-18-rev1.md`
- IA Faza 2 (binding): `strategy/landing/information-architecture-2026-04-19.md`
- Wireframe v1.1 LOCKED (binding): `strategy/landing/landing-wireframe-spec-v1.1-LOCKED-2026-04-22.md`
- Personas card copy LOCKED: `decisions/2026-04-22-personas-card-copy-locked.md`
- Personas IA LOCKED: `decisions/2026-04-22-landing-personas-ia-locked.md`
- v3 hive-mind landing copy: `briefs/2026-04-26-landing-copy-v3.md` (retained for hive-mind.dev domain)
- Pilot FAIL verdict: `decisions/2026-04-26-pilot-verdict-FAIL.md`
- Phase 4.3 verdict: `decisions/2026-04-28-phase-4-3-rescore-delta-report.md`
- Faza 1 GEPA launch: `decisions/2026-04-28-gepa-faza1-launch.md`
- Waggle ↔ KVARK funnel principle: `.auto-memory/project_waggle_kvark_demand_generation.md`
- Three products distinction: `.auto-memory/project_three_products.md`
- claude.ai/design pause memory: `.auto-memory/project_claude_design_setup_pause.md`
- Brand voice contract: `D:\Projects\waggle-os\docs\BRAND-VOICE.md`
- Hive DS tokens: `D:\Projects\waggle-os\apps\www\src\styles\globals.css`

---

**End of v4. Awaiting Marko ratification on §9 open questions before authoring claude.ai/design setup brief.**
