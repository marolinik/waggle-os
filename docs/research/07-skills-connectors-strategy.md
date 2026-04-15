# Skills + Connectors — Shipping Strategy, User Extension, Self-Evolution

**Author:** Waggle OS research series (7 of 7)
**Drafted:** 2026-04-15 (overnight batch)
**Scope:** Strategy for Waggle's two main extension points — Skills (prompt modules the agent loads on demand) and Connectors (MCP-style integrations to external systems). What ships at launch, how users extend, how the self-evolving loop works, and how we explain all this to non-technical users.

---

## TL;DR

**Skills and Connectors are the monetization trigger** per the tier strategy memory: Memory + Harvest are free forever (lock-in moat), but Skills and Connectors are what escalates a user from Free → Pro → Teams. So the shipping strategy matters.

**The shipping posture:** ship lean (~20 starter skills, ~12 starter native connectors, the MCP catalog for the 100+ long tail), make the creation loop visible so users *see* that skills are learnable and sharable, then let the self-evolving loop (GEPA + skill promotion + auto-extract + retirement) quietly make everything better over time.

**The explanation challenge:** most users don't know what "skill" or "MCP connector" means. The UX must translate these concepts into vocabulary the persona understands — for the Founder, a skill is "a saved way of working"; for the Developer, it's "composable prompt modules"; for the IT Admin, it's "a governed AI capability with an audit trail." One underlying system, multiple surface languages.

---

## 1. Strategic framing

### 1.1 Why Skills matter

A Skill in Waggle is a SKILL.md file with YAML frontmatter (name, description, scope, permissions) plus a body that explains *how to do a specific thing well.* The agent loads the relevant skill at the right moment based on the user's request, giving it compact, expert-authored guidance.

Why this matters strategically:
- **Reuse** — the user's best prompts get captured once, used forever
- **Sharing** — promotable scope (personal → workspace → team → enterprise) means a senior's skill can elevate the whole org
- **Auto-evolution** — Waggle's extractor → generator pipeline (Gap A shipped) auto-creates skills from repeated workflows without the user writing anything
- **Governance** — compliance officers love them: every skill has an author, a version, a scope, an audit trail
- **Monetization** — a skill marketplace is a natural Pro-tier upsell

### 1.2 Why Connectors matter

A Connector in Waggle lets an agent act on external systems (read your Gmail, post to Slack, query HubSpot). Waggle supports two styles:

- **Native connectors** (`packages/agent/src/connectors/*`) — TypeScript classes implementing `WaggleConnector`, shipped in the binary
- **MCP connectors** — Model Context Protocol servers, discoverable via the MCP catalog (`packages/shared/src/mcp-catalog.ts`), runnable as subprocesses or remote endpoints

Native is for the 10-15 hero integrations (Gmail, Slack, GitHub, etc.); MCP is for the long tail (the 100+ catalog entries). Both surface identically to the agent.

Why this matters:
- **Table stakes** for enterprise buyers — no connectors, no deal
- **Action** is what makes AI useful beyond chat; connectors are how agents *do things*
- **Ecosystem** — MCP is the industry's emerging standard; Waggle being a good MCP citizen is a defensive moat
- **Tier trigger** — "free gets 3 native + 10 MCP; Pro gets all 12 native + full MCP catalog" converts

---

## 2. Skills — shipping strategy

### 2.1 The starter pack (~20 skills)

A deliberate, curated set that covers the most common workflows across personas. Each skill is maintained by Waggle, versioned, and distributed with the binary.

**Writing** (4 skills)
- `long-form-writer` — produces essays, reports, blog posts with structure
- `email-drafter` — short, contextual emails in the user's voice (pulls from memory)
- `slide-deck-outliner` → pairs with `generate_docx` / `powerpoint-automation`
- `style-consistency` — maintains voice across a multi-doc project

**Coding** (4 skills)
- `tdd-workflow` — enforces write-test-first (already exists in skills library as `tdd`)
- `code-reviewer` — bug/security/style review on a diff
- `refactor-planner` — proposes refactor steps with tests
- `commit-message` — conventional commits from a diff

