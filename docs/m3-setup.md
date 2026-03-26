# Waggle M3: Team Pilot -- Setup Guide

## Prerequisites

- Node.js 20+
- Docker Desktop (for PostgreSQL + Redis)
- Clerk account (for authentication)

## Quick Start

### 1. Start Infrastructure

```bash
cd waggle-poc
docker compose up -d
```

This starts:
- PostgreSQL 16 on port 5434
- Redis 7 on port 6381

### 2. Configure Environment

Copy `.env.example` and fill in your values:

```bash
cp .env.example .env
```

Required variables:
- `DATABASE_URL` -- PostgreSQL connection string (default: `postgres://waggle:waggle_dev@localhost:5434/waggle`)
- `REDIS_URL` -- Redis connection string (default: `redis://localhost:6381`)
- `CLERK_SECRET_KEY` -- Your Clerk secret key
- `CLERK_PUBLISHABLE_KEY` -- Your Clerk publishable key

### 3. Install Dependencies

```bash
npm install
```

### 4. Run Database Migrations

```bash
cd packages/server
npx tsx src/db/migrate.ts
```

### 5. Start the Server

```bash
cd packages/server
npm run dev
```

Server starts on http://localhost:3100

### 6. Start the Worker

In a separate terminal:

```bash
cd packages/worker
npm run dev
```

### 7. Start the Admin Dashboard (optional)

```bash
cd packages/admin-web
npm run dev
```

Dashboard at http://localhost:5173

## Architecture

```
Client (Desktop / CLI / Admin Web)
        |
        v  REST + WebSocket
+----------------------------------+
|       Fastify API Server         |
|  REST - WebSocket - Clerk Auth   |
|  Cron - BullMQ - Waggle Dance    |
+---------------+------------------+
          +-----+-----+
          v     v     v
    PostgreSQL Redis  Agent Worker
                      (BullMQ consumer)
```

### Packages

| Package | Purpose |
|---------|---------|
| @waggle/shared | Shared types, Zod schemas, constants |
| @waggle/server | Fastify API server |
| @waggle/worker | BullMQ agent job worker |
| @waggle/waggle-dance | Protocol types and routing logic |
| @waggle/admin-web | React admin dashboard |
| @waggle/core | .mind SQLite database (M2) |
| @waggle/agent | Agent orchestrator (M2) |
| @waggle/cli | Interactive REPL (M2) |
| @waggle/sdk | Skill/plugin SDK (M2) |
| @waggle/optimizer | GEPA prompt optimization (M2) |
| @waggle/weaver | Memory consolidation (M2) |

## API Endpoints

### Authentication
All endpoints (except webhooks and health) require a Bearer token in the `Authorization` header. Tokens are verified via Clerk.

### Core Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/api/webhooks/clerk` | Clerk user lifecycle webhooks |
| POST | `/api/teams` | Create team |
| GET | `/api/teams` | List user's teams |
| GET | `/api/teams/:slug` | Get team details |
| PATCH | `/api/teams/:slug` | Update team (admin+) |
| POST | `/api/teams/:slug/members` | Invite member (admin+) |
| DELETE | `/api/teams/:slug/members/:userId` | Remove member (admin+) |
| PATCH | `/api/teams/:slug/members/:userId` | Update member profile |

### Tasks

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/teams/:slug/tasks` | Create task |
| GET | `/api/teams/:slug/tasks` | List tasks |
| GET | `/api/teams/:slug/tasks/:id` | Get task |
| PATCH | `/api/teams/:slug/tasks/:id` | Update task |
| POST | `/api/teams/:slug/tasks/:id/claim` | Claim task |

### Waggle Dance Messages

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/teams/:slug/messages` | Send message |
| GET | `/api/teams/:slug/messages` | List messages |
| POST | `/api/teams/:slug/messages/hive-check` | Check the hive |

### Knowledge Graph

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/teams/:slug/entities` | Share entity |
| GET | `/api/teams/:slug/entities` | List entities |
| POST | `/api/teams/:slug/relations` | Create relation |
| GET | `/api/teams/:slug/graph` | Query graph traversal |

### Shared Resources

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/teams/:slug/resources` | Share resource |
| GET | `/api/teams/:slug/resources` | List resources |
| PATCH | `/api/teams/:slug/resources/:id` | Rate resource |

