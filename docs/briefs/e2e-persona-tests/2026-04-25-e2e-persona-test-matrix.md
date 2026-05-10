# E2E Persona Test Matrix — 3 Tier × 3 Proficiency × Persona Mapping

**Date**: 2026-04-25 (autored 2026-04-24 late evening)
**Status**: Test scripts ready, čekaju executable app + test accounts
**Authored by**: claude-opus-4-7 (PM Cowork)
**Execution method**: PM (claude-opus-4-7) sa Claude in Chrome computer use, observational testing kao stvarni user; friction log generates JSON per scenario; Marko reviewa rezultate
**Scope per Marko brief 2026-04-24**: "ne samo naplatne tiere nego i tri nivoa usera - starter, pro, professional - power user"

## §0 Architecture

### 3 monetization tiers (LOCKED per `project_locked_decisions`)
- **FREE** ($0/forever) — 5 workspaces, 22 personas, 60+ tools, persistent .mind, harvest, encrypted vault, wiki compiler, self-evolution
- **PRO** ($19/mo) — Free + unlimited workspaces, all embedding providers, skills marketplace, custom skills, compliance audit reports, priority support
- **TEAMS** ($49/seat/mo) — Pro + shared team memory, WaggleDance coordination, team skill library, admin governance, S3 team storage, audit trail compliance

### 3 user proficiency levels (per Marko brief)
- **STARTER** — first-time user, never used AI agent platform, expects guided experience, limited technical context, learns by doing
- **PRO** — regular user, knows AI agent basics (used Claude Code / Cursor / GPT API), comfortable with concepts but new to Waggle paradigm
- **PROFESSIONAL** (power user) — advanced workflows, multiple agents simultaneously, custom skills, MCP server integration, governance + audit needs

### 3 × 3 = 9 archetype matrix

| | STARTER | PRO | PROFESSIONAL |
|---|---|---|---|
| **FREE** | A1: Curious newbie | A2: Existing AI user testing alternatives | A3: Power user evaluating before buying |
| **PRO** | A4: Onboarded paying user (first month) | A5: Settled paying user (3+ months) | A6: Solo professional sa heavy workflows |
| **TEAMS** | A7: New team member onboarded by admin | A8: Active team contributor | A9: Team admin sa governance ownership |

### Persona overlay (13 bee personas iz DS spec)

Per archetype mapping, izaberem 1-2 reprezentativne persona za testing realism:
- A1 (Free Starter): **bee-confused** (overwhelmed first-timer)
- A2 (Free Pro): **bee-researcher** (academic on free tier)
- A3 (Free Professional): **bee-architect** (systems thinker, evaluating)
- A4 (Pro Starter): **bee-builder** (developer building first project)
- A5 (Pro Pro): **bee-writer** (content creator, regular use)
- A6 (Pro Professional): **bee-orchestrator** (multi-agent coordinator)
- A7 (Teams Starter): **bee-marketer** (joined team, learning)
- A8 (Teams Pro): **bee-analyst** (active team contributor)
- A9 (Teams Professional): **bee-team** (team admin/lead)

Plus dva edge case persone:
- **bee-hunter** (sales/BD, used cross-archetype za commercial scenarios)
- **bee-celebrating** (success state — does notification flow work?)
- **bee-sleeping** (idle state — what happens when user disengages?)

---

## §1 Pre-test setup checklist

Pre svakog scenario-a:

1. **Browser**: incognito Chromium (no cached state, no localStorage pollution)
2. **Device emulation**: standard desktop 1440×900, ne mobile (Tauri app je desktop-first)
3. **Network throttling**: none initially, simulate Fast 3G u stress scenarijima
4. **Test account credentials** (Marko provides): per-tier test accounts seeded sa appropriate persona profile
5. **Seed data**:
   - FREE accounts: empty workspace
   - PRO accounts: 3-5 sample memories, 2 agents idle
   - TEAMS accounts: shared workspace sa 5 members, 10 sample memories, audit log entries
6. **Time-of-day**: skip A/B variants for now, all tests at same time-of-day to remove temporal variance
7. **Snapshots**: pre-test screenshot, post-test screenshot, friction-event screenshots (captured by computer-use mid-flow)
8. **Friction log**: open `friction-log-{archetype}-{persona}.json` template at start, populate during

### Friction log JSON schema

