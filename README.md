# Waggle OS

Workspace-native AI agent platform with persistent memory, model-agnostic orchestration, and skill-extensible capabilities. The current desktop release scope is Windows-first: a Tauri 2.0 app with a Vite-bundled web UI and bundled Node.js sidecar; macOS packaging and certification remain roadmap work.

## Current Release Scope

The active launch gate is **Windows Solo**. Its in-scope external-agent release cohort is **Claude Code, Codex, and Hermes**. Each tool uses the user's own installation and authentication; Waggle does not redistribute provider credentials or bypass provider terms.

- **Cursor and OpenClaw are roadmap integrations.** They remain registered for detection and future development, but the production launcher, hooks, Fleet/task path, and direct run API do not offer them.
- Claude Desktop, Codex Desktop, and Hermes Desktop may appear as detected convenience launch surfaces; they are not separate memory-hook or agent-acceptance targets in this release gate.
- **ChatGPT/OpenAI is a model and memory-import surface**, not a separate local coding-agent launcher.
- The Windows Solo launch contract requires an exact-revision Windows installer qualification receipt to prove its bundled Node sidecar, no-Python OpenAI-compatible proxy, Waggle-managed local runtime/model, default in-process embedding path, and freedom from developer Node, Docker, Python, an external LiteLLM service, or a separately installed Ollama. A separate revision-bound router receipt must prove the smart-router primary, compact-tool-context, budget, and fallback paths. Router, persona, and authentication receipts may cover a later candidate only through an independently reviewed bounded no-impact attestation proving that no covered runtime surface changed; otherwise they must be rerun. A user-installed Ollama remains optional.
- Docker/LiteLLM deployment files remain optional server and team deployment choices; they are not desktop prerequisites.

Release status, revision-bound receipts, and any bounded carry-forward attestations are governed only by the current [launch recommendation](docs/production-readiness/09-LAUNCH_RECOMMENDATION.md). If it does not say **GO**, do not describe Waggle as production-ready or reuse historical scores or receipts as current release evidence.

### Current Windows Solo internal RC evidence — 2026-08-14

The frozen internal runtime/binary evidence revision is
`d4f1dae3476829f1fc6d73c2173c960527c7b4c9`. This Markdown release-record update
is a no-impact descendant: it changes no shipped runtime surface and does not relabel
the installer or receipts as if they had been produced from the documentation commit.

- Paid ten-persona acceptance is carried forward after a scoped no-impact diff review:
  **30/30 accepted across ten personas x3, all selected receipts 100/100**.
- Smart-router qualification and the Claude Code, Codex, and Hermes official-auth
  canaries are carried forward from `692c69b9` after scoped no-impact diff review.
  The router passed primary, compact-tool-context, durable-budget, and fallback paths
  with a managed local runtime and without Docker; the auth harness read/copied zero
  authentication files.
- The application-runtime regression at `af19b387` passed **714 test files and 11,586
  tests**. Changes from that revision through `d4f1dae3` are confined to
  release, signing, certification, and their tests and are covered by focused
  `d4f1dae3` gates.
- The exact-`d4f1dae3` unsigned NSIS installer is 98,686,269 bytes with SHA-256
  `B5B427B7D4828BF18FC639CA475D7B21D6E007F3095285859AA67164D9C7DC7D`.
  It passed **59/59** clean-profile lifecycle, Docker-independent Solo, managed-model,
  proxy-restart, repair, data-preservation, and uninstall checks.
- The exact-`d4f1dae3` hosted-signing implementation passed **248/248** PowerShell policy tests,
  **85/85** workflow/Tauri tests, app/agent/server typechecks, lint, YAML/PowerShell
  parsing, and three independent reviews with no P0-P2 finding.

Detailed local receipt paths and SHA-256 digests are recorded in the current
[launch recommendation](docs/production-readiness/09-LAUNCH_RECOMMENDATION.md); the
receipts themselves are intentionally not published from ignored local `output/` or
temporary directories.

