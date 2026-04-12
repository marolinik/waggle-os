# Waggle OS -- Comprehensive Feature Inventory

> Generated from codebase audit, April 2026.
> Status key: **BUILT** = fully implemented and wired, **PARTIAL** = backend exists but UI incomplete or gaps remain, **PLACEHOLDER** = route/type exists but minimal logic.

---

## 1. PERSISTENT MEMORY SYSTEM (Crown Jewel #1)

Waggle's memory system is a multi-layered, dual-mind architecture that gives the AI agent persistent, cross-session knowledge. Nothing comparable exists in competing products at this depth.

### 1.1 Dual-Mind Architecture
| Feature | Description | Status |
|---------|-------------|--------|
| Personal Mind | SQLite DB (`~/.waggle/.mind/`) stores user-level knowledge shared across all workspaces | **BUILT** |
| Workspace Mind | Separate SQLite DB per workspace, fully isolated -- client data never leaks between projects | **BUILT** |
| MultiMind Router | Automatically routes memory queries/saves to the correct mind based on context | **BUILT** |
| Cross-Mind Dedup | Before saving, checks BOTH personal and workspace minds for exact, normalized, and semantic (cosine > 0.95) duplicates | **BUILT** |
| Workspace-Specific Routing Guard | If `target=personal` but content contains confidential signals ($amounts, client names, NDA, SOW), auto-redirects to workspace mind | **BUILT** |
| Cross-Workspace Search | `search_all_workspaces` tool queries ALL workspace minds + personal simultaneously | **BUILT** |

### 1.2 FrameStore (Memory Frames)
| Feature | Description | Status |
|---------|-------------|--------|
| I-Frames | Initial frames -- standalone memory units | **BUILT** |
| P-Frames | Predictive/update frames -- linked to a base I-frame, representing changes or additions | **BUILT** |
| B-Frames | Bridge frames -- cross-reference multiple other frames with structured references | **BUILT** |
| Importance Levels | `critical`, `important`, `normal`, `temporary`, `deprecated` -- with score multipliers (2.0x to 0.3x) | **BUILT** |
| Source Provenance | `user_stated`, `tool_verified`, `agent_inferred`, `import`, `system` -- tracked per frame | **BUILT** |
| Confidence Derivation | Auto-derives confidence from source: tool_verified->high, user_stated->medium, agent_inferred->low | **BUILT** |
| Dramatic Claim Detection | Detects dramatic statements (shutdown, bankrupt, emergency) and downgrades importance to `temporary` | **BUILT** |
| Rate Limiting | Max 50 memory saves per session to prevent flooding attacks | **BUILT** |
| FTS5 Indexing | Full-text search index on all frame content | **BUILT** |
| Dedup on Create | I-Frame creation checks for exact duplicates before inserting | **BUILT** |

### 1.3 HybridSearch (Vector + Keyword Fusion)
| Feature | Description | Status |
|---------|-------------|--------|
| Keyword Search | SQLite FTS5 full-text search | **BUILT** |
| Vector Search | Embedding-based similarity via sqlite-vec | **BUILT** |
| Reciprocal Rank Fusion (RRF) | Combines keyword and vector results using RRF (k=60) | **BUILT** |
| Scoring Profiles | `balanced`, `recent`, `important`, `connected` -- weighted scoring across recency, importance, access, and connections | **BUILT** |
| Temporal Filtering | `since` and `until` ISO date filters on search | **BUILT** |
| Importance Filtering | Filter results by importance level (critical, important, normal, temporary) | **BUILT** |
| Contradiction Detection | Flags potential contradictions when results contain conflict signals ("however", "no longer", "changed to") | **BUILT** |
| LIKE Fallback | When vector/FTS return nothing, falls back to SQL LIKE scan on keywords | **BUILT** |

### 1.4 Knowledge Graph
| Feature | Description | Status |
|---------|-------------|--------|
| Entity Extraction | Regex-based extraction of persons, organizations, technologies, projects, concepts from text | **BUILT** |
| Entity Normalization | Normalizes entity names for consistent graph storage | **BUILT** |
| Relation Extraction | Semantic relations: led_by, reports_to, depends_on, co-occurrence | **BUILT** |
| Wildcard Query | `query_knowledge("*")` lists all known entities (capped at 50) | **BUILT** |
| Entity Correction | `correct_knowledge` tool to update or invalidate entities via feedback handler | **BUILT** |
| Ontology | Structured ontology definitions for entity types | **BUILT** |
| Graph Visualization API | `GET /api/memory/graph` returns entities + relations for UI rendering | **BUILT** |

### 1.5 CognifyPipeline
| Feature | Description | Status |
|---------|-------------|--------|
| Full Pipeline | Save frame -> extract entities -> enrich knowledge graph -> create relations -> index for search | **BUILT** |
| Memory Linking | Optional MemoryLinker finds related frames after saving | **BUILT** |
| Co-occurrence Relations | Entities found in same text automatically get relation edges | **BUILT** |

### 1.6 IdentityLayer
| Feature | Description | Status |
|---------|-------------|--------|
| Agent Identity | Persists name, role, department, personality, capabilities, system_prompt | **BUILT** |
| Identity Context | `get_identity` tool returns who the agent is | **BUILT** |
| Auto-Setup | `ensureIdentity` runs on server startup | **BUILT** |

