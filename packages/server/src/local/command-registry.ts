/**
 * NL Command Bar — the CLOSED action registry (Tier 1 intent layer).
 *
 * The core safety property: the LLM resolver returns only an action `id` +
 * `params`. THIS module — never the model — maps the id onto an executable
 * shape (a navigation target or a server-derived endpoint), validates params,
 * and stamps `sideEffect` / `riskLevel` / `requiredTier`. An unknown id, or
 * params that fail validation, resolve to `null` (→ the caller returns `none`).
 *
 * No new execution layer: navigation reuses the CommandResult `onNavigate`
 * semantics (`routeForSearchResult`), and side-effects POST to endpoints that
 * already exist (`/api/workspaces`, `/api/mcps/install`). See
 * docs/nl-command-bar/STEP0-AND-DESIGN.md.
 */

import {
  MCP_CATALOG,
  assertTierCapability,
  TierError,
  type Tier,
  type RiskLevel,
  type ResolvedAction,
} from '@waggle/shared';

/** A navigable surface the resolver may send the user to (`open_app`). */
export interface NavTarget {
  /** Must be a valid AppId so the FE `routeForSearchResult('command', …)` resolves it. */
  id: string;
  label: string;
  /** Plain-language aliases to help the model map intent → surface. */
  hints: string;
}

/**
 * Curated user-facing surfaces (a subset of `apps/web/src/lib/routes.ts`
 * APP_ROUTES — all valid AppIds). The frontend resolves the id → URL via its
 * existing `routeFor`, so routing logic is NOT duplicated here — only the
 * capability catalog the model picks from.
 */
export const NAV_TARGETS: readonly NavTarget[] = [
  { id: 'home', label: 'Home', hints: 'dashboard, overview, start' },
  { id: 'memory', label: 'Memory', hints: 'my memories, notes, what I saved, knowledge' },
  { id: 'artifacts', label: 'Artifacts', hints: 'documents, outputs, files I created' },
  { id: 'files', label: 'Files', hints: 'file browser, workspace files' },
  { id: 'agents', label: 'Agents', hints: 'my agents, sub-agents' },
  { id: 'scheduled-jobs', label: 'Automations', hints: 'schedules, cron, recurring tasks, automations' },
  { id: 'capabilities', label: 'Skills', hints: 'skills, capabilities, install a skill' },
  { id: 'connectors', label: 'Connectors', hints: 'integrations, connect a service, Slack, Gmail, GitHub' },
  { id: 'mcp-hub', label: 'MCP Hub', hints: 'MCP servers, model context protocol, browse MCPs' },
  { id: 'marketplace', label: 'Marketplace', hints: 'browse skills and connectors to install' },
  { id: 'launcher', label: 'Launcher', hints: 'launch external AI tools' },
  { id: 'room', label: 'Room', hints: 'collaborative room, live workspace' },
  { id: 'waggle-dance', label: 'WaggleDance', hints: 'multi-agent coordination' },
  { id: 'approvals', label: 'Approvals', hints: 'pending approvals, review requests' },
  { id: 'governance', label: 'Team', hints: 'team, governance, members, roles' },
  { id: 'settings', label: 'Settings', hints: 'preferences, configuration, options' },
  { id: 'profile', label: 'Profile', hints: 'my profile, writing style, brand' },
  { id: 'timeline', label: 'Timeline', hints: 'history, activity timeline' },
  { id: 'telemetry', label: 'Usage', hints: 'usage, cost, token spend, billing usage' },
];

const NAV_IDS = new Set(NAV_TARGETS.map((t) => t.id));

/** A small, popular slice of MCP_CATALOG surfaced to the model for `install_mcp`. */
const POPULAR_MCP_IDS = [
  'postgres', 'sqlite', 'filesystem', 'github', 'slack', 'gdrive-mcp',
  'notion', 'linear', 'stripe', 'puppeteer',
] as const;

/** Context the registry needs to validate/build an action. */
export interface RegistryContext {
  workspaceId?: string;
  /** Known workspaces (id + name) for `open_workspace` resolution. */
  workspaces: ReadonlyArray<{ id: string; name: string }>;
}

interface ParamSpec {
  type: 'string';
  required?: boolean;
  description: string;
  /** Restrict to an enumerated set (rendered + validated). */
  enum?: readonly string[];
}

interface ActionDescriptor {
  id: string;
  description: string;
  params: Record<string, ParamSpec>;
  sideEffect: boolean;
  riskLevel: RiskLevel;
  requiredTier?: Tier;
  /** Build the executable shape, or return null when params are invalid. */
  build: (
    params: Record<string, unknown>,
    ctx: RegistryContext,
  ) => Pick<ResolvedAction, 'label' | 'navigate' | 'endpoint'> | null;
}

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;

/**
 * The CLOSED registry. v1 deliberately small (§3.2 simplicity-first): two
 * read/nav actions + two well-defined side-effect actions. Ambiguous "do X"
 * intents are routed to their screen via `open_app` rather than executed
 * headlessly.
 */
