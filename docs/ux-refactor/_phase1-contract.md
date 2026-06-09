# UX-Refactor Phase 1 — Shared CONTRACT (binding)

> Authored by the Phase-1 contract agent (the ONLY agent that edits
> `packages/shared/src/types.ts` + `apps/web/src/lib/adapter.ts` +
> `apps/web/src/lib/types.ts` this run). Leaf builders (S01/S02/S03 FE + the
> sidecar route leaves) and the integrator MUST align to the names + shapes below.
>
> Grounded in: `shared-types-delta.md §9`, `backend-api-delta.md` Phase-1 group,
> gap cards `S01 §6`, `S02 §6`, `S03 §6`. Mockups are directional; PRD acceptance wins.
>
> **Verification:** `npx tsc --build packages/shared` → exit 0;
> `npx tsc --noEmit --project apps/web/tsconfig.json` → exit 0 (adapter + FE types
> resolve against the rebuilt shared dist). The `/api/*` routes do NOT exist yet —
> the adapter methods compile as fetch wrappers; the route leaves build the servers.

---

## 1. New shared types — `packages/shared/src/types.ts`

Added as a `// === UX-Refactor Command vocabulary (PRD §12.3 / shared-types-delta §9) ===`
block. Exported via the barrel (`packages/shared/src/index.ts` `export * from './types.js'`),
so `import { … } from '@waggle/shared'` resolves them. **String-literal unions, all exported.**

> Phase-0 already shipped the §15.2 unions (`WorkspaceType`, `Scope`, `Confidence`,
> `MemoryKind`, `ArtifactKind`, `AgentType`, `AutonomyLevel`, `ExtensionType`) and
> `WorkspaceConfigV2` in this same file. This run adds ONLY the Command vocabulary.

```ts
export type CommandCategory =
  | 'search' | 'launch' | 'create' | 'run' | 'navigate' | 'extend';

export type CommandResultType =
  | 'workspace' | 'memory' | 'artifact' | 'session' | 'person'
  | 'agent' | 'skill' | 'command' | 'connector' | 'mcp' | 'automation';

export interface CommandAction {
  route?: string;
  endpoint?: string;
  payload?: Record<string, unknown>;
}

export interface CommandResult {
  id: string;
  type: CommandResultType;
  title: string;
  subtitle?: string;
  category: CommandCategory;
  icon?: string;
  requiresApproval?: boolean;      // §12.3 permission-gated → approval prompt
  action?: CommandAction;
}

export interface Command {            // execute request body
  id?: string;                       // structured command resolves via id
  input?: string;                    // OR natural-language command string
  category?: CommandCategory;
  type?: CommandResultType;
  workspaceId?: string;
  payload?: Record<string, unknown>;
}
```

> **Field-name note (binding):** `shared-types-delta §9` is the source of truth, so
> `CommandResult` uses `category: CommandCategory` + `type: CommandResultType`.
> Gap card S03 §6 sketched alternate field names (`kind`/`objectType`) — those are
> SUPERSEDED. Leaves must use `category`/`type`. S03's local `SearchResult`
> interface (`GlobalSearch.tsx:17-25`) is replaced by this shared `CommandResult`.

---

## 2. New FE view-model types — `apps/web/src/lib/types.ts`

Added in a `// ── UX-Refactor Phase 1 view-models ──` block. The top of the file
now re-exports the shared Command vocabulary so palette FE can import the whole
contract from `lib/types`:

```ts
import type {
  WorkspaceType, CommandCategory, CommandResultType, CommandResult, CommandAction,
} from '@waggle/shared';
export type { CommandCategory, CommandResultType, CommandResult, CommandAction };
```

### S01 — Home Cockpit
```ts
export interface RecentWorkspaceCard {
  id: string; name: string; group: string;
  summary?: string; lastActive: string;
  pendingCount: number; continueSessionId?: string;
}
export interface SuggestedAction {
  label: string; workspaceId: string; sessionId?: string; kind: string;
}
export interface UpNextItem {
  id: string; label: string; workspaceId?: string; at?: string;
  kind: 'event' | 'task' | 'schedule';
}
export interface HomeBriefing {
  greeting: string; userName?: string; date: string;
  recentWorkspaces: RecentWorkspaceCard[];
  suggestedActions: SuggestedAction[];
  upNext: UpNextItem[];
  activeModels?: string[];
  isFirstRun: boolean;
}
export interface OvernightFailure {
  id: string; label: string; automationId?: string; error: string; at: string;
}
export interface OvernightSummary {
  consolidated: number; artifactsCreated: number; automationsCompleted: number;
  failures: OvernightFailure[];
  window?: { from: string; to: string };
}
export interface QuickCaptureInput {
  kind: 'note' | 'task' | 'link' | 'file'; content: string; workspaceId?: string;
}
```

