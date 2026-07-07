/**
 * Hero shared-element morph identifiers (path-to-9 Pillar 1.1 · Lane HM).
 *
 * The two hero cases in the motion system are shared-element morphs, driven by
 * framer-motion `layoutId`: a source element (a workspace shelf card) and a
 * destination element (the workspace surface header) that carry the SAME
 * `layoutId` animate between one another on route change — the card GROWS into
 * the surface. These builders are the single source of truth for those ids so
 * source and destination can never drift out of sync (the whole morph silently
 * no-ops if the two strings disagree).
 *
 * Pure data — imports nothing — so both React callers and the (non-React)
 * motion-gate scripts can read it.
 *
 * Integration note (Lane RT): the morph fires via framer's global layoutId
 * registry, so it works without a wrapping `LayoutGroup`. When Lane RT's
 * RouteTransition lands (an `AnimatePresence mode="popLayout"` around the
 * AppShell `<Outlet/>`), the exiting shelf and the entering surface briefly
 * co-exist, which makes the morph land even more reliably; no id changes are
 * needed here.
 */

/** layoutId for a workspace's hex avatar (card ⇄ surface header). */
export function workspaceHeroAvatarId(workspaceId: string): string {
  return `ws-hero-avatar-${workspaceId}`;
}

/** layoutId for a workspace's name (card ⇄ surface header). */
export function workspaceHeroNameId(workspaceId: string): string {
  return `ws-hero-name-${workspaceId}`;
}

/**
 * Kill switch for every hero morph. A regression in the shared-element system
 * is one env flip away from off: build with `VITE_HERO_MORPH_DISABLED=true` and
 * all morph callers fall back to the default route crossfade. Wrapped in
 * try/catch so non-Vite consumers (node gate scripts) resolve to enabled.
 */
export function heroMorphEnabled(): boolean {
  try {
    return import.meta.env?.VITE_HERO_MORPH_DISABLED !== 'true';
  } catch {
    return true;
  }
}
