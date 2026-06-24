# PR3.5 Recon — `frame.source` server read/write path (1-field projection)

**Goal:** add `source` to the `recentMemories` + `recentDecisions` items returned by the
workspace-state / workspace-context API so the FE can render a ⬡ provenance pill on Chat +
Workspace. This doc maps the exact write site, the exact read/SELECT/projection sites, the
type-contract change, and the column's value vocabulary.

Repo root: `D:/Projects/waggle-os`. All line numbers verified 2026-06-16.

---

## 0. TL;DR — what to change

The ⬡ provenance pill on the **Workspace Briefing** (Chat + Workspace Overview both render
`<WorkspaceBriefing>` fed by `GET /api/workspaces/:id/context`) is unlocked by **one route +
one type change**:

1. `packages/server/src/local/routes/workspaces.ts` — add `source` to the two SELECTs (lines
   **393-400** and **409-417**) and to their two `.map()` projections (lines **402-406** and
   **419-429**).
2. `apps/web/src/lib/types.ts` — widen `WorkspaceContext.recentMemories` / `recentDecisions`
   item shapes (lines **248-249**) with an optional `source?: string`.

That is the minimum. There is a SECOND, parallel context builder in
`packages/server/src/local/routes/workspace-context.ts` (the `WorkspaceNowBlock` /
`buildWorkspaceState` path) that feeds the **system prompt**, NOT the FE pill — see §4 for why
it is out of scope, and the one ambiguity it raises.

---

## 1. WRITE path — where `frame.source` is set

### 1a. Schema DDL (the column itself)

`packages/hive-mind-core/src/mind/schema.ts:56-57`

```sql
source TEXT NOT NULL DEFAULT 'user_stated'
  CHECK (source IN ('user_stated', 'tool_verified', 'agent_inferred', 'import', 'system')),
```

Column lives on `memory_frames` (DDL `CREATE TABLE ... memory_frames` at `schema.ts:47`).
Confirmed: the column name **is `source`** (not `frame_source` / `provenance`).

### 1b. Where rows are written with an explicit `source`

- **Template starter seeding** — `packages/server/src/local/routes/workspaces.ts:290-291`:

  ```sql
  INSERT INTO memory_frames (frame_type, gop_id, t, content, importance, source)
    VALUES ('I', ?, ?, ?, 'normal', 'system')
  ```

  i.e. workspace template starter memories are written with `source = 'system'`.

- **General frame writes** go through `FrameStore` in
  `packages/hive-mind-core/src/mind/frames.ts` — `createIFrame` /
  `createPFrame` (`frames.ts:74,119`) default `source: FrameSource = 'user_stated'`.
- **MCP `save_memory`** maps an incoming `source` arg, defaulting to `'agent_inferred'`
  (`packages/memory-mcp/src/tools/memory.ts:35`,
  `packages/hive-mind-mcp-server/src/tools/memory.ts:34`).

So in practice persisted rows carry one of the five DB-CHECK values (see §3).

---

## 2. READ path — the SELECT + projection that feeds the FE (THE CHANGE SITE)

**Route:** `GET /api/workspaces/:id/context` —
`packages/server/src/local/routes/workspaces.ts:364` (handler).
This is the response consumed by `<WorkspaceBriefing>` (apps/web), which renders both the
"Key memories" list and the "Recent decisions" list on Chat + Workspace.

### 2a. `recentMemories` — SELECT at `workspaces.ts:393-400`, projection at `402-406`

**BEFORE** (SELECT, lines 393-400):

```ts
const frames = raw.prepare(
  `SELECT content, importance, created_at FROM memory_frames
   WHERE importance != 'deprecated' AND importance != 'temporary'
   ORDER BY CASE importance
     WHEN 'critical' THEN 1 WHEN 'important' THEN 2
     WHEN 'normal' THEN 3 ELSE 4 END,
   id DESC LIMIT 8`
).all() as Array<{ content: string; importance: string; created_at: string }>;
```

**AFTER**:

```ts
const frames = raw.prepare(
  `SELECT content, importance, source, created_at FROM memory_frames
   WHERE importance != 'deprecated' AND importance != 'temporary'
   ORDER BY CASE importance
     WHEN 'critical' THEN 1 WHEN 'important' THEN 2
     WHEN 'normal' THEN 3 ELSE 4 END,
   id DESC LIMIT 8`
).all() as Array<{ content: string; importance: string; source: string; created_at: string }>;
```

**BEFORE** (projection, lines 402-406):