### 1.7 AwarenessLayer
| Feature | Description | Status |
|---------|-------------|--------|
| Active Task Tracking | Categories: task, action, pending, flag | **BUILT** |
| Priority System | 0-10 priority per awareness item | **BUILT** |
| Expiration | Optional expires_at for time-limited items | **BUILT** |
| Metadata | JSON metadata per item (context, status, result) | **BUILT** |
| Tool Utilization Tracking | Tracks unique tools used per session, reports utilization percentage | **BUILT** |

### 1.8 SessionStore
| Feature | Description | Status |
|---------|-------------|--------|
| GOP-based Sessions | Sessions identified by gop_id, with timestamps | **BUILT** |
| Session Distillation | `findUndistilledSessions` + `markSessionDistilled` for memory consolidation | **BUILT** |
| Session Search | Full-text search across session transcripts | **BUILT** |
| Session Timeline | `parseSessionTimeline` extracts chronological events from sessions | **BUILT** |
| Session Export | Export sessions to Markdown format | **BUILT** |
| Session Outcome Extraction | Extracts and persists structured outcomes from sessions | **BUILT** |
| Thread Classification | Classifies conversation threads by freshness (active, stale, dormant) | **BUILT** |
| Open Question Extraction | Identifies unresolved questions from session transcripts | **BUILT** |

### 1.9 Memory Weaver (Consolidation)
| Feature | Description | Status |
|---------|-------------|--------|
| MemoryWeaver | Consolidates and compacts memory frames over time | **BUILT** |
| Skill Extraction | Extracts reusable skills from session transcripts | **BUILT** |
| Memory Decay | Time-based decay for less important memories | **BUILT** |
| Manual Trigger | `POST /api/weaver/trigger` for on-demand consolidation | **BUILT** |
| Status API | `GET /api/weaver/status` shows last consolidation times | **BUILT** |

### 1.10 Embedding System
| Feature | Description | Status |
|---------|-------------|--------|
| Multi-Provider Chain | InProcess -> Ollama -> Voyage -> OpenAI -> LiteLLM -> Mock fallback | **BUILT** |
| Tier-Gated Providers | SOLO gets inprocess+mock; BASIC adds ollama/voyage/openai; TEAMS adds litellm | **BUILT** |
| Monthly Quota | Tracked in `embedding_usage` table, enforced per tier | **BUILT** |
| In-Process Embeddings | Local transformer model via @xenova/transformers (no API key needed) | **BUILT** |
| LiteLLM Embedder | Proxy through LiteLLM for any compatible model | **BUILT** |
| Ollama Embedder | Local Ollama server for embeddings | **BUILT** |
| API Embedder | Direct Voyage AI / OpenAI API calls | **BUILT** |

---

## 2. AGENT PERSONA SYSTEM (Crown Jewel #2)

22 fully-defined personas with distinct system prompts, tool allowlists/denylists, failure patterns, and behavioral guardrails.

### 2.1 Universal Personas (8)
| Persona | Tools | Key Capability |
|---------|-------|----------------|
| General Purpose | Full tool set (30+) | Adapts to any task, suggests specialists |
| Researcher | web_search, web_fetch, search_memory, save_memory, generate_docx | Multi-source investigation, citation tracking |
| Writer | read/write/edit_file, search_memory, generate_docx | Document creation, tone adaptation, no bash/git |
| Analyst | bash, read/write_file, web_search, generate_docx | Data analysis, frameworks, quantified outputs |
| Coder | bash, all file ops, full git suite | Code review, debugging, architecture |
| Project Manager | plan tools, memory, file ops | Task tracking, status reports, no git/bash |
| Planner (read-only) | read_file, search, memory, plan tools | Strategic planning only, no write tools |
| Verifier (read-only) | read_file, search, bash (read-only) | Adversarial QA, VERDICT output format |

### 2.2 Domain Specialists (14)
| Persona | Domain |
|---------|--------|
| Executive Assistant | Email drafting, meeting prep, calendar |
| Sales Rep | Lead research, outreach, pipeline |
| Marketer | Content, campaigns, SEO, social media |
| Senior PM | PRD drafting, RICE scoring, roadmap |
| HR Manager | Policy, onboarding, compliance |
| Legal Counsel | Contract review, compliance, jurisdiction |
| Business Finance | Budget analysis, projections, invoicing |
| Strategy Consultant | Frameworks (MECE, Porter), client deliverables |
| Coordinator | Pure orchestrator -- only spawn_agent, list_agents, get_agent_result |
| Customer Support | Ticket resolution, KB management, escalation |
| Operations Manager | SOPs, vendor management, process optimization |
| Data Engineer | SQL, pipelines, dashboards, data quality |
| Recruiter | Job descriptions, screening scorecards, interview prep |
| Creative Director | Creative briefs, feedback synthesis, brand consistency |

