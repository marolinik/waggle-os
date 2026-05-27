# BENCHMARK — Claude Code for Non-Coders (May 2026)

Competitive scan for Waggle OS. Snapshot of what a non-developer actually gets from Anthropic's Claude Code line, where it hooks them, and where it bleeds them.

## 1. Product surface today

Four surfaces, one substrate:

- **CLI** (`claude`) — terminal-first, the original Claude Code. Still the canonical surface for engineers.
- **Desktop app** (Mac + Windows, redesigned 2026-04-14) — three tabs: **Chat** (conversation), **Cowork** (Dispatch + long-running agentic work), **Code** (dev sessions with file tree, diff viewer, integrated terminal/editor, HTML/PDF preview, parallel sessions sidebar). No Linux desktop.
- **Web** at `claude.ai/code` — including **Ultra Plan** planning mode.
- **IDE plugins** — VS Code + JetBrains; **Slack** integration; SSH for remote work.

For the non-coder, the meaningful entry is the **Cowork** tab — explicitly positioned as "Claude Code without the scary terminal" since the Jan 2026 research preview / April 2026 GA. ([Anthropic Cowork](https://claude.com/product/cowork), [Desktop docs](https://code.claude.com/docs/en/desktop), [Desktop redesign blog](https://claude.com/blog/claude-code-desktop-redesign))

## 2. Non-coding workflows it supports well

- **Document creation** — built-in Skills produce real .docx, .xlsx (with working formulas), .pptx. ([Cowork Tutorial - DataCamp](https://www.datacamp.com/tutorial/claude-cowork-tutorial))
- **Research + literature review** — `academic-research-skills` suite hit v3.7.0 in May 2026, covers research → write → review → revise → finalise with PRISMA + citation verification. ([Tosea.ai guide](https://tosea.ai/blog/academic-research-skills-claude-code-suite-guide-2026))
- **PM/exec work** — PRDs, Jira tickets, SEO audits, "second brain" systems, spreadsheet editing. ([Dept. of Product](https://departmentofproduct.substack.com/p/how-to-use-claude-code-for-non-engineering))
- **Personal finance / data ops** — multi-credit-card expense trackers, year-of-engagement dataset analysis that broke claude.ai's UI cap. ([Every](https://every.to/source-code/how-to-use-claude-code-for-everyday-tasks-no-programming-required))
- **Cross-tool retrieval** — connectors give one prompt access to Gmail, Notion, Drive, Slack. ([TDS](https://towardsdatascience.com/how-to-apply-claude-code-to-non-technical-tasks/))
- **Sales outreach + CRM updates** — find ICP-matching prospects, draft outreach, write back to CRM.
- **Routines** (shipped 2026-04-14, all paid plans) — cron/webhook/API-triggered runs in Anthropic cloud; nightly triage, weekly digest, post-deploy verification translate to non-coder use as "every Monday brief me on X." ([Anthropic blog via VentureBeat](https://venturebeat.com/orchestration/we-tested-anthropics-redesigned-claude-code-desktop-app-and-routines-heres-what-enterprises-should-know))

## 3. Sticky design surfaces

- **Skills marketplace** — 9,000+ plugins as of Feb 2026, 200k devs/mo on the marketplace; official + community registries with SHA-pinned plugins. ([claudemarketplaces.com](https://claudemarketplaces.com/), [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official))
- **Skills auto-invoke** across web, desktop, and Code — non-coders don't have to "call" them. ([Product Talk](https://www.producttalk.org/how-to-use-claude-code-features/))
- **Memory** — four layers: hand-authored `CLAUDE.md`, learned `MEMORY.md` (200 lines / 25KB cap, loads each session), Memory Tool API, and per-subagent persistent directories. NOT cross-subagent shareable. ([orchestrator.dev](https://orchestrator.dev/blog/2026-04-06--claude-code-agent-memory-2026/), [Hindsight](https://hindsight.vectorize.io/blog/2026/05/06/claude-code-subagents-shared-memory))
- **Sub-agents + MCP + hooks** — full extensibility; same surface as coders.
- **Routines** — the "set and forget" loop that turns the tool into a daily habit.

## 4. Hook moment for the non-coder

The flip happens when claude.ai (the chat product) **stalls on a real dataset** — too many files, context cap, chat length. They move the same prompt into Cowork/Code, it finishes, and they never go back. Every and TDS both name this as the conversion event. Secondary hook: their first Routine runs overnight and they wake to a finished briefing.

## 5. What it lacks for non-coders

- **Terminal DNA still bleeds through** — even Cowork inherits CLI mental models; setup, auth, MCP wiring is engineer-coded language.
- **No Linux desktop**; mobile is "Dispatch from phone" only — not a real client.
- **Memory is plumbing, not a product** — `CLAUDE.md` is hand-edited markdown, `MEMORY.md` caps at 25KB and is per-subagent, no cross-session knowledge graph, no harvest from other AI tools, no entity/concept surfacing.
- **Skills install is dev-flavoured** — marketplace UI is GitHub-pinned commits, not a one-click app store.
- **Pricing meters by 5-hour windows** — non-coders hit them mid-document and get a wall.
- **Vendor-locked** — only Anthropic models; LiteLLM/local fallback not native.

## 6. Pricing

- **Pro $20/mo** (or $17 annualised): ~44k tokens / 5h window; includes Sonnet 4.6 + Opus 4.6 across CLI/desktop/web.
- **Max 5x $100/mo**: ~88k tokens / 5h window.
- **Max 20x $200/mo**: ~220k tokens / 5h window; weekly all-models + Sonnet-only caps reset 7 days post first session.
- **Team / Enterprise / API** above. ([Verdent](https://www.verdent.ai/guides/claude-code-pricing-2026), [Anthropic Max plan FAQ](https://support.claude.com/en/articles/11049741-what-is-the-max-plan))

## 7. Top 3 weaknesses Waggle can exploit

1. **Memory is plumbing, not product.** Waggle's FrameStore + HybridSearch + KnowledgeGraph + Identity + Awareness + Harvest is a real second brain — Claude Code has flat markdown capped at 25KB per subagent. Lead with "memory you can browse."
2. **Vendor + window lock-in.** Non-coders hit 5-hour caps mid-deck. Waggle's LiteLLM routing + local Ollama path makes the wall optional.
3. **Engineer aesthetics + Linux gap.** Even Cowork ships file trees, diff viewers, "sessions." Waggle's desktop OS metaphor (Dock, apps, Room) is non-coder-native by default.

## 8. Top 3 strengths Waggle must match

1. **Skills marketplace gravity** — 9k plugins is the moat. Waggle's MCP catalog (148 entries, dedup, simple-icons) is the spine; needs a one-click install UX + auto-invoke across personas.
2. **Routines / scheduled agents** — "wake up to a finished brief" is the addictive habit. Waggle's WaggleDance + cron-store must surface this as a first-class loop, not an admin setting.
3. **Document Skills that produce real files** — proper .docx/.xlsx (with formulas)/.pptx, not text dumps. Waggle's pptx/xlsx/docx skills exist but must be visible as the first thing a writer/analyst sees post-onboarding.

---

Sources inline. Compiled 2026-05-28 by Claude Code (Opus 4.7) for Waggle OS competitive intel.
