# Team Mode

Waggle Team Mode lets multiple users share workspaces, assign tasks, see who is online, and govern agent capabilities through an admin dashboard. It runs as a separate server backed by PostgreSQL and Redis.

## Architecture

Team Mode adds a **team server** alongside the local Waggle server:

- **Local server** (localhost:3333) -- your personal agent, memory, and workspace management
- **Team server** (your-server:3334) -- shared workspaces, presence, tasks, capability governance

The desktop app connects to both. Local operations stay fast; team operations sync through the team server.

## Docker Setup

The simplest way to run the team server is with Docker Compose.

### Prerequisites

- Docker and Docker Compose installed
- An Anthropic (or other LLM) API key

### Start the Services

```bash
cd waggle-poc

# Set your API key
export ANTHROPIC_API_KEY=sk-ant-your-key-here

# Start PostgreSQL, Redis, and LiteLLM
docker compose up -d
```

This starts:
- **PostgreSQL** on port 5434 (user: `waggle`, password: `waggle_dev`, database: `waggle`)
- **Redis** on port 6381
- **LiteLLM** on port 4000 (model proxy)

### Start the Team Server

```bash
cd packages/server
DATABASE_URL=postgresql://waggle:waggle_dev@localhost:5434/waggle \
REDIS_URL=redis://localhost:6381 \
npx tsx src/index.ts
```

The team server starts on port 3334 by default.

## Cloud Deployment (Render)

For a hosted team server:

1. Create a new **Web Service** on Render from the waggle repository
2. Set the **Build Command**: `npm install && npm run build`
3. Set the **Start Command**: `cd packages/server && node dist/index.js`
4. Add environment variables:
   - `DATABASE_URL` -- your PostgreSQL connection string
   - `REDIS_URL` -- your Redis connection string
   - `CLERK_SECRET_KEY` -- for authentication (Clerk)
   - `CLERK_PUBLISHABLE_KEY` -- for client auth
5. Deploy

## Connecting to a Team Server

### From the Desktop App

1. Go to **Settings** > **Team**
2. Enter the server URL (e.g., `https://your-team.render.com`)
3. Enter your authentication token
4. Click **Connect**

Waggle validates the connection by hitting the team server's `/health` endpoint.

### From the API

```bash
curl -X POST http://localhost:3333/api/team/connect \
  -H "Content-Type: application/json" \
  -d '{"serverUrl": "https://your-team.render.com", "token": "your-auth-token"}'
```

## Shared Workspaces

Team workspaces are created on the team server and synced to each member's local Waggle instance.

### Creating a Team Workspace

1. Connect to a team server (see above)
2. Press **Ctrl+N** to create a new workspace
3. Enable the **Team** toggle
4. Select the team and your role
5. Click **Create**

### Memory Sync

Team workspaces sync memory frames between members:
- When one member saves a decision, it appears in everyone's workspace mind
- Personal mind remains private -- only workspace mind is shared
- Author attribution shows who contributed each memory

## Task Board

Each team workspace has a task board for lightweight project management.

### Creating Tasks

```bash
curl -X POST http://localhost:3333/api/workspaces/{id}/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "Review Q1 metrics", "assigneeName": "Alice"}'
```

Or ask the agent: "Create a task for Alice to review Q1 metrics."

### Task States

Tasks move through three states: `open` -> `in_progress` -> `done`.

### Filtering

```bash
# Get all open tasks
curl "http://localhost:3333/api/workspaces/{id}/tasks?status=open"
```

## WebSocket Presence

Team Mode uses WebSocket push with a 60-second polling fallback for presence:

- See who is online in a shared workspace
- See who is actively typing
- Get real-time notifications for task assignments and team messages

## Admin Dashboard

Team admins access the admin dashboard at the team server URL. It provides:

### Members Management
- View all team members and their roles (owner, admin, member, viewer)
- Invite new members
- Change roles

### Capability Governance

Two-layer governance model:

**Layer 1: Role Policies**
Define which capabilities each role can use. Example: viewers can only use read tools, members can use write tools, admins can use all tools.

**Layer 2: Per-Capability Overrides**
Fine-grained overrides for specific capabilities. Example: allow a specific member to use `send_email` even if their role policy doesn't include it.

### Approval Request Queue

When a member tries to use a capability they do not have:
1. The agent tool `request_team_capability` creates a request
2. The request appears in the admin queue
3. An admin approves or rejects it
4. The member is notified

### Waggle Dance Messages

View inter-agent communication in team workflows. The Waggle Dance protocol lets agents coordinate tasks, share findings, and report progress.

## Capability Governance API

```bash
# List role policies
curl http://localhost:3333/api/team/governance/policies

# Create a policy
curl -X POST http://localhost:3333/api/team/governance/policies \
  -H "Content-Type: application/json" \
  -d '{"role": "member", "capabilities": ["read_file", "search_files", "search_memory"]}'

# List pending capability requests
curl http://localhost:3333/api/team/governance/requests?status=pending

# Approve a request
curl -X PATCH http://localhost:3333/api/team/governance/requests/{id} \
  -H "Content-Type: application/json" \
  -d '{"decision": "approved"}'
```

## Disconnecting

```bash
curl -X POST http://localhost:3333/api/team/disconnect
```

This removes the team server configuration but preserves any local copies of team workspace data.

## Team Server Status

```bash
# Check connection status
curl http://localhost:3333/api/team/status
```

Returns the server URL, connection state, user ID, and display name.