```ts
recentMemories = frames.map(f => ({
  content: f.content.slice(0, 200),
  importance: f.importance,
  date: f.created_at?.slice(0, 10) ?? 'unknown',
}));
```

**AFTER**:

```ts
recentMemories = frames.map(f => ({
  content: f.content.slice(0, 200),
  importance: f.importance,
  source: f.source,
  date: f.created_at?.slice(0, 10) ?? 'unknown',
}));
```

> The local `let recentMemories` is declared at `workspaces.ts:376` as
> `Array<{ content: string; importance: string; date: string }>` — add `source: string;`
> there too (or the `.map()` widening will type-error against the narrower local).

### 2b. `recentDecisions` — SELECT at `workspaces.ts:409-417`, projection at `419-429`

**BEFORE** (SELECT, lines 409-417):

```ts
const decisionFrames = raw.prepare(
  `SELECT content, created_at FROM memory_frames
   WHERE importance != 'deprecated' AND importance != 'temporary'
     AND (content LIKE 'Decision%' OR content LIKE '%decided%'
       OR content LIKE '%decision made%' OR content LIKE '%chose %'
       OR content LIKE '%selected %' OR content LIKE '%agreed %'
       OR importance = 'critical')
   ORDER BY id DESC LIMIT 5`
).all() as Array<{ content: string; created_at: string }>;
```

**AFTER**:

```ts
const decisionFrames = raw.prepare(
  `SELECT content, source, created_at FROM memory_frames
   WHERE importance != 'deprecated' AND importance != 'temporary'
     AND (content LIKE 'Decision%' OR content LIKE '%decided%'
       OR content LIKE '%decision made%' OR content LIKE '%chose %'
       OR content LIKE '%selected %' OR content LIKE '%agreed %'
       OR importance = 'critical')
   ORDER BY id DESC LIMIT 5`
).all() as Array<{ content: string; source: string; created_at: string }>;
```

**BEFORE** (projection, lines 419-429):

```ts
recentDecisions = decisionFrames.map(f => {
  const firstLine = f.content.split('\n')[0];
  const sentenceMatch = firstLine.match(/^(.+?\.\s)(?=[A-Z])/);
  const text = sentenceMatch
    ? sentenceMatch[1].trim()
    : (firstLine.length > 150 ? firstLine.slice(0, 147) + '...' : firstLine);
  return {
    content: text.replace(/\.\s*$/, ''),
    date: f.created_at?.slice(0, 10) ?? 'unknown',
  };
});
```

**AFTER** — add `source: f.source,` to the returned object:

```ts
  return {
    content: text.replace(/\.\s*$/, ''),
    source: f.source,
    date: f.created_at?.slice(0, 10) ?? 'unknown',
  };
```

> Same as above: the local `let recentDecisions` declared at `workspaces.ts:377` as
> `Array<{ content: string; date: string }>` must gain `source: string;`.

### Response shape (unchanged structurally)

The handler returns an object whose `recentMemories` / `recentDecisions` fields are these two
arrays (assembled further down in the same handler, returned as part of the workspace-context
body). Adding `source` is purely additive — no existing consumer breaks.

---

## 3. TYPE-CONTRACT change

**File:** `apps/web/src/lib/types.ts` — interface `WorkspaceContext`, lines **248-249**:

**BEFORE**:

```ts
recentDecisions?: Array<{ content: string; date: string }>;
recentMemories?: Array<{ content: string; importance: string; date: string }>;
```

**AFTER**:

```ts
recentDecisions?: Array<{ content: string; source?: string; date: string }>;
recentMemories?: Array<{ content: string; importance: string; source?: string; date: string }>;
```

- Keep `source` **optional** (`source?:`) so older sidecars (pre-PR3.5) that don't emit the
  field still typecheck and the FE degrades gracefully (no pill when absent).
- This is the ONLY type file that needs to change for the pill. `WorkspaceContext` is the FE
  mirror; there is no separate `@waggle/shared` interface for these inline item shapes (they're
  declared anonymously inline in both `workspaces.ts` and `types.ts`).
- The FE consumer is `apps/web/src/components/os/WorkspaceBriefing.tsx` — `recentMemories`
  rendered at lines **186-197** (importance badge at 189-193, add the ⬡ pill alongside it),
  `recentDecisions` rendered at lines **164-178**. No type change needed in the component; it
  reads `m.content` / `m.importance` today and would add `m.source`.