```json
{
  "archetype": "A4-Pro-Starter",
  "persona": "bee-builder",
  "session_id": "uuid",
  "started_at": "2026-04-25T10:00:00Z",
  "ended_at": "2026-04-25T10:32:00Z",
  "duration_seconds": 1920,
  "scenario_completed": true,
  "events": [
    {
      "step": 1,
      "action": "click signup button",
      "expected": "redirect to signup form",
      "observed": "redirect to signup form",
      "friction_score": 0,
      "friction_note": null,
      "screenshot": "01-signup-clicked.png",
      "timestamp_seconds": 5
    },
    {
      "step": 2,
      "action": "complete email + password",
      "expected": "submit, redirect to onboarding wizard",
      "observed": "submit, but error 'password too weak' surprised user",
      "friction_score": 2,
      "friction_note": "User attempted 8-char password. App requires 12+ but error message didn't say that until after submit. Pre-validate during typing.",
      "screenshot": "02-password-error.png",
      "timestamp_seconds": 65
    }
  ],
  "summary": {
    "completion_rate": "5/6 sub-tasks completed",
    "avg_friction": 1.4,
    "highest_friction_step": 2,
    "deal_breakers": [],
    "delight_moments": [
      "Onboarding step 3 (persona selection) — smooth, well-designed grid"
    ],
    "improvement_suggestions": [
      "Pre-validate password during typing",
      "Add 'show password' toggle (currently hidden)"
    ]
  }
}
```

friction_score scale: 0 (smooth) / 1 (slight pause, no impact) / 2 (noticeable hesitation) / 3 (re-try required) / 4 (user almost abandoned) / 5 (complete blocker, scenario fail)

---

## §2 Coverage area inventory

Per scenario, svi profili pokrivaju subset:

| Coverage area | Description |
|---|---|
| **CA-1**: Signup + onboarding (8-step) | Welcome → WhyWaggle → Persona → ApiKey → Template → ModelTier → Import → Tier → Ready |
| **CA-2**: First memory creation | Manual entry sa scope + tag + content; verify save + appears u Memory app |
| **CA-3**: Harvest from chat | Connect provider, harvest existing chat session into memory |
| **CA-4**: Memory search | Search by name + filter by scope/tag + date range |
| **CA-5**: Graph viewport | Open Graph app, navigate force-directed canvas, click node, see drawer |
| **CA-6**: Agent spawn | Spawn agent via dock → app → "+ New Agent" or ⌘K, assign task, monitor status |
| **CA-7**: Multi-window | Open Memory + Graph + Cockpit simultaneously, drag/resize, z-order interactions |
| **CA-8**: ⌘K palette | Trigger palette in different contexts (desktop, Memory, Graph, Agents), execute commands |
| **CA-9**: Provenance audit | Open Provenance app, filter by event type, replay event state, export CSV |
| **CA-10**: Light/dark toggle | Settings → Appearance → toggle Auto/Light/Dark, verify smooth transition + token swap |
| **CA-11**: Tier upgrade flow | Click upgrade CTA, complete Stripe checkout (test card), verify tier change + new features unlocked |
| **CA-12**: Tier downgrade flow | Cancel subscription, verify graceful degradation (data preserved, features locked) |
| **CA-13**: Settings configuration | Preferences, keyboard shortcuts, providers, policy |
| **CA-14**: Notifications | Trigger toast (success + error + policy), open NotificationInbox, mark read, filter |
| **CA-15**: ⌘? shortcuts modal | Open keyboard shortcuts registry, search filter, navigate, learn |
| **CA-16**: Error handling | Network drop, invalid API key, parse error mid-flow — graceful recovery |
| **CA-17**: Workspace management | Create new workspace, switch workspaces, archive |
| **CA-18**: Skills marketplace (Pro+) | Browse marketplace, install skill, configure |
| **CA-19**: Team coordination (Teams) | Invite member, share workspace, audit member actions |
| **CA-20**: Custom skill creation (Pro+) | Build custom skill, test, publish to team library |

---

## §3 Per-archetype test scripts

### A1 — FREE Starter (bee-confused)

**Profile**: First-time AI agent platform user. Has heard about Waggle from a friend. Privacy-conscious. Tech savvy enough to install desktop apps but new to AI agent paradigms. Goal: try it free, see if it makes sense.

**Pre-test state**: Fresh download, no account, no .mind files.

**Scenario duration target**: 30-45 min

**Coverage**: CA-1, CA-2, CA-7, CA-8, CA-15, CA-16

**Step-by-step script**:

1. **Land on waggle-os.ai** — observable: hero banner, "Free for individuals" subtext, Download CTAs visible
   - Friction probe: does CTA copy resonate? Is "no credit card" trust signal clear?