### 2.3 Persona Features
| Feature | Description | Status |
|---------|-------------|--------|
| Per-Persona Tool Allowlist | Each persona declares which tools it can use | **BUILT** |
| Per-Persona Denylist | `disallowedTools` enforced at pool level | **BUILT** |
| Read-Only Mode | `isReadOnly` flag prevents all write operations | **BUILT** |
| Failure Patterns | 3+ documented failure modes per persona for self-correction | **BUILT** |
| Tagline + BestFor + WontDo | User-facing hover metadata | **BUILT** |
| Suggested Skills/Connectors/MCP | Each persona suggests relevant capabilities | **BUILT** |
| Default Workflow | Persona maps to a workflow template (research-team, plan-execute, etc.) | **BUILT** |
| Custom Personas | `loadCustomPersonas()` from disk + POST /api/personas | **BUILT** |

---

## 3. MULTI-AGENT ORCHESTRATION (Crown Jewel #3)

### 3.1 Sub-Agent System
| Feature | Description | Status |
|---------|-------------|--------|
| spawn_agent | Launches specialist agents with specific tasks and persona roles | **BUILT** |
| list_agents | Check status of running agents | **BUILT** |
| get_agent_result | Retrieve completed agent output | **BUILT** |
| Agent Communication | send_agent_message / check_agent_messages for inter-agent messaging | **BUILT** |
| SubagentOrchestrator | Full orchestration with dependency ordering and context flow between steps | **BUILT** |
| Agent Groups | CRUD for multi-agent group configurations (parallel/sequential/coordinator strategies) | **BUILT** |

### 3.2 Workflow Templates (Built-in)
| Template | Description | Status |
|----------|-------------|--------|
| research-team | Researcher -> Synthesizer -> Reviewer (3 agents) | **BUILT** |
| review-pair | Writer -> Reviewer -> Reviser (draft/critique/revise cycle) | **BUILT** |
| plan-execute | Planner -> Executor -> Summarizer | **BUILT** |
| ticket-resolve | Triage -> Investigator -> Responder (support workflow) | **BUILT** |
| content-pipeline | Researcher -> Drafter -> Editor (content creation) | **BUILT** |

### 3.3 Workflow Composer
| Feature | Description | Status |
|---------|-------------|--------|
| Task Shape Detection | Analyzes user message to detect task type/complexity | **BUILT** |
| Execution Mode Selection | Chooses lightest sufficient mode: direct, structured_single_agent, skill_guided, subagent_workflow | **BUILT** |
| Custom Workflows | Create/delete custom workflow templates via API | **BUILT** |

### 3.4 Waggle Dance Protocol (Team Communication)
| Feature | Description | Status |
|---------|-------------|--------|
| Message Types | request, response, broadcast with typed subtypes | **BUILT** |
| Task Delegation | Dispatches task_delegation messages to spawn workers | **BUILT** |
| Knowledge Check | Searches memory to answer knowledge_check requests | **BUILT** |
| Skill Request/Share | Routes skill requests and shares between agents | **BUILT** |

### 3.5 Fleet Management
| Feature | Description | Status |
|---------|-------------|--------|
| Fleet Status | GET /api/fleet -- lists all active workspace sessions with model, cost, tool count | **BUILT** |
| Spawn Agent | POST /api/fleet/spawn -- create new agent session (BASIC+ tier) | **BUILT** |
| Pause/Resume/Kill | Per-workspace session controls | **BUILT** |
| Max Sessions by Tier | SOLO=3, BASIC=10, TEAMS=25, ENTERPRISE=100 | **BUILT** |

---

## 4. TOOL ECOSYSTEM

### 4.1 System Tools (12)
| Tool | Description | Status |
|------|-------------|--------|
| bash | Shell command execution | **BUILT** |
| read_file | Read file content | **BUILT** |
| write_file | Write file content | **BUILT** |
| edit_file | Edit file with patch | **BUILT** |
| multi_edit | Batch edit multiple files | **BUILT** |
| search_files | Glob-pattern file search | **BUILT** |
| search_content | Content/regex search across files | **BUILT** |
| web_search | LLM-powered web search | **BUILT** |
| web_fetch | Fetch URL content | **BUILT** |
| run_code | Execute code in sandboxed runtime | **BUILT** |
| get_task_output | Get output from background task | **BUILT** |
| kill_task | Kill a running background task | **BUILT** |

### 4.2 Mind Tools (7)
| Tool | Description | Status |
|------|-------------|--------|
| get_identity | Agent identity context | **BUILT** |
| get_awareness | Current tasks, flags, tool utilization | **BUILT** |
| search_memory | Hybrid search across personal + workspace memory | **BUILT** |
| search_all_workspaces | Cross-workspace search | **BUILT** |
| save_memory | Save to workspace or personal mind with routing guards | **BUILT** |
| query_knowledge | Query knowledge graph entities and relations | **BUILT** |
| add_task | Add task to awareness layer | **BUILT** |
| correct_knowledge | Correct or invalidate knowledge entities | **BUILT** |

### 4.3 Git Tools (11)
| Tool | Description | Status |
|------|-------------|--------|
| git_status, git_diff, git_log | Read operations | **BUILT** |
| git_commit, git_branch, git_stash | Write operations | **BUILT** |
| git_push, git_pull, git_merge | Remote operations | **BUILT** |
| git_pr | Create pull requests | **BUILT** |

### 4.4 Plan Tools (4)
| Tool | Description | Status |
|------|-------------|--------|
| create_plan | Create structured multi-step plan | **BUILT** |
| add_plan_step | Add step to existing plan | **BUILT** |
| execute_step | Execute a plan step | **BUILT** |
| show_plan | Display current plan status | **BUILT** |

