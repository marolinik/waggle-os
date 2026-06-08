# 02b · Data Model — Relational Layer (Team / Cloud, Postgres + Drizzle)

## Purpose

This section documents the **TEAM / CLOUD relational layer** of Waggle OS: a PostgreSQL database accessed through Drizzle ORM, defined in `packages/server/src/db/schema.ts` (20 tables). This is the **shared, multi-user, team-scoped** store — distinct from the **per-workspace SQLite memory layer** (`packages/hive-mind-core/src/mind/`, `better-sqlite3` + `sqlite-vec`) which holds a single user's private memory frames, knowledge graph, identity, and awareness. Treat the shapes below as a hard contract: every column name, Postgres type, default, and foreign key here is copied verbatim from the schema and its generated migrations — do not invent fields.

---

## Two distinct data layers (do not confuse them)

| Aspect | Relational layer (THIS section) | SQLite memory layer (separate) |
|---|---|---|
| Engine | PostgreSQL | SQLite (`better-sqlite3` + `sqlite-vec`) |
| Access | Drizzle ORM (`drizzle-orm/postgres-js`) | Direct `@waggle/hive-mind-core` API |
| Scope | Teams, users, agents, tasks, jobs, governance | One workspace's private memory |
| Location | Cloud / server (`DATABASE_URL`) | Local file per workspace (`mind_path`) |
| Defined in | `packages/server/src/db/schema.ts` | `packages/hive-mind-core/src/mind/` |
| Link between them | `users.mindPath` (text) points at the user's local SQLite mind file |

The only bridge column is `users.mind_path` — a nullable `text` pointer to where a user's private SQLite "mind" lives. There are **no cross-database foreign keys**; the layers are joined only in application code.

---

## Connection & migration mechanics

From `packages/server/src/db/connection.ts`:

```ts
export function createDb(connectionString: string) {
  const client = postgres(connectionString);
  return drizzle(client, { schema });
}
export type Db = ReturnType<typeof createDb>;
export type DbTransaction = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbExecutor = Db | DbTransaction;   // root db OR an open transaction
```

- Driver: `postgres` (postgres-js) wrapped by `drizzle()`.
- `DbExecutor` is the type passed around so repository functions accept **either** the root `db` **or** a live transaction — useful to know if the frontend's backend-for-frontend wraps multi-step writes in transactions.
- Migrations (`packages/server/src/db/migrate.ts`): requires `DATABASE_URL` env var (throws if absent), runs `migrate(db, { migrationsFolder: './drizzle' })`, then `process.exit(0)`.
- Config (`packages/server/drizzle.config.ts`): dialect `postgresql`, schema `./src/db/schema.ts`, output `./drizzle`, dev fallback URL `postgres://waggle:waggle_dev@localhost:5434/waggle` (port **5434**).
- Two migration files exist: `0000_wild_glorian.sql` (18 tables) and `0001_redundant_sauron.sql` (the 3 `team_capability_*` tables).

> **FK delete behavior (uniform):** every foreign key in both migrations is `ON DELETE no action ON UPDATE no action`. There are **no cascades** — deleting a `users` or `teams` row will be **blocked** by Postgres if any child row references it. The frontend must not assume cascading cleanup.

---

## Column type legend

| Drizzle builder | Postgres type | Notes |
|---|---|---|
| `uuid().defaultRandom()` | `uuid DEFAULT gen_random_uuid()` | All primary keys |
| `text()` | `text` | Strings |
| `timestamp({ withTimezone: true })` | `timestamp with time zone` | All timestamps are TZ-aware |
| `boolean()` | `boolean` | |
| `real()` | `real` | Floats (scores, confidence, ratings) |
| `integer()` | `integer` | Counts / ordering |
| `jsonb().$type<T>()` | `jsonb` | Typed JSON blobs — shapes given per column |

`.notNull()` = NOT NULL. `.unique()` = UNIQUE constraint. `.default(x)` = column default. `.references(() => t.col)` = foreign key.

---

## The 20 tables

### Identity & membership

#### `users`
The account record. `clerkId` ties to Clerk auth; `mindPath` points at the private SQLite mind.