2. **Click "Download for Windows"** — observable: redirect to GitHub releases latest
   - Friction probe: does GitHub UI feel scary to non-developer? Does .exe vs .msi vs portable confuse?
3. **Install + launch** — observable: BootScreen, OnboardingWizard appears
4. **Onboarding step 1 (Welcome)** — read welcome copy, click "Begin →"
   - Friction probe: does "AI agents that remember" make sense without technical context?
5. **Step 2 (WhyWaggle)** — read why-now narrative
   - Friction probe: too long? boring? appropriate depth?
6. **Step 3 (Persona)** — select "bee-confused" persona ("New to AI? Start here.")
   - Friction probe: does 13-grid overwhelm? Are persona descriptions clear?
7. **Step 4 (ApiKey)** — IMPORTANT — STARTER may not have any API key
   - Friction probe: does "Skip — use local Ollama" option exist? If not, ABANDON RISK
   - Expected: graceful path for users without API keys (local model fallback)
8. **Step 5 (Template)** — select "personal notes" template
9. **Step 6 (ModelTier)** — select default (local Ollama / Llama 3 if no API key)
10. **Step 7 (Import)** — skip (no existing data)
11. **Step 8 (Tier)** — select Free tier
12. **Step 9 (Ready)** — click "Start using Waggle"
13. **Land on desktop** — observable: BootScreen complete, desktop with dock visible, Cockpit auto-opened
   - Friction probe: does empty desktop feel inviting or intimidating?
14. **First memory creation (CA-2)** — open Memory app from dock, click "+ New memory"
    - Type: name = "My first thought", scope = "personal", content = "Testing Waggle to see how this works."
    - Save, verify appears u list
15. **Multi-window test (CA-7)** — open Graph app, observe empty graph (no nodes yet)
    - Friction probe: does empty state explain "Add memories to populate graph"?
16. **⌘K palette (CA-8)** — press Cmd-K (or Ctrl-K on Win), see palette
    - Try "search memories" → find created memory
    - Friction probe: does ⌘K feel discoverable? Hint visible somewhere u UI?
17. **⌘? shortcuts (CA-15)** — press Cmd-? to see shortcuts registry
    - Friction probe: does power-user feature gate intimidate Starter?
18. **Error simulation (CA-16)** — disconnect network, try search
    - Expected: graceful "you're offline, search using local cache" message
19. **End test** — close all windows, observe state preservation

**Success criteria**:
- Onboarding completed without abandoning (8/8 steps)
- First memory created and searchable
- User did not require external help (no Discord/email)
- Net friction score average ≤ 2.0
- 0 deal-breakers (friction_score ≥ 5)

---

### A2 — FREE Pro (bee-researcher)

**Profile**: PhD candidate, uses Claude/GPT daily, knows about RAG, vector DBs. Has API keys for multiple providers. Wants to evaluate Waggle as alternative to NotebookLM / Mem0. Will switch if it's better.

**Coverage**: CA-1 (faster), CA-3, CA-4, CA-5, CA-9, CA-13

**Step-by-step script**:

1. Skip — same Hero + download as A1, but completes onboarding ~10x faster
2. **Onboarding (CA-1, abbreviated)** — provides Anthropic + OpenAI + Together API keys, selects "researcher" persona, "academic-research" template
3. **Harvest existing chat (CA-3)** — connect Anthropic API key, harvest last 50 conversations
   - Friction probe: does harvest UI explain what gets imported? Privacy implication clear?
4. **Memory search (CA-4)** — after harvest, search "elasticity" or domain-specific term
   - Friction probe: does search return semantic matches or only keyword? Is ranking sensible?
5. **Graph viewport (CA-5)** — open Graph app, see imported memories as nodes
   - Click a node, see drawer sa Properties / Neighbors / Bitemporal
   - Friction probe: bitemporal interface — does Researcher persona understand "VALID vs RECORDED"? Tooltip / explainer needed?
6. **Provenance audit (CA-9)** — open Provenance app, see harvest events
   - Filter by source = "anthropic", inspect single event
   - Friction probe: does provenance UI feel valuable to academic (citation use case) or overkill?
7. **Settings (CA-13)** — Preferences, configure default model = Claude Sonnet 4
   - Friction probe: does provider routing UI confuse? Is "cost meter" visible?