### 4.5 Document Tools (1)
| Tool | Description | Status |
|------|-------------|--------|
| generate_docx | Generate Word documents with formatting | **BUILT** |

### 4.6 Skill Tools (7)
| Tool | Description | Status |
|------|-------------|--------|
| list_skills | List installed skills | **BUILT** |
| create_skill | Create new skill | **BUILT** |
| delete_skill | Remove skill | **BUILT** |
| read_skill | Read skill content | **BUILT** |
| search_skills | Search skills by keyword | **BUILT** |
| suggest_skill | Recommend skills for current context | **BUILT** |
| acquire_capability / install_capability | Install from marketplace or starter pack | **BUILT** |

### 4.7 Search Provider Tools (3)
| Tool | Description | Status |
|------|-------------|--------|
| perplexity_search | Perplexity AI search (requires API key) | **BUILT** |
| tavily_search | Tavily search (requires API key) | **BUILT** |
| brave_search | Brave Search (requires API key) | **BUILT** |

### 4.8 Browser Tools (6)
| Tool | Description | Status |
|------|-------------|--------|
| browser_navigate | Navigate to URL | **BUILT** |
| browser_screenshot | Take page screenshot | **BUILT** |
| browser_click | Click element | **BUILT** |
| browser_fill | Fill form field | **BUILT** |
| browser_evaluate | Execute JavaScript | **BUILT** |
| browser_snapshot | Accessibility snapshot | **BUILT** |

### 4.9 LSP Tools (4)
| Tool | Description | Status |
|------|-------------|--------|
| lsp_diagnostics | Get code diagnostics | **BUILT** |
| lsp_definition | Go to definition | **BUILT** |
| lsp_references | Find references | **BUILT** |
| lsp_hover | Hover info | **BUILT** |

### 4.10 CLI Discovery Tools (2)
| Tool | Description | Status |
|------|-------------|--------|
| cli_discover | Detect installed CLI tools (git, node, docker, aws, etc. -- 26 tools) | **BUILT** |
| cli_execute | Execute a discovered CLI tool safely | **BUILT** |

### 4.11 Cron Tools (4)
| Tool | Description | Status |
|------|-------------|--------|
| create_schedule | Create cron schedule | **BUILT** |
| list_schedules | List all schedules | **BUILT** |
| delete_schedule | Remove schedule | **BUILT** |
| trigger_schedule | Manually trigger | **BUILT** |

### 4.12 Team Tools (9)
| Tool | Description | Status |
|------|-------------|--------|
| check_hive | Check team status | **BUILT** |
| share_to_team | Share content with team | **BUILT** |
| create_team_task | Create task for team | **BUILT** |
| claim_team_task | Claim a team task | **BUILT** |
| send_waggle_message | Send Waggle Dance protocol message | **BUILT** |
| request_team_capability | Request capability from team | **BUILT** |
| team_activity | View team activity feed | **BUILT** |
| team_tasks / team_members | List tasks and members | **BUILT** |
| assign_task / complete_task | Task lifecycle management | **BUILT** |

### 4.13 KVARK Tools (4)
| Tool | Description | Status |
|------|-------------|--------|
| kvark_search | Search KVARK enterprise platform | **BUILT** |
| kvark_feedback | Submit feedback to KVARK | **BUILT** |
| kvark_action | Execute KVARK action | **BUILT** |
| kvark_ask_document | Query KVARK document | **BUILT** |

### 4.14 Audit Tools (1)
| Tool | Description | Status |
|------|-------------|--------|
| query_audit | Query audit trail events | **BUILT** |

### 4.15 Workflow Tools (2)
| Tool | Description | Status |
|------|-------------|--------|
| compose_workflow | Generate workflow plan from task description | **BUILT** |
| orchestrate_workflow | Execute a multi-agent workflow template | **BUILT** |

**Total: ~80+ distinct agent tools**

---

## 5. WORKSPACE SYSTEM

### 5.1 Workspace CRUD
| Feature | Description | Status |
|---------|-------------|--------|
| Create Workspace | With name, description, path, persona, model, template | **BUILT** |
| List Workspaces | With group and teamId filters | **BUILT** |
| Get Workspace Detail | Full config + memory stats + recent decisions + summary | **BUILT** |
| Update Workspace | Config, persona, model changes | **BUILT** |
| Delete Workspace | With mind DB cleanup | **BUILT** |
| Workspace Summary | Narrative summary with activity status, memory count, key topics | **BUILT** |

### 5.2 Workspace Templates (15)
| Template | Persona | Category |
|----------|---------|----------|
| Sales Pipeline | sales-rep | sales |
| Research Project | researcher | research |
| Code Review | coder | engineering |
| Marketing Campaign | marketer | marketing |
| Product Launch | product-manager-senior | operations |
| Legal Review | legal-professional | legal |
| Agency/Consulting | consultant | custom |
| + 8 more via template system | various | various |

Template features:
- Starter memory (pre-seeded workspace context)
- Suggested commands
- Welcome messages per template
- Template-to-capability-pack mapping (auto-installs relevant skills)

