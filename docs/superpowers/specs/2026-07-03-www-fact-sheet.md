# www rebuild — verified fact sheet (2026-07-03)

Every marketing claim on apps/www traces to one of these. Verified directly against the repo / local OSS clone this session unless noted.

| Claim on site | Source | Status |
|---|---|---|
| "The AI workspace that remembers" / persistent memory substrate | `packages/hive-mind-core/src/mind/` (FrameStore, HybridSearch, KnowledgeGraph, IdentityLayer, AwarenessLayer); `docs/memory-architecture.md` | ✅ |
| Local-first, SQLite on device | `CLAUDE.md` §1 (better-sqlite3 + sqlite-vec); mind substrate | ✅ |
| Harvest imports: ChatGPT, Claude, Gemini, Perplexity, PDF, Markdown, URL | `CLAUDE.md` §2 harvest adapter list (`packages/hive-mind-core/src/harvest/`) | ✅ |
| LoCoMo 86.49% (N=1,540), +4.54pp vs Memori 81.95, z=4.64; Mem0 same-protocol 73.96; single-hop 92.27 | `benchmarks/results/locomo-sota-2026-06/`; `docs/methodology.md`; MEMORY.md benchmark-discipline pin (87.66 withdrawn — never use) | ✅ |
| Reproduce: `cd hive-mind/benchmarks/locomo && node artifacts/w4-n1540/recount.mjs` → `overall 1332/1540 = 86.49%` + "RECOUNT OK" | Read verbatim from `D:/Projects/hive-mind/benchmarks/locomo/README.md` + `artifacts/w4-n1540/recount.mjs` tail | ✅ verified on local clone |
| hive-mind is Apache-2.0 | `D:/Projects/hive-mind/LICENSE` (read: Apache License Version 2.0) | ✅ |
| npm: `@hive-mind/core` (+ wiki-compiler, mcp-server, cli, claude-code-hooks, enrichment, wiki-web) | OSS `README.md` npm badges | ✅ |
| Models: Claude, GPT, Gemini, Grok, DeepSeek, Perplexity, OpenRouter | `litellm-config.yaml` model_name entries (grep this session) | ✅ — NO Qwen entry; "local model with your own keys" kept as configuration option, not bundled inference |
| Tiers: TRIAL 15d all features; FREE forever 5 workspaces + agents + built-in skills; PRO $19 unlimited/marketplace/all connectors; TEAMS $49-seat shared/WaggleDance/governance; ENTERPRISE→KVARK | `packages/shared/src/tiers.ts` (read this session: TRIAL_DURATION_DAYS=15, FREE workspaceLimit 5, spawnAgents true, customSkills false; PRO connectorLimit -1, workspaceLimit -1, customSkills true; TEAMS per CLAUDE §1 table) | ⚠️ SUPERSEDED 2026-07-05 |
| _(post Solo-vs-Team collapse)_ Two-tier: TRIAL = 15-day Team preview → Solo; FREE(Solo) forever = unlimited workspaces+connectors, marketplace/custom skills, cloud embeddings, PDF/JSON export, basic audit; TEAMS $49-seat shared/WaggleDance/governance; ENTERPRISE→KVARK. **PRO removed.** | `packages/shared/src/tiers.ts` (TIERS=['TRIAL','FREE','TEAMS','ENTERPRISE'], TIER_LABELS FREE→'Solo'); `CLAUDE.md` §1 | ✅ |
| "Memory + Harvest free forever" | `tiers.ts` header comment (strategy line, verbatim) | ✅ |
| Annual prices $190 / $490-seat | Stripe M7 verification (MEMORY.md; pro_annual/teams_annual lookup keys exist live+test) | ✅ |
| 22 personas (8 universal + 14 specialists) | `CLAUDE.md` §5 / `persona-data.ts` | ✅ |
| Loops report-only + approval queue (held actions) | MEMORY 0629 S2 (Loops v0 L1 report-only) + S3 (`pending_actions` + `/api/approval`) — shipped to main | ✅ |
| Memory Center: view original source, erasure survives re-import, provenance | MEMORY 0630 S4 (view-source), 0702 S2 (sticky erasure `erased_subjects`), #7 arc closed | ✅ |
| Injection scanning on external input | `packages/agent/src/injection-scanner.ts` | ✅ |
| Keys in local vault | `packages/core/src/vault.ts` | ✅ |
| Skills integrity audit ("verified" badge) | MEMORY 0629 S1 (PRO skill-audit loop + badge) | ✅ |
| MCP server catalog | `packages/shared/src/mcp-catalog.ts` — surfaced WITHOUT a count on site | ✅ |
| Windows & macOS desktop (Tauri 2.0) | `CLAUDE.md` §1 | ✅ |
| KVARK sovereign copy | `CLAUDE.md` §9 canonical copy | ✅ |

## Do-not-claim (removed from old site or never added)
SOC 2 · multi-device/priority sync · 48h email SLA · dedicated account manager · 14-day trial (it's 15) · "advanced graph queries" as paid gate · user counts/testimonials · 87.66% · hero-visual fake stats (12,847 edges / 42ms P99 / 17 providers) · SSO/RBAC as shipped Teams feature (RBAC Phase 5 DEFERRED per founder pin) · Qwen as a configured provider.
