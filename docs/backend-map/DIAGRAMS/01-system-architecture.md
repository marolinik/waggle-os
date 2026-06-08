# System Architecture (Layers)

This diagram is the cross-cutting runtime map for a Lovable rebuild of the Waggle OS frontend. It traces one request from the Tauri Rust shell, through the `apps/web` React SPA, into the Fastify **Local Sidecar** (port 3333) that serves the SPA and exposes all `/api/*` routes, down through the workspace packages that own each responsibility, into the data stores (per-workspace SQLite `*.mind` files via better-sqlite3 + sqlite-vec, plus team/cloud Postgres + Redis via the separate Cloud Server on port 3100), and out to the LiteLLM router and the LLM providers. Every node and ownership label is grounded in the section files. Key facts to anchor on: the frontend origin **is** the sidecar (same-origin, two-step Bearer-token auth), the sidecar uses local SQLite while the optional Cloud Server uses Postgres + Clerk + Redis, and the memory substrate (`mind` + `harvest`) lives in `@waggle/hive-mind-core`, not `@waggle/core`.

## Full Runtime Stack

```mermaid
flowchart TD
  subgraph Shell["Desktop shell — app/ (Tauri 2.0, Rust)"]
    TAURI["Tauri WebView\nloads apps/web dist from sidecar\norigin = tauri://localhost"]
  end

  subgraph Web["Frontend — apps/web (React 19 + Vite + Tailwind 4)"]
    SPA["SPA shell + assets\nauth-exempt GET"]
    AUTH2["Two-step auth\n1. GET /api/auth/session-token\n2. Authorization Bearer on every /api/*"]
    APPS["OS apps + overlays\nChat · Memory{Harvest,Evolution,Wiki}\nMarketplace · Connectors · Launcher\nWaggleDance · Room · Mission Control"]
    WS["WebSocket client\nGET /ws?token="]
  end

  subgraph Sidecar["Local Sidecar :3333 — packages/server (Fastify, Node, bundled in Tauri)"]
    SEC["securityMiddleware\nHost allowlist · Bearer · CORS · RateLimit · CSP"]
    STATIC["@fastify/static + SPA fallback\nserves apps/web dist"]
    ROUTES["62 route plugins, flat /api/* paths\nchat · memory · harvest · evolution · skills\nmarketplace · connectors · wiki · tools\nwaggle-dance · stripe · vault · personas"]
    WSL["/ws event-bus relay\napprovals · steps · tools · notifications"]
  end

  subgraph Packages["Workspace packages (responsibilities)"]
    AGENT["@waggle/agent\nrunAgentLoop · Orchestrator · personas\ntool-executor · completion gates · cost-tracker\nconnectors · capability/trust · KVARK tools"]
    HMC["@waggle/hive-mind-core\nmind: Identity·Awareness·Frames·KnowledgeGraph\nHybridSearch·Cognify·embeddings\nharvest: source adapters + 4-pass pipeline"]
    SHARED["@waggle/shared\ntypes · zod schemas · TIERS\nmcp-catalog · tool-detection"]
    DANCE["@waggle/waggle-dance\nWaggleMessage protocol\ndispatcher · SignalBus"]
    MKT["@waggle/marketplace\ncatalog · installer · SecurityGate · sync"]
    WIKI["@waggle/wiki-compiler\nentity/concept/synthesis/index/health pages"]
    OPT["@waggle/optimizer\nself-evolution: GEPA + EvolveSchema\njudge · gates · evolution runs"]
  end

  subgraph LocalData["Per-workspace local data (better-sqlite3 + sqlite-vec)"]
    MIND[("*.mind SQLite per workspace\nmemory_frames + _fts + _vec float[1024]\nknowledge_entities/relations · sessions\nharvest_runs · evolution_runs · wiki_pages")]
    CFG[("~/.waggle/config.json\ntier · stripe_customer_id")]
    VAULT[("Vault\napi keys · connector creds · kvark:connection")]
    MKTDB[("marketplace.db SQLite")]
    SKILLS[("~/.waggle/skills/*.md\nplugins · hooks.json")]
  end

  subgraph Cloud["Optional Cloud Server :3100 — packages/server (team/SaaS only)"]
    AUTHP["authPlugin — Clerk JWT verify"]
    CROUTES["teams · agents · jobs · scout\nsuggestions · messages · audit · analytics"]
    WSG["/ws gateway — team chat"]
    PG[("Postgres via drizzle\nDATABASE_URL")]
    REDIS[("Redis pub/sub\nteam:*:waggle · job:*:progress")]
  end

  LITELLM["LiteLLM router\nlitellm-config.yaml\nPOST /chat/completions"]
  PROVIDERS["LLM providers\nAnthropic · OpenAI · Ollama (local)\nVoyage · others"]
  STRIPEAPI["Stripe API"]
  KVARK["KVARK sovereign FastAPI\nsearch · ask · actions (TEAMS/ENTERPRISE)"]

  TAURI --> SPA
  SPA --> AUTH2
  AUTH2 --> APPS
  APPS -->|"Bearer /api/*"| SEC
  WS -->|"?token="| WSL
  SPA -.->|"shell + assets"| STATIC

  SEC --> ROUTES
  ROUTES --> AGENT
  ROUTES --> HMC
  ROUTES --> DANCE
  ROUTES --> MKT
  ROUTES --> WIKI
  ROUTES --> OPT
  ROUTES --> SHARED
  WSL --> AGENT

  AGENT --> SHARED
  HMC --> SHARED
  OPT --> AGENT
  WIKI --> HMC
  MKT --> SKILLS

  AGENT -->|"recall/write memory"| HMC
  HMC --> MIND
  AGENT --> VAULT
  ROUTES --> CFG
  MKT --> MKTDB
  AGENT --> SKILLS

  AGENT -->|"POST /chat/completions"| LITELLM
  OPT -->|"judge + mutate (Haiku)"| LITELLM
  HMC -->|"embeddings (litellm/ollama)"| LITELLM
  WIKI -->|"synthesize (Haiku/Ollama)"| LITELLM
  LITELLM --> PROVIDERS

  ROUTES -->|"stripeRoutes"| STRIPEAPI
  STRIPEAPI -->|"webhook -> write tier"| CFG
  VAULT -->|"KvarkClient"| KVARK

  APPS -. "team mode only" .-> AUTHP
  AUTHP --> CROUTES
  CROUTES --> PG
  CROUTES --> REDIS
  WSG <--> REDIS
```