The `d4f1dae3` internal Windows Solo runtime RC is qualified, but the public Windows
binary release is **not yet approved**. The installer above is `NotSigned`; a protected
hosted run must build the exact approved release-tag commit and produce a publicly
trusted Authenticode signature and timestamp. A managed Codex Security Deep Scan must
also produce a sealed report with no unresolved Critical/High findings.

## Architecture

```
waggle-os/
├── apps/
│   ├── web/            # Main web app UI (React 19 + Vite + Tailwind 4 + base-ui/react)
│   ├── www/            # Marketing site (Next.js)
│   └── browser-ext/    # Browser extension (unpacked; not an npm workspace)
├── packages/           # 28 workspace packages (see "Packages" below)
├── app/                # Tauri 2.0 desktop shell (Rust) — loads the apps/web build
├── sidecar/            # Node.js sidecar bundled into the Tauri desktop binary
└── docs/               # Architecture, contributing, threat model, and guides
```

### Packages

The monorepo has **28 packages** under `packages/`. They split into two groups.

**Product packages (15, MIT):**

| Package | Purpose |
|---|---|
| `agent` | Agent loop, orchestrator, tools, personas, workflows, and the evolution subsystem |
| `core` | Config, the encrypted vault, cron store, file store, telemetry, and compliance/audit |
| `server` | Fastify sidecar — local (solo) and team routes, SSE streaming, Stripe, KVARK client |
| `shared` | Shared types, Zod schemas, the tier system, and the MCP catalog |
| `marketplace` | Package catalog with the `SecurityGate` installer |
| `optimizer` | GEPA prompt optimization |
| `weaver` | Memory consolidation daemon |
| `waggle-dance` | Multi-agent coordination protocol |
| `worker` | Background job processor (BullMQ, team mode) |
| `sdk` | Plugin / skill SDK |
| `cli` | Command-line REPL |
| `launcher` | AI-tool launcher / dock backend |
| `admin-web` | Admin dashboard for team deployments |
| `wiki-compiler` | Knowledge / wiki compiler |
| `memory-mcp` | MCP server exposing the memory substrate to external agents |

