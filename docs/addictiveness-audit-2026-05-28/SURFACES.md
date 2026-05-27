# Waggle's existing addictiveness surfaces (codebase inventory)
**Date:** 2026-05-28 · **Method:** code-grounded inventory, not aspirational.

This is the raw surface area we score against in the baseline audit, mapped per rubric dimension.

## Apps in dock + dedicated screens (25 total)
Chat · Room · Cockpit / Dashboard / MissionControl · Files (+Tabs) · Memory · Marketplace · Connectors · Capabilities · Settings · Vault · Agents · Approvals · Backup · Events · ScheduledJobs · Timeline · UserProfile · Voice · Launcher · Telemetry · TeamGovernance · ChatWindowInstance

## Overlays
ContextRail · LoginBriefing · NotificationInbox · OnboardingTooltips · OnboardingWizard · PersonaSwitcher · SpawnAgentDialog · GlobalSearch · WorkspaceSwitcher · CreateWorkspaceDialog · EraseDataDialog · KeyboardShortcutsHelp · TrialExpiredModal · UpgradeModal

## Mapped to rubric

### A · TRIGGER (dims 1-2)
| Surface | Evidence | Notes |
|---|---|---|
| Hotkeys / shortcuts | `useKeyboardShortcuts.ts`, `KeyboardShortcutsHelp.tsx` | Strong internal-app navigation, no external triggers (taskbar, desktop notification, email digest, browser extension) |
| Notifications | `NotificationInbox.tsx`, region `Notifications (F8)` | In-app only |
| Scheduled jobs | `ScheduledJobsApp.tsx` | Can trigger work on cron; surfaced via UI but not as a daily-driver hook yet |
| Memory recall as internal-trigger fit | LoginBriefing "I REMEMBER" + ContextRail | Strong fit for "I forgot what I decided" itch |
| No external trigger beyond dock app | — | Gap for dim 1 |

### B · ACTION (dims 3-4)
| Surface | Evidence | Notes |
|---|---|---|
| LoginBriefing "I REMEMBER" + brag-line | `LoginBriefing.tsx` lines 187-211, brag line "N memories · N entities · N relations" | Strong wow for **returning** users; near-empty for first-session |
| BootScreen → desktop | `BootScreen.tsx` (2-sec animated) → Desktop | Fast first surface |
| Dock click → app open | `Dock.tsx` 10 apps + Spawn Agent | ≤ 1 click to top-level surface |
| Chat → type → send | Typical 3 clicks dock→chat→submit | Good |
| Spawn Agent dedicated button | `SpawnAgentDialog.tsx` | One-shot agent path is a discrete affordance |

### C · VARIABLE REWARD (dims 5-7)

**Reward of the tribe (dim 5):**
| Surface | Evidence | Notes |
|---|---|---|
| Team workspaces | TEAMS tier | Shared workspaces with peers |
| Team presence in chat header | `ChatApp.tsx` line 793-813 | Avatars of co-workers with online status |
| TeamGovernanceApp | overlay | Governance, sharing rules |
| Free / individual users | — | **No social loop** — major gap for solo / Free tier addictiveness |

**Reward of the hunt (dim 6):**
| Surface | Evidence | Notes |
|---|---|---|
| LoginBriefing importance-ranked highlights | `selectBriefingHighlights` | Surfaces 3 surprising memories per launch |
| HybridSearch (FTS5 + vec0, fused via RRF) | `packages/core/src/mind/search.ts` | Surprise connections — but no UI "look what I found for you" surface yet |
| KnowledgeGraph | `packages/core/src/mind/knowledge.ts` | Entity-relation surfaces in WeaverPanel + Memory app |
| Wiki Compiler | 240 pages from 177 frames (memory entry 2026-05-05) | Synthesized synthesis pages — discovery surface |

**Reward of the self (dim 7):**
| Surface | Evidence | Notes |
|---|---|---|
| Custom personas | `loadCustomPersonas()`, `custom-personas.ts` | User can author their own agent identity |
| Identity layer | `IdentityResponse {name, role, department, personality, system_prompt}` | Personalisable user identity that flows into chat |
| Brand voice (per skills marketplace) | `brand-voice:enforce-voice` skill | Personalisation that compounds |
| Skills marketplace | `MarketplaceApp.tsx` | Install + customize skills |
| Spawn Agent → save as workflow | `WorkflowComposer`, `workflow-templates.ts` | Reify ad-hoc agent runs into reusable workflows |

### D · INVESTMENT (dims 8-9)

**Stored personal data (dim 8):**
| Layer | Evidence | Compounds? |
|---|---|---|
| FrameStore (memory frames) | `packages/core/src/mind/frames.ts` | YES — per-frame importance, dedup, compaction |
| KnowledgeGraph | `knowledge.ts` | YES — entity + relation graph grows |
| IdentityLayer | `identity.ts` | YES — user profile persists |
| AwarenessLayer | `awareness.ts` | YES — active task/state |
| Files (virtual + local + team) | `FilesApp.tsx` | YES — user-authored artefacts |
| Wiki pages | `packages/wiki-compiler` | YES — synthesized knowledge |
| Custom personas, custom skills | `custom-personas.ts`, `MarketplaceApp.tsx` | YES — user-shaped tooling |

**Switching cost (dim 9):**
| Mechanic | Evidence | Notes |
|---|---|---|
| Backup app | `BackupApp.tsx` | Exists — exports something. Verify what's exportable. |
| Memory-import | `packages/core/src/memory-import.ts` | Can re-ingest exports |
| Hive-mind OSS shared substrate | per CLAUDE.md §7.5 | The MEMORY substrate is OSS — user can technically take their memory with them, but the harvest pipelines, personas, skills, wiki, and connector integrations stay in Waggle. **High switching cost on the surrounding layers.** |

### "The one tool" coverage (dim 10)
| Workflow | Waggle has it? | Gap |
|---|---|---|
| General chat / Q&A | YES (ChatApp) | — |
| Document creation (.docx, .pptx) | Partial — skills + Files; demonstrated in P1 audit | Native editor missing |
| Notes / recall | YES (Memory + ContextRail) | — |
| Multi-agent collab | YES (Room) | — |
| Voice input | YES (VoiceApp) | — |
| Skills marketplace | YES | — |
| Connectors / integrations | YES (ConnectorsApp; 148 MCP catalog) | Runtime install is the open product gap (P1 found it) |
| Calendar / email native | NO | Gap |
| Spreadsheet | NO | Gap (xlsx skill exists but no native UI) |
| Code editor | NO (intentional — Waggle is not Claude Code) | Not a gap |
| Browse / scrape | YES (apify, firecrawl skills) | — |
| Image / video | Skills (Canva, Gamma, Invideo) | No native generation surface |

## Universal observations (pre-persona)
- Returning users have a strong reward layer (brag-line, I REMEMBER, accumulated stats).
- New users (day 0) have weaker hook material — onboarding wizard is functional but doesn't deliver the "this remembers me" wow until session 2+.
- Social loops only exist in TEAMS tier. Free/individual gets no tribe reward.
- External triggers are weak — no taskbar persistence, no scheduled digest emails, no browser extension.
- Investment surfaces are strong — multiple layers compound.

These observations seed the per-persona scoring once benchmarks return.
