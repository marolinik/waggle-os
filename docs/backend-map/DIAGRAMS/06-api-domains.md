# API Domain Overview

This is the cross-cutting map of every HTTP/SSE/WebSocket surface a Lovable rebuild of the Waggle frontend must talk to. Almost everything lives in the **Local Fastify Sidecar** (default loopback `:3333`, flat `/api/*` paths, Bearer session-token + same-origin guards); a smaller set of Clerk-authenticated routes live in the separate **Cloud Server** (`:3100`, used only in SaaS/team-server deployments). Each domain node below is annotated with its endpoint count (counts are derived from the route tables in sections `03a`-`03g`; the approvals group is shared between the chat and governance sections, so it is shown once and noted). KVARK has no Fastify routes — it is reached only through the in-process `KvarkClient` (its method count is shown for completeness). Use this as the index; drill into the matching `03*` section for exact request/response shapes.

```mermaid
mindmap
  root(("Waggle API\n7 domains"))
    ("Chat / Agents / Sessions\n~29 endpoints\nsec 03a")
      ("POST /api/chat SSE + DELETE history\n2")
      ("GET /api/history\n1")
      ("Agent status / cost / model / active\n6")
      ("Slash commands /api/commands/execute\n1")
      ("Sessions CRUD + search + export + timeline\n8")
      ("Agent groups CRUD + run\n5")
      ("POST /api/agent/run one-shot SSE\n1")
      ("Approvals SSE-paused gate\nshared with 03e")
    ("Memory / Wiki / Harvest\n~38 endpoints\nsec 03b")
      ("Memory frames search/CRUD/stats\n7")
      ("Knowledge graph read /api/memory/graph\n1")
      ("Wiki pages / compile / export\n8")
      ("Harvest preview/commit/sources/runs SSE\n11")
      ("Legacy import preview/commit\n2")
      ("Identity record + mind context\n5")
      ("Document version registry\n3")
      ("GDPR data erase\n1")
    ("Workspace / Team / Personas\n~76 endpoints\nsec 03c")
      ("Workspaces lifecycle + storage + context\n16")
      ("Workspace templates 15 built-in\n5")
      ("Team remote-proxy + local CRUD\n25")
      ("Personas catalog + create + generate\n5")
      ("Settings / tier / cloud-sync / admin\n14")
      ("User profile + style + brand\n7")
      ("Pins per workspace\n4")
    ("Marketplace / Skills / Connectors\n~60 endpoints\nsec 03d")
      ("Marketplace search/install/sources PRO\n15")
      ("Skills + plugins + hooks\n28")
      ("Connectors connect/disconnect/health\n4")
      ("AI-OS tool launcher detect/launch/hooks\n5")
      ("OAuth 5 providers\n3")
      ("Vault list/add/delete/reveal\n4")
      ("LLM + search providers catalog\n1")
    ("Evolution / Governance\n~39 endpoints\nsec 03e")
      ("Evolution runs accept/reject/run SSE\n8")
      ("Feedback thumbs + stats\n2")
      ("Telemetry local-only\n6")
      ("Compliance EU AI Act + templates + PDF\n12")
      ("Cost dashboard + by-workspace TEAMS\n3")
      ("Capabilities status + plugin toggles\n3")
      ("Approvals inbox + grants\n5")
    ("Real-time / Ops\n~52 endpoints\nsec 03f")
      ("WaggleDance UI signals + stream SSE\n4")
      ("WaggleDance v2 protocol bus\n2")
      ("Audit events + stats + stream SSE\n3")
      ("Cron schedules + trigger + history\n7")
      ("Notifications stream SSE + store\n6")
      ("Offline message queue\n5")
      ("Backup / restore / metadata\n3")
      ("Agent fleet spawn/pause/resume/kill\n5")
      ("LiteLLM control + pricing\n4")
      ("Local inference hardware/models/pull\n4")
      ("Anthropic proxy /v1/chat/completions SSE\n2")
      ("Filesystem browse local-only\n2")
      ("Browser extension health\n1")
      ("Telegram outbound push\n4")
    ("Cloud / Billing / KVARK\n~35 surfaces\nsec 03g")
      ("Sidecar inline auth/docs/health/ws\n6")
      ("Stripe checkout/webhook/sync/portal\n4")
      ("Cloud agents + groups Clerk\n10")
      ("Cloud jobs queue Clerk\n4")
      ("Cloud scout findings Clerk\n2")
      ("Cloud suggestions Clerk\n2")
      ("KVARK client methods no routes\n5")
      ("WebSocket sidecar + cloud\n2")
```

## Domains as a graph (server split + auth model)

The same domains, grouped by which server hosts them and what auth each requires. The sidecar serves the SPA and almost every domain; the cloud server is Clerk-gated and optional.

```mermaid
graph LR
  FE["Frontend SPA\napps/web served by sidecar"]

  subgraph SIDECAR["Local Sidecar :3333 - Bearer session-token + same-origin"]
    D1["Chat / Agents / Sessions\n~29"]
    D2["Memory / Wiki / Harvest\n~38"]
    D3["Workspace / Team / Personas\n~76"]
    D4["Marketplace / Skills / Connectors\n~60"]
    D5["Evolution / Governance\n~39"]
    D6["Real-time / Ops SSE+WS\n~52"]
    BILL["Stripe billing\n4"]
    BOOT["Auth token / docs / health / ws\n6"]
  end

  subgraph CLOUD["Cloud Server :3100 - Clerk JWT - optional SaaS"]
    C1["Agents + Groups\n10"]
    C2["Jobs queue\n4"]
    C3["Scout findings\n2"]
    C4["Suggestions\n2"]
    C5["Team WebSocket gateway\n1"]
  end

  KVARK["KVARK client\nno routes - vault-credentialed\n5 methods - TEAMS/ENTERPRISE"]

  FE -->|"same-origin Bearer"| SIDECAR
  FE -.->|"team mode Clerk JWT"| CLOUD
  D5 -->|"agent tools"| KVARK
  D3 -->|"teamServerUrl proxy"| CLOUD
  BILL -->|"writes tier to config.json"| D3
```
