# CC Sesija D — Waggle apps/web UI Alignment sa Claude Design Prototype

**Datum:** 2026-05-01
**Autor:** PM
**Status:** AUTHORED — awaiting Marko ratifikacija → CC kickoff
**Authority:** Track A iz `decisions/2026-04-30-pre-launch-sprint-consolidation-LOCKED.md` + Pass 1 review `strategy/ui-ux/2026-04-30-track-a-uiux-review-pass-1.md` + Claude Design overnight completes `project_overnight_2026_04_30_claude_design_completes.md`
**Branch policy:** Kreirati `feature/sesija-D-ui-alignment` iz main HEAD-a (NE iz feature/sesija-A — taj branch je za Tauri/backend integration, paralelan stream)
**Cost cap:** $40 hard / $30 halt / $10-20 expected — UI iteracije sa screenshot verifications mogu biti tokens-heavy

---

## §0 — Pre-flight gates (BLOCKING — CC mora da prođe pre §1 kickoff)

### Gate G0.1 — Branch state verifikacija

CC izvršava i prijavljuje:
- `git fetch origin && git status` — clean working tree
- `git log --oneline -5 origin/main` — verify HEAD je production-ready
- `git checkout -b feature/sesija-D-ui-alignment origin/main` — create branch
- `npm install --workspace=apps/web` — verify dependencies clean

**PASS uslovi:** clean checkout, npm install zero errors, dev server može da krene (`npm run dev --workspace=apps/web` opens at localhost:5173 ili sl.)
**FAIL handling:** halt + PM ratifikacija pre nastavka

### Gate G0.2 — Test baseline establish

CC izvršava i prijavljuje:
- `npm test --workspace=apps/web` — full vitest run
- `npm run lint --workspace=apps/web` — ESLint clean
- `npm run typecheck --workspace=apps/web` — TypeScript clean

Capture full test count (X passed / Y skipped / Z failed). To je baseline — svaki commit u Sesija D mora održavati ili poboljšati taj broj. Zero new failures.

### Gate G0.3 — Visual reference acquisition