### 5.3 Workspace Context
| Feature | Description | Status |
|---------|-------------|--------|
| Time-Aware Greeting | Morning/afternoon/evening contextual greetings | **BUILT** |
| Upcoming Schedules | Shows next cron jobs for the workspace | **BUILT** |
| Workspace State | Activity level, memory count, decisions, progress | **BUILT** |
| Recent Decisions | Extracted from memory for quick context | **BUILT** |

### 5.4 File Management
| Feature | Description | Status |
|---------|-------------|--------|
| File Registry | Track ingested files per workspace | **BUILT** |
| File Ingestion | Process images, documents (PDF, DOCX, PPTX), spreadsheets (XLSX, CSV), code files, archives | **BUILT** |
| Directory Browser | Browse local filesystem for workspace path selection | **BUILT** |
| Document Version Registry | Track document versions within a workspace | **BUILT** |

### 5.5 Pins
| Feature | Description | Status |
|---------|-------------|--------|
| Pin Messages | Favorite/bookmark messages within workspace | **BUILT** |
| Draft/Final Status | W7.4 -- mark pinned outputs as draft or final | **BUILT** |
| Per-Workspace Storage | JSON file in workspace directory | **BUILT** |

---

## 6. CONNECTOR / INTEGRATION SYSTEM

### 6.1 Built-in Connectors (28)
| Category | Connectors |
|----------|------------|
| Code | GitHub, GitLab, Bitbucket |
| Communication | Slack, Discord, MS Teams, Gmail, Outlook, Email |
| Project Management | Jira, Linear, Asana, Trello, Monday |
| Knowledge | Notion, Confluence, Obsidian |
| CRM | HubSpot, Salesforce, Pipedrive |
| Cloud Storage | Google Drive, Google Docs, Google Sheets, OneDrive, Dropbox |
| Calendar | Google Calendar |
| Data | Airtable, PostgreSQL |
| Meta | Composio (250+ integrations gateway) |
| Mock | MockSlack, MockTeams, MockDiscord (for testing) |

### 6.2 Connector Features
| Feature | Description | Status |
|---------|-------------|--------|
| Connect/Disconnect | Store/remove credentials in vault | **BUILT** |
| Health Check | Per-connector health status (connected, expired, disconnected) | **BUILT** |
| OAuth Flow | Full OAuth for GitHub, Slack, Google, Notion, Jira | **BUILT** |
| Connector Registry | Dynamic registry with definitions and live status | **BUILT** |

### 6.3 MCP (Model Context Protocol) Runtime
| Feature | Description | Status |
|---------|-------------|--------|
| MCP Server Lifecycle | Start/stop/health for stdio-based MCP servers | **BUILT** |
| JSON-RPC 2.0 | Full protocol implementation | **BUILT** |
| Tool Discovery | Lists tools from connected MCP servers | **BUILT** |
| Per-Workspace MCP | Servers can be scoped to specific workspaces | **BUILT** |

### 6.4 Plugin System
| Feature | Description | Status |
|---------|-------------|--------|
| PluginManager | Load/install/uninstall plugins from ~/.waggle/plugins/ | **BUILT** |
| Plugin Runtime | PluginRuntimeManager for lifecycle management | **BUILT** |
| Plugin Validation | Manifest validation via SDK | **BUILT** |
| Starter Skills | Auto-install starter skills on first run | **BUILT** |
| Capability Packs | Grouped skill bundles (developer_workspace, research_analyst, etc.) | **BUILT** |

---

## 7. MARKETPLACE

| Feature | Description | Status |
|---------|-------------|--------|
| FTS5 Search | Full-text search across package catalog | **BUILT** |
| Faceted Filters | Filter by type, category, pack, source | **BUILT** |
| Sort Options | relevance, popular, recent, name | **BUILT** |
| Install/Uninstall | Package lifecycle management | **BUILT** |
| Security Gate | Cisco scanner integration for package security scanning | **BUILT** |
| Scan Status | passed/failed/not_scanned per package | **BUILT** |
| Enterprise Packs | Curated package bundles for specific use cases | **BUILT** |
| Package Categories | Structured categorization system | **BUILT** |
| Install Audit | Track all marketplace installs with timestamps | **BUILT** |
| Skill Hash Tracking | Detect if installed skills have been modified | **BUILT** |

---

## 8. TIER / BILLING SYSTEM

### 8.1 Tier Architecture
| Tier | Price | Key Limits |
|------|-------|------------|
| SOLO | Free | 5 workspaces, 10 connectors, 500 embeddings/mo, no sub-agents, no custom skills |
| BASIC | $15/mo | Unlimited workspaces/connectors, 5000 embeddings/mo, sub-agents, custom skills |
| TEAMS | $79/mo/seat | Everything + team library, cloud sync, shared workspaces, admin panel, audit log |
| ENTERPRISE | Consultative | Everything + self-hosted, full audit, KVARK integration |

### 8.2 Feature Gating
| Feature | Description | Status |
|---------|-------------|--------|
| TierCapabilities | 17 capability flags per tier | **BUILT** |
| requireTier Middleware | Fastify preHandler that enforces minimum tier | **BUILT** |
| tierSatisfies | Comparison function for tier ordering | **BUILT** |
| parseTier | Handles legacy lowercase tier names -> canonical uppercase | **BUILT** |

