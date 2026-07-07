/**
 * RouteTransition — the DEFAULT motion tier for top-level route changes
 * (path-to-9 Pillar 1.1 · Lane RT). Wraps the AppShell `<Outlet/>` in a
 * fade-through crossfade with PERSISTENT chrome (the sidebar + StatusBar live
 * OUTSIDE this subtree in AppShell, so they never fade). NOT a global router
 * rewrite — the router is untouched; this only reshapes what renders into the
 * shell's single canvas.
 *
 * Design contract:
 *  1. DEFAULT crossfade, keyed by ROUTE GROUP (top path segment — see
 *     routeGroupKey), so a workspace sub-tab change never crossfades the whole
 *     surface; only a top-level surface change (home→memory→settings…) does.
 *     Enter/exit = opacity fade (DUR.base + EASE_OUT).
 *  2. Interruptibility + input-primacy (ACCEPTANCE): `mode="popLayout"` (never
 *     "wait") so an exit NEVER blocks the next enter — a route change
 *     mid-transition redirects immediately; the final route always wins.
 *  3. Focus + assistive-tech, shipped INSIDE this component: on a group change
 *     the exiting panel is set `inert`+`aria-hidden` (focus / the SR virtual
 *     cursor can never land in it), focus moves to the destination surface's
 *     primary heading (or the panel landmark), and the route is announced via a
 *     polite live region.
 *  4. Reduced-motion (REDUCED.routeTransition): no opacity animation — an
 *     instant swap; focus + announce still fire.
 *  5. Feature-flagged (routeTransitionEnabled) — OFF renders the bare outlet,
 *     the exact pre-Lane-RT behaviour, so a regression is one flag flip.
 *
 * ChatHost is deliberately NOT wrapped (it is a sibling in AppShell) — it keeps
 * in-flight SSE alive across route changes; wrapping it here would remount it.
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useLocation, useOutlet } from 'react-router-dom';
import { DUR, EASE_OUT } from '@/lib/motion/tokens';
import {
  routeAnnouncement,
  routeGroupKey,
  routeTransitionEnabled,
} from '@/lib/motion/route-transition';

export default function RouteTransition() {
  const location = useLocation();
  const outlet = useOutlet();
  const reduce = useReducedMotion();
  // Read the kill switch once per mount — it is a regression escape hatch, not a
  // live toggle (a flip takes effect on the next app load).
  const [enabled] = useState(routeTransitionEnabled);

  const groupKey = routeGroupKey(location.pathname);
  const rootRef = useRef<HTMLDivElement>(null);
  const [announcement, setAnnouncement] = useState('');
  // The landing surface is not a navigation — skip focus-move + announce on the
  // first commit so boot never steals focus or announces the entry surface.
  const firstRun = useRef(true);

  // Focus + AT (item 3). Runs on a route-GROUP change only, so a workspace
  // sub-tab change (same group) can never steal focus. useLayoutEffect → the
  // focus move lands before paint (no focus-ring flash on the exiting tree).
  useLayoutEffect(() => {
    if (!enabled) return;
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const root = rootRef.current;
    if (!root) return;

    const panels = Array.from(root.querySelectorAll<HTMLElement>('[data-route-group]'));
    const dest = panels.find((p) => p.dataset.routeGroup === groupKey) ?? null;

    // Every panel that is NOT the destination is exiting — make it unreachable to
    // focus and to the SR virtual cursor for the remainder of its exit.
    for (const p of panels) {
      if (p !== dest) {
        p.setAttribute('inert', '');
        p.setAttribute('aria-hidden', 'true');
      }
    }

    if (dest) {
      // V1 catch: on an A→B→A re-entry within A's exit window, popLayout reuses
      // A's still-exiting node as the destination — which we already marked
      // inert+aria-hidden while it was exiting. Clear those FIRST, or focus()
      // silently no-ops (inert can't receive focus) and the landed surface stays
      // dead to keyboard+mouse and hidden from SR.
      dest.removeAttribute('inert');
      dest.removeAttribute('aria-hidden');
      // V3 catch: most surfaces have no <h1> (only 8 of 59). Broaden the target
      // to any heading/landmark; when none exists, give the fallback wrapper an
      // accessible name so a SR user lands on a NAMED region, not a generic dump.
      const heading = dest.querySelector<HTMLElement>('h1, h2, [role="heading"], [data-route-heading]');
      const target = heading ?? dest;
      if (target === dest) {
        dest.setAttribute('role', 'region');
        dest.setAttribute('aria-label', routeAnnouncement(location.pathname));
      }
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }

    setAnnouncement(routeAnnouncement(location.pathname));
  }, [groupKey, enabled, location.pathname]);

  // Kill switch: the bare outlet, byte-for-byte the pre-Lane-RT behaviour.
  if (!enabled) return <>{outlet}</>;

  return (
    <div
      ref={rootRef}
      data-testid="route-transition"
      className="relative h-full w-full overflow-hidden"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={groupKey}
          data-route-group={groupKey}
          data-reduced={reduce ? 'true' : 'false'}
          className="absolute inset-0 h-full w-full"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduce ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: reduce ? 0 : DUR.base, ease: EASE_OUT }}
        >
          {outlet}
        </motion.div>
      </AnimatePresence>

      {/* Polite route announce (item 3). Stable node outside AnimatePresence so
          the swap only mutates its text — SR reads the destination label. */}
      <div
        aria-live="polite"
        role="status"
        className="sr-only"
        data-testid="route-announcer"
      >
        {announcement}
      </div>
    </div>
  );
}
