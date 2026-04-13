---
type: entity
entity_type: project
name: "Waggle OS"
confidence: 0.90
sources: 30
last_compiled: 2026-04-13T20:35:34.634Z
frame_ids: [154, 174, 171, 167, 150, 133, 120, 92, 39, 82, 41, 60, 832, 796, 846, 907, 37, 780, 38, 844, 791, 836, 788, 845, 787, 786, 848, 852, 789, 1005]
related_entities: ["EU AI Act", "KVARK", "Tier Strategy", "Memory MCP", "Wiki Compiler", "Memory Harvest", "React", "TypeScript", "Tauri", "SQLite", "Fastify", "Clerk", "Egzakta Group", "Marko Markovic"]
---

# Waggle OS

# Waggle OS

## Summary

**Waggle OS** is a desktop-native AI agent platform with persistent structured memory, built by Egzakta Group as the demand-generation engine for KVARK (the company's sovereign enterprise AI platform). Shipping as a Tauri 2.0 desktop application with React frontend and Node.js sidecar, Waggle enables individuals and teams to manage AI conversations across 20+ platforms through unified memory, audit trails, and agent-native workflows. The product is technologically mature (4,409 passing tests, zero TypeScript errors as of March 2026) but requires UI/UX refinement and Memory Harvest feature completion before public launch.

---

## Key Facts

**Technical Foundation**
- Built with Tauri 2.0 (Rust desktop + React frontend + Node.js sidecar) [Frame #780]
- Language preference: TypeScript for development [Frame #154]
- Persists memory in SQLite `.mind` files with FTS5 + sqlite-vec + knowledge graph [Frame #846]
- Includes Memory MCP plugin (18 tools, 4 resources) compatible with Claude Code, Claude Desktop, and any MCP client [Frame #786]
- Test suite: 4,409 passing tests, 100% pass rate as of March 2026; 4,185+ tests by Wave 11 [Frame #844, #848]
- TypeScript errors: 0 (fixed from 87 in production hardening wave) [Frame #844]

**Product Architecture**
- Five-layer memory system: personal.mind, workspace.mind, collective.mind, team minds [Frame #846]
- Agents communicate via **Waggle Dance** protocol for inter-agent memory and knowledge exchange [Frame #846]
- 80+ tools, 22 personas, skill SDK with manifest system [Frame #844, #845]
- Model router supporting multi-provider LLM access [Frame #832]
- Interactive CLI (REPL, slash commands, markdown rendering) [Frame #832]
- Plugin system with manifest validation, install/uninstall [Frame #832]

**Project Status (as of March 2026)**
- **Milestone 0**: Complete (172 tests) [Frame #832]
- **Milestone 1**: Complete — desktop app shipping as 10.6 MB waggle.exe binary [Frame #832]
- **Milestone 2**: Complete — 232 tests, 7 commits, 6 npm packages (@waggle/core, agent, optimizer, weaver, cli, sdk) [Frame #832]
- **Gap Register**: 68 of 69 items implemented in March 2026; 3 items deferred to enterprise phase (KVARK integration, SSO, Tauri build verification) [Frame #848]
- **Wave 11 Production Hardening** (2026-03-20): 57 audit findings fixed (8 CRITICAL → 0); security, agent rate-limiting, frontend error boundaries, accessibility hardened [Frame #844]
- **npm Publishing**: `@waggle-ai/waggle` v1.0.0 published on npmjs.com [Frame #844]

**Launch Readiness**
- Internal testing phase (friends & family) is active; product ready for unsigned distribution [Frame #836]
- **Blocking public launch**: Code signing (recommendation: SSL.com eSigner EV ~$240/yr or Certum SimplySign EV ~$249/yr using Netherlands entity) [Frame #836]
- KVARK wiring specified (6 HTTP endpoints, 3 P0 for MVP: login, me, search) — awaiting KVARK API availability [Frame #836]
- All deferred items non-blocking for internal testing [Frame #836]

**UI/UX Status**
- Two CSS systems diverge on design tokens; 360+ instances of 9-10px text reduce readability [Frame #1005]
- Stripe billing integration has 5 blocking gaps [Frame #1005]
- Memory Harvest (consolidate conversations from 20+ platforms) still spec-only, not built [Frame #1005]
- SplashScreen on-brand, light theme fixed, all hardcoded hex values → theme tokens in Wave 11 [Frame #844]
- Accessibility (ARIA) hardened; App.tsx refactored (1338 → 1140 lines, 6 hooks extracted) [Frame #844]

**Business Model & Revenue**
- **Tier funnel**: Solo (Free) → Basic ($15/mo) → Teams ($79/mo) → Enterprise (consultative KVARK sale) [Frame #789]
- KVARK context: EUR 1.2M in contracted revenue; Waggle is intentionally free/cheap, not direct revenue driver [Frame #788, #846]
- Egzakta Group: ~200 employees, EUR 4.5M EBITDA, targeting EUR 10M in 2026 [Frame #846]
- Key enterprise opportunities: EPS, Yettel, AOFI, EU Horizon 2026, Clipperton Finance [Frame #846]

**Strategic Vision**
- Two core hooks for market penetration:
  1. **"Bring Your Memory Home"** — Memory Harvest consolidates 20+ platform conversations into governed workspace [Frame #1005]
  2. **"AI Act Compliance by Default"** — All work auditable inside Waggle; no bolt-on governance needed [Frame #1005]
- Sovereign deployment moat: CEE/SEE regulated markets (banking, utilities, government) legally cannot use US cloud AI; Waggle + KVARK meet regulatory requirement [Frame #846]
- Universal Memory Harvest spec v1.0 complete; implementation planned for post-launch phase [Frame #846]
- EvolveSchema/GAPA evolutionary schema optimization proven in research (+2-4 pp across benchmarks); research phase complete, integration pending [Frame #846]

**Team & Governance**
- Built by Egzakta Group (founded by Marko Markovic) [Frame #791]
- Key people: Marko (strategy + enterprise sales), Mihail (GAPA + KVARK backend), Marko D. (Waggle architecture), Ivan (LM TEK + hardware) [Frame #846]
- CLI/config system supports `~/.waggle/` home directory [Frame #832]
- Slack for team communication [Frame #38]

**Deferred/