**Research** (3 skills)
- `deep-research` — multi-source synthesis with citations
- `market-scan` — competitive landscape with sources
- `literature-review` — academic paper synthesis

**Planning** (3 skills)
- `break-down-task` — decompose to checklist
- `prioritize` — RICE/MoSCoW framework application
- `retrospective` — structured post-mortem

**Analysis** (3 skills)
- `data-exploration` — profile + describe a dataset
- `statistical-sanity` — check distributions + outliers before a claim
- `chart-recommender` — pick the right viz for the question

**Professional** (3 skills)
- `stakeholder-update` — tailored update in the recipient's context
- `meeting-summary` — from transcript or notes
- `1:1-prep` — given a direct report's recent frames, draft talking points

### 2.2 Explanation to the user — per persona

The same underlying system, different vocabulary:

| Persona | How "skill" is introduced |
|---|---|
| Product owner | "Saved ways of working. When you ask me to draft a stakeholder update, I use your `stakeholder-update` skill so the output matches your voice every time." |
| Knowledge worker | "Expert-approved instructions your AI follows. Your legal team can author the `nda-review` skill once; everyone on the team uses it consistently." |
| Developer | "Composable prompt modules. They live in `~/.waggle/skills/*.md` — YAML frontmatter + markdown body. Git-manageable, version-controlled, promotable." |
| Researcher | "Structured method cards. Each skill encodes a methodology (e.g., `literature-review` applies a consistent synthesis framework)." |
| Founder | "Your competitive advantage, packaged. Your best prompts become your team's default way of working." |
| IT admin | "Governed AI capabilities with scope gates (personal / workspace / team / enterprise), audit trails, and permission boundaries. Promote only after review." |
| Prosumer | "Little helpers that know your style. The `email-drafter` skill learns your voice over time." |

One system, seven onboarding scripts. This should be reflected in persona-aware tooltips at skill-discovery points in the UI.

### 2.3 Tier gates

- **Free tier** — all 20 starter skills, personal scope only. Can create custom skills (unlimited personal). Cannot promote.
- **Pro tier ($19)** — everything free + marketplace access + promotion to workspace scope
- **Teams tier ($49/seat)** — + team scope promotion + shared skill library (requires `teamSkillLibrary` capability — already gated in `tiers.ts`)
- **Enterprise / KVARK** — + enterprise scope + SSO + attestation workflow for skill promotion (two-person approval, audit log)

### 2.4 The creation loop (how users extend)

Three pathways for users to create a new skill:

**Pathway 1: Write one from scratch.** `create_skill` tool or UI form. For users who know exactly what they want.

**Pathway 2: Capture from a conversation.** "Turn this into a skill" button after a successful interaction. Waggle runs `generateSkillMarkdown` with the conversation as input → produces a draft SKILL.md → user edits/saves. **This is the fastest path for most users.**

**Pathway 3: Auto-extract (Gap A, shipped).** When the same 3+ tool sequence repeats 2+ times in a session, the agent *offers* to save a skill: "I noticed you web-search → web-fetch → save-memory often. Save as a skill called 'research-workflow'?" User clicks yes or dismisses.

All three converge on the same SKILL.md artifact with the same frontmatter schema. Pathway 3 is the magic moment — showcase it in onboarding.

### 2.5 Promotion flow (Gap E, shipped)

Once a skill is working well at personal scope, the user promotes it up the ladder:

```
personal → workspace → team → enterprise
```

Each step is one rung — no jumps, no demotions. Tier gated (team requires `teamSkillLibrary`, enterprise requires ENTERPRISE tier). Frontmatter tracks the `promoted_from` history. A `skill_promotion` improvement signal is recorded per promotion for telemetry + eval.

**UX for promotion:**
- Right-click a skill → "Promote to workspace" → confirm
- Show the history: "This skill was promoted by Alice from personal on 2026-04-01, then promoted to team by Bob on 2026-04-12"
- On team promotion, show a diff of what team members will see

