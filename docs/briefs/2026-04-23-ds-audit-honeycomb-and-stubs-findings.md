---
title: Waggle DS Audit — Honeycomb Invisibility + Stubbed Surfaces + Bees Preview Broken
date: 2026-04-23
audience: Marko (PM) — za paste u claude.ai/design chat (project ea934a60)
status: DRAFT audit findings + paste-ready iteration prompt
related:
  - decisions/2026-04-22-landing-personas-ia-locked.md (personas ostaju landing-only)
  - project_landing_wireframe_v11_locked_2026_04_22.md (wireframe v1.1 LOCK)
  - project_design_stream_locked_2026_04_22.md (nomenclature Opcija 3 dual-layer)
---

# TL;DR

Tri konkretna defekta + jedan jos neproveren surface. Dva complaint-a iz tvoje poruke razbijena:

1. **"App old UI/UX"** — nije tacno za Memories + ⌘K palette (to je solidan moderan dark OS shell). Pravi defekt: **6 surfaces stubovano** i fall-back na generic patterns (Graph, Agents, Provenance, Providers, Policy, Preferences). DS chat sam to confirmuje u self-disclosure.
2. **"Honeycomb texture not visible"** — CONFIRMED. Texture preview renderuje 3 opacity celije (8% / 15% / 30%). Pattern je nevidljiv na app-chrome (8%) i empty-state (15%) — a to su glavne povrsine. Samo 30% (footer max) ima citljiv pattern.
3. **Bees preview broken** — `preview/bees.html` renderuje blank white page. Personas po LOCK-u ostaju landing-only artefakt, ali preview mora da radi jer je to DS validacija.
4. **waggle-site ui_kit** — nije jos inspektovan; ne blokira ovaj fix, ali treba drugi prolaz.

# Evidence (sta sam video u claude.ai/design, tab 1596057996)

**Project scope:** Anthropic Labs / Waggle Design System / project ea934a60-2f76-40de-a4d8-31f111d32980.

**Preview pages** (`project/preview/`): empty-state, menus, terminal, texture, bees, logo, cards, badges, inputs, buttons, elevation, radii, spacing-scale, typography. 14 HTML preview-a.

**UI kits** (`project/ui_kits/`): `waggle-app/` (index.html + App.jsx + Dashboard.jsx + Palette.jsx + Memories.jsx + Shell.jsx + Icons.jsx + styles.css + README.md) i `waggle-site/` (jos neotvoren).

**waggle-app rendered state (index.html):** Moderan dark OS shell — top bar sa Waggle logom + ⌘K palette + Commit + Ask agent; leva navigacija (HIVE: Memories 12,480 / Graph 3 / Agents 04 / Provenance 24 | SCOPES: pricing-q3-2026, eu-audit-triggers, customer-research | SETTINGS: Providers, Policy, Preferences); main surface = Memories sa 4 KPI kartice (Memories 12,480 | Avg recall 8.2ms p99 42ms | Audit hooks 24, 4 EU AI Act | Providers 04 all local) + lista poslednjih memorija + agent activity panel + status footer. **Ovo nije "old UI/UX" — ovo je upravo "operating system" paradigma koju smo LOCK-ovali.**

**DS chat self-disclosure (najvaznije):**

> "Product surfaces beyond Memories + ⌘K palette are stubbed (graph, agents, audit, policy, providers, prefs)"

Dakle Claude je sam rekao da su 6 surfaces stubovane. Kad klik-nes Graph ili Agents ili Provenance iz leve nav-a — dobijas placeholder, ne stvaran OS shell. **To je ono sto izgleda "old".**

**Texture preview evidence:** `preview/texture.html` prikazuje 3 cells: opacity 8% za app-chrome surface, 15% za empty-state, 30% za footer max. Pattern je jedva vidljiv na prve dve (koje su 80%+ glavne povrsine app-a). Samo 30% ima citljiv heksagonalni pattern.

