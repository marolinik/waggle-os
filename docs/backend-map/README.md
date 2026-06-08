# Waggle OS — Backend Map

This is the complete, source-grounded map of the Waggle OS backend, written so the frontend can be
**rebuilt from scratch (e.g. in Lovable) against the existing, unchanged Fastify sidecar**. The
mental model is simple and worth internalizing before anything else: Waggle is a single-page
"desktop OS" (window manager + dock + ~18 apps, opened by `appId`, not by URL) that is a *thin
client* — it renders state, streams responses over SSE, and POSTs user intent through one shared
`adapter` singleton to a local Node.js Fastify **sidecar** (`http://127.0.0.1:3333`). The sidecar is
the brain stem: it resolves the workspace session, builds the layered system prompt, runs the agent
tool-calling loop, executes tools through a governance middleware chain, and streams results back.
Two physically separate data stores sit behind it — per-workspace **SQLite `*.mind` files** (private
memory, knowledge graph, identity, awareness; the moat) and an optional team/cloud **Postgres** layer
(users, teams, tasks, governance). Everything is gated on two orthogonal axes: **subscription tier**
(does the feature exist?) and **trust/autonomy** (does this action need an approval click?). The
backend is the contract; the frontend is replaceable.

---

## Recommended Reading Order

Read these in sequence for a clean ramp from concept → contracts → build playbook:

1. **[00-MENTAL-MODEL.md](00-MENTAL-MODEL.md)** — the concept map and six-layer request lifecycle. Read this first; keep it in your head while reading everything else.
2. **[DIAGRAMS/01-system-architecture.md](DIAGRAMS/01-system-architecture.md)** — the cross-cutting runtime stack: shell → SPA → sidecar → packages → data stores → LLM router.
3. **[DIAGRAMS/02-master-er.md](DIAGRAMS/02-master-er.md)** — the two ER diagrams (SQLite memory layer + Postgres relational layer) and how they bridge.
4. **[sections/03a-api-chat-agents.md](sections/03a-api-chat-agents.md)** … **[sections/03g-api-cloud-billing-kvark.md](sections/03g-api-cloud-billing-kvark.md)** — the full HTTP/SSE/WS API contract, split by domain (start at 03a, the conversational core).
5. **[sections/04-feature-map.md](sections/04-feature-map.md)** — the canonical app ↔ endpoint matrix: every screen and exactly which routes it calls.
6. **[sections/05a-subsystem-agent-runtime.md](sections/05a-subsystem-agent-runtime.md)** … **[sections/05g-subsystem-skills-marketplace-wiki.md](sections/05g-subsystem-skills-marketplace-wiki.md)** — the subsystem deep-dives explaining what the API actually does internally.
7. **[07-FRONTEND-REBUILD-GUIDE.md](07-FRONTEND-REBUILD-GUIDE.md)** — the action-oriented, build-in-order playbook for the Lovable rebuild.

---

## Full File Index

### Top-level

| File | Description |
|---|---|
| [00-MENTAL-MODEL.md](00-MENTAL-MODEL.md) | The concept map: what Waggle OS is, the six-layer request lifecycle, and the two or three ideas everything hangs off. |
| [07-FRONTEND-REBUILD-GUIDE.md](07-FRONTEND-REBUILD-GUIDE.md) | Action-oriented Lovable rebuild playbook — build the adapter + ServiceProvider + Desktop shell first, then screens that call adapter methods. |
| [AUDIT.md](AUDIT.md) | Completeness audit cross-checking the written sections against ground truth (route files, schema tables, connectors); ~94% coverage with named gaps. |
| [WAGGLE-BACKEND-VISUAL.html](WAGGLE-BACKEND-VISUAL.html) | Self-contained dark-themed visual one-pager of the whole backend map (Hive DS palette) — open in a browser for the diagrams. |

### Diagrams (`DIAGRAMS/`)

