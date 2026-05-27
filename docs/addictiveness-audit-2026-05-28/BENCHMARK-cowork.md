# BENCHMARK — Claude Cowork (Anthropic)

> Real, shipping product. Verified against `claude.com/product/cowork`, Anthropic Help Center, the public `anthropics/knowledge-work-plugins` repo, and the April 9 2026 GA announcement.

## 1. What it is (verified)

Anthropic's agentic AI for knowledge workers. Launched as research preview Jan 12 2026, expanded with enterprise connectors Feb 24, **GA April 9 2026** across all paid plans. Lives as a **separate "Cowork" tab inside the Claude Desktop app** (macOS/Windows) — switches Claude from chatbot to autonomous agent that can read/write local files, coordinate sub-agents, and produce finished deliverables (xlsx, pptx, docx) instead of chat replies. Positioned as "Claude Code for everyone who isn't an engineer."

## 2. Daily-driver features

- **Autonomous task execution.** "Describe the task you want Claude to complete" — point at a folder, walk away, return to finished work. File ops (rename, sort, dedupe), document synthesis, research synthesis, data extraction.
- **Plugin marketplace.** 11 official Knowledge Work Plugins (Sales, Marketing, Legal, Finance, Data, Product Mgmt, Customer Support, Enterprise Search, Bio-Research, Productivity, Plugin Mgmt) — each bundles skills + slash commands + MCP connectors + sub-agents per role. Open-sourced at `github.com/anthropics/knowledge-work-plugins`. Partner plugins (Apollo, Common Room, Stripe, etc.) layer on top.
- **Sub-agent parallelism.** Explicit "use sub-agents to process these 50 files in parallel" — ~30 min → ~4 min in tests. Manual invocation, not auto.
- **Connectors via MCP.** Gmail, Google Drive, Notion, Slack, HubSpot, Linear, Jira, Snowflake, BigQuery, DocuSign, FactSet, Figma, Zoom (GA-launch connector), Microsoft 365, plus role-specific (PubMed/Benchling for bio, Klaviyo/Ahrefs for marketing).
- **Skills as governance, not hints.** "Skills in Chat were useful, Skills in Cowork are operational" — a brand-guidelines skill governs every file Cowork produces, not just one reply.
- **Scheduled tasks.** Recurring autonomous runs — flagged by power users as "one of the most useful 2026 features."

## 3. Addictive / sticky design

- **Output is a real artifact**, not a chat thread. Excel with working formulas, deck, doc — closes the loop chat never closes.
- **Delegation flywheel.** First successful end-of-day "I gave it 3 hours of work and it shipped" creates lock-in; users now build a personal library of plugins/skills.
- **Plugin gravity.** Each installed plugin = role identity + 6-12 MCP connectors authorized. Switching cost grows linearly.
- **Scheduled runs** turn it into infrastructure, not a tool you remember to open.
- **Progress transparency** during long runs — visible reasoning + step list keeps users watching instead of bouncing.

## 4. Onboarding / hook moment

Install Claude Desktop → upgrade to any paid plan → see Chat | Cowork tab toggle → click Cowork → empty-state prompt "Describe the task you want Claude to complete" + permission-mode selector (ask vs autonomous). **Hook moment**: first run that touches local files autonomously and returns a polished deliverable. No setup wizard, no template gallery — minimal scaffolding, maximum "just give it a goal" framing. Plugins are discovered later via `claude.com/plugins`.

## 5. UX surface

**Desktop-only execution** (macOS/Windows, Electron). Mobile users on Pro/Max can message Claude from phone but Cowork tasks only run on desktop. Tab inside Claude Desktop, not a separate binary. Requires desktop app open for session continuity — close app = session ends.

## 6. Pricing

Included in **Pro ($17-20/mo), Max ($100/$200/mo), Team ($20-25/seat/mo, but Cowork access needs a $100-125 "Premium Seat"), Enterprise (consultative).** **Free tier does NOT include Cowork** — that's the upgrade gate. GA added enterprise-grade RBAC, group spend limits, OpenTelemetry export, usage analytics API.

## 7. Top 3 weaknesses Waggle can exploit

1. **No persistent memory across sessions.** Users must hand-author `CLAUDE.md` / `memories.md` to fake it. Anthropic's own power-user reviewers flag this as a major pain. **Waggle's FrameStore + HybridSearch + KnowledgeGraph + harvest from every prior AI tool is the answer** — and it's free forever.
2. **Desktop-app session dependency.** Close the app = lose the session. No background daemon, no resume. Waggle is a Tauri binary with a Fastify sidecar that already supports cron/scheduled runs and per-workspace persistence.
3. **Plugin context budget bleed.** Many skills loaded simultaneously consume ~2% context each — "Claude starts behaving like it forgot a skill exists." Waggle's per-persona tool filtering + workspace-scoped tool pools sidesteps this structurally.

## 8. Top 3 strengths Waggle must match

1. **Plugin marketplace gravity.** 11 official + open-source + claude.com/plugins distribution. **Waggle has the catalog (148 MCP entries) and the personas; needs the one-click installer + a curated "knowledge-work bundle" parity story** so a Sales user sees "Sales" not "configure 8 connectors."
2. **Output = real artifacts, not chat.** xlsx with formulas, pptx, docx as default deliverables. Waggle has the artifact rails (Files app, Weaver) but needs to default to "ship the deliverable" instead of "render the chat."
3. **Sub-agent parallelism as a felt 10× speed-up.** Cowork's "30 min → 4 min" narrative is the single most viral demo. WaggleDance + subagent-orchestrator + worker package exists — needs the same instrument-grade demo (one prompt → 10 parallel agents → finished bundle).

---
**Verified against Anthropic primary sources May 28 2026. No fabricated facts.**
