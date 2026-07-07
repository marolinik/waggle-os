/**
 * Lane RT — route-transition system (path-to-9 Pillar 1.1).
 *
 * Covers the acceptance contract:
 *  - routeGroupKey keys on the TOP segment only (a workspace sub-tab change is
 *    the SAME group — no whole-surface crossfade).
 *  - Interruptibility: two navigations in quick succession → the FINAL route
 *    wins and is focused, no lock (popLayout, never "wait").
 *  - Focus + AT ships INSIDE the component: focus moves to the destination
 *    heading, the exiting tree is inert + aria-hidden, the route is announced
 *    via a polite live region.
 *  - Reduced-motion degrades to an instant swap (no opacity animation) while
 *    focus + announce still fire.
 *  - The feature flag OFF renders the bare outlet (regression escape hatch).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';

// framer-motion caches the prefers-reduced-motion media query at module scope
// (a singleton set on the first useReducedMotion call), so a per-test matchMedia
// swap can't flip it. Override just that hook via a mutable holder; motion +
// AnimatePresence stay real.
const reduceHolder = vi.hoisted(() => ({ value: false }));
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => reduceHolder.value };
});

import RouteTransition from './RouteTransition';
import {
  routeGroupKey,
  routeAnnouncement,
  routeTransitionEnabled,
  ROUTE_TRANSITION_FLAG_KEY,
} from '@/lib/motion/route-transition';

// ── Pure helpers ─────────────────────────────────────────────────────────────
describe('routeGroupKey — keys on the top segment only', () => {
  it("'/' (transient index) maps to the home group", () => {
    expect(routeGroupKey('/')).toBe('home');
  });

  it('derives the key from the FIRST path segment', () => {
    expect(routeGroupKey('/memory')).toBe('memory');
    expect(routeGroupKey('/memory/personal')).toBe('memory');
    expect(routeGroupKey('/settings/vault')).toBe('settings');
  });

  it('a workspace sub-tab change is the SAME group (no whole-surface crossfade)', () => {
    const chat = routeGroupKey('/workspaces/abc/chat');
    const overview = routeGroupKey('/workspaces/abc/overview');
    const other = routeGroupKey('/workspaces/xyz');
    expect(chat).toBe('workspaces');
    expect(overview).toBe('workspaces');
    expect(other).toBe('workspaces');
  });

  it('distinct top-level surfaces are distinct groups', () => {
    expect(routeGroupKey('/home')).not.toBe(routeGroupKey('/memory'));
    expect(routeGroupKey('/agents')).not.toBe(routeGroupKey('/marketplace'));
  });
});

describe('routeAnnouncement — the polite-live-region label', () => {
  it('labels known surfaces', () => {
    expect(routeAnnouncement('/memory')).toBe('Memory');
    expect(routeAnnouncement('/waggle-dance')).toBe('Agent swarm');
    expect(routeAnnouncement('/workspaces/abc/chat')).toBe('Workspaces');
  });

  it('never returns empty for an unknown segment (title-cased fallback)', () => {
    expect(routeAnnouncement('/some-unknown-surface')).toBe('Some Unknown Surface');
  });
});

describe('routeTransitionEnabled — the kill switch', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('defaults ON', () => {
    expect(routeTransitionEnabled()).toBe(true);
  });

  it('is disabled by the localStorage kill switch', () => {
    localStorage.setItem(ROUTE_TRANSITION_FLAG_KEY, 'off');
    expect(routeTransitionEnabled()).toBe(false);
  });

  it('an explicit "on" keeps it enabled', () => {
    localStorage.setItem(ROUTE_TRANSITION_FLAG_KEY, 'on');
    expect(routeTransitionEnabled()).toBe(true);
  });
});

// ── Component ────────────────────────────────────────────────────────────────
function Surface({ id, label }: { id: string; label: string }) {
  return (
    <div data-testid={`surface-${id}`}>
      <h1>{label}</h1>
    </div>
  );
}

/** A surface with NO <h1> (like Agents/Settings/most of components/os/apps) —
 *  exercises the broadened focus selector + the named-region fallback. */
function SurfaceNoH1({ id, label }: { id: string; label: string }) {
  return (
    <div data-testid={`surface-${id}`}>
      <h2>{label} section</h2>
      <p>body</p>
    </div>
  );
}

/** Renders navigation controls + the RouteTransition under one layout route. */
function Layout() {
  const navigate = useNavigate();
  return (
    <div>
      <button onClick={() => navigate('/memory')}>go-memory</button>
      <button onClick={() => navigate('/agents')}>go-agents</button>
      <button
        onClick={() => {
          navigate('/memory');
          navigate('/agents');
        }}
      >
        go-double
      </button>
      <button onClick={() => navigate('/workspaces/a/chat')}>go-ws-chat</button>
      <button onClick={() => navigate('/workspaces/a/overview')}>go-ws-overview</button>
      <button onClick={() => navigate('/settings')}>go-settings</button>
      <button onClick={() => navigate('/home')}>go-home</button>
      <RouteTransition />
    </div>
  );
}