### 8.3 Stripe Integration
| Feature | Description | Status |
|---------|-------------|--------|
| Checkout | Stripe Checkout session creation | **BUILT** |
| Webhooks | Stripe webhook handling (subscription events) | **BUILT** |
| Customer Portal | Stripe customer portal redirect | **BUILT** |
| Tier-from-Price Mapping | Map Stripe price IDs back to canonical tiers | **BUILT** |
| Lazy SDK Init | Stripe SDK only loaded if STRIPE_SECRET_KEY is set | **BUILT** |

---

## 9. LLM PROVIDER SYSTEM

### 9.1 Provider Registry
| Feature | Description | Status |
|---------|-------------|--------|
| Multi-Provider | Anthropic, OpenAI, Google, DeepSeek, xAI, Mistral, Alibaba/Qwen, MiniMax, GLM/Zhipu, OpenRouter, Perplexity, Moonshot | **BUILT** |
| Model Catalog | Per-provider model list with cost/speed ratings | **BUILT** |
| Vault Key Status | Shows which providers have API keys configured | **BUILT** |
| LiteLLM Proxy | Routes through LiteLLM for model abstraction | **BUILT** |
| Anthropic Direct Proxy | Fallback direct Anthropic proxy when LiteLLM is down | **BUILT** |
| Health Check | Provider health: healthy, degraded, unavailable | **BUILT** |
| Credential Pool | Round-robin + cooldown across multiple keys per provider | **BUILT** |

### 9.2 Cost Tracking
| Feature | Description | Status |
|---------|-------------|--------|
| Per-Model Pricing | Default pricing for Claude, GPT, etc. (input + output per 1k tokens) | **BUILT** |
| Usage Recording | Track input/output tokens per request with workspace attribution | **BUILT** |
| By-Model Breakdown | Aggregate cost/tokens per model | **BUILT** |
| By-Workspace Cost | GET /api/cost/by-workspace (TEAMS+) | **BUILT** |
| Cost Reset | POST /api/agent/cost/reset | **BUILT** |
| Iteration Budget | Per-session budget tracking with isWithinBudget check | **BUILT** |

---

## 10. SECURITY FEATURES

| Feature | Description | Status |
|---------|-------------|--------|
| Injection Scanner | 3 pattern sets: role_override (12 patterns), prompt_extraction (6 patterns), instruction_injection (7 patterns) | **BUILT** |
| Multi-Language Patterns | Detects injection in English, German, Spanish, French | **BUILT** |
| Memory Wipe Detection | Catches "forget everything", "erase all context" attempts | **BUILT** |
| Authority Claim Detection | Detects fake system/admin messages, debug mode claims | **BUILT** |
| XSS Sanitization | Memory frame content sanitized (script tags, event handlers, javascript: URIs) | **BUILT** |
| Vault (Encrypted Secrets) | AES-encrypted secret storage for API keys and tokens | **BUILT** |
| Vault Categories | LLM Providers, Embedding, Search, Code/DevOps, Communication, Business, Storage | **BUILT** |
| Secret Reveal | POST /api/vault/:name/reveal -- explicit decrypt action | **BUILT** |
| Rate Limiter | Server-level rate limiting middleware | **BUILT** |
| CORS Configuration | Allowed origins list with validation | **BUILT** |
| Input Validation | assertSafeSegment for path traversal prevention | **BUILT** |
| Parameterized Queries | All SQL uses parameterized queries (no string interpolation) | **BUILT** |
| Trust Assessment | assessTrust function for evaluating content trustworthiness | **BUILT** |

---

## 11. PROACTIVE / AUTONOMOUS FEATURES

### 11.1 Cron Scheduling
| Feature | Description | Status |
|---------|-------------|--------|
| Cron CRUD | Create, read, update, delete schedules via REST API | **BUILT** |
| Job Types | Multiple job types with configurable payloads | **BUILT** |
| Manual Trigger | POST /api/cron/:id/trigger | **BUILT** |
| Cross-Workspace | `workspaceId="*"` for global cron jobs | **BUILT** |
| Default Crons | Auto-seed default cron schedules on first run | **BUILT** |
| Delivery System | Email delivery of cron results with HTML escaping (XSS safe) | **BUILT** |
| Delivery Preferences | Configurable delivery channels per schedule | **BUILT** |

### 11.2 Proactive Handlers
| Feature | Description | Status |
|---------|-------------|--------|
| Morning Briefing | Daily summary of workspace state and priorities | **BUILT** |
| Stale Workspace Detection | Flags workspaces with no recent activity | **BUILT** |
| Pending Task Reminders | Alerts for unresolved awareness items | **BUILT** |
| Capability Suggestions | Recommends skills/tools based on usage patterns | **BUILT** |

### 11.3 Monthly Self-Assessment
| Feature | Description | Status |
|---------|-------------|--------|
| Performance Report | Total interactions, correction rate, improvement trend | **BUILT** |
| Strengths/Weaknesses | Auto-derived from optimization logs and feedback | **BUILT** |
| Capability Gaps | Detected gaps from improvement signals | **BUILT** |
| Saved to Memory | Assessment becomes part of long-term self-awareness | **BUILT** |

---

## 12. DATA MANAGEMENT