### S02 — Workspace Desktop
```ts
export interface WorkspaceStateItem {
  id: string; content: string; date?: string;
  freshness?: 'fresh' | 'aging' | 'stale';
}
export interface WorkspaceStateView {       // FE mirror of server WorkspaceState
  active: WorkspaceStateItem[];
  openQuestions: WorkspaceStateItem[];
  pending: WorkspaceStateItem[];            // pending + blocked seed the Tasks tab
  blocked: WorkspaceStateItem[];
  completed: WorkspaceStateItem[];
  stale: WorkspaceStateItem[];
  recentDecisions: WorkspaceStateItem[];
  nextActions: SuggestedAction[];
}
export interface WorkspaceActivityEvent {
  id: string | number; ts: string; type: string; actor?: string; summary: string;
}
```

> The FE `Workspace` interface already carries the Phase-0 optional V2 fields
> (`type`, `status`, `description`, `agentIds`, `connectorIds`, `mcpIds`,
> `updatedAt`) — leaves consume those; do not re-add them.

---

## 3. New adapter methods — `apps/web/src/lib/adapter.ts`

Pattern matched to existing siblings: thin `await this.fetch(path[, init])` →
`res.json()`. Base URL + bearer-token + 403-tier handling all come from the
shared `this.fetch()` wrapper. All exposed on the `LocalAdapter` instance
exported as `adapter` (and the default export). Routes are net-new (do not exist
yet) — these compile and run as fetch wrappers; calls will 404 until the route
leaves land.

| Method (signature) | HTTP | Endpoint | Screen |
|---|---|---|---|
| `getHomeBriefing(): Promise<HomeBriefing>` | GET | `/api/home/briefing` | S01 |
| `getHomeOvernight(since?: string): Promise<OvernightSummary>` | GET | `/api/home/overnight[?since=<iso>]` | S01 |
| `quickCapture(input: QuickCaptureInput): Promise<{ frameId: string }>` | POST | `/api/quick-capture` | S01 |
| `getWorkspaceState(id: string): Promise<WorkspaceStateView>` | GET | `/api/workspaces/:id/state` | S01, S02 |
| `getWorkspaceActivity(id: string, limit = 50): Promise<{ events: WorkspaceActivityEvent[] }>` | GET | `/api/workspaces/:id/activity?limit=` | S02 |
| `commandSearch(q: string, scope?: string): Promise<{ results: CommandResult[] }>` | GET | `/api/command/search?q=[&scope=]` | S00, S03 |
| `commandRecent(): Promise<{ recent: CommandResult[] }>` | GET | `/api/command/recent` | S03 |
| `commandSuggestions(): Promise<{ suggestions: CommandResult[] }>` | GET | `/api/command/suggestions` | S03 |
| `commandExecute(payload: Command): Promise<{ ok: boolean; result?: unknown }>` | POST | `/api/command/execute` | S00, S03 |

### Binding notes for the route + FE leaves
- **Response envelopes are exact.** `commandSearch` returns `{ results: CommandResult[] }`,
  `commandRecent` returns `{ recent: CommandResult[] }`, `commandSuggestions` returns
  `{ suggestions: CommandResult[] }` (distinct keys — do not collapse). `getWorkspaceActivity`
  returns `{ events: [...] }`. `getHomeBriefing` / `getHomeOvernight` / `getWorkspaceState`
  return the bare object (no envelope).
- **B4 (founder-ratified):** `commandExecute` posts to the **singular** `/api/command/execute`,
  which the route leaf ALIASES onto the existing handler. The existing plural
  `/api/commands/execute` (`adapter.executeCommand`) is NOT renamed and stays as-is.
- **C9:** the Command Center permission prompt (`CommandResult.requiresApproval`) reuses the
  chat approvals pipeline (`useChat().pendingApproval` / `ApprovalRequest`), not a new mechanism.
- **C5/C7 do not change this contract** but constrain consumers: Overview chat is a read-only
  preview deep-linking to the Chat tab; Tasks tab seeds from `WorkspaceStateView.pending` +
  `.blocked`.
- **Artifact/agent facets** in `CommandResultType` are intentionally present-but-gated — S05/S09
  substrate is not built yet; command search ships with the available facets only.

---

## 4. Files touched this run (scope lock)

- `packages/shared/src/types.ts` — added Command vocabulary block.
- `apps/web/src/lib/types.ts` — added Phase-1 FE view-models + shared re-export.
- `apps/web/src/lib/adapter.ts` — added 9 Phase-1 methods + 2 import lines.
- `docs/ux-refactor/_phase1-contract.md` — this note.

NOT touched (by contract): `Desktop.tsx`, `lib/dock-tiers.ts`, any `index.ts` route
registrar, any `routes/*.ts`, any component. Those belong to the leaf builders.