CC pristupa Claude Design "waggle app" project (URL: `https://claude.ai/design/p/019dd700-75a0-7127-872a-3ce5e162d11f?file=Waggle+Workspace+OS.html`) za pixel-level reference. Ako CC nema browser access, alternativa je da PM autoring pripremi screenshot folder u `D:\Projects\PM-Waggle-OS\strategy\ui-ux\reference-screenshots\` sa po-state screenshots (Tweaks closed/open, dark/light theme, simple/professional/power tier) — koje CC koristi kao spec.

**PASS uslovi:** CC dobio access do reference (browser ili screenshot folder).
**FAIL handling:** PM dostavlja screenshot bundle za 30 min, kickoff resume.

---

## §1 — Scope declaration

### Šta ulazi u Sesija D

Strukturni UI alignment apps/web/src/components/os/ existing React/TypeScript codebase sa Claude Design visual spec-om iz overnight Pass 1 fix iteracije + Waggle Landing.html visual tokens. Sedam Pass 1 fix-eva already done in Claude Design moraju biti reflected u waggle-os apps/web/ React komponentama.

Konkretno: Desktop.tsx + Dock.tsx + StatusBar.tsx + AppWindow.tsx + ContextRail (overlays/) + MemoryApp.tsx (filter pills) + Settings/Tweaks UI + Welcome callout system. Plus dark theme color tokens, typography (Inter + JetBrains Mono), spacing tokens.

### Šta NE ulazi u Sesija D

- Backend code (services/, hive-mind packages, MCP servers) — touched 0 lines
- Business logic unutar apps (npr. MemoryApp logic, ChatApp message flow, AgentsApp agent execution) — UI/UX prezentacioni sloj only
- 25 apps individual feature work — only shell + Memory + Chat + Cockpit polish u Sesija D
- Tauri/.msi packaging — to je Sesija A scope, ne diramo
- Landing site (apps/www ako postoji) — separate stream
- Test infrastructure changes — postojeći vitest + playwright ostaje
- New dependencies — koristimo postojeće (shadcn/ui + Tailwind + react-query + react-router)

---

## §2 — Mapping table (Claude Design → waggle-os apps/web)

| Claude Design component / state | waggle-os target file | Akcija | Priority |
|---|---|---|---|
| Dock global position (fixed, bottom 14px, viewport-centered) | `apps/web/src/components/os/Dock.tsx` | Refactor outer wrapper iz `left:0; right:0; flex-center` u `position: fixed; bottom: 14px; left: 50%; transform: translateX(-50%)` na dock pill itself; verify ne pomera kad Tweaks panel toggle | P0 |
| Top menu bar (Waggle/File/Edit/View/Window/Help) sa View shortcuts ⌘1 Cockpit / ⌘2 Memory / ⌘3 Chat | `apps/web/src/components/os/StatusBar.tsx` (ili novi `MenuBar.tsx`) | Add macOS-style menu bar component sa keyboard shortcuts; bind shortcuts u global handler | P0 |
| Workspace selector "Q1 Strategy Review" (replaceable) | `apps/web/src/components/os/WorkspaceBriefing.tsx` ili StatusBar | Update default placeholder text + interaction popover | P1 |
| Model selector dropdown "qwen3.6-35b-thinking" sa interactive popover | `apps/web/src/components/os/ModelSelector.tsx` | Update default model + ensure popover trigger working + Phase 5 LOCKED scope only (Claude Opus + qwen-thinking, ne GPT/Llama/Gemini) | P0 |
| Memory app filter pills "all/decision/fact/insight/task/event" | `apps/web/src/components/os/apps/MemoryApp.tsx` | Add "event" pill to filter pills component | P1 |
| Welcome callout cards (Back/Next + "Don't show again", 3-card swipeable format) | New component `apps/web/src/components/os/WelcomeCards.tsx` | Implement card-based onboarding flow, replace any existing single-callout | P1 |
| Tweaks panel — Dock position dropdown sa default "Bottom" | `apps/web/src/components/os/apps/SettingsApp.tsx` ili novi `TweaksPanel.tsx` | Implement dropdown sa working state mgmt (bottom/top/left/right) | P2 |
| Tweaks panel — Billing Tier dropdown sa default "Pro" | Same Tweaks panel | Implement dropdown bound na user tier system | P2 |
| Z-order focus dim (0.7 opacity overlay za unfocused windows) | `apps/web/src/components/os/AppWindow.tsx` | Add focus state + dim CSS na non-focused windows | P1 |
| Cockpit window default state ("3 agents · 1 running · 1 queued") | `apps/web/src/components/os/apps/CockpitApp.tsx` | Update default mock state za prototype-friendly demo | P2 |
| Chat window persona ("Researcher · Deep investigation, multi-source synthesis") | `apps/web/src/components/os/apps/ChatApp.tsx` ili ChatWindowInstance | Update default persona display + add persona switcher hook | P2 |
| Color tokens — dark navy #0A0E1A bg, warm beige #F5E6D3 text, orange #ED915C primary CTA | `apps/web/tailwind.config.js` ili `apps/web/src/index.css` | Update theme tokens to match Claude Design palette | P0 |
| Typography — Inter (body) + JetBrains Mono (tags/numerals) | Same tailwind config + globals.css | Add font-family tokens, ensure web fonts loaded | P1 |

### Mapping discovery uslovi

CC mora prvo da read postojeće Dock.tsx, StatusBar.tsx, AppWindow.tsx files i prijavi PM-u **diff-aware mapping** — šta već postoji u kodu, šta treba dodati, šta menjati. Ne implement before reporting current state. PM ratifikuje mapping pre §3 implementation kickoff.

---

## §3 — Implementation phases

### §3.1 — Phase 1: Color + Typography tokens (P0, 1 dan)

Update tailwind config + globals.css sa Claude Design palette. Verify svi postojeći komponenti i dalje render-uju (visual regression check kroz Playwright snapshot tests). Zero functional change — samo theme refresh.

**Deliverable:** PR commit "feat(theme): align tokens sa Claude Design — dark navy + warm beige + orange CTA". Screenshot diff (before/after) attached.

### §3.2 — Phase 2: Dock + StatusBar + MenuBar P0 (1-2 dana)

Three P0 fixes:
1. Dock global position refactor (postojeći Dock.tsx) — exact CSS spec primenjen
2. Top MenuBar implementacija sa keyboard shortcuts ⌘1/⌘2/⌘3 (i ⌘P workspace switcher, ⌘K spotlight)
3. ModelSelector update sa Phase 5 LOCKED scope + interactive popover

**Deliverable:** PR commit per fix sa Playwright screenshot test koji verifikuje state. Test suite green.

### §3.3 — Phase 3: Memory app filter pills + Welcome cards (P1, 1 dan)

Add "event" pill u MemoryApp filter component. Implement WelcomeCards component sa Back/Next + "Don't show again" + first-launch detection.

**Deliverable:** PR commits + visual regression tests + e2e test za welcome flow first-launch.

### §3.4 — Phase 4: Z-order focus dim + AppWindow polish (P1, 1 dan)

AppWindow component dobija focus state, unfocused windows dim na 0.7 opacity. Window switching kroz ⌘` (cmd+backtick) implementiran.

