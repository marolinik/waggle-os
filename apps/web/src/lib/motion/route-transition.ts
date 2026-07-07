/**
 * Route-transition pure helpers (Pillar 1.1 · Lane RT). No JSX / no React so the
 * contract is unit-testable in isolation and the component file stays fast-refresh
 * clean. The <RouteTransition/> component consumes all three.
 *
 *  - routeGroupKey       — the AnimatePresence key. Derived from the TOP path
 *                          segment ONLY, so a workspace sub-tab change within
 *                          /workspaces/:id (overview→chat) never crossfades the
 *                          whole surface — only a top-level surface change does.
 *  - routeAnnouncement   — the polite-live-region label for the destination
 *                          surface (assistive-tech route announce).
 *  - routeTransitionEnabled — the kill switch. Default ON; one localStorage flag
 *                          flip disables the whole tier if it ever regresses.
 */

/** localStorage kill-switch key. `'off'|'false'|'0'` disables; anything else = ON. */
export const ROUTE_TRANSITION_FLAG_KEY = 'waggle-route-transition';

/**
 * The AnimatePresence key for a pathname: the first path segment, lowercased.
 * '/' (the transient index before IndexRedirect) maps to 'home' so the boot
 * redirect to /home does not read as a crossfade. Every /workspaces/* path —
 * grid, :id, and every sub-tab — shares the single 'workspaces' key (the
 * card→workspace-open hero morph, Lane HM, owns that pair, not this crossfade).
 */
export function routeGroupKey(pathname: string): string {
  const seg = pathname.split('/').filter(Boolean)[0];
  return seg ? seg.toLowerCase() : 'home';
}

/** Human labels for the known top-level surfaces (route-announce copy). */
const ROUTE_LABELS: Record<string, string> = {
  home: 'Home',
  workspaces: 'Workspaces',
  memory: 'Memory',
  artifacts: 'Artifacts',
  files: 'Files',
  agents: 'Agents',
  automations: 'Automations',
  skills: 'Skills',
  room: 'Room',
  'waggle-dance': 'Agent swarm',
  approvals: 'Approvals',
  connectors: 'Connectors',
  mcps: 'MCP hub',
  marketplace: 'Marketplace',
  launcher: 'Launcher',
  team: 'Team',
  settings: 'Settings',
  benchmarks: 'Benchmarks',
  platform: 'Platform',
};

/**
 * The polite-live-region announcement for a destination pathname: the surface
 * label. Unknown segments fall back to a title-cased form of the segment so the
 * announce is never empty (a wrong-but-present label is still better for SR than
 * silence, and this never fires on a known surface).
 */
export function routeAnnouncement(pathname: string): string {
  const key = routeGroupKey(pathname);
  return ROUTE_LABELS[key] ?? titleCase(key);
}

function titleCase(seg: string): string {
  return seg
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Kill switch. Default ON everywhere; a regression is one flag flip:
 * `localStorage.setItem('waggle-route-transition', 'off')`. Reads defensively so
 * a disabled/throwing storage falls back to ON (the shipped default).
 */
export function routeTransitionEnabled(): boolean {
  try {
    if (typeof localStorage !== 'undefined') {
      const v = localStorage.getItem(ROUTE_TRANSITION_FLAG_KEY);
      if (v === 'off' || v === 'false' || v === '0') return false;
      if (v === 'on' || v === 'true' || v === '1') return true;
    }
  } catch {
    /* storage disabled — fall through to the ON default */
  }
  return true;
}