| Column | Type | Constraints / Default |
|---|---|---|
| `id` | uuid | PK, `defaultRandom()` |
| `clerk_id` | text | **UNIQUE**, NOT NULL |
| `display_name` | text | NOT NULL |
| `email` | text | **UNIQUE**, NOT NULL |
| `avatar_url` | text | nullable |
| `mind_path` | text | nullable — pointer to user's SQLite memory file |
| `created_at` | timestamptz | NOT NULL, `defaultNow()` |
| `updated_at` | timestamptz | NOT NULL, `defaultNow()` |

#### `teams`
A workspace/organization. `slug` is the URL-safe unique key; `ownerId` is the founding user.

| Column | Type | Constraints / Default |
|---|---|---|
| `id` | uuid | PK, `defaultRandom()` |
| `name` | text | NOT NULL |
| `slug` | text | **UNIQUE**, NOT NULL |
| `owner_id` | uuid | NOT NULL → `users.id` |
| `created_at` | timestamptz | NOT NULL, `defaultNow()` |

#### `team_members` (junction, composite PK)
Who belongs to which team, with role + interests. **Composite primary key `(team_id, user_id)`** — a user can appear once per team.

| Column | Type | Constraints / Default |
|---|---|---|
| `team_id` | uuid | PK part, NOT NULL → `teams.id` |
| `user_id` | uuid | PK part, NOT NULL → `users.id` |
| `role` | text | NOT NULL, default `'member'` |
| `role_description` | text | nullable |
| `interests` | jsonb (`string[]`) | nullable |
| `joined_at` | timestamptz | NOT NULL, `defaultNow()` |

### Agents

#### `agents`
A configured agent owned by a user, optionally scoped to a team.

| Column | Type | Constraints / Default |
|---|---|---|
| `id` | uuid | PK, `defaultRandom()` |
| `user_id` | uuid | NOT NULL → `users.id` |
| `team_id` | uuid | nullable → `teams.id` |
| `name` | text | NOT NULL |
| `role` | text | nullable |
| `system_prompt` | text | nullable |
| `model` | text | NOT NULL, default `'claude-haiku-4-5'` |
| `tools` | jsonb (`string[]`) | NOT NULL, default `[]` |
| `config` | jsonb (`Record<string, unknown>`) | NOT NULL, default `{}` |
| `created_at` | timestamptz | NOT NULL, `defaultNow()` |

#### `agent_groups`
A named collection of agents with an execution `strategy`.

| Column | Type | Constraints / Default |
|---|---|---|
| `id` | uuid | PK, `defaultRandom()` |
| `user_id` | uuid | NOT NULL → `users.id` |
| `name` | text | NOT NULL |
| `description` | text | nullable |
| `strategy` | text | NOT NULL, default `'parallel'` |
| `created_at` | timestamptz | NOT NULL, `defaultNow()` |

#### `agent_group_members` (junction, composite PK)
Maps agents into groups with an in-group role and ordering. **Composite PK `(group_id, agent_id)`.**

| Column | Type | Constraints / Default |
|---|---|---|
| `group_id` | uuid | PK part, NOT NULL → `agent_groups.id` |
| `agent_id` | uuid | PK part, NOT NULL → `agents.id` |
| `role_in_group` | text | NOT NULL, default `'worker'` |
| `execution_order` | integer | NOT NULL, default `0` |

### Collaboration: tasks & messages

#### `tasks`
Team work items. Self-references for subtasks via `parent_task_id` (note: `parentTaskId` is a plain `uuid` column with **no `.references()`** — it is NOT an enforced FK in the schema).

| Column | Type | Constraints / Default |
|---|---|---|
| `id` | uuid | PK, `defaultRandom()` |
| `team_id` | uuid | NOT NULL → `teams.id` |
| `title` | text | NOT NULL |
| `description` | text | nullable |
| `status` | text | NOT NULL, default `'open'` |
| `priority` | text | NOT NULL, default `'normal'` |
| `created_by` | uuid | NOT NULL → `users.id` |
| `assigned_to` | uuid | nullable → `users.id` |
| `parent_task_id` | uuid | nullable — **no FK constraint** (logical self-ref only) |
| `created_at` | timestamptz | NOT NULL, `defaultNow()` |
| `updated_at` | timestamptz | NOT NULL, `defaultNow()` |