### 2.6 Self-evolution loop

Waggle's GEPA + EvolveSchema integration runs continuously over the most-used skills:

1. Every chat turn records an execution trace (`packages/core/src/mind/execution-traces.ts`)
2. The Evolution orchestrator (`evolution-orchestrator.ts`) periodically selects skills with ≥10 traces and runs a mini-evolution cycle against them
3. Candidate improved prompts are judged by LLM-as-judge (`judge.ts`) on a held-out slice of traces
4. If a candidate passes constraint gates (`evolution-gates.ts`) AND beats the incumbent by a meaningful margin, it's proposed to the user
5. User sees: "`stakeholder-update` skill has an improved version. Before/after comparison + score delta. Accept / reject / keep both."
6. Accept → deploy (the live prompt overrides file is updated atomically); the user's version of the skill evolves

**UX principle:** the user is always in the loop. We don't auto-deploy evolved prompts without consent. Surface the improvement *and* the reasoning ("here's why the new version scored higher — it better extracts context from memory before drafting").

### 2.7 Decay (Gap F, shipped)

Skills not used for ≥90 days get archived to `~/.waggle/skills-archive/` — recoverable, never deleted. Keeps the active library lean. User sees: "Archived 3 unused skills. See archive | Restore all."

---

## 3. Connectors — shipping strategy

### 3.1 Native starter pack (12 hero connectors)

Shipped in the binary, wired to per-connector OAuth, enforce per-action permissions, full audit trail.

| Category | Connector | Why priority |
|---|---|---|
| Email | **Gmail** | 60%+ of workforce; universal primary |
| Email | **Outlook** | enterprise | 
| Calendar | **Google Calendar** | reads for context, writes for scheduling |
| Calendar | **Outlook Calendar** | enterprise |
| Chat | **Slack** | team comms |
| Chat | **Microsoft Teams** | enterprise comms |
| Task | **Linear** | dev-heavy teams |
| Task | **Asana / Trello / Monday** | broad team tracking |
| Docs | **Notion** | power users |
| Docs | **Google Drive** | universal |
| Code | **GitHub** | dev teams + code review |
| Sales | **HubSpot** | founder / sales persona |

(MCP catalog covers 100+ more: Jira, Stripe, Salesforce, Zendesk, Discord, Figma, Intercom, Confluence, etc.)

### 3.2 Explanation to the user — per persona

| Persona | How "connector" is introduced |
|---|---|
| Product owner | "Lets your assistant act on your behalf in the tools you already use. Connect Gmail and I can draft replies in threads you care about." |
| Knowledge worker | "Permissioned integrations. Each one is opt-in, scoped to specific actions, and every action is logged for your audit trail." |
| Developer | "MCP servers + native SDK. Write your own against the `WaggleConnector` interface in `@waggle/agent`." |
| Researcher | "Data access to your papers, notes, and sources — bring your research surface into one mind." |
| Founder | "Connect the 5 tools you already pay for. Your AI works across them instead of forcing you to copy-paste." |
| IT admin | "Governed integrations with per-connector access control, audit logging, optional enterprise gateway routing. Marketplace can be whitelisted." |
| Prosumer | "Plug your AI into your life. Let it see your calendar, your email, your creative apps." |

### 3.3 Tier gates