function Harness({ initial = '/home' }: { initial?: string }) {
  return (
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route path="home" element={<Surface id="home" label="Home" />} />
          <Route path="memory" element={<Surface id="memory" label="Memory" />} />
          <Route path="agents" element={<Surface id="agents" label="Agents" />} />
          <Route
            path="workspaces/:id/:tab?"
            element={<Surface id="ws" label="Workspace" />}
          />
          <Route path="settings" element={<SurfaceNoH1 id="settings" label="Settings" />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('RouteTransition — component', () => {
  beforeEach(() => {
    localStorage.clear();
    reduceHolder.value = false;
  });
  afterEach(() => {
    cleanup();
    reduceHolder.value = false;
  });

  it('wraps the outlet in the crossfade root and announces politely', () => {
    render(<Harness />);
    expect(screen.getByTestId('route-transition')).toBeInTheDocument();
    const announcer = screen.getByTestId('route-announcer');
    expect(announcer).toHaveAttribute('aria-live', 'polite');
    // Landing surface is present but NOT announced (first commit is not a nav).
    expect(screen.getByTestId('surface-home')).toBeInTheDocument();
    expect(announcer).toHaveTextContent('');
  });

  it('moves focus to the destination heading and announces the route on nav', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('go-memory'));
    expect(screen.getByTestId('surface-memory')).toBeInTheDocument();
    const heading = screen.getByRole('heading', { name: 'Memory' });
    expect(document.activeElement).toBe(heading);
    expect(screen.getByTestId('route-announcer')).toHaveTextContent('Memory');
  });

  it('sets the exiting panel inert + aria-hidden so focus cannot land in it', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('go-memory'));
    const panels = document.querySelectorAll('[data-route-group]');
    // The destination panel is live; any other (exiting) panel is inert.
    const exiting = Array.from(panels).filter(
      (p) => (p as HTMLElement).dataset.routeGroup !== 'memory',
    );
    for (const p of exiting) {
      expect(p).toHaveAttribute('inert');
      expect(p).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('interruptibility: two navigations in quick succession → the final route wins, no lock', () => {
    render(<Harness />);
    act(() => {
      fireEvent.click(screen.getByText('go-double')); // navigate(/memory) then (/agents)
    });
    // The FINAL route mounted immediately (popLayout, not "wait") and is focused.
    expect(screen.getByTestId('surface-agents')).toBeInTheDocument();
    const heading = screen.getByRole('heading', { name: 'Agents' });
    expect(document.activeElement).toBe(heading);
  });

  it('no-<h1> surface: focus lands on a heading (broadened selector), not a generic dump (V3 fix)', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('go-settings'));
    // The h2 is now a valid focus target (selector broadened from h1-only).
    const heading = screen.getByRole('heading', { name: 'Settings section' });
    expect(document.activeElement).toBe(heading);
    expect(screen.getByTestId('route-announcer')).toHaveTextContent('Settings');
  });

  it('re-entry A→B→A within the exit window leaves the destination interactive, not stale-inert (V1 fix)', () => {
    render(<Harness />);
    act(() => { fireEvent.click(screen.getByText('go-memory')); });
    act(() => { fireEvent.click(screen.getByText('go-home')); }); // back to home while memory (or home's prior) may still be exiting
    const homePanel = document.querySelector('[data-route-group="home"]') as HTMLElement;
    expect(homePanel).not.toBeNull();
    // The destination must NOT retain a stale inert/aria-hidden from a prior exit.
    expect(homePanel.hasAttribute('inert')).toBe(false);
    expect(homePanel.getAttribute('aria-hidden')).not.toBe('true');
    // Focus is inside the destination, never dropped to <body>.
    expect(document.activeElement).not.toBe(document.body);
    expect(homePanel.contains(document.activeElement)).toBe(true);
  });

  it('a workspace sub-tab change updates the SAME panel in place (no new crossfade)', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('go-ws-chat'));
    expect(screen.getByTestId('route-announcer')).toHaveTextContent('Workspaces');
    // Capture the workspaces panel node. A sub-tab change is the SAME group key,
    // so the panel must be reconciled IN PLACE (same DOM node) — no exit/enter —
    // rather than crossfaded. (Node identity is robust vs. framer's lingering
    // exit panel from the earlier home→workspaces transition.)
    const wsPanelBefore = document.querySelector('[data-route-group="workspaces"]');
    expect(wsPanelBefore).not.toBeNull();
    fireEvent.click(screen.getByText('go-ws-overview'));
    const wsPanelAfter = document.querySelector('[data-route-group="workspaces"]');
    expect(wsPanelAfter).toBe(wsPanelBefore);
  });

  it('reduced-motion → instant swap (no opacity anim) while focus + announce still fire', () => {
    reduceHolder.value = true;
    render(<Harness />);
    fireEvent.click(screen.getByText('go-memory'));
    const panel = document.querySelector('[data-route-group="memory"]') as HTMLElement;
    expect(panel).toHaveAttribute('data-reduced', 'true');
    // Focus + announce are NOT gated by reduced motion.
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Memory' }));
    expect(screen.getByTestId('route-announcer')).toHaveTextContent('Memory');
  });

  it('feature flag OFF → renders the bare outlet (no crossfade root, no announcer)', () => {
    localStorage.setItem(ROUTE_TRANSITION_FLAG_KEY, 'off');
    render(<Harness />);
    expect(screen.queryByTestId('route-transition')).not.toBeInTheDocument();
    expect(screen.queryByTestId('route-announcer')).not.toBeInTheDocument();
    // The surface still renders (bare outlet).
    expect(screen.getByTestId('surface-home')).toBeInTheDocument();
  });
});
