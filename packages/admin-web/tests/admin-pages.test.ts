// @vitest-environment jsdom
/**
 * Admin web — comprehensive page component and API module tests.
 *
 * Tests module exports, API client methods, URL construction,
 * and rendering of each page component in various states.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { App } from '../src/App.js';
import { Dashboard } from '../src/pages/Dashboard.js';
import { Members } from '../src/pages/Members.js';
import { Capabilities } from '../src/pages/Capabilities.js';
import { Jobs } from '../src/pages/Jobs.js';
import { Audit } from '../src/pages/Audit.js';
import { TeamSettings } from '../src/pages/TeamSettings.js';
import { Analytics } from '../src/pages/Analytics.js';
import { api } from '../src/api.js';

// ─── API Client Tests ──────────────────────────────────────────────────

describe('API client', () => {
  it('exports team management methods', () => {
    expect(typeof api.listTeams).toBe('function');
    expect(typeof api.getTeam).toBe('function');
    expect(typeof api.updateTeam).toBe('function');
    expect(typeof api.inviteMember).toBe('function');
    expect(typeof api.removeMember).toBe('function');
    expect(typeof api.updateMemberRole).toBe('function');
  });

  it('exports job and audit methods', () => {
    expect(typeof api.listJobs).toBe('function');
    expect(typeof api.listCron).toBe('function');
    expect(typeof api.listAudit).toBe('function');
    expect(typeof api.getStats).toBe('function');
  });

  it('exports analytics method', () => {
    expect(typeof api.getAnalytics).toBe('function');
  });

  it('exports task management method', () => {
    expect(typeof api.listTasks).toBe('function');
  });

  it('exports capability governance methods', () => {
    expect(typeof api.listCapabilityPolicies).toBe('function');
    expect(typeof api.updateCapabilityPolicy).toBe('function');
    expect(typeof api.listCapabilityOverrides).toBe('function');
    expect(typeof api.createCapabilityOverride).toBe('function');
    expect(typeof api.deleteCapabilityOverride).toBe('function');
    expect(typeof api.listCapabilityRequests).toBe('function');
    expect(typeof api.decideCapabilityRequest).toBe('function');
  });

  it('exports scout and suggestions methods', () => {
    expect(typeof api.listScoutFindings).toBe('function');
    expect(typeof api.listSuggestions).toBe('function');
  });
});

// ─── Page Module Export Tests ──────────────────────────────────────────

describe('Admin page module exports', () => {
  it('Dashboard is a function component', () => {
    expect(typeof Dashboard).toBe('function');
  });

  it('Members is a function component', () => {
    expect(typeof Members).toBe('function');
  });

  it('Capabilities is a function component', () => {
    expect(typeof Capabilities).toBe('function');
  });

  it('Jobs is a function component', () => {
    expect(typeof Jobs).toBe('function');
  });

  it('Audit is a function component', () => {
    expect(typeof Audit).toBe('function');
  });

  it('TeamSettings is a function component', () => {
    expect(typeof TeamSettings).toBe('function');
  });

  it('Analytics is a function component', () => {
    expect(typeof Analytics).toBe('function');
  });

  it('App root is a function component', () => {
    expect(typeof App).toBe('function');
  });
});

// ─── Rendering Tests ───────────────────────────────────────────────────

// Mock fetch globally for all rendering tests
function mockFetch(responses: Record<string, unknown>) {
  // Sort patterns longest-first so more specific URLs match before shorter ones
  const sortedPatterns = Object.entries(responses).sort(
    ([a], [b]) => b.length - a.length,
  );
  const mock = vi.fn(async (url: string, _opts?: RequestInit) => {
    // Match URL patterns (longest match first)
    for (const [pattern, data] of sortedPatterns) {
      if (url.includes(pattern)) {
        return {
          ok: true,
          status: 200,
          json: async () => data,
          text: async () => JSON.stringify(data),
        };
      }
    }
    // Default: 404
    return {
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({}),
      text: async () => 'Not Found',
    };
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

describe('App root component', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the Waggle Admin title', () => {
    const { container } = render(React.createElement(App));
    expect(container.textContent).toContain('Waggle Admin');
  });

  it('shows connect prompt when no token/slug entered', () => {
    render(React.createElement(App));
    expect(screen.getByText('Connect to a Team')).toBeDefined();
  });

  it('renders all navigation items', () => {
    render(React.createElement(App));
    expect(screen.getByText('Dashboard')).toBeDefined();
    expect(screen.getByText('Analytics')).toBeDefined();
    expect(screen.getByText('Members')).toBeDefined();
    expect(screen.getByText('Capabilities')).toBeDefined();
    expect(screen.getByText('Jobs')).toBeDefined();
    expect(screen.getByText('Audit Log')).toBeDefined();
    expect(screen.getByText('Team Settings')).toBeDefined();
  });
});

describe('Dashboard page', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading state initially', () => {
    mockFetch({});
    render(React.createElement(Dashboard, { token: 'tok', teamSlug: 'test' }));
    expect(screen.getByText('Loading dashboard...')).toBeDefined();
  });

  it('renders team name and stat cards after data loads', async () => {
    mockFetch({
      '/api/teams/test': {
        id: 't1', name: 'Test Team', slug: 'test', ownerId: 'u1', createdAt: '2025-01-01',
        members: [
          { userId: 'u1', displayName: 'Alice', role: 'owner' },
          { userId: 'u2', displayName: 'Bob', role: 'member' },
        ],
      },
      '/api/teams/test/tasks': [
        { id: 'task1', teamId: 't1', title: 'Fix bug', status: 'open', priority: 'high', createdBy: 'u1', createdAt: '2025-01-10', updatedAt: '2025-01-10' },
        { id: 'task2', teamId: 't1', title: 'Write docs', status: 'completed', priority: 'medium', createdBy: 'u2', createdAt: '2025-01-11', updatedAt: '2025-01-11' },
      ],
    });

    render(React.createElement(Dashboard, { token: 'tok', teamSlug: 'test' }));

    await waitFor(() => {
      expect(screen.getByText('Test Team Dashboard')).toBeDefined();
    });

    // Stat cards exist with correct labels
    expect(screen.getByText('Members')).toBeDefined();
    expect(screen.getByText('Active Tasks')).toBeDefined();
    expect(screen.getByText('Total Tasks')).toBeDefined();
    expect(screen.getByText('Team Slug')).toBeDefined();
    // Member count '2' appears in stat card (may also appear in task count area)
    expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1);

    // Team members section
    expect(screen.getByText('Alice')).toBeDefined();
    expect(screen.getByText('Bob')).toBeDefined();

    // Recent tasks
    expect(screen.getByText('Fix bug')).toBeDefined();
    expect(screen.getByText('Write docs')).toBeDefined();
  });

  it('shows error message when both API calls fail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({}),
      text: async () => 'Internal Server Error',
    })));

    render(React.createElement(Dashboard, { token: 'tok', teamSlug: 'test' }));

    await waitFor(() => {
      expect(screen.getByText(/Could not connect to team server/)).toBeDefined();
    });
  });
});

describe('Members page', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders heading and invite form', async () => {
    mockFetch({
      '/api/teams/test': {
        id: 't1', name: 'Test Team', slug: 'test', ownerId: 'u1', createdAt: '2025-01-01',
        members: [
          { userId: 'u1', displayName: 'Alice', role: 'owner', email: 'alice@test.com' },
        ],
      },
    });

    render(React.createElement(Members, { token: 'tok', teamSlug: 'test' }));

    expect(screen.getByText('Team Members')).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeDefined();
    });

    // Owner should have a badge, not a select
    expect(screen.getByText('Owner')).toBeDefined();

    // Invite form elements
    expect(screen.getByPlaceholderText('user@example.com')).toBeDefined();
    expect(screen.getByText('Invite')).toBeDefined();
  });

  it('shows empty state when no members', async () => {
    mockFetch({
      '/api/teams/test': {
        id: 't1', name: 'Test Team', slug: 'test', ownerId: 'u1', createdAt: '2025-01-01',
        members: [],
      },
    });

    render(React.createElement(Members, { token: 'tok', teamSlug: 'test' }));

    await waitFor(() => {
      expect(screen.getByText(/No members found/)).toBeDefined();
    });
  });
});

describe('Jobs page', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading state', () => {
    mockFetch({});
    render(React.createElement(Jobs, { token: 'tok', teamSlug: 'test' }));
    expect(screen.getByText('Loading jobs...')).toBeDefined();
  });

  it('renders job list after loading', async () => {
    mockFetch({
      '/api/jobs': [
        {
          id: 'job-abc12345-long-id',
          teamId: 't1', userId: 'u1', jobType: 'agent_task',
          status: 'completed', input: {}, output: {},
          createdAt: '2025-01-10T12:00:00Z', completedAt: '2025-01-10T12:05:00Z',
        },
        {
          id: 'job-def67890-long-id',
          teamId: 't1', userId: 'u1', jobType: 'research',
          status: 'running', input: {},
          createdAt: '2025-01-11T10:00:00Z',
        },
      ],
    });

    render(React.createElement(Jobs, { token: 'tok', teamSlug: 'test' }));

    await waitFor(() => {
      expect(screen.getByText('agent_task')).toBeDefined();
    });
    expect(screen.getByText('completed')).toBeDefined();
    expect(screen.getByText('running')).toBeDefined();
    expect(screen.getByText('research')).toBeDefined();
  });

  it('shows empty state when no jobs', async () => {
    mockFetch({ '/api/jobs': [] });

    render(React.createElement(Jobs, { token: 'tok', teamSlug: 'test' }));

    await waitFor(() => {
      expect(screen.getByText('No jobs found')).toBeDefined();
    });
  });
});

describe('Audit page', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading state', () => {
    mockFetch({});
    render(React.createElement(Audit, { token: 'tok', teamSlug: 'test' }));
    expect(screen.getByText('Loading audit log...')).toBeDefined();
  });

  it('renders audit entries after loading', async () => {
    mockFetch({
      '/api/admin/teams/test/audit': [
        {
          id: 'a1', userId: 'u1', agentName: 'waggle-1', actionType: 'tool_use',
          description: 'Executed shell command', requiresApproval: true, approved: true,
          createdAt: '2025-01-10T10:00:00Z',
        },
        {
          id: 'a2', userId: 'u1', agentName: 'waggle-1', actionType: 'memory_write',
          description: 'Stored project context', requiresApproval: false,
          createdAt: '2025-01-10T11:00:00Z',
        },
      ],
    });

    render(React.createElement(Audit, { token: 'tok', teamSlug: 'test' }));

    await waitFor(() => {
      expect(screen.getByText('tool_use')).toBeDefined();
    });
    expect(screen.getByText('memory_write')).toBeDefined();
    expect(screen.getByText('Approved')).toBeDefined();
  });

  it('shows empty state when no audit entries', async () => {
    mockFetch({ '/api/admin/teams/test/audit': [] });

    render(React.createElement(Audit, { token: 'tok', teamSlug: 'test' }));

    await waitFor(() => {
      expect(screen.getByText('No audit entries')).toBeDefined();
    });
  });
});

describe('TeamSettings page', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading state', () => {
    mockFetch({});
    render(React.createElement(TeamSettings, { token: 'tok', teamSlug: 'test' }));
    expect(screen.getByText('Loading team settings...')).toBeDefined();
  });

  it('renders team info after loading', async () => {
    mockFetch({
      '/api/teams/test': {
        id: 'team-uuid-123', name: 'Test Team', slug: 'test', ownerId: 'u1', createdAt: '2025-01-01T00:00:00Z',
      },
    });

    render(React.createElement(TeamSettings, { token: 'tok', teamSlug: 'test' }));

    await waitFor(() => {
      expect(screen.getByDisplayValue('Test Team')).toBeDefined();
    });

    // Slug display
    expect(screen.getByText('test')).toBeDefined();
    // Team ID display
    expect(screen.getByText('team-uuid-123')).toBeDefined();
    // Labels
    expect(screen.getByText('Team Name')).toBeDefined();
    expect(screen.getByText('Slug')).toBeDefined();
    expect(screen.getByText('Team ID')).toBeDefined();
    expect(screen.getByText('Created')).toBeDefined();
  });

  it('save button is disabled when name unchanged', async () => {
    mockFetch({
      '/api/teams/test': {
        id: 't1', name: 'Test Team', slug: 'test', ownerId: 'u1', createdAt: '2025-01-01',
      },
    });

    render(React.createElement(TeamSettings, { token: 'tok', teamSlug: 'test' }));

    await waitFor(() => {
      expect(screen.getByDisplayValue('Test Team')).toBeDefined();
    });

    const saveButton = screen.getByText('Save') as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
  });
});

describe('Capabilities page', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders heading and tab bar', () => {
    mockFetch({
      '/api/teams/test/capability-policies': [],
    });

    render(React.createElement(Capabilities, { token: 'tok', teamSlug: 'test' }));

    expect(screen.getByText('Capabilities')).toBeDefined();
    expect(screen.getByText('Role Policies')).toBeDefined();
    expect(screen.getByText('Overrides')).toBeDefined();
    expect(screen.getByText('Requests')).toBeDefined();
  });
});

describe('Analytics page', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading state', () => {
    mockFetch({});
    render(React.createElement(Analytics, { token: 'tok', teamSlug: 'test' }));
    expect(screen.getByText('Loading analytics...')).toBeDefined();
  });

  it('renders analytics cards after data loads', async () => {
    mockFetch({
      '/api/admin/teams/test/analytics': {
        activeUsers: { daily: 7, weekly: 19, monthly: 42 },
        tokenUsage: {
          total: 1500000,
          byUser: [
            { userId: 'u1', name: 'Alice', tokens: 800000, cost: 4.50 },
            { userId: 'u2', name: 'Bob', tokens: 700000, cost: 3.20 },
          ],
        },
        topTools: [
          { name: 'memory_search', invocations: 150 },
          { name: 'shell_exec', invocations: 80 },
        ],
        topCommands: [
          { name: '/research', count: 45 },
          { name: '/draft', count: 30 },
        ],
        capabilityGaps: [
          { tool: 'browser_navigate', requestCount: 9, suggestion: 'Install browser skill' },
        ],
        performanceTrends: {
          correctionRate: 0.15,
          correctionTrend: -0.03,
          avgResponseTime: 8.5,
        },
      },
    });

    render(React.createElement(Analytics, { token: 'tok', teamSlug: 'test' }));

    await waitFor(() => {
      expect(screen.getByText('Usage Analytics')).toBeDefined();
    });

    // Active users section
    expect(screen.getByText('Active Users')).toBeDefined();
    expect(screen.getByText('7')).toBeDefined(); // daily
    expect(screen.getByText('19')).toBeDefined(); // weekly
    expect(screen.getByText('42')).toBeDefined(); // monthly

    // Token usage
    expect(screen.getByText('Token Usage')).toBeDefined();
    expect(screen.getByText('1.5M tokens')).toBeDefined();
    expect(screen.getByText('Alice')).toBeDefined();
    expect(screen.getByText('Bob')).toBeDefined();

    // Top tools
    expect(screen.getByText('Top Tools')).toBeDefined();
    expect(screen.getByText('memory_search')).toBeDefined();
    expect(screen.getByText('shell_exec')).toBeDefined();

    // Top commands
    expect(screen.getByText('Top Commands')).toBeDefined();
    expect(screen.getByText('/research')).toBeDefined();
    expect(screen.getByText('/draft')).toBeDefined();

    // Capability gaps
    expect(screen.getByText('Capability Gaps')).toBeDefined();
    expect(screen.getByText('browser_navigate')).toBeDefined();

    // Performance trends
    expect(screen.getByText('Performance Trends')).toBeDefined();
    expect(screen.getByText('15.0%')).toBeDefined(); // correction rate
    expect(screen.getByText('8.5s')).toBeDefined(); // avg response time
  });

  it('shows error when analytics API fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      json: async () => ({}),
      text: async () => 'Server Error',
    })));

    render(React.createElement(Analytics, { token: 'tok', teamSlug: 'test' }));

    await waitFor(() => {
      expect(screen.getByText(/API error: 500/)).toBeDefined();
    });
  });
});