export const ACTION_REGISTRY: readonly ActionDescriptor[] = [
  {
    id: 'open_app',
    description: 'Open one of the app surfaces / screens listed in NAV TARGETS.',
    params: { app: { type: 'string', required: true, description: 'NAV TARGET id', enum: NAV_TARGETS.map((t) => t.id) } },
    sideEffect: false,
    riskLevel: 'low',
    build: (params) => {
      const app = str(params.app);
      if (!app || !NAV_IDS.has(app)) return null;
      const target = NAV_TARGETS.find((t) => t.id === app)!;
      return { label: `Open ${target.label}`, navigate: { type: 'command', id: `command:${app}` } };
    },
  },
  {
    id: 'open_workspace',
    description:
      'Open / resume an existing workspace (use for "continue what I was working on", "open the X workspace"). Pick from RECENT WORKSPACES.',
    params: {
      workspaceId: { type: 'string', required: false, description: 'id of a RECENT WORKSPACE' },
      name: { type: 'string', required: false, description: 'name of the workspace, if the id is unknown' },
    },
    sideEffect: false,
    riskLevel: 'low',
    build: (params, ctx) => {
      const wantId = str(params.workspaceId);
      const wantName = str(params.name);
      let match = wantId ? ctx.workspaces.find((w) => w.id === wantId) : undefined;
      if (!match && wantName) {
        const lower = wantName.toLowerCase();
        match = ctx.workspaces.find((w) => w.name.toLowerCase() === lower)
          ?? ctx.workspaces.find((w) => w.name.toLowerCase().includes(lower));
      }
      if (!match) return null;
      return { label: `Open workspace "${match.name}"`, navigate: { type: 'workspace', id: `workspace:${match.id}` } };
    },
  },
  {
    id: 'create_workspace',
    description: 'Create a new workspace. Infer a concise name from the request.',
    params: {
      name: { type: 'string', required: true, description: 'workspace name' },
      group: { type: 'string', required: false, description: 'group/folder, defaults to "Personal"' },
    },
    sideEffect: true,
    riskLevel: 'low',
    build: (params) => {
      const name = str(params.name);
      if (!name) return null;
      const group = str(params.group) ?? 'Personal';
      return {
        label: `Create workspace "${name}"`,
        endpoint: { method: 'POST', path: '/api/workspaces', body: { name, group } },
      };
    },
  },
  {
    id: 'install_mcp',
    description: 'Install an MCP server from the catalog. Pick an id from POPULAR MCP SERVERS.',
    params: { mcpId: { type: 'string', required: true, description: 'MCP catalog id', enum: POPULAR_MCP_IDS } },
    sideEffect: true,
    riskLevel: 'medium',
    build: (params) => {
      const mcpId = str(params.mcpId);
      if (!mcpId) return null;
      const server = MCP_CATALOG.find((m) => m.id === mcpId);
      if (!server) return null;
      return {
        label: `Install MCP server "${server.name}"`,
        endpoint: { method: 'POST', path: '/api/mcps/install', body: { mcpId } },
      };
    },
  },
];

const BY_ID = new Map(ACTION_REGISTRY.map((d) => [d.id, d]));

export const ACTION_IDS: readonly string[] = ACTION_REGISTRY.map((d) => d.id);

/**
 * Validate an LLM-proposed `(actionId, params)` against the closed registry and
 * build the server-derived `ResolvedAction`. Returns `null` for an unknown id
 * or invalid params — the caller turns that into a `none` result.
 */
export function validateAndBuildAction(
  actionId: string,
  params: Record<string, unknown>,
  ctx: RegistryContext,
): ResolvedAction | null {
  const descriptor = BY_ID.get(actionId);
  if (!descriptor) return null;

  // Enum guard for any enumerated param (defence-in-depth alongside build()).
  for (const [key, spec] of Object.entries(descriptor.params)) {
    if (spec.enum) {
      const v = str(params[key]);
      if (v && !spec.enum.includes(v)) return null;
    }
  }

  const built = descriptor.build(params ?? {}, ctx);
  if (!built) return null;

  return {
    id: descriptor.id,
    label: built.label,
    params: params ?? {},
    sideEffect: descriptor.sideEffect,
    riskLevel: descriptor.riskLevel,
    navigate: built.navigate,
    endpoint: built.endpoint,
  };
}

/**
 * Tier gate for a resolved action, reusing the canonical `assertTierCapability`.
 * Returns `{ gated: true, requiredTier }` when the current tier is below the
 * action's `requiredTier`.
 */
export function checkTier(actionId: string, currentTier: Tier): { gated: boolean; requiredTier?: Tier } {
  const descriptor = BY_ID.get(actionId);
  if (!descriptor?.requiredTier) return { gated: false };
  try {
    assertTierCapability(currentTier, descriptor.requiredTier);
    return { gated: false };
  } catch (e) {
    if (e instanceof TierError) return { gated: true, requiredTier: descriptor.requiredTier };
    throw e;
  }
}

/** Render the registry + nav/MCP catalogs as the system-prompt action catalog. */
export function buildActionCatalog(): string {
  const actions = ACTION_REGISTRY.map((d) => {
    const params = Object.entries(d.params)
      .map(([k, s]) => `${k}${s.required ? '' : '?'}: ${s.description}${s.enum ? ` (one of: ${s.enum.join(', ')})` : ''}`)
      .join('; ');
    const tier = d.requiredTier ? ` [requires ${d.requiredTier}]` : '';
    const eff = d.sideEffect ? ' [side-effect → approval]' : '';
    return `- ${d.id}${tier}${eff}: ${d.description}\n    params: ${params || '(none)'}`;
  }).join('\n');

  const navList = NAV_TARGETS.map((t) => `- ${t.id} (${t.label}) — ${t.hints}`).join('\n');
  const mcpList = POPULAR_MCP_IDS
    .map((id) => {
      const m = MCP_CATALOG.find((s) => s.id === id);
      return m ? `- ${m.id} (${m.name}) — ${m.description}` : `- ${id}`;
    })
    .join('\n');

  return `ACTION REGISTRY (you may ONLY use these ids):\n${actions}\n\nNAV TARGETS (for open_app.app):\n${navList}\n\nPOPULAR MCP SERVERS (for install_mcp.mcpId):\n${mcpList}`;
}