**bees.html:** Klik-nuto Open, URL `?file=preview%2Fbees.html`, tab renderuje **blank white canvas** — sacekao 2 sekunde, screenshot still blank. Broken.

# Diagnoza po nalazu

## Nalaz 1 — "Old UI/UX" je zapravo "6 stubovanih surfaces"

Memories je izgradjena do OS-shell standarda. Problem je sto Graph, Agents, Provenance, Providers, Policy, Preferences nisu — i fallback na generic layout (tabela ili prazan okvir) rusi coherentnost. Resenje: **ne redizajn, nego popunjavanje istog shell-a** (ista leva nav, ista top bar, isti KPI grid pattern, isti agent activity panel) sa content-om specificnim za svaki surface.

**Po surface-u — short brief:**

- **Graph** — force-directed graph view bitemporal KG (episodic/semantic/procedural); zoom/pan; node click → side panel sa metadata + linkovima ka Memories + Provenance
- **Agents** — table + cards hybrid; svaki agent ima status pill (active/paused/failed), last-run timestamp, model badge (claude-sonnet-4 / llama-3.1-70b / local), scope tag, recent activity sparkline
- **Provenance** — audit log stream: timestamp + event_type + actor + target + outcome + compliance_trigger tag (EU AI Act / SOC 2 / internal); filter po trigger type; export CSV za auditor
- **Providers** — grid kartica: 4 karticа (3 cloud providers + "local" for Ollama/vLLM); po svakoj: model list, active/deprecated pill, latency p50/p99, cost meter, toggle "allow cloud routing"
- **Policy** — editor za rules: "allow/deny", "scope", "model class", "cost ceiling", "audit required"; each rule → YAML block + natural-language summary; save → diff preview
- **Preferences** — 3 sekcije: Appearance (theme toggle dark/honey/auto + texture density slider), Defaults (default scope, default model, default mode), Keyboard (palette command list + customize)

## Nalaz 2 — Honeycomb Texture Invisible

Korenski uzrok: opacity za app-chrome (8%) i empty-state (15%) je previse nizak da pattern bude citljiv na dark base palette. Pattern postoji u asset-u ali optical signal ispod praga.

**Fix preporucen:**

- App-chrome: **8% → 12-14%** (dovoljno da heksagon scaffolding "breathe" ali ne preglasi text)
- Empty-state: **15% → 22-25%** (empty states treba da imaju vise character — to su najmanje posecene povrsine a brand-defining)
- Footer max: **30% → zadrzi 30%** (vec dobar)
- Opcionalno blend-mode: `overlay` ili `soft-light` umesto `normal` opacity — pattern se "uvlaci" u color field umesto da sedi preko njega

## Nalaz 3 — bees.html Broken

Preview page renderuje blank. Moguci uzroci: HTML template prazan, broken asset reference, JS error na load-u. Ne zahteva redizajn — samo regen preview page-a. **Personas ostaju landing-only artefakt** po design-stream LOCK-u (decisions/2026-04-22-landing-personas-ia-locked.md §2) — preview treba samo da prikaze 13 bee personas kao staticni grid za DS reference, ne za injection u app shell.

## Nalaz 4 — waggle-site UI Kit

Jos neotvoren u ovoj sesiji. Pretpostavljam da je u pitanju renderovanje landing wireframe v1.1 kroz DS tokene (hero + proof + how-it-works + personas + pricing + trust + final CTA). Kad budes spreman za sledeci prolaz, otvori `ui_kits/waggle-site/index.html` — ako je to landing mockup, cross-check sa landing-wireframe-spec-v1.1-LOCKED-2026-04-22.md (14 ratifikovanih decisions).

# Paste-ready iteration prompt za DS chat

Kopiraj sledeci blok u claude.ai/design chat (project ea934a60), kao sledecu poruku:

---

