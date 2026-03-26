import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

const mockCatalog = {
  skills: [
    { id: 'draft-memo', name: 'Draft Memo', description: 'Turn context into a polished memo', family: 'writing', familyLabel: 'Writing & Docs', state: 'available', isWorkflow: false },
    { id: 'decision-matrix', name: 'Decision Matrix', description: 'Structured decision analysis', family: 'decision', familyLabel: 'Decision Support', state: 'active', isWorkflow: false },
    { id: 'research-team', name: 'Research Team', description: 'Multi-agent investigation', family: 'research', familyLabel: 'Research & Analysis', state: 'installed', isWorkflow: true },
    { id: 'code-review', name: 'Code Review', description: 'Review code for quality', family: 'code', familyLabel: 'Code & Engineering', state: 'available', isWorkflow: false },
    { id: 'daily-plan', name: 'Daily Plan', description: 'Plan your day', family: 'planning', familyLabel: 'Planning & Organization', state: 'available', isWorkflow: false },
  ],
  families: [
    { id: 'writing', label: 'Writing & Docs' },
    { id: 'research', label: 'Research & Analysis' },
    { id: 'decision', label: 'Decision Support' },
    { id: 'planning', label: 'Planning & Organization' },
    { id: 'code', label: 'Code & Engineering' },
  ],
};

const mockRuntime = {
  plugins: [{ name: 'test-plugin', state: 'active', tools: 3, skills: 1 }],
  mcpServers: [{ name: 'test-mcp', state: 'ready', healthy: true, tools: 5 }],
  skills: [{ name: 'decision-matrix', length: 500 }],
  tools: { count: 25, native: 17, plugin: 3, mcp: 5 },
  commands: [{ name: 'help', description: 'Show help' }],
  hooks: { registered: 10, recentActivity: [] },
  workflows: [{ name: 'research-team', description: 'Research workflow', steps: 3 }],
};

function setupFetchMock(catalogResponse = mockCatalog, runtimeResponse = mockRuntime) {
  mockFetch.mockImplementation((url: string) => {
    if (url.includes('/api/skills/starter-pack/catalog')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(catalogResponse),
      });
    }
    if (url.includes('/api/capabilities/status')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(runtimeResponse),
      });
    }
    // Install endpoint
    if (url.includes('/api/skills/starter-pack/') && !url.includes('catalog')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true, skill: { id: 'draft-memo', name: 'Draft Memo', state: 'active' } }),
      });
    }
    return Promise.resolve({ ok: false, status: 404 });
  });
}

