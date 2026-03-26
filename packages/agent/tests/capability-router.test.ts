import { describe, it, expect } from 'vitest';
import { CapabilityRouter, type CapabilityRouterDeps } from '../src/capability-router.js';

function makeDeps(overrides: Partial<CapabilityRouterDeps> = {}): CapabilityRouterDeps {
  return {
    toolNames: [],
    skills: [],
    plugins: [],
    mcpServers: [],
    subAgentRoles: [],
    ...overrides,
  };
}

describe('CapabilityRouter', () => {
  it('returns native tool on exact name match', () => {
    const router = new CapabilityRouter(makeDeps({ toolNames: ['save_memory', 'search_memory'] }));
    const routes = router.resolve('save_memory');
    expect(routes[0]).toMatchObject({
      source: 'native',
      name: 'save_memory',
      confidence: 1.0,
      available: true,
    });
  });

  it('returns native tool for partial name match (query "memory" matches "search_memory")', () => {
    const router = new CapabilityRouter(makeDeps({ toolNames: ['search_memory', 'read_file'] }));
    const routes = router.resolve('memory');
    expect(routes.length).toBeGreaterThanOrEqual(1);
    expect(routes[0]).toMatchObject({
      source: 'native',
      name: 'search_memory',
      confidence: 0.8,
    });
  });

  it('returns skill match when skill name matches query', () => {
    const router = new CapabilityRouter(makeDeps({
      skills: [{ name: 'summarize', content: 'Creates summaries of text' }],
    }));
    const routes = router.resolve('summarize');
    expect(routes[0]).toMatchObject({
      source: 'skill',
      name: 'summarize',
      confidence: 0.7,
    });
  });

  it('returns skill match when skill content matches query', () => {
    const router = new CapabilityRouter(makeDeps({
      skills: [{ name: 'my-skill', content: 'Generates diagrams from text descriptions' }],
    }));
    const routes = router.resolve('diagrams');
    expect(routes[0]).toMatchObject({
      source: 'skill',
      name: 'my-skill',
      confidence: 0.5,
    });
  });

  it('returns plugin match when plugin description matches', () => {
    const router = new CapabilityRouter(makeDeps({
      plugins: [{ name: 'chart-plugin', description: 'Creates charts and visualizations' }],
    }));
    const routes = router.resolve('charts');
    expect(routes[0]).toMatchObject({
      source: 'plugin',
      name: 'chart-plugin',
      confidence: 0.6,
    });
  });

  it('returns MCP server match when server name matches', () => {
    const router = new CapabilityRouter(makeDeps({
      mcpServers: ['github-mcp', 'slack-mcp'],
    }));
    const routes = router.resolve('github');
    expect(routes[0]).toMatchObject({
      source: 'mcp',
      name: 'github-mcp',
      confidence: 0.45,
    });
  });

  it('returns sub-agent match for role keywords ("research" → researcher)', () => {
    const router = new CapabilityRouter(makeDeps({
      subAgentRoles: ['researcher', 'writer', 'coder'],
    }));
    const routes = router.resolve('research');
    expect(routes[0]).toMatchObject({
      source: 'subagent',
      name: 'researcher',
      confidence: 0.4,
    });
  });

  it('returns sub-agent match for "write" → writer', () => {
    const router = new CapabilityRouter(makeDeps({
      subAgentRoles: ['writer'],
    }));
    const routes = router.resolve('write');
    expect(routes[0]).toMatchObject({
      source: 'subagent',
      name: 'writer',
    });
  });

  it('returns missing with suggestion when nothing matches', () => {
    const router = new CapabilityRouter(makeDeps());
    const routes = router.resolve('quantum_entangle');
    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({
      source: 'missing',
      name: 'quantum_entangle',
      confidence: 0,
      available: false,
    });
    expect(routes[0].suggestion).toBeTruthy();
  });

  it('routes are sorted by confidence (native > skill > plugin > mcp > subagent)', () => {
    const router = new CapabilityRouter(makeDeps({
      toolNames: ['research_tool'],
      skills: [{ name: 'research-skill', content: 'Does research' }],
      plugins: [{ name: 'research-plugin', description: 'Research helper' }],
      mcpServers: ['research-mcp'],
      subAgentRoles: ['researcher'],
    }));
    const routes = router.resolve('research');
    const sources = routes.map(r => r.source);
    // Native partial match (0.8) > skill name match (0.7) > plugin (0.6) > mcp (0.45) > subagent (0.4)
    expect(sources).toEqual(['native', 'skill', 'plugin', 'mcp', 'subagent']);
  });

  it('handles empty deps gracefully', () => {
    const router = new CapabilityRouter(makeDeps());
    const routes = router.resolve('anything');
    expect(routes).toHaveLength(1);
    expect(routes[0].source).toBe('missing');
  });

  it('is case-insensitive', () => {
    const router = new CapabilityRouter(makeDeps({ toolNames: ['Search_Memory'] }));
    const routes = router.resolve('search_memory');
    expect(routes[0]).toMatchObject({ source: 'native', confidence: 1.0 });
  });
});