#### `messages`
Team message bus. `content` is a typed jsonb blob; `routing` records targeted delivery with reasons.

| Column | Type | Constraints / Default |
|---|---|---|
| `id` | uuid | PK, `defaultRandom()` |
| `team_id` | uuid | NOT NULL → `teams.id` |
| `sender_id` | uuid | NOT NULL → `users.id` |
| `type` | text | NOT NULL |
| `subtype` | text | NOT NULL |
| `content` | jsonb (`Record<string, unknown>`) | NOT NULL |
| `reference_id` | uuid | nullable — **no FK** (generic reference) |
| `routing` | jsonb (`Array<{ userId: string; reason: string }>`) | nullable |
| `created_at` | timestamptz | NOT NULL, `defaultNow()` |

### Shared team knowledge graph

> This is a **team-shared, Postgres** mini knowledge graph — separate from each user's private SQLite KnowledgeGraph. Entities are bi-temporal (`valid_from` / `valid_to`).

#### `team_entities`
Shared facts/entities contributed by team members.

| Column | Type | Constraints / Default |
|---|---|---|
| `id` | uuid | PK, `defaultRandom()` |
| `team_id` | uuid | NOT NULL → `teams.id` |
| `entity_type` | text | NOT NULL |
| `name` | text | NOT NULL |
| `properties` | jsonb (`Record<string, unknown>`) | NOT NULL, default `{}` |
| `shared_by` | uuid | NOT NULL → `users.id` |
| `valid_from` | timestamptz | NOT NULL, `defaultNow()` |
| `valid_to` | timestamptz | nullable (open-ended validity) |
| `created_at` | timestamptz | NOT NULL, `defaultNow()` |

#### `team_relations`
Edges between `team_entities` with a confidence score.

| Column | Type | Constraints / Default |
|---|---|---|
| `id` | uuid | PK, `defaultRandom()` |
| `team_id` | uuid | NOT NULL → `teams.id` |
| `source_id` | uuid | NOT NULL → `team_entities.id` |
| `target_id` | uuid | NOT NULL → `team_entities.id` |
| `relation_type` | text | NOT NULL |
| `confidence` | real | NOT NULL, default `1.0` |
| `properties` | jsonb (`Record<string, unknown>`) | NOT NULL, default `{}` |
| `created_at` | timestamptz | NOT NULL, `defaultNow()` |

#### `team_resources`
Shared reusable assets (prompts, tools, docs) with social signals.

| Column | Type | Constraints / Default |
|---|---|---|
| `id` | uuid | PK, `defaultRandom()` |
| `team_id` | uuid | NOT NULL → `teams.id` |
| `resource_type` | text | NOT NULL |
| `name` | text | NOT NULL |
| `description` | text | nullable |
| `config` | jsonb (`Record<string, unknown>`) | NOT NULL (no default) |
| `shared_by` | uuid | NOT NULL → `users.id` |
| `rating` | real | NOT NULL, default `0` |
| `use_count` | integer | NOT NULL, default `0` |
| `created_at` | timestamptz | NOT NULL, `defaultNow()` |

### Team governance / capability control

> These three tables (added in migration `0001`) implement team-level capability governance: standing policies per role, one-off allow/deny overrides, and a request→decision approval queue.

#### `team_capability_policies`
Standing policy per team role.

| Column | Type | Constraints / Default |
|---|---|---|
| `id` | uuid | PK, `defaultRandom()` |
| `team_id` | uuid | NOT NULL → `teams.id` |
| `role` | text | NOT NULL |
| `allowed_sources` | jsonb (`string[]`) | NOT NULL, default `[]` |
| `blocked_tools` | jsonb (`string[]`) | NOT NULL, default `[]` |
| `approval_threshold` | text | NOT NULL, default `'none'` |
| `updated_by` | uuid | nullable → `users.id` |
| `created_at` | timestamptz | NOT NULL, `defaultNow()` |
| `updated_at` | timestamptz | NOT NULL, `defaultNow()` |