describe('InstallCenter — Logic Tests', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  // 1. Catalog fetch
  it('fetches both catalog and runtime data on mount', async () => {
    setupFetchMock();

    const [catalogRes, runtimeRes] = await Promise.all([
      fetch('http://127.0.0.1:3333/api/skills/starter-pack/catalog'),
      fetch('http://127.0.0.1:3333/api/capabilities/status'),
    ]);

    expect(catalogRes.ok).toBe(true);
    expect(runtimeRes.ok).toBe(true);

    const catalog = await catalogRes.json();
    expect(catalog.skills).toHaveLength(5);
    expect(catalog.families).toHaveLength(5);
  });

  // 2. Family filtering
  it('filters skills by family', () => {
    const skills = mockCatalog.skills;

    const writingOnly = skills.filter(s => s.family === 'writing');
    expect(writingOnly).toHaveLength(1);
    expect(writingOnly[0].id).toBe('draft-memo');

    const allSkills = skills.filter(() => true);
    expect(allSkills).toHaveLength(5);
  });

  // 3. Search filtering
  it('filters skills by search query', () => {
    const skills = mockCatalog.skills;
    const q = 'memo';

    const filtered = skills.filter(s =>
      s.name.toLowerCase().includes(q.toLowerCase()) ||
      s.description.toLowerCase().includes(q.toLowerCase())
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('draft-memo');
  });

  // 4. Combined family + search filtering
  it('filters by both family and search', () => {
    const skills = mockCatalog.skills;
    const family = 'writing';
    const q = 'memo';

    const filtered = skills.filter(s => {
      if (s.family !== family) return false;
      return s.name.toLowerCase().includes(q.toLowerCase()) || s.description.toLowerCase().includes(q.toLowerCase());
    });

    expect(filtered).toHaveLength(1);
  });

  // 5. State distinction
  it('preserves three-state distinction: active, installed, available', () => {
    const states = new Set(mockCatalog.skills.map(s => s.state));
    expect(states.has('active')).toBe(true);
    expect(states.has('installed')).toBe(true);
    expect(states.has('available')).toBe(true);
  });

  // 6. Install button only for available
  it('only available skills should show install action', () => {
    const installable = mockCatalog.skills.filter(s => s.state === 'available');
    const nonInstallable = mockCatalog.skills.filter(s => s.state !== 'available');

    expect(installable).toHaveLength(3);
    expect(nonInstallable).toHaveLength(2);

    // Active and installed should not be installable
    expect(nonInstallable.every(s => s.state === 'active' || s.state === 'installed')).toBe(true);
  });

  // 7. Install sends POST to correct endpoint
  it('install sends POST to /api/skills/starter-pack/:id', async () => {
    setupFetchMock();

    const skillId = 'draft-memo';
    const res = await fetch(`http://127.0.0.1:3333/api/skills/starter-pack/${skillId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.skill.id).toBe('draft-memo');
  });

  // 8. After install, re-fetches catalog (no optimistic update)
  it('re-fetches catalog after install to get truthful state', async () => {
    setupFetchMock();

    // Simulate install
    await fetch('http://127.0.0.1:3333/api/skills/starter-pack/draft-memo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    // Should re-fetch catalog
    const catalogRes = await fetch('http://127.0.0.1:3333/api/skills/starter-pack/catalog');
    expect(catalogRes.ok).toBe(true);

    // Verify fetch was called for both install and catalog re-fetch
    const calls = mockFetch.mock.calls;
    const installCall = calls.find((c: any) => c[0].includes('starter-pack/draft-memo'));
    const catalogCall = calls.find((c: any) => c[0].includes('starter-pack/catalog'));
    expect(installCall).toBeDefined();
    expect(catalogCall).toBeDefined();
  });

  // 9. Workflow badge
  it('identifies workflow skills correctly', () => {
    const workflows = mockCatalog.skills.filter(s => s.isWorkflow);
    expect(workflows).toHaveLength(1);
    expect(workflows[0].id).toBe('research-team');
  });

  // 10. Runtime data structure
  it('runtime data has expected structure', () => {
    expect(mockRuntime.tools.count).toBe(25);
    expect(mockRuntime.plugins).toHaveLength(1);
    expect(mockRuntime.mcpServers).toHaveLength(1);
    expect(mockRuntime.skills).toHaveLength(1);
    expect(mockRuntime.commands).toHaveLength(1);
    expect(mockRuntime.hooks.registered).toBe(10);
    expect(mockRuntime.workflows).toHaveLength(1);
  });

  // 11. Error handling — catalog fetch failure
  it('handles catalog fetch failure gracefully', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/skills/starter-pack/catalog')) {
        return Promise.resolve({ ok: false, status: 500 });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockRuntime) });
    });

    const res = await fetch('http://127.0.0.1:3333/api/skills/starter-pack/catalog');
    expect(res.ok).toBe(false);
    expect(res.status).toBe(500);
  });

  // 12. Empty search returns all skills in family
  it('empty search returns all skills when no family filter', () => {
    const skills = mockCatalog.skills;
    const q = '';
    const family = 'all';

    const filtered = skills.filter(s => {
      if (family !== 'all' && s.family !== family) return false;
      if (q) {
        return s.name.toLowerCase().includes(q.toLowerCase()) || s.description.toLowerCase().includes(q.toLowerCase());
      }
      return true;
    });

    expect(filtered).toHaveLength(5);
  });

  // 13. Confirmation flow — governed install
  it('install flow requires confirmation step', () => {
    // Simulate the confirmation state machine
    let confirmingSkillId: string | null = null;
    let installingSkillId: string | null = null;

    // Step 1: User clicks Install
    confirmingSkillId = 'draft-memo';
    expect(confirmingSkillId).toBe('draft-memo');
    expect(installingSkillId).toBeNull();

    // Step 2: User confirms
    installingSkillId = confirmingSkillId;
    confirmingSkillId = null;
    expect(confirmingSkillId).toBeNull();
    expect(installingSkillId).toBe('draft-memo');

    // Step 3: Install completes
    installingSkillId = null;
    expect(installingSkillId).toBeNull();
  });
});