> Note: the richer `@waggle/shared` `Memory` interface (`packages/shared/src/types.ts:517`,
> field `source: string` at `:526`, doc-comment "maps from `memory_frames.source`") already
> models provenance — but that's the Memory Center view-model, NOT the workspace-context item
> shape. Do not route the pill through `Memory`; the context items are their own inline type.

---

## 4. The PARALLEL builder (workspace-context.ts) — out of scope, but flagged

`packages/server/src/local/routes/workspace-context.ts` builds `WorkspaceNowBlock`
(`recentDecisions: string[]`, type at `:14-21`) for **system-prompt injection**, via
`buildWorkspaceState()` in `packages/server/src/local/workspace-state.ts:234`. Its decision
SELECT is `workspace-state.ts:86-94` (`SELECT id, content, created_at`) and the legacy inline
one is `workspace-context.ts:362` (`SELECT content`). Its items are typed `StateItem`
(`workspace-state.ts:30-36`) whose `source` field is a `StateSource =
'memory'|'session'|'awareness'` — that is a DIFFERENT `source` axis (where in the substrate the
item came from), **not** the `frame.source` provenance class.

**Decision:** the FE pill is fed by §2 (`workspaces.ts` `/context` route → `WorkspaceContext`
→ `WorkspaceBriefing`), so PR3.5's 1-field projection only needs §2 + §3. The
`workspace-state.ts` / `WorkspaceNowBlock` path does not surface to the pill and can be left
untouched. If a future task wants frame-provenance in the system prompt too, that's a separate,
larger change (it would collide with the existing `StateItem.source` name).

`home.ts` (`GET /api/home/briefing`) consumes `buildWorkspaceState().recentDecisions[0].content`
(`home.ts:314-315`) only — it reads `.content`, never `.source`, so it is unaffected.

---

## 5. SOURCE-column value vocabulary

**DB CHECK constraint (authoritative for persisted rows)** —
`schema.ts:57`:

| value | meaning |
|---|---|
| `user_stated` | user said it directly (FrameStore default) |
| `tool_verified` | confirmed by a tool execution |
| `agent_inferred` | agent inferred it (MCP `save_memory` default) |
| `import` | brought in via harvest/import |
| `system` | system-seeded (e.g. workspace template starter memory — `workspaces.ts:291`) |

**TS `FrameSource` union is WIDER than the DB CHECK** —
`packages/hive-mind-core/src/mind/frames.ts:25`:

```ts
export type FrameSource = 'user_stated' | 'tool_verified' | 'agent_inferred'
  | 'import' | 'system' | 'personal' | 'workspace' | 'team_sync';
```

The extra three (`personal` / `workspace` / `team_sync`) are application-level labels that the
DB CHECK does **not** allow, so a constrained INSERT with one of them would fail — **persisted
rows can only ever hold the 5 CHECK values** (documented drift:
`docs/backend-map/sections/02a-data-model-memory.md:109` and `.../05b-subsystem-memory.md:318`).

**FE pill mapping guidance:** the pill should map the 5 real values to friendly labels/icons
(e.g. `user_stated`→"you", `tool_verified`→"verified", `agent_inferred`→"agent",
`import`→"imported", `system`→"system"). Treat anything else as a graceful fallback. Because
the projection returns the raw string, the FE owns the label map (do not hardcode it in the
route).

---

## 6. Honest ambiguities / risks

1. **Two SELECTs, one new column each** — straightforward, additive. The only typecheck trap is
   the narrower `let recentMemories` / `let recentDecisions` declarations at `workspaces.ts:376-377`;
   widen those too or `tsc` fails. (Reminder per CLAUDE.md §2: `npm run build` typechecks
   `apps/web` only — run `npx tsc --noEmit --project packages/server/tsconfig.json` to catch a
   server-route type error, since the sidecar runs via `tsx` transpile-only.)
2. **The "source" name is overloaded** — `frame.source` (provenance: 5 CHECK values) vs
   `StateItem.source` (`memory|session|awareness`, where-it-came-from) vs `WorkspaceContext`
   inline items (currently no `source`). Make sure the pill consumes the PROVENANCE one from §2,
   not the `StateItem` one.
3. **Decision frames may carry any of the 5 sources** — the decision SELECT (`workspaces.ts:409`)
   filters by `content LIKE` / `importance='critical'`, not by `source`, so a "decision" can be
   `agent_inferred` or `user_stated` etc. That's fine for a pill; just don't assume decisions
   are always `system`.
4. **No migration / no DDL change needed** — `source` already exists on every DB (NOT NULL
   DEFAULT). The projection is read-only over an existing column. Zero data-backfill risk.