## Request / Auth Path (Local Sidecar)

This is the bootstrap handshake the rebuilt frontend must reproduce. The API root is the page's own origin; there is no separate host to configure.

```mermaid
flowchart LR
  A["1. Load shell\nauth-exempt GET"] --> B["2. GET /api/auth/session-token\nsame-origin gated"]
  B --> C["token"]
  C --> D["3. Authorization Bearer token\non every /api/* call"]
  C --> E["4. GET /ws?token=\nWebSocket relay"]
  D --> F["Sidecar route plugins\nrate-limited, tier-gated"]
  F -->|"403 TIER_INSUFFICIENT"| G["render upgrade prompt\nrequired + upgradeUrl"]
  F -->|"429 + Retry-After"| H["backoff and retry"]
```

## Package Ownership Map

Which package owns which responsibility, distilled from the subsystem sections.

```mermaid
flowchart TD
  R["Fastify sidecar routes\npackages/server"] --> A
  R --> H
  R --> D
  R --> M
  R --> W
  R --> O

  A["@waggle/agent\nagent loop · orchestrator · 22 personas\ntool execution + 11-step chain\ncompletion gates D3/D4/D1\nconnectors (30) · capability + trust\nautonomy gating · KVARK tools · cost"]
  H["@waggle/hive-mind-core\nMIND: identity · awareness · frames\nknowledge graph · hybrid search\nrelevance scoring · cognify · embeddings\nHARVEST: adapters · 4-pass pipeline · dedup"]
  D["@waggle/waggle-dance\nWaggleMessage protocol\ndispatcher + combo validation\nSignalBus ring buffer · AI-OS signals"]
  M["@waggle/marketplace\nSQLite catalog · installer\nSecurityGate (4 layers) · 9 sync adapters"]
  W["@waggle/wiki-compiler\n5 page types from memory\nincremental compile · Obsidian/Notion export"]
  O["@waggle/optimizer\nGEPA + EvolveSchema + judge\nevolution gates · run store · deploy"]
  S["@waggle/shared\nwire types · zod schemas\n5-tier model + capabilities\nMCP catalog · tool detection"]

  A --> S
  H --> S
  D --> S
  M --> S
  W --> S
  O --> S
```
