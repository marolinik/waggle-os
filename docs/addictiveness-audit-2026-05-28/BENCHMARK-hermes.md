# BENCHMARK — Hermes Agent (Nous Research)

_Audit date: 2026-05-28. Verified via WebFetch on hermes-agent.nousresearch.com + github.com/NousResearch/hermes-agent + 6 third-party reviews._

## 1. Reality check

**Real and live.** Released **2026-02-25**, MIT-licensed, by **Nous Research**.
GitHub: <https://github.com/NousResearch/hermes-agent>. **Current version v0.14.0 ("Foundation Release"), 2026-05-16. ~170k stars** (95.6k at the 7-week mark — fastest-growing agent framework of 2026).
Companion repo `hermes-agent-self-evolution` adds DSPy + GEPA optimization. Docs site: hermes-agent.nousresearch.com.

**Corrections to your second-hand summary:**
- Release was **Feb 25, 2026**, not just "Feb 2026" — confirmed.
- Gateways are real, but list is **Telegram, Discord, Slack, WhatsApp, Signal, Email, CLI** (Email included; you missed it).
- "Sub-agents that spawn in parallel" is correct — isolated subagents with five sandbox backends (Docker, SSH, Singularity, Modal, Daytona).
- Platforms: **Linux/macOS/WSL2/Termux native; Windows PowerShell is early beta**, not first-class. Single-curl install only on Linux/macOS/WSL2.
- It is **not pure-OSS — Nous Portal is a paid hosted add-on** (300+ models + Tool Gateway: Firecrawl search, FAL image-gen, OpenAI TTS, Browser Use). Self-hosting works without it.

## 2. Daily-driver features (what locks users in)

- **Built-in learning loop.** Every ~15 tool calls Hermes pauses, analyzes what worked, and writes a reusable skill to `~/.hermes/skills/`. Skills self-improve on subsequent runs. This is the headline differentiator and visible in user reviews as the "compounding value" hook.
- **Persistent memory + Honcho dialectic user model.** FTS5 search over all past conversations + LLM summarization; an explicit model of "who you are" that survives across sessions and platforms.
- **`agentskills.io` open skill standard** — portable skill marketplace already nascent (`awesome-hermes-agent` repo lists community skills).
- **Natural-language cron** — "Send me a daily project digest at 8am to Telegram" parses to schedule + delivery channel.
- **Multi-gateway presence.** One agent reachable from 6 chat surfaces + email + CLI. Same memory across all.
- **Server-resident, not laptop-resident.** "Talk to it from Telegram while it works on a cloud VM" — runs on a $5 Hetzner VPS.

## 3. Addictive / sticky design

- **Variable reward via visible skill growth.** Users see `~/.hermes/skills/` directory fill up — concrete artifacts of "the agent got smarter today." Several reviews flag day-30 as the inflection point.
- **Daily trigger via cron + chat push.** Hermes initiates conversations (digests, briefings) rather than waiting to be opened — the gateway delivers to apps users already check.
- **Investment hook (IKEA effect).** Every interaction trains the user-model and creates skills the user "owns." Switching cost compounds invisibly.
- **Channel ubiquity.** Telegram/WhatsApp/Signal means engagement happens in the same threads where users already live — no separate app to remember to open.
- **No premium gate on the loop.** Memory + skills + cron are 100% free OSS, so the addictive layer is not behind a paywall.

## 4. Onboarding / hook moment

- **Install:** one curl line → `source ~/.bashrc` → `hermes setup` → `hermes`. ~2 minutes on Linux/macOS.
- **Day-2 hook (per reviews):** run **one** narrow repeating task (daily report, log triage) — once a skill auto-generates and triggers on day 2 via cron, users see the loop pay off concretely.
- **Day-30 inflection** is the most-cited retention milestone — the skills directory and user-model carry visible weight by then.
- **Friction:** CLI/SSH-first today. Issue #10488 tracks a "secure first-run web onboarding wizard" — they know non-technical users bounce. Not yet shipped.

## 5. UX surface

**Server-first, chat-on-top.** Daemon runs on a VPS; the user interacts via:
- **TUI** — full terminal interface with multiline edit, slash-command autocomplete, history.
- **Messaging gateways** — Telegram/Discord/Slack/WhatsApp/Signal/Email (cross-platform conversation continuity).
- **No desktop app, no native GUI, no browser app.** This is the biggest UX gap vs. Waggle.

## 6. Pricing / OSS vs hosted

- **Core agent: free, MIT, self-hosted.** No seat/feature paywall.
- **Infra:** $4–$25/mo VPS + $2–$15/mo LLM API → realistic floor **~$6/mo** (Hetzner + DeepSeek V4 with caching).
- **Nous Portal (optional):** subscription gives 300+ models routed + Tool Gateway (search/image/TTS/browser). No public flat price; per portal.nousresearch.com it's a managed sub.
- **Third-party managed hosting:** $6/mo (OpenClaw Launch) → $59/mo (FlyHermes); enterprise "PTG" tiers $5K–$40K+ one-time.

## 7. Top 3 weaknesses Waggle can exploit

1. **No real GUI.** TUI + chat-bots only. No file browser, no canvas, no spatial workspace, no visual memory view. Waggle's desktop OS metaphor + Room canvas is a category-different surface for the ~80% of knowledge workers who don't live in terminals.
2. **Windows is second-class.** Native PowerShell support is "early beta"; the curl-installer flow is Linux/macOS/WSL2. Waggle ships Windows binaries as first-class.
3. **Non-technical onboarding is unsolved** (their own issue #10488). VPS + DNS + SSH is a hard wall. Waggle's local-first Tauri install is one-click — no infra to provision.

## 8. Top 3 strengths Waggle should match

1. **Visible compounding value.** The `~/.hermes/skills/` directory is the killer artifact — users *see* the agent get smarter. Waggle has Wiki Compiler and an Evolution subsystem, but neither surfaces as a "look how much I taught it" trophy case. **Action:** ship a Skills/Memory growth tile on the OS dock with delta counters ("+3 skills, +47 frames this week"). Mission Control tile is the natural home.
2. **Cron + push to chat surfaces.** Hermes pulls users back via daily digests delivered to Telegram. Waggle's signal bus + Launcher arc is the foundation, but we have no outbound digest path. **Action:** wire scheduled agents → email/Slack/Telegram delivery (the AI-OS arc opens the door; finish the loop).
3. **Open skill standard (`agentskills.io`).** Community-portable skills + the `awesome-hermes-agent` curated list. Waggle has skills internally but no public registry / marketplace front-door. **Action:** publish skill format + a public registry — this is the network-effect moat we keep deferring.

---

**Sources:**
- <https://github.com/NousResearch/hermes-agent> (v0.14.0, 170k stars, MIT)
- <https://hermes-agent.nousresearch.com/> (marketing copy, gateway list)
- <https://github.com/NousResearch/hermes-agent/issues/10488> (web-onboarding gap)
- <https://github.com/NousResearch/hermes-agent-self-evolution> (DSPy + GEPA companion)
- <https://github.com/0xNyk/awesome-hermes-agent> (community skill registry)
- <https://portal.nousresearch.com/manage-subscription> (Nous Portal hosted tier)
- TokenMix / innobu / Fastio / MindStudio / userorbit / DEV.to reviews (day-30 retention, addictive loop)