**Success criteria**:
- Harvest succeeds (50/50 chats imported, memories created)
- Search returns relevant results (not just keyword match)
- Graph visualization meaningful (clusters, edges represent something)
- User remains on Free tier after test (no upsell pressure resented)
- User comments "I'd recommend this to colleagues" (qualitative)

---

### A3 — FREE Professional / Power User (bee-architect)

**Profile**: Senior systems architect, runs local LLMs, builds MCP servers, evaluates tooling for adoption. Goal: stress-test Waggle's architecture, see if it's production-grade.

**Coverage**: CA-1 (skipped — direct config), CA-3, CA-5, CA-7, CA-9, CA-13, CA-14

**Step-by-step script**:

1. Skip onboarding via "advanced setup" path (if exists)
2. **MCP server inspection** — verify Waggle's MCP server endpoint exposed locally (default port?), test from Claude Code
   - Friction probe: is MCP endpoint discoverable without docs?
3. **Custom provider** — add custom OpenAI-compatible endpoint (e.g., local vLLM)
   - Friction probe: provider configuration sufficiently flexible?
4. **Heavy harvest** — import 5,000+ memory items via batch script (.mind file format)
   - Friction probe: large import progress indicator, error recovery?
5. **Graph stress** — open Graph app sa 5,000 nodes, pan/zoom performance
   - Friction probe: rendering FPS, search latency u large graph?
6. **Multi-window stress (CA-7)** — open all 23 apps simultaneously
   - Friction probe: does compositor handle? Memory leak?
7. **Audit provenance (CA-9)** — query 100k events, export CSV
   - Friction probe: query latency, CSV size limit, EU AI Act audit triggers visible?
8. **Notification flood (CA-14)** — trigger 50 simultaneous notifications
   - Friction probe: NotificationInbox aggregation? Toast queue management?
9. **Resource monitoring** — check Cockpit u stress conditions: memory usage, CPU, network
   - Friction probe: visible OOM risk warnings? Cost meter accurate?

**Success criteria**:
- MCP server discovery + connection working
- 5,000-node graph remains usable (≥30 FPS pan)
- Notification system doesn't break under flood
- No data loss on stress operations
- Cockpit metrics accurate
- User adoption decision: "I'll try this in my team" (qualitative)

---

### A4 — PRO Starter (bee-builder)

**Profile**: Junior developer, hired into team using Waggle, paid Pro tier issued. First week, learning the tool. Goal: become productive without feeling overwhelmed.

**Coverage**: CA-1 (with API keys provided by team), CA-2, CA-4, CA-6, CA-8, CA-11

**Step-by-step script**:

1. **Login sa pre-existing Pro account** — observable: tier badge "PRO" visible u Settings or Cockpit
2. **Quick onboarding (CA-1)** — accept defaults set by admin (template, model tier)
3. **First memory (CA-2)** — same as A1 but slightly more complex (project context)
4. **Memory search (CA-4)** — search project terms
5. **Spawn agent (CA-6)** — open Agents app, click "+ Spawn agent" → "Researcher" template
   - Assign task: "Read README and summarize project structure"
   - Monitor status: idle → running → done
   - Friction probe: spawn UX — does Starter understand parameter knobs?
6. **⌘K palette context (CA-8)** — try ⌘K when Memory focused vs Agents focused
   - Friction probe: does context-switching feel natural?
7. **Tier upgrade hint** — observe upsell hints (skills marketplace teaser, custom skill creation gate)
   - Friction probe: are upsell prompts honest or pushy?

**Success criteria**:
- First agent task completes successfully
- Pro features (skills marketplace) discoverable but not pushy
- User self-rates productivity gain "above average" or higher

---

### A5 — PRO Pro (bee-writer)

**Profile**: Content creator, 3+ months on Pro tier, daily user. Has personal workflows established. Goal: efficient task execution, minor optimization.

**Coverage**: CA-2, CA-4, CA-6, CA-7, CA-9, CA-18 (skills marketplace), CA-13

**Step-by-step script**:

1. **Existing workspace** — open with established memories, agents
2. **Daily workflow** — search existing memory, edit, save
3. **Spawn agent for routine task** — "Draft tomorrow's newsletter from this week's notes"
4. **Multi-window** — Memory + Chat + Agents simultaneously
5. **Skills marketplace (CA-18)** — browse, install "newsletter-formatter" skill
   - Friction probe: install UX, configuration prompts, immediate availability?
6. **Provenance check (CA-9)** — verify last week's auto-generated newsletter has proper citations
7. **Settings tweaks (CA-13)** — change keyboard shortcut for "spawn newsletter agent"

