import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CommandRegistry, type CommandContext } from '../src/commands/command-registry.js';
import { registerMarketplaceCommands } from '../src/commands/marketplace-commands.js';

function mockContext(): CommandContext {
  return {
    workspaceId: 'test-ws',
    sessionId: 'test-session',
  };
}

describe('Marketplace Commands', () => {
  let registry: CommandRegistry;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    registry = new CommandRegistry();
    registerMarketplaceCommands(registry);
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // ── Registration ──────────────────────────────────────────────────────

  it('registers the marketplace command', () => {
    const cmd = registry.get('marketplace');
    expect(cmd).toBeDefined();
    expect(cmd!.name).toBe('marketplace');
  });

  it('resolves alias "mp"', () => {
    const cmd = registry.get('mp');
    expect(cmd).toBeDefined();
    expect(cmd!.name).toBe('marketplace');
  });

  it('resolves alias "market"', () => {
    const cmd = registry.get('market');
    expect(cmd).toBeDefined();
    expect(cmd!.name).toBe('marketplace');
  });

  // ── Help (no sub-command) ─────────────────────────────────────────────

  it('/marketplace with no args shows help', async () => {
    const ctx = mockContext();
    const result = await registry.execute('/marketplace', ctx);

    expect(result).toContain('Marketplace Commands');
    expect(result).toContain('search');
    expect(result).toContain('install');
    expect(result).toContain('packs');
    expect(result).toContain('installed');
    expect(result).toContain('sync');
  });

  // ── Unknown sub-command ───────────────────────────────────────────────

  it('/marketplace unknown-cmd shows sub-command help', async () => {
    const ctx = mockContext();
    const result = await registry.execute('/marketplace foobar', ctx);

    expect(result).toContain('Unknown sub-command');
    expect(result).toContain('foobar');
    expect(result).toContain('search');
    expect(result).toContain('install');
  });

  // ── Search ────────────────────────────────────────────────────────────

  it('/marketplace search <query> calls API and formats results', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      packages: [
        { id: 1, name: 'deep-research', description: 'Deep research skill', package_type: 'skill', category: 'research' },
        { id: 2, name: 'research-assistant', description: 'Research assistant plugin', package_type: 'plugin', category: 'research' },
      ],
      total: 2,
    }), { status: 200 }));

    const ctx = mockContext();
    const result = await registry.execute('/marketplace search research', ctx);

    expect(result).toContain('Marketplace Search Results');
    expect(result).toContain('deep-research');
    expect(result).toContain('research-assistant');
    expect(result).toContain('2 total');
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/marketplace/search?query=research'),
    );
  });

  it('/marketplace search without query shows usage', async () => {
    const ctx = mockContext();
    const result = await registry.execute('/marketplace search', ctx);

    expect(result).toContain('Missing query');
    expect(result).toContain('Usage');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('/marketplace search handles empty results', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      packages: [],
      total: 0,
    }), { status: 200 }));

    const ctx = mockContext();
    const result = await registry.execute('/marketplace search nonexistent', ctx);

    expect(result).toContain('No packages found');
  });

  // ── Packs ─────────────────────────────────────────────────────────────

  it('/marketplace packs returns formatted output', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      packs: [
        { slug: 'research-pack', display_name: 'Research Pack', description: 'Research tools', priority: 'high', target_roles: 'researcher' },
        { slug: 'writing-pack', display_name: 'Writing Pack', description: 'Writing tools', priority: 'medium', target_roles: 'writer' },
      ],
      total: 2,
    }), { status: 200 }));

    const ctx = mockContext();
    const result = await registry.execute('/marketplace packs', ctx);

    expect(result).toContain('Capability Packs');
    expect(result).toContain('Research Pack');
    expect(result).toContain('Writing Pack');
    expect(result).toContain('2 total');
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/marketplace/packs'),
    );
  });

  it('/marketplace packs handles empty list', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      packs: [],
      total: 0,
    }), { status: 200 }));

    const ctx = mockContext();
    const result = await registry.execute('/marketplace packs', ctx);

    expect(result).toContain('No capability packs available');
  });

  // ── Install ───────────────────────────────────────────────────────────

  it('/marketplace install <name> searches then installs', async () => {
    // Mock search response
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      packages: [
        { id: 42, name: 'deep-research', description: 'Deep research skill' },
      ],
      total: 1,
    }), { status: 200 }));

    // Mock install response
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      success: true,
      message: 'Installed to ~/.waggle/skills/',
    }), { status: 200 }));

    const ctx = mockContext();
    const result = await registry.execute('/marketplace install deep-research', ctx);

    expect(result).toContain('Successfully installed');
    expect(result).toContain('deep-research');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('/marketplace install handles not-found package', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      packages: [],
      total: 0,
    }), { status: 200 }));

    const ctx = mockContext();
    const result = await registry.execute('/marketplace install unknown-package', ctx);

    expect(result).toContain('No package found');
    expect(result).toContain('unknown-package');
    // Should only call search, not install
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('/marketplace install without name shows usage', async () => {
    const ctx = mockContext();
    const result = await registry.execute('/marketplace install', ctx);

    expect(result).toContain('Missing package name');
    expect(result).toContain('Usage');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('/marketplace install handles install failure', async () => {
    // Search succeeds
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      packages: [{ id: 42, name: 'bad-pkg', description: 'test' }],
      total: 1,
    }), { status: 200 }));

    // Install fails
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      success: false,
      message: 'Security check blocked installation',
    }), { status: 422 }));

    const ctx = mockContext();
    const result = await registry.execute('/marketplace install bad-pkg', ctx);

    expect(result).toContain('Failed to install');
    expect(result).toContain('Security check blocked');
  });

  // ── Installed ─────────────────────────────────────────────────────────

  it('/marketplace installed lists installed packages', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      installations: [
        { id: 1, package_id: 42, package_name: 'deep-research', install_type: 'skill', status: 'installed', installed_at: '2026-03-18T10:00:00Z' },
      ],
      total: 1,
    }), { status: 200 }));

    const ctx = mockContext();
    const result = await registry.execute('/marketplace installed', ctx);

    expect(result).toContain('Installed Packages');
    expect(result).toContain('deep-research');
    expect(result).toContain('1)');
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/marketplace/installed'),
    );
  });

  // ── Sync ──────────────────────────────────────────────────────────────

  it('/marketplace sync calls sync endpoint', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      results: [
        { source: 'GitHub', added: 5, updated: 2, errors: [] },
        { source: 'ClawHub', added: 3, updated: 0, errors: ['rate limited'] },
      ],
    }), { status: 200 }));

    const ctx = mockContext();
    const result = await registry.execute('/marketplace sync', ctx);

    expect(result).toContain('Marketplace Sync Complete');
    expect(result).toContain('GitHub');
    expect(result).toContain('+5 added');
    expect(result).toContain('ClawHub');
    expect(result).toContain('1 errors');
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/marketplace/sync'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  // ── API error handling ────────────────────────────────────────────────

  it('/marketplace search handles API errors gracefully', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      error: 'Marketplace not available',
    }), { status: 503 }));

    const ctx = mockContext();
    const result = await registry.execute('/marketplace search test', ctx);

    expect(result).toContain('Marketplace search failed');
    expect(result).toContain('Marketplace not available');
  });

  it('/marketplace search handles network errors', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const ctx = mockContext();
    const result = await registry.execute('/marketplace search test', ctx);

    expect(result).toContain('search error');
    expect(result).toContain('ECONNREFUSED');
  });

  // ── Alias execution ───────────────────────────────────────────────────

  it('/mp search works via alias', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      packages: [{ id: 1, name: 'test-skill', description: 'Test', package_type: 'skill' }],
      total: 1,
    }), { status: 200 }));

    const ctx = mockContext();
    const result = await registry.execute('/mp search test', ctx);

    expect(result).toContain('Marketplace Search Results');
    expect(result).toContain('test-skill');
  });
});