#### `team_capability_overrides`
Explicit per-capability allow/deny decisions (`decision`).

| Column | Type | Constraints / Default |
|---|---|---|
| `id` | uuid | PK, `defaultRandom()` |
| `team_id` | uuid | NOT NULL → `teams.id` |
| `capability_name` | text | NOT NULL |
| `capability_type` | text | NOT NULL |
| `decision` | text | NOT NULL |
| `reason` | text | NOT NULL, default `''` |
| `decided_by` | uuid | NOT NULL → `users.id` |
| `created_at` | timestamptz | NOT NULL, `defaultNow()` |
| `decided_at` | timestamptz | NOT NULL, `defaultNow()` |

#### `team_capability_requests`
A member's request for a capability + its approval lifecycle.

| Column | Type | Constraints / Default |
|---|---|---|
| `id` | uuid | PK, `defaultRandom()` |
| `team_id` | uuid | NOT NULL → `teams.id` |
| `requested_by` | uuid | NOT NULL → `users.id` |
| `capability_name` | text | NOT NULL |
| `capability_type` | text | NOT NULL |
| `justification` | text | NOT NULL |
| `status` | text | NOT NULL, default `'pending'` |
| `decided_by` | uuid | nullable → `users.id` |
| `decision_reason` | text | nullable |
| `created_at` | timestamptz | NOT NULL, `defaultNow()` |
| `decided_at` | timestamptz | nullable |

### Background work & scheduling

#### `agent_jobs`
Async agent job queue with input/output blobs and lifecycle timestamps.

| Column | Type | Constraints / Default |
|---|---|---|
| `id` | uuid | PK, `defaultRandom()` |
| `team_id` | uuid | NOT NULL → `teams.id` |
| `user_id` | uuid | NOT NULL → `users.id` |
| `job_type` | text | NOT NULL |
| `status` | text | NOT NULL, default `'queued'` |
| `input` | jsonb (`Record<string, unknown>`) | NOT NULL |
| `output` | jsonb (`Record<string, unknown>`) | nullable |
| `started_at` | timestamptz | nullable |
| `completed_at` | timestamptz | nullable |
| `created_at` | timestamptz | NOT NULL, `defaultNow()` |

#### `cron_schedules`
Recurring job definitions (cron expression + config) with run bookkeeping.

| Column | Type | Constraints / Default |
|---|---|---|
| `id` | uuid | PK, `defaultRandom()` |
| `team_id` | uuid | NOT NULL → `teams.id` |
| `created_by` | uuid | NOT NULL → `users.id` |
| `name` | text | NOT NULL |
| `cron_expr` | text | NOT NULL |
| `job_type` | text | NOT NULL |
| `job_config` | jsonb (`Record<string, unknown>`) | NOT NULL, default `{}` |
| `enabled` | boolean | NOT NULL, default `true` |
| `last_run_at` | timestamptz | nullable |
| `next_run_at` | timestamptz | nullable |
| `created_at` | timestamptz | NOT NULL, `defaultNow()` |

### Proactive / scout intelligence

#### `scout_findings`
Discovered items (news, signals) scoped to a user and/or team. **Both `user_id` and `team_id` are nullable** → a finding can be global, user-only, or team-only.

| Column | Type | Constraints / Default |
|---|---|---|
| `id` | uuid | PK, `defaultRandom()` |
| `user_id` | uuid | nullable → `users.id` |
| `team_id` | uuid | nullable → `teams.id` |
| `source` | text | NOT NULL |
| `category` | text | NOT NULL |
| `title` | text | NOT NULL |
| `summary` | text | nullable |
| `relevance_score` | real | NOT NULL, default `0` |
| `url` | text | nullable |
| `status` | text | NOT NULL, default `'new'` |
| `created_at` | timestamptz | NOT NULL, `defaultNow()` |

#### `proactive_patterns`
Reusable trigger→suggestion templates. **Has no `created_at` and no FKs** — it is a standalone config/lookup table.