**Memory substrate — `hive-mind-*` (13, Apache-2.0):** the persistent-memory core, mirrored to the public OSS repo [`marolinik/hive-mind`](https://github.com/marolinik/hive-mind).

| Package | Purpose |
|---|---|
| `hive-mind-core` | The memory substrate: `FrameStore`, `HybridSearch`, `KnowledgeGraph`, `IdentityLayer`, `AwarenessLayer`, plus Harvest ingestion (`src/mind` + `src/harvest`) |
| `hive-mind-cli` | CLI for the substrate |
| `hive-mind-mcp-server` | MCP server for the substrate |
| `hive-mind-shim-core` | Signal-emitter shim library |
| `hive-mind-wiki-compiler` | Wiki compiler (OSS) |
| `hive-mind-hooks-core` | Shared hook library |
| `hive-mind-hooks-*` | Per-tool capture hooks: `claude-code`, `claude-desktop`, `codex`, `codex-desktop`, `cursor`, `hermes`, `openclaw` |

> The memory substrate is developed **here** and mirrored out — never the reverse.
> See the "Memory Substrate Sync" section of [`CLAUDE.md`](./CLAUDE.md) before touching `packages/hive-mind-core`.

## Quick Start

### Windows Solo desktop

Use only the signed Windows installer and SHA-256 identified by a **GO** [launch recommendation](docs/production-readiness/09-LAUNCH_RECOMMENDATION.md). If that recommendation is not GO, no packaged desktop artifact is release-approved; use the source-development instructions below.

### Self-host in one line (Linux / macOS)

```bash
curl -fsSL https://raw.githubusercontent.com/marolinik/waggle-os/main/install.sh | bash
```

Best for a VPS or homelab — this runs a headless Waggle server (no desktop shell):

- **Checks prerequisites, clones, builds, and starts** the Node.js sidecar, then prints the URL (`http://127.0.0.1:3333`). A 5-question wizard — install dir, port, data dir, build web UI, start now — is all Enter-defaulted; pass `--yes` to accept every default non-interactively.
- **Boots with zero API keys** in echo mode so the UI works immediately. Add a provider key later under **Settings → API Keys**, where it is stored in the encrypted vault — keys are never passed on the command line.
- **No sudo, ever.** A missing prerequisite prints the exact per-OS install command and exits; the installer never installs system packages for you.

Manage the running server with the installed wrapper: `scripts/waggle-server.sh status | logs | stop | start`. Re-running the one-liner against an existing install prints an upgrade hint instead of reinstalling.

### Run from source (development)

```bash
# Prerequisites: Node.js ^20.19.0 or >=22.12.0, npm
npm install

# (Optional) copy the env template. Provider API keys are normally set in-app
# (Settings → API Keys), which stores them in the encrypted vault — so you do
# NOT need to put keys in .env for a basic local run.
cp .env.example .env

# Terminal 1 — backend sidecar (http://localhost:3333)
npm run dev:server

# Terminal 2 — web app (http://localhost:8080)
npm run dev:web

# Open http://localhost:8080
```

The source tree follows the root `package.json` Node engine above. The packaged
Windows Solo desktop carries its own pinned Node.js 22.23.2 runtime, so an
installed user does not need a separate Node.js installation.

`npm run dev:server` runs the Fastify sidecar via `tsx` (equivalent to
`cd packages/server && npx tsx src/local/start.ts`). `npm run dev:web` runs the
Vite dev server for `apps/web`.

**Embeddings.** By default `EMBEDDING_PROVIDER=auto` downloads a small in-process
model (~23 MB, cached under `~/.waggle/models/`) and works fully offline. For
better recall — and to reproduce any hive-mind benchmark — install
[Ollama](https://ollama.com), run `ollama pull nomic-embed-text`, and set
`EMBEDDING_PROVIDER=ollama`.

> **Windows:** if the sidecar fails to start with an esbuild platform error, see
> [Troubleshooting](docs/CONTRIBUTING.md#troubleshooting) in the contributing guide.

## Environment Variables

Provider keys are stored in the encrypted vault (set via **Settings → API Keys**)
and hydrated into the process at boot, so most of these are optional for a local
run. See [`.env.example`](./.env.example) for the full contract.

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Recommended | Claude API key. Optional in `.env` — can be set in-app instead (vault). |
| `OPENAI_API_KEY` | No | Enables OpenAI models and optional OpenAI embeddings. |
| `EMBEDDING_PROVIDER` | No | `auto` (default) · `inprocess` · `ollama` · `voyage` · `openai` · `mock`. `auto` tries in-process → Ollama → API → mock. |
| `LITELLM_BASE_URL` | No | Optional external LiteLLM-compatible proxy URL. The Windows Solo desktop uses its bundled no-Python proxy unless explicitly configured otherwise. |
| `DATABASE_URL` | Team only | PostgreSQL connection string. |
| `REDIS_URL` | Team only | Redis for the background job queue. |

## Documentation

- [Getting Started](docs/GETTING-STARTED.md) — first-run walkthrough
- [Architecture](docs/ARCHITECTURE.md) — package structure, data flow, extension points
- [Contributing](docs/CONTRIBUTING.md) — setup, tests, PR process, troubleshooting
- [Threat Model](THREAT_MODEL.md) — trust boundary and security controls
- [Security Policy](SECURITY.md) — how to report a vulnerability
- [Code of Conduct](CODE_OF_CONDUCT.md)

## License

This repository is licensed under the [MIT License](./LICENSE), **except** the
`hive-mind-*` packages under `packages/`, which are licensed under **Apache-2.0**.
Each `hive-mind-*` package carries its own `LICENSE` file, which governs that
package. See [Packages](#packages) for the split.