**Deliverable:** PR commit sa interactive demo screenshots multi-window state pre/posle focus change.

### §3.5 — Phase 5: Tweaks panel dropdowns (P2, 1-2 dana)

SettingsApp ili novi TweaksPanel komponenta dobija dva working dropdowns: Dock position (bottom/top/left/right) + Billing Tier (free/trial/pro/teams/enterprise). Real state management, ne dead UI. Billing Tier toggling menja Approvals chip visibility u dock + Team Governance access.

**Deliverable:** PR commit sa interactive demo, full test coverage.

### §3.6 — Phase 6: Cockpit + Chat default states (P2, 0.5 dana)

CockpitApp dobija prototype-friendly default mock state. ChatApp dobija default persona display + persona switcher. Niska kompleksnost, kosmetičko poboljšanje za demo screenshots.

**Deliverable:** PR commit sa screenshot updates.

---

## §4 — Visual reference assets (PM dostavlja)

PM autoring sa overnight Computer Use:
- `D:\Projects\PM-Waggle-OS\strategy\ui-ux\reference-screenshots\` folder sa pre-named PNG-ovima:
  - `dock-fixed-tweaks-closed.png` (Claude Design verified output)
  - `dock-fixed-tweaks-open.png` (Claude Design verified output)
  - `welcome-callout-cards.png`
  - `tweaks-panel-dropdowns.png`
  - `view-menu-shortcuts.png`
  - `memory-filter-pills-event.png`
  - `model-selector-popover.png`
  - `multi-window-focus-dim.png`
  - `landing-hero.png` (color reference)

Plus reference fajlovi:
- `landing-v3.1-refreshed-overnight.md` — color tokens + typography spec source-of-truth
- `track-a-uiux-review-pass-1.md` — original Pass 1 diagnostic
- `project_overnight_2026_04_30_claude_design_completes.md` — accepted fix decisions

CC fetch-uje ove fajlove kao input pre §3.1 phase kickoff.

---

## §5 — Acceptance criteria

CC Sesija D je COMPLETE kad svih 6 phases zatvoren PR-ovima na `feature/sesija-D-ui-alignment` branch sa:

1. **Test posture:** vitest + playwright + tsc + ESLint zero new failures vs G0.2 baseline
2. **Visual diff:** Screenshot diff before/after za svaki phase, embedded u PR description
3. **Pixel match:** Dock pill x-position centered na viewport midpoint kad Tweaks closed AND open (per overnight spec)
4. **Functional:** ⌘1/⌘2/⌘3/⌘`/⌘K/⌘P shortcuts sve work, popovers open na click, dropdowns store state
5. **Branch state:** sve commits pushed na origin, branch ready za review (NE merge — Marko ratifikuje pre merge u main)
6. **Documentation:** Update apps/web/README.md (ako postoji) sa novim color tokens + shortcut list

