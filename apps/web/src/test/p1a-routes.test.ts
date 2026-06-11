/**
 * UX Refactor v2.1 P1a — pins the §1.1 appId→route table (routeFor), the §2.2
 * search-result retarget (routeForSearchResult, total over NAVIGABLE_TYPES),
 * the queryString deep-link carrier, the §2.1.2 nav active-state matcher, and
 * the §1.3 dock-tiers `route` field invariant (every nav entry's route agrees
 * with routeFor).
 */
import { describe, it, expect } from 'vitest';
import {
  APP_ROUTES,
  matchNavRoute,
  queryString,
  routeFor,
  routeForSearchResult,
} from '@/lib/routes';
import {
  TIER_DOCK_CONFIG,
  getDockForTier,
  type AppId,
  type DockEntry,
} from '@/lib/dock-tiers';

/** Every AppId in the union (dock-tiers.ts:7-18) — keep in sync; 28 ids. */
const ALL_APP_IDS: AppId[] = [
  'home', 'chat', 'dashboard', 'memory', 'events',
  'capabilities', 'connectors', 'cockpit', 'mission-control',
  'settings', 'vault', 'profile',
  'waggle-dance', 'files', 'artifacts', 'agents',
  'scheduled-jobs', 'marketplace', 'voice', 'room', 'approvals', 'timeline',
  'backup', 'telemetry', 'governance', 'launcher',
  'workspace-desktop', 'mcp-hub',
];

