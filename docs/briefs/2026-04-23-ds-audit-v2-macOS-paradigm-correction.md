---
title: Waggle DS Audit v2 — macOS-Style Desktop Paradigm Correction
date: 2026-04-23
supersedes: briefs/2026-04-23-ds-audit-honeycomb-and-stubs-findings.md (v1 misdiagnosed)
audience: Marko (PM) — za paste u claude.ai/design chat (project ea934a60)
status: DRAFT audit findings v2 + paste-ready iteration prompt
repo-evidence:
  - docs/WAGGLE-SYSTEM-VISUAL.html:684 ("24 OS Apps")
  - docs/WAGGLE-SYSTEM-VISUAL.html:689 (apps/web/src/components/os/apps/)
  - docs/WAGGLE-SYSTEM-VISUAL.html:698 (apps/web/src/components/os/overlays/OnboardingWizard.tsx)
  - docs/WAGGLE-SYSTEM-VISUAL.html:679 ("Lightweight native shell wrapping the React web app")
  - docs/wiki-test/entities/waggle-os.md:14 (desktop paradigm explicit)
---

# Korekcija na v1

v1 audit je proglasio Memories + ⌘K palette + left-sidebar-nav kao "solidan moderan OS shell" i preporučio da se ostalih 6 surfaces samo popune istim chrome-om. **To je bilo pogrešno.** Marko je već u Aprilu adjustao paradigmu ka "operating system design" i repo to dokumentuje crno-na-belo:

- `apps/web/src/components/os/apps/` — kanonski folder sa **24 OS Apps** (Chat, Memory, Files, Wiki, Settings, Marketplace, Cockpit, i ostale)
- `apps/web/src/components/os/overlays/` — overlay pattern za Onboarding i druge system-level panele
- Tauri 2.0 = jedan native prozor koji wrapuje React web app; unutar tog native prozora živi desktop-metafora
- WAGGLE-SYSTEM-VISUAL.html arhitekturni diagram eksplicitno govori o User Layer kao Desktop sa Window paradigmom

Dakle trenutni DS mockup (left sidebar sa HIVE / SCOPES / SETTINGS i central Memories canvas) je zapravo Linear/Notion/Slack paradigma — SaaS dashboard, ne operating system. Zato je tvoja prva reakcija bila tačna: "app old UI/UX". Moja prva dijagnoza je zatvorila oči pred time jer je vizuelno polirano bilo i zvuči kao "cockpit" — ali cockpit nije chrome layout, cockpit je JEDNA od 24 OS aplikacija.

# Šta kanonska paradigma stvarno znači

Unutar Tauri native prozora, Waggle treba da simulira macOS desktop:

**Menubar na vrhu** — sistemski meni levo (Waggle logo + File / Edit / View / Window / Help), status-cluster desno (provider pill + cost meter + policy indicator + sistemski čas + ⌘K spotlight trigger). Fiksiran, ne scroll-uje se.

**Dock na dnu ili sa strane** — 24 app ikonice, hover tooltip, running-app indicator ispod ikone, right-click za context menu, odvajač između system apps i user-pinned. Apps su: Chat, Memory, Files, Wiki, Settings, Marketplace, Cockpit, Graph, Agents, Provenance, Providers, Policy, Preferences, Skills, Scopes, Tasks, Timeline, Audit, Prompts, Search, Terminal, Notes, Export, About — 24 ukupno per repo evidence. Ne sve odmah MVP; prvi launch subset ali dock struktura mora podržati svih 24.

**App windows** — pravi draggable / resizable / minimizable / maximizable paneli koji se otvaraju kad user klik-ne app ikonu u dock-u. Title bar sa traffic-light dugmadima (close / minimize / maximize) levo (macOS konvencija), title centralno, app-specific controls desno. Z-order sa focus. Window state persist po session-u.

**Desktop background** — honeycomb texture PROMINENT (ne 8%, bliže 25-35% na background-u pošto je to brand defining moment). Opcionalno wallpaper per persona ili per scope kasnije, ali default je hive honeycomb.

**⌘K palette** — ostaje kao Spotlight equivalent (launch app / search memory / invoke command). Već je polirana u trenutnom DS-u, preživljava paradigm shift.

**Overlays** — OnboardingWizard, first-run tour, modal dialogs, global alerts, toast notifications. System-level layer iznad window-a a ispod palette-a.

**Cockpit nije chrome, Cockpit je app** — kad korisnik klikne Cockpit u dock-u, otvara se app window sa KPI-jima i agent activity (ono što trenutni mockup pokazuje kao "Memories surface"). Ali u pristojnoj paradigmi to je JEDAN window, nije šasija cele aplikacije.