### 12.1 Backup & Restore
| Feature | Description | Status |
|---------|-------------|--------|
| Encrypted Backup | AES-256-GCM encrypted ZIP archive of ~/.waggle/ | **BUILT** |
| Stream Download | POST /api/backup streams the archive | **BUILT** |
| Restore | POST /api/restore accepts encrypted backup | **BUILT** |
| Metadata | GET /api/backup/metadata -- last backup info | **BUILT** |
| Size Limit | 500 MB max, batched file reads to limit memory pressure | **BUILT** |
| Exclusions | node_modules, .git, marketplace.db excluded | **BUILT** |

### 12.2 Import / Export
| Feature | Description | Status |
|---------|-------------|--------|
| ChatGPT Import | Preview and commit ChatGPT conversation exports | **BUILT** |
| Claude Import | Preview and commit Claude conversation exports | **BUILT** |
| Knowledge Extraction | Extracts knowledge items from imported conversations | **BUILT** |
| GDPR Export | ZIP file with memories, sessions, workspaces, settings (keys masked), vault metadata | **BUILT** |
| Per-Workspace Export | Scoped export for agency/multi-client privacy | **BUILT** |
| Audit Event on Export | Every export operation logged to audit trail | **BUILT** |

---

## 13. REAL-TIME & COMMUNICATION

### 13.1 Notifications
| Feature | Description | Status |
|---------|-------------|--------|
| SSE Stream | Server-Sent Events for live notifications | **BUILT** |
| Categories | cron, approval, task, message, agent | **BUILT** |
| Sub-Agent Status | Real-time status updates for running sub-agents | **BUILT** |
| Workflow Suggestions | Pattern detection prompts for workflow capture | **BUILT** |

### 13.2 Waggle Signals
| Feature | Description | Status |
|---------|-------------|--------|
| Signal Types | agent:started, tool:called, memory:saved, agent:completed | **BUILT** |
| SSE Stream | GET /api/waggle/stream for real-time signal feed | **BUILT** |
| Acknowledgment | PATCH /api/waggle/signals/:id/ack | **BUILT** |
| In-Memory Store | Capped at 500 signals | **BUILT** |

### 13.3 Audit Trail
| Feature | Description | Status |
|---------|-------------|--------|
| Event Types | 14 types: tool_call, tool_result, memory_write, memory_delete, workspace CRUD, session lifecycle, approvals, exports, cron_trigger | **BUILT** |
| Separate Database | audit.db in dataDir (not in .mind) | **BUILT** |
| Paginated Listing | GET /api/events with filters | **BUILT** |
| Aggregate Stats | GET /api/events/stats by type and day | **BUILT** |
| SSE Stream | GET /api/events/stream for live Cockpit feed | **BUILT** |
| Retention | 90-day default, auto-cleanup via cron | **BUILT** |

---

## 14. USER PROFILE & PERSONALIZATION

| Feature | Description | Status |
|---------|-------------|--------|
| Identity Profile | Name, role, company, industry, bio, avatar | **BUILT** |
| Writing Style Analysis | Tone, sentence length, vocabulary, structure -- analyzed from text samples | **BUILT** |
| Brand Profile | Company colors (primary/secondary/accent), fonts, logo description | **BUILT** |
| Per-Format Styles | DOCX, PPTX, PDF, XLSX style preferences | **BUILT** |
| Online Research | POST /api/profile/research -- research user/company online | **BUILT** |
| Agent-Accessible | GET /api/profile/style and /api/profile/brand for agent tools | **BUILT** |
| Memory Integration | Key profile fields saved to personal memory for agent access | **BUILT** |

---

## 15. CHAT SYSTEM

| Feature | Description | Status |
|---------|-------------|--------|
| WebSocket Chat | Real-time bidirectional chat via WebSocket | **BUILT** |
| Session Persistence | Messages persisted to JSONL files per workspace | **BUILT** |
| Context Window Management | Configurable MAX_CONTEXT_MESSAGES with intelligent pruning | **BUILT** |
| Context Compression | Iterative conversation compression for long sessions | **BUILT** |
| Skill Prompt Injection | Active skills appended to system prompt per message | **BUILT** |
| Governance Permissions | Per-workspace tool/action permissions | **BUILT** |
| Dramatic Claim Hook | pre:memory-write hook flags dramatic claims before saving | **BUILT** |
| System Prompt Caching | Cached per session to avoid rebuilding on every message | **BUILT** |
| Ambiguity Detection | Detects ambiguous messages and prompts for clarification | **BUILT** |
| Schedule Suggestions | Detects recurring task patterns and suggests cron schedules | **BUILT** |
| Regulated Content Detection | Flags legal/financial/medical content for disclaimers | **BUILT** |
| Retry Logic | Retryable error detection for transient LLM failures | **BUILT** |
| Approval System | Human-in-the-loop approval for sensitive tool calls | **BUILT** |
| Capability Gap Recording | Records when agent cannot fulfill a request | **BUILT** |
| Correction Analysis | Analyzes user corrections to improve future responses | **BUILT** |
| Workflow Capture Suggestion | Detects repeatable patterns and suggests saving as workflow | **BUILT** |

---

## 16. OFFLINE MODE

