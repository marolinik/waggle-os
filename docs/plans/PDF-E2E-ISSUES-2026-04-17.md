# E2E PDF Issues — 2026-04-17

Source: `C:\Users\MarkoMarkovic\OneDrive - Egzakta d.o.o\Desktop\Waggle e2e test pdf.pdf`
Parser: Claude (via /verify + PDF read, 2026-04-17)

## Legend

- ✅ Fixed this session
- 🟡 Partial fix / needs follow-up
- 🟠 Deferred (complex, needs investigation)
- 🔴 Blocked (Stripe / billing / infra)

## Items

### UI / Dock / Status

| # | Item | Status |
|---|------|--------|
| P1  | Opens as General Purpose — should be Researcher (wrong persona from onboarding) | 🟡 |
| P2  | Chat message input too small — need bigger textarea, multi-line visible | ✅ |
| P3  | Tier-gated menu items — Teams-only apps should not show on Free | ✅ |
| P4  | Permissions → Mutation Gates confusing — should merge with 3-level tool approval | 🟠 |
| P5  | Advanced Settings has nothing actionable — debug toggle + log download needed | ✅ |
| P6  | Room feature — verify 2 parallel agents visualization | 🟠 |
| P7a | Agent slash commands use `//` should be `/` | ✅ |
| P7b | Agents show "No tools assigned" — should show real tools | ✅ |
| P8  | Naming inconsistency Agents vs Personas — unify | 🟡 |
| P9  | AI-generate agent → Stripe subscription link broken | 🔴 |
| P10 | Agent icons generic — need bee-style per agent, dark + light | 🟠 |
| P11 | Group members only shows 3 — should list ALL available agents | ✅ |
| P12 | Workspace template has Blank twice — duplicate | ✅ |
| P13 | Group filter has Projects/Research — should only be Personal/Work/Team | ✅ |
| P14 | Virtual storage path truncated + Local browser only drive D, need C | 🟠 |
| P15 | Create Template modal overlaps Dashboard — can't drag | 🟠 |
| P16 | Files app only Virtual storage — need local create + explorer-like browse | 🟠 |
| P17 | Tooltips missing app-wide — need hover tooltips on badges/options | 🟠 |
| P18 | Waggle Dance signals — need to display real discovery/handoff events | 🟠 |
| P19 | Cockpit System Health "Ok" shown in red — color logic wrong | ✅ |
| P20 | AI Act Compliance warning has no explanation — tooltips + "EU AI Act" naming | ✅ |
| P21 | Timeline always empty — no activity tracked | 🟠 |
| P22 | Usage & Telemetry — "Upgrade to unlock" should be free | ✅ |
| P23 | Backup & Restore doubled — also in Settings | ✅ |
| P24 | Events Replay unclear — needs explanation | ✅ |
| P25 | Scheduled Jobs toggle stays off after trigger | 🟠 |
| P26 | New scheduled job creation unclear — what does it do? | 🟠 |
| P27 | Skills & Apps — Installed vs Starter overlap | ✅ |
| P28 | Marketplace empty — should sync from DB | 🟠 |
| P29 | Skills & Apps cards not clickable — no detail card | 🟠 |
| P30 | MCP install flow unclear — copy npx command then what? | 🟠 |
| P31 | Second Marketplace app in dock — duplicate of Skills & Apps → Marketplace | ✅ |
| P32 | Team Governance visible on Free — should be Teams tier only | ✅ |
| P33 | "API Keys" tooltip vs "Vault" app name — unify | ✅ |
| P34 | Approvals redundant — move to Ops or delete | 🟠 |
| P35 | Spawn Agent "no models available — check backend config" — wrong | 🟠 |
| P36 | Dock spawn-agent icon separate + clicking does nothing | 🟠 |
| P37 | Ctrl-K search hidden — make more visible | ✅ |
| P38 | Status bar WiFi badge delete + 24h time format | ✅ |
| P39 | Status bar left shows static — should be dynamic model + folder | 🟡 |
| P40 | Light mode boot screen — no Waggle logo / animation | 🟠 |
| P41 | Light mode "Waggle AI" text styling ugly | 🟠 |