**Success criteria**:
- All routine tasks complete < 50% time vs without Waggle (subjective comparison)
- Skill install + first use < 2 min
- Custom shortcut configuration works first try

---

### A6 — PRO Professional / Power User (bee-orchestrator)

**Profile**: Solo professional sa heavy parallel workflows. Runs 5+ agents simultaneously. Custom skills built. Goal: scale operations without context switching cost.

**Coverage**: CA-6 (parallel), CA-7 (heavy multi-window), CA-19 N/A solo, CA-20 (custom skills), CA-13

**Step-by-step script**:

1. **Parallel agent orchestration (CA-6)** — spawn 5 agents simultaneously, different tasks
   - Friction probe: dock indicator clarity, status overlap, message routing?
2. **Custom skill creation (CA-20)** — build "competitor-tracker" skill (scrape + summarize + memory store)
   - Friction probe: skill DSL learning curve? Test environment? Publish workflow?
3. **Multi-window heavy (CA-7)** — Cockpit + Memory + Graph + Agents + Chat + Provenance + Files all open
   - Friction probe: window management cognitive load? Snap-zone effectiveness?
4. **Workspace switching (CA-17)** — 5 workspaces, switch quickly
5. **Audit (CA-9)** — review week's agent activity, identify cost optimization

**Success criteria**:
- 5 parallel agents complete tasks without collision
- Custom skill published + works
- Multi-window paradigm scales (no FPS drop, no z-order confusion)
- Cost meter informs efficient model routing decisions

---

### A7 — TEAMS Starter (bee-marketer)

**Profile**: New team member added by admin, first day. Doesn't know Waggle. Has shared workspace access via team license.

**Coverage**: CA-1 (team-onboarded), CA-2, CA-4, CA-19 (member side)

**Step-by-step script**:

1. **Email invite link** — click, land on team workspace
2. **Auto-onboarding (CA-1, team variant)** — provider keys inherited from team, persona selection only
3. **Shared workspace tour (CA-19 member side)** — see existing team memories, agents (read-only initially)
4. **Add first memory (CA-2)** — contribute personal note to shared scope
   - Friction probe: does sharing model (private vs team) feel clear?
5. **Search team memory (CA-4)** — find colleague's memory, see attribution

**Success criteria**:
- Team workspace access immediate (no admin waiting)
- Shared vs private boundary clear
- New member feels productive within first hour

---

### A8 — TEAMS Pro (bee-analyst)

**Profile**: Active team contributor, daily Waggle user, 6+ months. Has personal scope + contributes to team scope.

**Coverage**: CA-4 (cross-scope), CA-6, CA-9 (team audit), CA-19, CA-14

**Step-by-step script**:

1. **Cross-scope search (CA-4)** — search across personal + team scopes simultaneously
2. **Spawn agent on team data (CA-6)** — agent reads team memory, produces analysis
3. **Team audit (CA-9 + CA-19)** — see all team agent runs this week, costs, impact
4. **Notifications (CA-14)** — receive notification when colleague's agent enriches shared memory

**Success criteria**:
- Cross-scope queries fast + intuitive
- Team audit visibility appropriate (not invasive but transparent)
- Notification routing makes sense

---

### A9 — TEAMS Professional / Admin (bee-team)

**Profile**: Team admin, owns governance + billing. Manages 10-50 seats. Compliance-conscious (GDPR, EU AI Act).

**Coverage**: CA-9 (full audit), CA-12 (downgrade scenario), CA-13 (admin governance), CA-19 (admin side), CA-11 (seat add/remove)

**Step-by-step script**:

1. **Admin governance panel (CA-13)** — open Policy app, define team policies
   - "All agents must use models with EU data residency"
   - "Audit triggers fire on every external memory share"
   - Friction probe: policy DSL learning curve? Built-in templates?
2. **Add/remove seats (CA-11)** — invite 3 new members, then remove 1 (graceful downgrade CA-12)
3. **Audit trail review (CA-9)** — last 30 days, all team activity, export for compliance officer
   - Friction probe: GDPR data subject access request workflow?
4. **Billing review** — see usage breakdown per member, per project, per provider
5. **Compliance trigger drill** — simulate EU AI Act Article 13 audit request, verify reproducibility

**Success criteria**:
- Policy enforcement working (test by attempting violation)
- Audit trail meets compliance officer review (subjective)
- Billing breakdown accurate vs Stripe receipts
- Seat management smooth

---

## §4 Cross-cutting test scenarios

