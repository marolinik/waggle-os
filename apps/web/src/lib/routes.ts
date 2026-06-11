/**
 * UX Refactor v2.1 P1a — canonical AppId → URL table (conversion plan §1.1)
 * and the search-result → URL retarget (§2.2 row 1).
 *
 * `routeFor` is a FUNCTION, not a `Record<AppId, string>` (§2.3): `chat` and
 * `workspace-desktop` resolve to parameterized routes (`/workspaces/:id(/chat)`,
 * no active workspace → `/home`) that a static record cannot express. All
 * chat-capable consumers (nav Chat entry §1.3, Ctrl+Shift+1 §2.2, the
 * `waggle:open-app` shim §2.3) resolve through it, so the chat special-case
 * is implemented exactly once.
 */
import type { AppId } from '@/lib/dock-tiers';

export interface RouteContext {
  activeWorkspaceId?: string | null;
}

/**
 * Static §1.1 routes — every AppId except the two parameterized ones.
 * The four KILLED ids (dashboard / voice / mission-control / backup, §1.1
 * bottom rows + §9.5) have no surface of their own; deep links retarget per
 * §2.2 (`dashboard`→`/home`, `voice`/`mission-control`→`/home`,
 * `backup`→`/settings?tab=backup` — SettingsApp's internal backup tab).
 */
export const APP_ROUTES = {
  home: '/home',
  memory: '/memory',
  artifacts: '/artifacts',
  files: '/files',
  agents: '/agents',
  'scheduled-jobs': '/automations',
  capabilities: '/skills',
  connectors: '/connectors',
  'mcp-hub': '/mcps',
  marketplace: '/marketplace',
  launcher: '/launcher',
  room: '/room',
  'waggle-dance': '/waggle-dance',
  approvals: '/approvals',
  governance: '/team',
  settings: '/settings',
  vault: '/settings/vault',
  profile: '/settings/profile',
  cockpit: '/settings/mission-control',
  timeline: '/settings/timeline',
  events: '/settings/events',
  telemetry: '/settings/usage',
  // — KILLED ids (§2.2 retargets) —
  dashboard: '/home',
  voice: '/home',
  'mission-control': '/home',
  backup: '/settings?tab=backup',
} as const satisfies Record<Exclude<AppId, 'chat' | 'workspace-desktop'>, string>;

const KNOWN_APP_IDS: ReadonlySet<string> = new Set([
  ...Object.keys(APP_ROUTES),
  'chat',
  'workspace-desktop',
]);

/**
 * Runtime AppId guard — used by the §2.2 `command:` fallback below and by the
 * §3.3 window-state migration's appId salvage (lib/window-state-migration.ts).
 */
export function isAppId(value: string): value is AppId {
  return KNOWN_APP_IDS.has(value);
}

/** The §1.1 table as code. Total over all 28 AppIds. */
export function routeFor(appId: AppId, ctx?: RouteContext): string {
  if (appId === 'chat' || appId === 'workspace-desktop') {
    const wsId = ctx?.activeWorkspaceId;
    // No active workspace → Home (Home IS the workspace selector, §1.3/§9.7).
    // 'local-default' is the pre-fetch placeholder, never a real route param
    // (same rule §3.3 step 2 applies during window-state salvage).
    if (!wsId || wsId === 'local-default') return APP_ROUTES.home;
    return appId === 'chat' ? `/workspaces/${wsId}/chat` : `/workspaces/${wsId}`;
  }
  return APP_ROUTES[appId];
}

/**
 * Deep-link query-string carrier for the `waggle:open-app` shim (§2.3) and
 * the `?session=` reservation (§1.1 /workspaces row). Empty params → ''.
 */
export function queryString(params: { tab?: string; automationId?: string; session?: string; filter?: string }): string {
  const qs = new URLSearchParams();
  if (params.tab) qs.set('tab', params.tab);
  if (params.automationId) qs.set('automationId', params.automationId);
  if (params.session) qs.set('session', params.session);
  if (params.filter) qs.set('filter', params.filter);
  const s = qs.toString();
  return s ? `?${s}` : '';
}

/**
 * §2.2 row 1 — pure retarget of Desktop's `handleSearchNavigate`
 * (Desktop.tsx:258-288). Ids are type-prefixed (`workspace:<id>`,
 * `session:<wsId>:<sessionId>`, `command:<name>` — routes/command.ts); the
 * prefix is stripped exactly as the old handler stripped it.
 *
 * Total over NAVIGABLE_TYPES (CommandCenter.tsx:66-68): workspace / memory /
 * session / person / command — plus the executed-object types the old handler
 * also navigated (skill / connector / mcp). `person:` → null no-op (parity:
 * unhandled today too — the server intentionally doesn't federate `person`
 * yet, routes/command.ts:22-24; retarget to `/team` when it federates).
 * Returns null when there is nothing to navigate to.
 */
export function routeForSearchResult(type: string, id: string, ctx?: RouteContext): string | null {
  // Session ids carry TWO segments after the prefix (`session:<wsId>:<sessionId>`),
  // so handle them before the generic single-prefix strip below.
  if (type === 'session') {
    const [, wsId, sessionId] = id.split(':');
    if (!wsId) return null;
    return `/workspaces/${wsId}/chat${queryString({ session: sessionId })}`;
  }
  const bareId = id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
  switch (type) {
    case 'workspace':
      return bareId ? `/workspaces/${bareId}` : null;
    case 'memory':
      return APP_ROUTES.memory;
    case 'skill':
      return APP_ROUTES.capabilities;
    case 'connector':
      return APP_ROUTES.connectors;
    case 'mcp':
      return APP_ROUTES['mcp-hub'];
    case 'command':
      // `command:<appId>` → routeFor fallback (§2.2). Unknown command names
      // are a no-op (parity: wm.openApp on an unknown id rendered nothing).
      return isAppId(bareId) ? routeFor(bareId, ctx) : null;
    case 'person':
      return null;
    default:
      return null;
  }
}

/**
 * Nav active-state resolver (§2.1.2): longest-prefix match of the current
 * pathname against the nav entries' `route` fields. Longest wins so
 * `/settings/vault` activates Vault, not Settings. Returns the matched route
 * (or null when nothing matches — e.g. an overlay-only or unknown URL).
 */
export function matchNavRoute(pathname: string, routes: readonly string[]): string | null {
  let best: string | null = null;
  for (const route of routes) {
    if (pathname === route || pathname.startsWith(`${route}/`)) {
      if (!best || route.length > best.length) best = route;
    }
  }
  return best;
}