| Feature | Description | Status |
|---------|-------------|--------|
| Offline Detection | OfflineManager tracks connectivity state | **BUILT** |
| Message Queue | Queue messages for when connection restores | **BUILT** |
| Offline-Capable Tools | Tools marked with `offlineCapable: true` (all mind tools) | **BUILT** |
| Status API | GET /api/offline/status | **BUILT** |
| Queue Management | List, clear, and delete individual queued messages | **BUILT** |

---

## 17. TEAM FEATURES

| Feature | Description | Status |
|---------|-------------|--------|
| Team DB | SQLite database for teams and members with role-based access | **BUILT** |
| Team Connect/Disconnect | Connect desktop app to team server | **BUILT** |
| Team Roles | owner, admin, member, viewer | **BUILT** |
| Team Sync | TeamSync from @waggle/core for cross-team data synchronization | **BUILT** |
| Cloud Sync | Tier-gated (TEAMS+) cloud synchronization | **PARTIAL** |
| Admin Panel | Admin overview endpoint (TEAMS+) | **BUILT** |
| Shared Workspaces | Tier-gated shared workspace access | **PARTIAL** |

---

## 18. TELEMETRY & OBSERVABILITY

| Feature | Description | Status |
|---------|-------------|--------|
| Telemetry Store | SQLite-backed event telemetry | **BUILT** |
| Summary API | GET /api/telemetry/summary | **BUILT** |
| Event Cleanup | DELETE /api/telemetry/events | **BUILT** |
| Status | GET /api/telemetry/status | **BUILT** |

---

## 19. ONBOARDING

| Feature | Description | Status |
|---------|-------------|--------|
| 7-Step Wizard | Welcome -> WhyWaggle -> MemoryImport -> Template -> Persona -> APIKey -> HiveReady | **BUILT** |
| Template Selection | 7+ workspace templates to choose from | **BUILT** |
| Persona Selection | Subset of personas for initial configuration | **BUILT** |
| API Key Setup | Guided key entry with provider selection | **BUILT** |
| Memory Import | Import from ChatGPT/Claude on first run | **BUILT** |

---

## 20. BEHAVIORAL SPEC & INTELLIGENCE

| Feature | Description | Status |
|---------|-------------|--------|
| BEHAVIORAL_SPEC | 273-line rules covering core loop, quality, behavior, work patterns, tools, intelligence defaults | **BUILT** |
| Smart Router | routeMessage() for intelligent message routing | **BUILT** |
| Capability Router | Resolves capabilities across native tools, skills, plugins, MCP, sub-agents, connectors | **BUILT** |
| Tool Filter | filterToolsForContext() with allowlist/denylist enforcement | **BUILT** |
| Tool Availability Check | Dynamic `checkAvailability()` per tool (e.g., browser connected, git repo present) | **BUILT** |
| Skill Recommender | Context-aware skill suggestions based on current task | **BUILT** |
| Hook Registry | Pre/post tool use hooks for validation and auto-formatting | **BUILT** |
| Command Registry | Slash command system with workflow and marketplace commands | **BUILT** |
| Optimization Logging | Track agent performance for self-improvement | **BUILT** |
| Improvement Signals | ImprovementSignalStore for detecting recurring issues | **BUILT** |

---

## CROWN JEWELS -- What Makes Waggle OS Unique

1. **Dual-Mind Persistent Memory** -- No other AI agent platform has workspace-isolated memory with cross-mind dedup, knowledge graph extraction, provenance tracking, and confidence derivation. The memory survives across sessions and grows smarter over time.

2. **22 Specialized Personas with Behavioral Guardrails** -- Not just "system prompts" but full personas with tool allowlists, denylists, failure pattern documentation, read-only enforcement, and suggested capability stacks. The Coordinator persona that can only delegate is particularly unique.

3. **Multi-Agent Orchestration with Workflow Templates** -- Built-in multi-agent workflows (research-team, review-pair, plan-execute, ticket-resolve, content-pipeline) with dependency ordering, context flow between steps, and automatic result aggregation.

4. **Memory Weaver** -- Automatic consolidation, decay, and strengthening of memories over time. Combined with monthly self-assessment that saves performance reports back into the agent's own memory, creating a genuine self-improvement loop.

5. **80+ Agent Tools** -- Comprehensive tool ecosystem spanning system ops, git, planning, documents, web, browser, LSP, CLI discovery, cron scheduling, team collaboration, and KVARK enterprise integration.

6. **28 Built-in Connectors + MCP Runtime** -- Native integrations for GitHub, Slack, Jira, Salesforce, Google Workspace, etc., plus MCP server support for extensibility. OAuth flows for major platforms.

7. **Encrypted Backup/Restore + GDPR Export** -- AES-256-GCM encrypted backup with per-workspace scoped export for agency privacy compliance.

8. **Tiered Feature Gating with Stripe** -- Full SOLO -> BASIC -> TEAMS -> ENTERPRISE tier system with per-feature capability gating, Stripe checkout/webhook/portal integration, and KVARK enterprise upsell funnel.

9. **Proactive Intelligence** -- Morning briefings, stale workspace detection, task reminders, capability suggestions, and monthly self-assessments -- all running on cron without user prompting.

10. **Security-First Design** -- Injection scanner with 25+ patterns (multilingual), XSS sanitization on memory writes, workspace-level data isolation, encrypted vault, rate limiting, parameterized SQL, and trust assessment on all external content.