| Column | Type | Constraints / Default |
|---|---|---|
| `id` | uuid | PK, `defaultRandom()` |
| `name` | text | NOT NULL |
| `trigger` | jsonb (`Record<string, unknown>`) | NOT NULL |
| `suggestion_type` | text | NOT NULL |
| `template` | text | NOT NULL |
| `enabled` | boolean | NOT NULL, default `true` |

#### `suggestions_log`
Records suggestions fired for a user from a `proactive_patterns` row.

| Column | Type | Constraints / Default |
|---|---|---|
| `id` | uuid | PK, `defaultRandom()` |
| `user_id` | uuid | NOT NULL → `users.id` |
| `pattern_id` | uuid | NOT NULL → `proactive_patterns.id` |
| `context` | jsonb (`Record<string, unknown>`) | NOT NULL |
| `status` | text | NOT NULL, default `'pending'` |
| `created_at` | timestamptz | NOT NULL, `defaultNow()` |

### Audit

#### `agent_audit_log`
Immutable audit trail of agent actions with before/after snapshots and an approval gate.

| Column | Type | Constraints / Default |
|---|---|---|
| `id` | uuid | PK, `defaultRandom()` |
| `user_id` | uuid | NOT NULL → `users.id` |
| `team_id` | uuid | nullable → `teams.id` |
| `agent_name` | text | NOT NULL |
| `action_type` | text | NOT NULL |
| `description` | text | NOT NULL |
| `before_state` | jsonb (`Record<string, unknown>`) | nullable |
| `after_state` | jsonb (`Record<string, unknown>`) | nullable |
| `requires_approval` | boolean | NOT NULL, default `false` |
| `approved` | boolean | nullable (tri-state: null = undecided) |
| `approved_by` | uuid | nullable → `users.id` |
| `created_at` | timestamptz | NOT NULL, `defaultNow()` |

---

## `text`-as-enum reference (no DB-level enums)

There are **no Postgres `enum` types** in this schema — every "enum-like" field is a free `text` column with a default. The frontend should treat these as the canonical values it sends/reads (defaults shown):

| Table.column | Default | Meaning |
|---|---|---|
| `team_members.role` | `'member'` | membership role |
| `agents.model` | `'claude-haiku-4-5'` | default LLM |
| `agent_groups.strategy` | `'parallel'` | group execution strategy |
| `agent_group_members.role_in_group` | `'worker'` | role within a group |
| `tasks.status` | `'open'` | task lifecycle |
| `tasks.priority` | `'normal'` | task priority |
| `agent_jobs.status` | `'queued'` | job lifecycle |
| `team_capability_policies.approval_threshold` | `'none'` | when approval is required |
| `team_capability_requests.status` | `'pending'` | request lifecycle |
| `scout_findings.status` | `'new'` | finding triage state |
| `suggestions_log.status` | `'pending'` | suggestion state |
| `cron_schedules.enabled` | `true` (boolean) | schedule on/off |
| `proactive_patterns.enabled` | `true` (boolean) | pattern on/off |

> The set of allowed values beyond the default is NOT constrained in the database; consult the route/service layer for the full vocabularies.

---

## Entity-relationship diagram