describe('routeFor — §1.1 table', () => {
  it('maps every static AppId exactly per the table (22 routed ids)', () => {
    const expected: Record<string, string> = {
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
    };
    for (const [appId, route] of Object.entries(expected)) {
      expect(routeFor(appId as AppId), appId).toBe(route);
    }
    expect(Object.keys(expected)).toHaveLength(22);
  });

  it('retargets the 4 KILLED ids per §2.2 (dashboard/voice/mission-control → /home, backup → /settings?tab=backup)', () => {
    expect(routeFor('dashboard')).toBe('/home');
    expect(routeFor('voice')).toBe('/home');
    expect(routeFor('mission-control')).toBe('/home');
    expect(routeFor('backup')).toBe('/settings?tab=backup');
  });

  it('parameterizes chat → /workspaces/:id/chat and workspace-desktop → /workspaces/:id', () => {
    expect(routeFor('chat', { activeWorkspaceId: 'ws-1' })).toBe('/workspaces/ws-1/chat');
    expect(routeFor('workspace-desktop', { activeWorkspaceId: 'ws-1' })).toBe('/workspaces/ws-1');
  });

  it('falls back to /home when there is no active workspace (§1.3)', () => {
    expect(routeFor('chat')).toBe('/home');
    expect(routeFor('chat', {})).toBe('/home');
    expect(routeFor('chat', { activeWorkspaceId: null })).toBe('/home');
    expect(routeFor('workspace-desktop')).toBe('/home');
    // 'local-default' is the pre-fetch placeholder, never a real route param (§3.3).
    expect(routeFor('chat', { activeWorkspaceId: 'local-default' })).toBe('/home');
    expect(routeFor('workspace-desktop', { activeWorkspaceId: 'local-default' })).toBe('/home');
  });

  it('is total over all 28 AppIds (never throws, never returns empty)', () => {
    expect(ALL_APP_IDS).toHaveLength(28);
    for (const appId of ALL_APP_IDS) {
      const route = routeFor(appId, { activeWorkspaceId: 'ws-x' });
      expect(route, appId).toMatch(/^\//);
    }
  });

  it('Ctrl+Shift+0/4 shortcut ids resolve per §2.2 (0:dashboard → /home, 4:cockpit → /settings/mission-control)', () => {
    expect(routeFor('dashboard')).toBe('/home');
    expect(routeFor('cockpit')).toBe('/settings/mission-control');
  });
});

describe('routeForSearchResult — §2.2 row 1', () => {
  it('workspace: → /workspaces/:id', () => {
    expect(routeForSearchResult('workspace', 'workspace:ws-1')).toBe('/workspaces/ws-1');
  });

  it('session: → /workspaces/:ws/chat?session=:sid (two segments after the prefix)', () => {
    expect(routeForSearchResult('session', 'session:ws-1:sess-9')).toBe('/workspaces/ws-1/chat?session=sess-9');
  });

  it('session: without a session segment still lands on the chat tab', () => {
    expect(routeForSearchResult('session', 'session:ws-1')).toBe('/workspaces/ws-1/chat');
  });

  it('session: with no workspace segment is a no-op (parity with Desktop.tsx:261-269)', () => {
    expect(routeForSearchResult('session', 'session:')).toBeNull();
  });

  it('memory:/skill:/connector:/mcp: → their hub routes', () => {
    expect(routeForSearchResult('memory', 'memory:m-1')).toBe('/memory');
    expect(routeForSearchResult('skill', 'skill:my-skill')).toBe('/skills');
    expect(routeForSearchResult('connector', 'connector:slack')).toBe('/connectors');
    expect(routeForSearchResult('mcp', 'mcp:github')).toBe('/mcps');
  });

  it('command: falls back to routeFor(appId), incl. the chat special-case through ctx', () => {
    expect(routeForSearchResult('command', 'command:settings')).toBe('/settings');
    expect(routeForSearchResult('command', 'command:scheduled-jobs')).toBe('/automations');
    expect(routeForSearchResult('command', 'command:chat', { activeWorkspaceId: 'ws-1' })).toBe('/workspaces/ws-1/chat');
    expect(routeForSearchResult('command', 'command:chat')).toBe('/home');
  });

  it('command: with an unknown app name is a no-op', () => {
    expect(routeForSearchResult('command', 'command:not-an-app')).toBeNull();
  });

  it('person: → null no-op (server does not federate person yet — routes/command.ts:22-24)', () => {
    expect(routeForSearchResult('person', 'person:p-1')).toBeNull();
  });

  it('is total over NAVIGABLE_TYPES (CommandCenter.tsx:66-68) — no throw on any of them', () => {
    const navigableTypes = ['workspace', 'memory', 'session', 'person', 'command'];
    for (const type of navigableTypes) {
      expect(() => routeForSearchResult(type, `${type}:x`)).not.toThrow();
    }
  });

  it('unknown result types are a no-op', () => {
    expect(routeForSearchResult('artifact', 'artifact:a-1')).toBeNull();
    expect(routeForSearchResult('', '')).toBeNull();
  });
});

describe('queryString — §2.3 deep-link carrier', () => {
  it('returns an empty string for empty params', () => {
    expect(queryString({})).toBe('');
  });

  it('serializes tab + automationId (Journey 16 payload)', () => {
    expect(queryString({ tab: 'logs' })).toBe('?tab=logs');
    expect(queryString({ tab: 'logs', automationId: 'auto-1' })).toBe('?tab=logs&automationId=auto-1');
  });

  it('URL-encodes values', () => {
    expect(queryString({ automationId: 'a b' })).toBe('?automationId=a+b');
  });

  it('serializes the reserved session param (§1.1 /workspaces row)', () => {
    expect(queryString({ session: 'sess-1' })).toBe('?session=sess-1');
  });

  it('serializes the filter param (P2/J08 — Memory Center needs-review deep link)', () => {
    expect(queryString({ filter: 'unreviewed' })).toBe('?filter=unreviewed');
    expect(queryString({ tab: 'memories', filter: 'unreviewed' })).toBe('?tab=memories&filter=unreviewed');
  });
});

describe('matchNavRoute — §2.1.2 active-state prefix match', () => {
  const navRoutes = ['/home', '/workspaces', '/memory', '/settings', '/settings/vault', '/settings/usage'];

  it('matches exact routes', () => {
    expect(matchNavRoute('/memory', navRoutes)).toBe('/memory');
  });

  it('matches by path prefix (chat tab under the /workspaces family)', () => {
    expect(matchNavRoute('/workspaces/ws-1/chat', navRoutes)).toBe('/workspaces');
  });

  it('longest prefix wins — /settings/vault activates Vault, not Settings', () => {
    expect(matchNavRoute('/settings/vault', navRoutes)).toBe('/settings/vault');
    expect(matchNavRoute('/settings', navRoutes)).toBe('/settings');
    // Nested System surface with no nav entry of its own falls back to /settings.
    expect(matchNavRoute('/settings/profile', navRoutes)).toBe('/settings');
  });

  it('does not match on partial segment names', () => {
    expect(matchNavRoute('/memoryx', navRoutes)).toBeNull();
  });

  it('returns null when nothing matches', () => {
    expect(matchNavRoute('/nowhere', navRoutes)).toBeNull();
  });
});

describe('dock-tiers route field — §1.3 invariant', () => {
  function flattenAppEntries(entries: DockEntry[]): DockEntry[] {
    const out: DockEntry[] = [];
    for (const e of entries) {
      if (e.type === 'app') out.push(e);
      if (e.type === 'zone-parent' && e.children) {
        out.push(...e.children.filter(c => c.type === 'app'));
      }
    }
    return out;
  }

  it('every app entry in every UI tier carries a route that agrees with routeFor', () => {
    for (const tier of ['simple', 'professional', 'power', 'admin'] as const) {
      for (const entry of flattenAppEntries(TIER_DOCK_CONFIG[tier])) {
        expect(entry.route, `${tier}/${entry.key} missing route`).toBeTruthy();
        if (entry.appId === 'chat') {
          // Parameterized: the field carries the prefix family for active-state
          // matching; clicks resolve through routeFor('chat', ctx) (§2.3).
          expect(entry.route).toBe('/workspaces');
        } else {
          expect(entry.route, `${tier}/${entry.key}`).toBe(routeFor(entry.appId!));
        }
      }
    }
  });

  it('billing-tier filtering still applies to nav data (Approvals/Team hidden below TEAMS — D5)', () => {
    const free = flattenAppEntries(getDockForTier('power', 'FREE'));
    const teams = flattenAppEntries(getDockForTier('power', 'TEAMS'));
    expect(free.some(e => e.appId === 'approvals')).toBe(false);
    expect(free.some(e => e.appId === 'governance')).toBe(false);
    expect(teams.some(e => e.appId === 'approvals')).toBe(true);
    expect(teams.some(e => e.appId === 'governance')).toBe(true);
  });

  it('APP_ROUTES has no entry for the parameterized ids (function-not-record, §2.3)', () => {
    expect('chat' in APP_ROUTES).toBe(false);
    expect('workspace-desktop' in APP_ROUTES).toBe(false);
  });
});