# Šta treba bri se odbaci iz trenutnog DS mockup-a

Levа HIVE / SCOPES / SETTINGS sidebar navigacija — ne ide. Scopes su filter (per-window), Settings je app (Preferences), HIVE elementi (Memories / Graph / Agents / Provenance) su 4 odvojene app ikonice u dock-u, ne navigation tree entries.

Central single-canvas Memories surface kao "main view" — ne ide. Memory je jedna app; kad je otvorena ona je window. User može da ima otvorena 3-4 app window-a istovremeno (Memory + Graph + Chat + Cockpit), tiled ili overlapping.

Fixed left sidebar "always visible" pattern — ne ide. macOS sidebar pattern postoji SAMO unutar app window-a (npr. Files app ima Finder-style sidebar za bookmarks), ne globalno na desktop-u.

# Šta ostaje iz trenutnog DS rada

**Design tokens** — dark-first paleta, honey accent 400/500/600, typography scale, spacing scale, radii, elevation. Sve ratifikovano i koristi se; paradigm shift ne zahteva token overhaul.

**⌘K palette component** — Spotlight equivalent već izgleda dobro, samo promena konteksta (u pravom desktop-u ⌘K se otvara iznad svega, ne u sidebar overlay-u).

**Bee textures + persona artwork** — landing-only per LOCK (decisions/2026-04-22-landing-personas-ia-locked.md), ne injektovati u app chrome.

**Typography i copy voice** — voice (bee/hive/honey metaphor) zadržan, samo redistribuiran (menubar prazniji, dock tooltips brižniji, window title bars minimalistički).

# Honeycomb texture — ažurirana preporuka

v1 preporuka (app-chrome 12-14% / empty-state 22-25% / footer 30%) je bila u pogrešnom kontekstu. Nova paradigma preraspoređuje gde texture živi:

- **Desktop background** (iza svih window-a) — 25-35% opacity, blend-mode overlay ili soft-light na dark base. Ovo je glavno mesto gde texture treba da PEVA.
- **Window background** (unutar app window-a) — 4-8% blago, dovoljno da se nasluti brand a ne ometa content density
- **Empty states** (kad app window nema podataka) — 15-20%, persona illustration accompanying
- **Menubar / Dock chrome** — 0% ili <3%, bez texture (chrome mora biti čist za legibility)

# bees.html broken

Taj nalaz iz v1 ostaje validan bez izmene. Personas ostaju landing-only per LOCK; preview page mora da renderuje static grid of 13 bees kao DS reference. Fix identičan kao u v1.

# Paste-ready iteration prompt v2 za DS chat

Kopiraj sledeći blok u claude.ai/design chat (project ea934a60), kao sledeću poruku. **Ovo poništava prethodni prompt** — novi chrome paradigm, ne iterativna popravka.

---