- **Free** — 3 native connectors (of user's choice from the 12) + 10 MCP servers
- **Pro** — all 12 native + full MCP catalog + custom connector SDK
- **Teams** — + team-shared connector credentials (one admin connects, team benefits)
- **Enterprise / KVARK** — + enterprise gateway (all connector traffic routes through your firewall / SSO), connector whitelisting, forced encrypted credential vault, connector usage analytics

### 3.4 Custom connector SDK

Power users and enterprise teams write their own. The SDK is already in `packages/agent/src/connector-sdk.ts`:

```
WaggleConnector {
  id, name, description, actions[], 
  authenticate(), executeAction(action, params)
}
```

Documentation + template repo: `waggle-os/connector-template` (suggested Q3 2026 deliverable). Users should be able to scaffold `npm create @waggle/connector my-tool` and publish to the marketplace in under 30 minutes.

### 3.5 MCP catalog — the long tail

Per memory: 148+ MCP servers catalogued in `packages/shared/src/mcp-catalog.ts` with simple-icons + dedup guard. This is Waggle's answer to "do you support X?" — almost always yes, via MCP.

UX for discovery:
- Settings → Connectors → "Add a connector" → search bar over full catalog
- Categories: Productivity / CRM / Dev Tools / File Storage / Chat / Finance / Design / Marketing / etc.
- For each: one-click "Install" that pulls the MCP server, sets up config, prompts for auth

### 3.6 Approval gates

Every connector action fires through `packages/server/src/local/approval-grants.ts`. By autonomy level:
- **Normal mode** — every destructive/external action asks user confirmation
- **Trusted mode** — one-click "trust this skill for this session"
- **YOLO mode** — user accepts all (for speed; not recommended in regulated workspaces)

Audit trail records: who approved what, when, with what result. This is the receipt-keeping layer that serves the IT Admin and Knowledge Worker personas.

### 3.7 Self-evolution for connectors?

Evolution today operates on *prompts* (skills, personas, behavioral spec). Connectors are *code*. But there's a related loop: **capability-acquisition** (`packages/agent/src/capability-acquisition.ts`) detects when the agent couldn't do something because no connector covered it. A `capability_gap` improvement signal fires, and the user sees: "I couldn't do X because we're not connected to Y. Want to install the MCP server for Y?"

This is the connector-side analog of skill auto-extract. It makes the gap visible instead of letting it silently fail.

---

## 4. Marketplace strategy

### 4.1 Positioning

The Waggle Skill + Connector Marketplace is the **last mile of extension**. Starter skills ship for free; great third-party skills (and connectors) are sold or shared through the marketplace.

Model options (pick one, recommend A):

- **A. Free marketplace + attribution only.** All skills/connectors are free to install. Authors are surfaced with reputation scores ("installed by 4,200 users, 4.8★"). Revenue comes from Pro/Teams upsell, not marketplace take. Simpler, faster to launch, larger ecosystem. **Recommended.**
- **B. Freemium marketplace.** Free skills + paid skills (author sets price, Waggle takes 20%). More revenue upside but requires Stripe Connect, KYC for authors, dispute handling, customer support. Slower to ship.
- **C. Enterprise-only marketplace.** Only Teams/Enterprise tier sees third-party skills (free or paid). Reduces moderation burden + keeps the free tier safe. Hybrid with A works well.

### 4.2 Quality control

- Every submitted skill goes through a trust assessment (`trust-model.ts` already shipped — assesses permissions, code patterns, author history)
- Authors verified (GitHub OAuth baseline; enterprise-verified tier later)
- Report-abuse flow with fast remove
- Version pinning — when a skill updates, users opt in to new version rather than getting silent changes

### 4.3 Starter seeding

At launch, Waggle authors 20-40 "showcase" skills beyond the 20-skill starter pack. These demonstrate what's possible and set the quality bar.

---

## 5. Explanation assets to build

Every explanation needs an artifact to back it. Propose the following:

| Asset | Audience | Purpose |
|---|---|---|
| 3-min "What are skills?" video | Product owner, Founder, Prosumer | Set the mental model |
| Developer documentation | Developer, IT admin | Custom connector SDK + skill frontmatter spec |
| Governance white paper | IT admin, Compliance officer | How skill/connector promotion + audit works for regulated workspaces |
| Evolution explainer | Researcher, Product owner | How self-evolution works + how to opt out |
| Per-persona onboarding scripts | All 7 | Tooltip text, empty states, success messages |
| Marketplace author guide | Third-party devs | How to publish a skill and get distribution |

---

## 6. Phased action plan

### Phase 1 (2 weeks) — launch the starter pack

- Finalize the 20 starter skills (content + tests that each works end-to-end)
- Wire the 12 native connectors with OAuth flows
- Write per-persona onboarding copy
- Publish the 3-min explainer video

### Phase 2 (2 weeks) — creation loop polish

- "Turn this into a skill" button in chat after successful interactions
- Auto-extract notification UX (Gap A is shipped — surface the suggestion)
- Promotion dialog with diff preview
- Skill retirement notification (Gap F shipped — surface the weekly summary)

### Phase 3 (3 weeks) — marketplace v1

- Browse UI (categories, search, install button)
- Author profile + reputation
- Version management + opt-in updates
- Trust assessment surfaced on every install ("This skill requests: network access, write-file. Author: GitHub-verified.")

### Phase 4 (ongoing) — evolution visibility

- Settings → Evolution tab showing skills-pending-improvement
- Before/after preview UI
- Accept / reject / split-test workflow
- "Evolution statistics" dashboard (how many skills evolved, average score lift)

### Phase 5 (Q3+) — ecosystem

- Custom connector SDK docs + templates + `npm create`
- Developer portal (api.waggle-os.ai) for marketplace authors
- Enterprise connector gateway for KVARK
- Possible paid-skill monetization (Model B) if ecosystem demonstrates demand

---

## 7. Metrics

- **Skill adoption rate** — % of active users with ≥3 skills installed
- **Custom skill creation rate** — % creating ≥1 custom skill in first 30 days
- **Connector attach rate** — % connecting ≥1 connector in first session
- **Promotion rate** — monthly % of personal skills promoted to workspace+ (indicator of team value capture)
- **Auto-extract acceptance rate** — when the agent suggests a skill, how often is it accepted (indicator of suggestion quality)
- **Evolution acceptance rate** — same for evolved prompts
- **Marketplace activation** — DAU/MAU on browse; install-to-use ratio per listing

---

## 8. Risks + mitigations

| Risk | Mitigation |
|---|---|
| Skill marketplace becomes a dump of low-quality prompts | Curation via trust assessment + featured sections + reputation |
| Users confused about what a "skill" is vs a "connector" | Per-persona explanations + unified "Extensions" nav if confusion persists |
| Enterprise IT blocks marketplace over shadow-IT concerns | Whitelisting toggle in KVARK + SSO-gated skill access |
| Self-evolution pushes a bad prompt into production | User-in-loop always; constraint gates + rollback one-click (Gap E's frontmatter tracks promoted_from for reversibility) |
| MCP catalog goes stale (servers break, move, renamed) | Automated health-check cron (Q7 MCP check from harness follow-ons memo is directly applicable) |
| Custom connector authors ship security holes | Trust assessment + sandboxing (subprocess isolation for MCP; permissions for native) + disclosure policy |

---

## 9. Open decisions for Marko

1. **Marketplace model A vs B vs hybrid** — recommend A (free marketplace, revenue from tiers). Decide before Phase 3 kicks off.
2. **3-connector cap on Free tier** — is the restriction in the right place? Alternative: all connectors free, limit by *action volume* per day. Simpler UX but harder to monetize.
3. **Auto-evolution default** — opt-in or opt-out? Privacy-conscious users may want opt-in ("evolve my prompts" toggle off by default); growth-focused tuning wants opt-out. Strong recommend: **opt-in** during onboarding with a clear explanation.
4. **Video or written explainers** — prioritization question. Video is higher-production cost but 5-10x the engagement. My take: ship written first (lives in docs/), video as a Q3 production.
5. **Enterprise gateway architecture** — does KVARK inherit all Pro connectors via pass-through, or does enterprise require explicit whitelisting of every connector? This is a KVARK engagement-specific decision.

---

## Closing

Skills and Connectors are Waggle's answer to "what can your AI do?" The answer is "anything, and the more you use it the better it gets." The shipping strategy is: small curated starter set that shows off the range, easy creation loop (3 pathways including auto-extract), clear promotion ladder, visible self-evolution, generous marketplace, per-persona explanations that meet users where they are.

**Do not ship 200 skills at launch.** Ship 20 great ones + a compelling creation loop. Users teach Waggle what they actually need, and the ecosystem grows from there.