```mermaid
erDiagram
  users ||--o{ teams : "owns (owner_id)"
  users ||--o{ team_members : "is"
  teams ||--o{ team_members : "has"
  users ||--o{ agents : "owns"
  teams ||--o{ agents : "scopes"
  users ||--o{ agent_groups : "owns"
  agent_groups ||--o{ agent_group_members : "contains"
  agents ||--o{ agent_group_members : "joins"
  teams ||--o{ tasks : "has"
  users ||--o{ tasks : "creates (created_by)"
  users ||--o{ tasks : "assigned (assigned_to)"
  teams ||--o{ messages : "channel"
  users ||--o{ messages : "sends"
  teams ||--o{ team_entities : "owns"
  users ||--o{ team_entities : "shares"
  teams ||--o{ team_relations : "owns"
  team_entities ||--o{ team_relations : "source"
  team_entities ||--o{ team_relations : "target"
  teams ||--o{ team_resources : "owns"
  users ||--o{ team_resources : "shares"
  teams ||--o{ team_capability_policies : "governs"
  users ||--o{ team_capability_policies : "updates"
  teams ||--o{ team_capability_overrides : "governs"
  users ||--o{ team_capability_overrides : "decides"
  teams ||--o{ team_capability_requests : "scopes"
  users ||--o{ team_capability_requests : "requests/decides"
  teams ||--o{ agent_jobs : "owns"
  users ||--o{ agent_jobs : "runs"
  teams ||--o{ cron_schedules : "owns"
  users ||--o{ cron_schedules : "creates"
  users ||--o{ scout_findings : "for-user"
  teams ||--o{ scout_findings : "for-team"
  proactive_patterns ||--o{ suggestions_log : "fires"
  users ||--o{ suggestions_log : "receives"
  users ||--o{ agent_audit_log : "acts"
  teams ||--o{ agent_audit_log : "scopes"

  users {
    uuid id PK
    text clerk_id UK
    text email UK
    text display_name
    text mind_path "→ SQLite mind"
  }
  teams {
    uuid id PK
    text slug UK
    uuid owner_id FK
  }
  team_members {
    uuid team_id PK_FK
    uuid user_id PK_FK
    text role
    jsonb interests
  }
  agents {
    uuid id PK
    uuid user_id FK
    uuid team_id FK "nullable"
    text model
    jsonb tools
    jsonb config
  }
  agent_groups {
    uuid id PK
    uuid user_id FK
    text strategy
  }
  agent_group_members {
    uuid group_id PK_FK
    uuid agent_id PK_FK
    integer execution_order
  }
  tasks {
    uuid id PK
    uuid team_id FK
    uuid created_by FK
    uuid assigned_to FK "nullable"
    uuid parent_task_id "no FK"
    text status
  }
  messages {
    uuid id PK
    uuid team_id FK
    uuid sender_id FK
    jsonb content
    jsonb routing
  }
  team_entities {
    uuid id PK
    uuid team_id FK
    uuid shared_by FK
    timestamptz valid_to "nullable"
  }
  team_relations {
    uuid id PK
    uuid source_id FK
    uuid target_id FK
    real confidence
  }
  team_resources {
    uuid id PK
    uuid team_id FK
    uuid shared_by FK
    real rating
  }
  team_capability_policies {
    uuid id PK
    uuid team_id FK
    jsonb blocked_tools
  }
  team_capability_overrides {
    uuid id PK
    uuid team_id FK
    text decision
  }
  team_capability_requests {
    uuid id PK
    uuid team_id FK
    text status
  }
  agent_jobs {
    uuid id PK
    uuid team_id FK
    uuid user_id FK
    text status
    jsonb input
  }
  cron_schedules {
    uuid id PK
    uuid team_id FK
    text cron_expr
    boolean enabled
  }
  scout_findings {
    uuid id PK
    uuid user_id FK "nullable"
    uuid team_id FK "nullable"
    real relevance_score
  }
  proactive_patterns {
    uuid id PK
    jsonb trigger
    boolean enabled
  }
  suggestions_log {
    uuid id PK
    uuid user_id FK
    uuid pattern_id FK
  }
  agent_audit_log {
    uuid id PK
    uuid user_id FK
    uuid team_id FK "nullable"
    boolean approved "nullable"
  }
```

---

## Notes for the frontend rebuild

- **All IDs are server-generated UUIDs** (`gen_random_uuid()`). The client never invents IDs; it reads them back from create responses.
- **All timestamps are `timestamp with time zone`** — expect ISO-8601 strings with offsets; render in the user's locale.
- **JSONB columns are opaque blobs with documented TS shapes** (`tools: string[]`, `config: Record<string, unknown>`, `routing: {userId, reason}[]`, `interests: string[]`, etc.). Send/receive these as plain JSON objects.
- **Two junction tables use composite PKs** (`team_members`, `agent_group_members`) — there is no surrogate id, so update/delete by the pair of FK columns.
- **No cascade deletes anywhere** — the UI must surface "cannot delete, still referenced" errors and/or delete children first.
- **`proactive_patterns` is config-only** (no FK, no timestamp) — likely seeded/admin-managed, not user-CRUD.
- **`users.mind_path`** is the only link from this cloud DB to a user's private local SQLite memory; the relational layer never stores memory frames.