### Agent Jobs

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/teams/:slug/jobs` | Submit job |
| GET | `/api/teams/:slug/jobs` | List jobs |
| GET | `/api/teams/:slug/jobs/:id` | Get job status |

### Agents

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/agents` | Create agent |
| GET | `/api/agents` | List user's agents |
| POST | `/api/agents/groups` | Create agent group |
| GET | `/api/agents/groups` | List agent groups |

### Cron Schedules

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/teams/:slug/cron` | Create schedule |
| GET | `/api/teams/:slug/cron` | List schedules |
| PATCH | `/api/teams/:slug/cron/:id` | Update schedule |

### Scout Findings

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/scout/findings` | List findings |
| PATCH | `/api/scout/findings/:id` | Adopt/dismiss finding |

### Suggestions (Proactive Engine)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/suggestions` | List pending suggestions |
| PATCH | `/api/suggestions/:id` | Accept/dismiss/snooze |

### Audit Trail (Admin Only)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/teams/:slug/audit` | List audit entries |
| GET | `/api/admin/teams/:slug/audit/pending` | List pending approvals |
| POST | `/api/admin/teams/:slug/audit/:id/approve` | Approve action |
| POST | `/api/admin/teams/:slug/audit/:id/reject` | Reject action |

## Running Tests

```bash
# All tests
npm test

# Server tests only
npx vitest run packages/server/tests/

# Integration tests only
npx vitest run tests/integration/

# Watch mode
npm run test:watch
```

## Docker Compose Services

The `docker-compose.yml` provides:

- **PostgreSQL 16** -- Main database (port 5434)
  - User: `waggle`, Password: `waggle_dev`, Database: `waggle`
- **Redis 7** -- Job queue and pub/sub (port 6381)

```bash
# Start
docker compose up -d

# Stop
docker compose down

# Reset data
docker compose down -v
docker compose up -d
```

## Troubleshooting

### Connection refused on port 5434/6381
Make sure Docker Desktop is running and containers are up:
```bash
docker compose ps
```

### Migration errors
Ensure the database exists and credentials are correct:
```bash
docker compose exec postgres psql -U waggle -d waggle -c "SELECT 1"
```

### Clerk authentication failures in development
For local testing without Clerk, tests override the auth handler via `server._authHandler.fn`. See existing tests for examples.

---

## M3a: CLI → Server + Real LLM

### Prerequisites
- Docker Desktop running
- Anthropic API key (or OpenAI API key)

### Setup

1. **Start all services:**
   ```bash
   cd waggle-poc
   docker compose up -d
   ```
   This starts PostgreSQL (5434), Redis (6381), and LiteLLM (4000).

2. **Configure API keys:**
   Create `.env` in `waggle-poc/`:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   OPENAI_API_KEY=sk-...  # optional
   LITELLM_MASTER_KEY=sk-waggle-dev
   ```

3. **Run CLI:**
   ```bash
   cd packages/cli
   npx tsx src/index.ts
   ```

4. **Login (optional, for team mode):**
   ```
   /login
   ```

### Modes
- **Local mode:** Direct LiteLLM → LLM (fast, no server needed)
- **Team mode:** CLI → Server → Worker → LiteLLM → LLM (full team features)

### CLI Flags
- `--local` — Force local mode
- `--team` — Force team mode (requires login)

### Available Tools
- **System tools:** `bash`, `read_file`, `write_file`, `edit_file`, `search_files`, `search_content`
- **Memory tools:** `save_memory`, `search_memory`, `query_knowledge`, `get_identity`, `get_awareness`, `add_task`
- **Team tools (team mode only):** `check_hive`, `share_to_team`, `create_team_task`, `claim_team_task`, `send_waggle_message`

### Commands
- `/model <name>` — Switch model (claude-sonnet, gpt-4o, claude-haiku)
- `/models` — List available models
- `/login` — Browser OAuth login
- `/logout` — Clear stored token
- `/whoami` — Show user and mode
- `/mode` — Show current mode
- `/clear` — Clear conversation
- `/admin` — Admin commands