```
Važna korekcija paradigme. Trenutni mockup (Memories + ⌘K + left sidebar sa HIVE/SCOPES/SETTINGS) je SaaS dashboard layout. Waggle je "operating system" — konkretno macOS-style desktop UNUTAR jednog Tauri native window-a. Repo evidence:

- apps/web/src/components/os/apps/ = 24 OS Apps (Chat, Memory, Files, Wiki, Settings, Marketplace, Cockpit, Graph, Agents, Provenance, Providers, Policy, Preferences, Skills, Scopes, Tasks, Timeline, Audit, Prompts, Search, Terminal, Notes, Export, About)
- apps/web/src/components/os/overlays/ = system-level overlays (OnboardingWizard pattern)
- Cockpit NIJE chrome layout. Cockpit je JEDNA od 24 apps.

Odbaci left sidebar nav i central Memories canvas kao "main view". Redizajniraj chrome oko macOS paradigme:

1. MENUBAR (top, fixed) — Waggle logo levo, sistemski meniji (File / Edit / View / Window / Help), status cluster desno (active-provider pill, cost meter, policy indicator, sistemski sat, ⌘K spotlight trigger). Visina ~28-32px. Tanka, elegantna, bez texture.

2. DOCK (bottom ili side-left, toggleable) — ikonice 24 apps, hover tooltip sa app name, running indicator dot ispod aktivne ikone, right-click context menu (hide, quit, show in Finder-equivalent). Odvajač između system apps i user-pinned. Magnification hover effect opciono ali poželjno. Honey accent na active app indicator.

3. APP WINDOWS — pravi draggable / resizable / minimizable / maximizable paneli. Title bar sa traffic-light dugmadima (close / minimize / maximize) levo po macOS konvenciji, centralni title, app-specific controls desno. Z-order sa focus. Window shadow + subtle border radius. Multi-window moguć (npr. Memory + Graph + Cockpit otvoreni istovremeno, tiled ili overlapping).

4. DESKTOP BACKGROUND — honeycomb texture PROMINENT, 25-35% opacity sa blend-mode overlay ili soft-light. Ovo je brand-defining canvas. Per-scope wallpaper kasnije, za MVP default je hive honeycomb.

5. ⌘K PALETTE — ostaje kao Spotlight equivalent. Otvara se iznad svega (modal layer). Trenutna vizuelna kvaliteta preživljava paradigm shift. Launch app, search memory, invoke command.

6. OVERLAYS LAYER — između window-a i palette-a, za OnboardingWizard, modal dialogs, toast notifications, global alerts.

Apps za MVP prvi launch (subset od 24, ostali dolaze kasnije):

• Cockpit (KPI dashboard, agent activity — ono što trenutni mockup pokazuje kao Memories surface, ali kao app window ne kao main chrome)
• Memory (browse, search, tag, edit memories; side panel sa filters)
• Graph (force-directed bitemporal KG, node-click side panel)
• Agents (status table + cards, last-run, model badge, activity sparkline)
• Chat (agent conversation interface, multi-provider)
• Provenance (audit log stream, compliance_trigger filters, CSV export)
• Providers (4-card grid, model list, latency meters, routing toggle)
• Policy (YAML rule editor + natural-language summary + diff preview)
• Preferences (Appearance / Defaults / Keyboard sections)
• Settings (system-level: account, sync, backup, about)
• Files (browse .mind files, imports, exports)
• Wiki (compiled wiki pages view)

12 apps za MVP dock. Preostalih 12 docked-but-unavailable ili sakrivenih iza "Show all apps" razrešavaju se kasnije.

Texture opacity ramp:
• Desktop BG: 25-35%, blend-mode overlay ili soft-light
• Window BG: 4-8% (blago nasluti, ne ometa)
• Empty states unutar window-a: 15-20% + persona illustration
• Menubar / Dock chrome: 0-3% (čisto)

Bees/personas ostaju landing-only per decisions/2026-04-22-landing-personas-ia-locked.md. NE injektovati bees u app chrome. preview/bees.html samo popraviti (trenutno blank) kao static grid of 13 bees za DS reference.

Dizajn tokeni (honey accent, dark palette, typography, spacing, radii) zadržani — samo rearhitektura chrome paradigme.

Renderuj:
1. Novi ui_kits/waggle-app/index.html sa macOS-style menubar + dock + desktop + 2-3 otvorena window-a (Cockpit primary, Memory i Graph kao sekundarni, jedan od njih floating iznad drugog da pokažeš z-order)
2. preview/desktop-chrome.html kao izolovan referenčni prikaz samo chrome-a (menubar + empty desktop + dock)
3. preview/window-variants.html sa pet window states: normal / focused / blurred (not focused) / minimized preview / maximized
4. preview/texture.html ažuriran sa novim opacity cell-ovima (desktop BG 30% overlay, window BG 6%, empty state 18%, menubar 0%)
5. preview/bees.html popravljen (static 13-bee grid)

Ako treba reference: macOS Sonoma/Sequoia chrome + dock behavior je polazna tačka; ne kopirati pixel-by-pixel ali preuzeti grammar (traffic lights levo, dock magnification, menubar density, window shadow).
```

---

# Šta NIJE predmet ove iteracije

Ne dirati design tokens (already ratified). Ne redizajnirati personas (landing-only per LOCK). Ne menjati voice ili copy u ⌘K palette. Ne menjati bee/honey metaforu. Ne menjati Tauri tehnički stack. Ne otvarati diskusiju o multi-window tilting/Mission Control/Stage Manager — to je v1.5+ scope.

# Posle DS outputa

Kad DS chat vrati iteraciju: screenshot svih 4 nova preview-a + novi index.html sa 2-3 window-a otvorena. Ako paradigma hvata — ratifikuj i prelazi na per-app deep dive (Memory, Graph, Agents, Provenance konkretizacija). Ako ne hvata — još jedna iteracija sa konkretnijim macOS grammar pinning-om.

CC-1 paralelno nastavlja Sprint 12 Task 2 C3 mini. Ovaj DS rad je nezavisan stream i ne blokira benchmark critical path.