```
Nastavi Waggle DS kroz 3 fiksa, isti visual language kao Memories surface:

FIX 1 — Flesh out 6 stubbed app surfaces u istom OS-shell-u kao Memories.
Svaka surface treba da nasledi: left nav (HIVE/SCOPES/SETTINGS) + top bar (⌘K palette + Commit + Ask agent) + status footer + texture/spacing tokens. Content po surface:

• Graph — force-directed bitemporal KG view; episodic/semantic/procedural node types; zoom/pan canvas; click-node → side panel with metadata + cross-links to Memories and Provenance.

• Agents — hybrid table+cards; per agent: status pill (active/paused/failed), last-run timestamp, model badge (claude-sonnet-4 / llama-3.1-70b / local-ollama), scope tag, 7-day activity sparkline, click-through to recent runs.

• Provenance — audit log stream; columns: timestamp, event_type, actor, target, outcome, compliance_trigger tag (EU AI Act / SOC 2 / internal); filter chips per trigger; export-CSV button for auditor hand-off.

• Providers — 4 cards grid (3 cloud + 1 local); per card: model list, active/deprecated pill, latency p50/p99, cost meter (weekly), toggle "allow cloud routing", hover → provenance of last 10 routings.

• Policy — rule editor; each rule = YAML block + natural-language summary; fields: allow/deny, scope, model class, cost ceiling, audit required; save → diff preview before commit.

• Preferences — 3 sections: Appearance (theme dark/honey/auto + texture density slider), Defaults (default scope, default model, default mode), Keyboard (palette command list + customize).

Apply same honey-spice ratio and bee-voice discipline as Memories. Don't invent new chrome — extend the existing cockpit.

FIX 2 — Honeycomb texture opacity ramp is too subtle on the main surfaces.

Current: app-chrome 8%, empty-state 15%, footer-max 30%.
Change to: app-chrome 12-14%, empty-state 22-25%, footer-max keep 30%.
Also try mix-blend-mode: overlay (or soft-light) instead of plain opacity — the pattern should settle INTO the base color field, not sit on top of it. Re-render preview/texture.html so I can see the three cells side-by-side with the new values, plus a fourth cell showing the blend-mode variant.

FIX 3 — preview/bees.html currently renders blank white (likely broken template or asset reference).

Regenerate it as a static grid of all 13 bee-dark personas (from brand/ assets — already upscaled to 2048px and deployed). One card per bee: portrait + name + one-line JTBD from the locked canon (apps/www/src/data/personas.ts when CC wires it). This is a DS reference preview, not an app surface — personas stay landing-only per wireframe v1.1 LOCK. Do NOT inject personas into the app cockpit.

Keep Memories surface and ⌘K palette exactly as-is — those are the reference standard; every new surface should match them in density, honey-accent ratio, and voice.
```

---

# Sta NE treba da trazis od DS chat-a

- Ne trazi redizajn Memories ili ⌘K palette — oni su reference.
- Ne trazi da personas udju u app shell — to breakujе design-stream LOCK (Opcija 3 dual-layer, personas kroz onboarding/tooltips/empty states tek posle CC Sprint 10 close, i to ne kao prerequisite).
- Ne trazi site ui_kit iteraciju u istoj poruci — to je poseban prolaz, drugi check.
- Ne trazi voice overhaul (hero h1, SDK comments) — otvoreno pitanje br. 3 u chat-u; odvojeno adresiraj kad fixevi 1-3 slete.

# Sledeci korak posle DS outputa

Kad DS chat vrati iteraciju: screenshot svih 6 novih surfaces + novi texture preview + novi bees preview. Ako je signal dovoljan, ratifikuj i prelazi na `waggle-site` ui_kit prolaz. Ako nije — iteracija 2 na one surfaces koji nisu pogodili ton.

CC-1 paralelno nastavlja Sprint 12 Task 2 C3 mini — ovaj DS rad je nezavisan stream i ne blokira benchmark critical path.