PM Pass 2 review (ja kroz Computer Use ili manual screenshots verification) na branch HEAD-u pre merge u main.

---

## §6 — Cost projection (real-anchored)

Baseline procena per phase:
- Phase 1 (tokens): ~5K LLM tokens — color tokens su deterministic, mali file diff
- Phase 2 (dock+menubar+modelselector): ~30K — Dock.tsx ~200-400 LOC menjati, MenuBar od nule ~150-300 LOC, ModelSelector ~50-100 LOC
- Phase 3 (filter pills + welcome): ~15K
- Phase 4 (focus dim): ~10K
- Phase 5 (tweaks dropdowns): ~25K — dva interactive dropdowns sa state mgmt + tests
- Phase 6 (cockpit+chat): ~10K

**Total estimate:** ~95K tokens × Sonnet 4.6 cost = ~$15-20 per single pass. Cap $40 hard / $30 halt allows for 1-2 retry passes ako bilo koji phase fail QA.

**Halt triggers:**
- Cumulative spend > $30 → halt + PM review
- Any phase requires > 5 retry iteracija → halt + PM diagnostic
- Test suite breaks i ne može vratiti zelenom unutar 1h → halt + PM rollback decision
- TypeScript errors koji nisu auto-fixable unutar 30 min → halt + PM scope decision

---

## §7 — Out of scope (eksplicitno isključeno)

- Backend integration (services/, hive-mind packages)
- New apps (sve od 25 postojećih ostaju, samo shell + 3 core polished)
- BootScreen redesign — Day 1 polish, ne pre-launch
- Animation polish (motion design) — Day 1 polish, ne pre-launch
- Accessibility audit (WCAG full pass) — separate stream Sesija E ako prioritet
- i18n / lokalizacija — Day 1 polish
- Performance optimization (bundle size, code splitting) — Day 1 polish
- Tauri-specific behavior (resize, traffic lights, system tray) — Sesija A scope

---

## §8 — Audit trail anchors

- Pre-launch sprint consolidation: `decisions/2026-04-30-pre-launch-sprint-consolidation-LOCKED.md` Track A
- Pass 1 review (input): `strategy/ui-ux/2026-04-30-track-a-uiux-review-pass-1.md`
- Overnight Claude Design completes (fix evidence): `project_overnight_2026_04_30_claude_design_completes.md`
- Landing v3.1 (color/typography source): `strategy/landing/2026-04-30-landing-v3.1-refreshed-overnight.md`
- Memory systems coexistence (cross-stream context): `feedback_memory_systems_coexistence.md`
- This brief: `briefs/2026-05-01-cc-sesija-D-apps-web-ui-alignment.md`

---

## §9 — Marko ratifikacija decisions (4 odluke)

Pre nego što CC krene, treba 4 ratifikacije:

1. **Branch baseline** — `origin/main` HEAD ili `feature/sesija-A` ako Marko želi da Sesija D radi povrh A za smoother merge?
2. **Visual reference dostava** — PM pravi screenshot bundle (1h Computer Use) ili CC samostalno fetch-uje Claude Design URL (rizik: Claude Design account cookie)?
3. **Cost cap** — $40 hard cap OK ili menjamo? Probe-validated $35-45 reality nije relevantna ovde (drugi tip rada od Phase 5 production deployment), $40 ima headroom za 1-2 retry passes.
4. **Branch merge policy** — CC otvara PR ka main i čeka Marko ratifikaciju, ili ja PM mergujem posle Pass 2 review u njegovo ime?

---

**End of brief. Awaiting Marko ratifikacija na 4 odluke iz §9 → CC kickoff.**
