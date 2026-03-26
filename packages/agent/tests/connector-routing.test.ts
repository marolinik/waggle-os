import { describe, it, expect } from 'vitest';
import { CapabilityRouter, type CapabilityRouterDeps } from '../src/capability-router.js';

function createDeps(overrides?: Partial<CapabilityRouterDeps>): CapabilityRouterDeps {
  return {
    toolNames: ['search_memory', 'save_memory', 'bash'],
    skills: [{ name: 'research-workflow', content: 'research and investigate topics' }],
    plugins: [],
    mcpServers: [],
    subAgentRoles: ['researcher', 'writer'],
    connectors: [
      { id: 'github', name: 'GitHub', service: 'github.com', connected: true, actions: ['list_repos', 'create_issue', 'list_prs'] },
      { id: 'slack', name: 'Slack', service: 'slack.com', connected: true, actions: ['send_message', 'list_channels'] },
      { id: 'jira', name: 'Jira', service: 'atlassian.net', connected: false, actions: ['create_issue', 'list_issues'] },
      { id: 'email', name: 'Email (SendGrid)', service: 'sendgrid.com', connected: true, actions: ['send_email'] },
    ],
    ...overrides,
  };
}

describe('Connector routing in CapabilityRouter', () => {
  it('resolve("jira") returns connector source when jira is registered', () => {
    const router = new CapabilityRouter(createDeps());
    const routes = router.resolve('jira');
    const connectorRoute = routes.find(r => r.source === 'connector');

    expect(connectorRoute).toBeDefined();
    expect(connectorRoute!.name).toBe('jira');
    expect(connectorRoute!.confidence).toBe(0.75);
    expect(connectorRoute!.available).toBe(false); // Jira is disconnected
    expect(connectorRoute!.suggestion).toContain('not connected');
  });

  it('resolve("github") returns connector with available=true when connected', () => {
    const router = new CapabilityRouter(createDeps());
    const routes = router.resolve('github');
    const connectorRoute = routes.find(r => r.source === 'connector');

    expect(connectorRoute).toBeDefined();
    expect(connectorRoute!.available).toBe(true);
    expect(connectorRoute!.suggestion).toBeUndefined();
  });

  it('resolve("create github issue") matches via action name', () => {
    const router = new CapabilityRouter(createDeps());
    const routes = router.resolve('create issue');
    // Both GitHub and Jira have "create_issue" action
    const connectorRoutes = routes.filter(r => r.source === 'connector');
    expect(connectorRoutes.length).toBeGreaterThanOrEqual(2);
    expect(connectorRoutes.some(r => r.name === 'github')).toBe(true);
    expect(connectorRoutes.some(r => r.name === 'jira')).toBe(true);
  });

  it('resolve("send email") returns email connector', () => {
    const router = new CapabilityRouter(createDeps());
    const routes = router.resolve('send email');
    const emailRoute = routes.find(r => r.source === 'connector' && r.name === 'email');
    expect(emailRoute).toBeDefined();
    expect(emailRoute!.available).toBe(true);
  });

  it('connector routes rank at 0.75 between native (0.8-1.0) and skill (0.5-0.7)', () => {
    const router = new CapabilityRouter(createDeps());
    const routes = router.resolve('slack');
    const connectorRoute = routes.find(r => r.source === 'connector');
    expect(connectorRoute!.confidence).toBe(0.75);

    // Verify ordering: native first (if any), then connector, then skill
    const nativeIdx = routes.findIndex(r => r.source === 'native');
    const connectorIdx = routes.findIndex(r => r.source === 'connector');
    if (nativeIdx >= 0) {
      expect(routes[nativeIdx].confidence).toBeGreaterThanOrEqual(0.75);
    }
    // Connector should come before skill-level entries
    const skillIdx = routes.findIndex(r => r.source === 'skill');
    if (skillIdx >= 0 && connectorIdx >= 0) {
      expect(connectorIdx).toBeLessThan(skillIdx);
    }
  });

  it('works with no connectors (backward compatible)', () => {
    const router = new CapabilityRouter(createDeps({ connectors: undefined }));
    const routes = router.resolve('github');
    const connectorRoutes = routes.filter(r => r.source === 'connector');
    expect(connectorRoutes).toHaveLength(0);
  });

  it('missing route suggestion mentions connectors', () => {
    const router = new CapabilityRouter(createDeps({ connectors: [] }));
    const routes = router.resolve('xyznonexistent');
    const missing = routes.find(r => r.source === 'missing');
    expect(missing).toBeDefined();
    expect(missing!.suggestion).toContain('Connectors');
  });
});