| File | Description |
|---|---|
| [DIAGRAMS/01-system-architecture.md](DIAGRAMS/01-system-architecture.md) | Full runtime stack as a layered flowchart: Tauri shell → React SPA → Fastify sidecar (:3333) → packages → SQLite/Postgres/Redis → LiteLLM → LLM providers. |
| [DIAGRAMS/02-master-er.md](DIAGRAMS/02-master-er.md) | Two ER diagrams — per-workspace SQLite memory (`*.mind`, 14+2 tables) and team/cloud Postgres (20 tables) — sharing no FKs except `users.mind_path`. |
| [DIAGRAMS/03-chat-turn-sequence.md](DIAGRAMS/03-chat-turn-sequence.md) | End-to-end sequence of one chat turn: `POST /api/chat` → prompt assembly → tool loop → 11-step tool middleware → SSE stream → cognify write-back. |
| [DIAGRAMS/04-feature-api-map.md](DIAGRAMS/04-feature-api-map.md) | Rebuild-contract flowchart mapping every OS app/overlay to the backend endpoint groups (03a–03g) it depends on. |
| [DIAGRAMS/05-tier-gating.md](DIAGRAMS/05-tier-gating.md) | The two orthogonal gating axes — subscription tier (does the door exist?) vs trust/autonomy (does it need a key turn?), plus `getEffectiveTier()`. |
| [DIAGRAMS/06-api-domains.md](DIAGRAMS/06-api-domains.md) | Mind-map index of all 7 API domains with endpoint counts; local sidecar (:3333) vs cloud server (:3100), KVARK via in-process client only. |

### Sections — Data Model (`sections/02*`)

| File | Description |
|---|---|
| [sections/02a-data-model-memory.md](sections/02a-data-model-memory.md) | Per-workspace SQLite `*.mind` schema — frames, knowledge graph, identity, awareness, sessions; the canonical shape of everything the memory APIs return. |
| [sections/02b-data-model-relational.md](sections/02b-data-model-relational.md) | Team/cloud Postgres + Drizzle schema (20 tables): users, teams, agents, tasks, jobs, governance — column names/types/FKs verbatim from source. |
| [sections/02c-shared-types-tiers.md](sections/02c-shared-types-tiers.md) | The wire contract: `@waggle/shared` interfaces, enums, Zod request schemas, and the 5-tier capability matrix consumed by both sidecar and web. |

### Sections — API Contracts (`sections/03*`)

| File | Description |
|---|---|
| [sections/03a-api-chat-agents.md](sections/03a-api-chat-agents.md) | Conversational core: `POST /api/chat` SSE stream, the event catalogue, mid-stream tool approvals, sessions CRUD/export, and slash commands. |
| [sections/03b-api-memory.md](sections/03b-api-memory.md) | Memory subsystem API: recall/save frames, knowledge graph, wiki compile/read, harvest external AI exports, import, identity, documents, GDPR erasure. |
| [sections/03c-api-workspace-team.md](sections/03c-api-workspace-team.md) | Management plane: workspaces + templates, teams/members, personas, settings (models/budgets/autonomy/tier), user profile, and message pins. |
| [sections/03d-api-marketplace-skills.md](sections/03d-api-marketplace-skills.md) | Capability layer API: marketplace, skills, connectors, tools, OAuth, vault, and providers. |
| [sections/03e-api-evolution-governance.md](sections/03e-api-evolution-governance.md) | "Self-improves + you stay in control": evolution runs, feedback, telemetry, EU AI Act compliance (PDF), cost tracking, capability status, approvals inbox. |
| [sections/03f-api-realtime-ops.md](sections/03f-api-realtime-ops.md) | Real-time + ops: the 4 SSE streams (WaggleDance v1/v2, events, notifications), cron, offline queue, backup/restore, fleet, LLM proxies, browse, Telegram. |
| [sections/03g-api-cloud-billing-kvark.md](sections/03g-api-cloud-billing-kvark.md) | The two HTTP surfaces, API-root discovery + auth/origin guards, Stripe billing flow (checkout → webhook → tier), KVARK client, and WebSocket channels. |