Beyond per-archetype, run these cross-cutting flows once:

### CC-1 — Full upgrade journey (Free → Pro → Teams)
Single user account. Start Free, hit Pro feature gate, upgrade. Use Pro for a week. Hit Teams feature gate (collaboration), upgrade. Verify data persistence + feature unlock at each step.

### CC-2 — Light/dark mode toggle (CA-10) across all apps
Fresh user, default Auto mode, toggle Dark, toggle Light, observe transition. Open every app sa toggle in different states. Verify no theming regression.

### CC-3 — Network resilience (CA-16)
Mid-session, simulate: brief offline (5s), prolonged offline (5min), provider API down (Anthropic 503), invalid API key. Verify graceful UI states + automatic recovery.

### CC-4 — Multi-window paradigm stress (CA-7)
Open all 23 apps, drag/resize/snap, observe focus state, z-order, animation FPS. Ensure no compositor stutter.

### CC-5 — Onboarding abandonment recovery
Start onboarding, exit at step 3. Re-launch app. Verify resume from step 3, not restart.

### CC-6 — Tier downgrade graceful (CA-12)
Pro → Free downgrade. Verify: Pro features locked, Free features remain, data preserved, no surprise data loss.

### CC-7 — Keyboard shortcut discoverability (CA-15)
First-time user attempts to find keyboard shortcuts. ⌘? must be discoverable somehow (menubar Help item, footer hint, etc.).

### CC-8 — Provenance replay (CA-9)
Trigger an event (memory edit), wait 1 hour, replay event state. Verify exact reproduction.

### CC-9 — Cost meter accuracy
Run a complex multi-agent task, compare Cockpit cost reading to Stripe billing event. Should match.

### CC-10 — Persona switch mid-flow
Switch persona from "Researcher" to "Engineer" via Settings. Verify dock layout, default agents, preferences update appropriately.

---

## §5 Execution sequencing

**Day 1** (post-build): A1, A4, A7 — Starter tier across 3 monetization
**Day 2**: A2, A5, A8 — Pro proficiency across 3 monetization
**Day 3**: A3, A6, A9 — Professional / Power user across 3 monetization
**Day 4**: CC-1 through CC-5 — first 5 cross-cutting
**Day 5**: CC-6 through CC-10 — second 5 cross-cutting + remediation pass

Total: ~25 scenarios × 30-60 min average = ~15-25h E2E testing wall-clock + report generation.

PM (claude-opus-4-7) executes via Claude in Chrome computer-use, generates friction-log JSON per scenario, aggregates into single test report sa:
- Per-archetype completion rates
- Average friction score
- Top 10 deal-breakers (P0)
- Top 20 high-friction items (P1)
- Top 30 medium-friction items (P2)
- Delight moments (positive feedback for marketing)
- Improvement recommendations sorted by RICE score (Reach × Impact × Confidence / Effort)

---

## §6 Pre-execution prerequisites — Marko side

Before PM can start:

1. **App accessible**: dev server running locally OR staging deployed URL OR Tauri build distributed
   - Decide deployment target — recommend staging URL on Vercel preview deploy for ease of access
2. **Test accounts**: 9 accounts seeded sa appropriate persona + tier + data
   - Account creation script u repo? Seed data scripts?
3. **Test card credentials**: Stripe test card 4242 4242 4242 4242 (or environment-specific)
4. **Webhook stubs**: Provenance audit replay needs working backend; ensure replay endpoint live
5. **Reset-between-tests procedure**: how to clean state between archetypes (separate accounts? wipe localStorage? incognito each session?)

If any of these aren't ready, PM will identify u test results and flag back.

---

## §7 Output deliverables (post-execution)

PM produces:
- `briefs/e2e-persona-tests/results/2026-04-XX-friction-log-A1-confused.json` (per scenario)
- `briefs/e2e-persona-tests/results/2026-04-XX-friction-log-aggregate.md` — synthesis
- `briefs/e2e-persona-tests/results/2026-04-XX-improvement-roadmap.md` — RICE-prioritized fixes for CC-1 implementation sprint

---

## §8 Authorized by

PM Marko Marković, 2026-04-24 evening, scope expansion ratified ("ne samo naplatne tiere nego i tri nivoa usera - starter, pro, professional - power user, sve treba da spremiš i smisliš na osnovu repoa").

PM (claude-opus-4-7) authored matrix overnight 2026-04-24/25, čeka Marka ujutru za review of prerequisite checklist (§6) and prerequisites readiness ratification before E2E execution begins.