### Sections — Feature Map (`sections/04`)

| File | Description |
|---|---|
| [sections/04-feature-map.md](sections/04-feature-map.md) | Canonical app↔endpoint matrix: every OS app, overlay, and page, the shared `adapter`/providers, and the exact backend endpoints each feature calls. |

### Sections — Subsystem Deep-Dives (`sections/05*`)

| File | Description |
|---|---|
| [sections/05a-subsystem-agent-runtime.md](sections/05a-subsystem-agent-runtime.md) | The agent runtime: layered system-prompt assembly, the tool-calling loop, the tool middleware chain, and completion-time verification/file-write/skill gates. |
| [sections/05b-subsystem-memory.md](sections/05b-subsystem-memory.md) | The persistent memory engine (the moat): Identity → Awareness → Frames → Knowledge Graph, hybrid search, cognify write path, combined retrieval. |
| [sections/05c-subsystem-harvest.md](sections/05c-subsystem-harvest.md) | Harvest ingestion pipeline: external AI exports + files/URLs → normalized `UniversalImportItem` → memory frames; powers the Memory app HarvestTab. |
| [sections/05d-subsystem-evolution.md](sections/05d-subsystem-evolution.md) | Self-evolution loop: mine execution history → GEPA + EvolveSchema mutation → LLM-judge → safety gates → auditable `EvolutionRun` → user accept/reject. |
| [sections/05e-subsystem-waggledance-aios.md](sections/05e-subsystem-waggledance-aios.md) | WaggleDance multi-agent coordination + the AI-OS arc: detect 7 external AI tools, install reversible hooks, launch with workspace context, stream signals back. |
| [sections/05f-subsystem-capabilities-tiers.md](sections/05f-subsystem-capabilities-tiers.md) | What an agent can/may do: capability discovery + acquisition, connectors-as-tools, MCP catalog, and the trust vs tier gates (incl. KVARK gating). |
| [sections/05g-subsystem-skills-marketplace-wiki.md](sections/05g-subsystem-skills-marketplace-wiki.md) | Skills lifecycle, the marketplace catalog/installer/security gate, and the wiki-compiler — the PRO+ upgrade trigger (Memory/Harvest/wiki stay free). |

---

## How to Feed This Into Lovable

For the rebuild, paste the **contract-bearing** docs directly into Lovable and keep the visual open
on the side:

- **Paste these as context** (the binding contracts the new frontend must honor):
  - [00-MENTAL-MODEL.md](00-MENTAL-MODEL.md) — so the model holds the desktop-OS / thin-client mental model.
  - [sections/02c-shared-types-tiers.md](sections/02c-shared-types-tiers.md) — the exact wire types, Zod request schemas, and tier capability matrix.
  - [sections/03a-api-chat-agents.md](sections/03a-api-chat-agents.md) through [sections/03g-api-cloud-billing-kvark.md](sections/03g-api-cloud-billing-kvark.md) — the full endpoint/SSE contract (paste the 03* sections relevant to the screens you're building).
  - [07-FRONTEND-REBUILD-GUIDE.md](07-FRONTEND-REBUILD-GUIDE.md) — the build-in-order playbook (adapter + ServiceProvider + Desktop shell first, then screens).
- **Open [WAGGLE-BACKEND-VISUAL.html](WAGGLE-BACKEND-VISUAL.html) in a browser** for the diagrams — it renders the architecture, ER, chat-turn, feature-API, and tier-gating views as one navigable one-pager, which is faster to skim than the raw Mermaid blocks.

Start by having Lovable build the `adapter` singleton + `ServiceProvider` + `Desktop` shell against
the sidecar at `http://127.0.0.1:3333`; everything else is screens that call adapter methods listed
in [sections/04-feature-map.md](sections/04-feature-map.md).
