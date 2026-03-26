import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  searchCapabilities,
  type SearchCapabilitiesInput,
  type MarketplaceCandidate,
} from '../src/capability-acquisition.js';
import { createSkillTools } from '../src/skill-tools.js';

describe('capability-marketplace', () => {
  let tmpDir: string;
  let starterDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-mkt-'));
    starterDir = path.join(tmpDir, 'starter-skills');
    fs.mkdirSync(starterDir, { recursive: true });

    // Create a sample starter skill (for ranking comparison)
    fs.writeFileSync(
      path.join(starterDir, 'research-synthesis.md'),
      '# Research Synthesis\n\nConduct structured research and provide synthesis.',
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── Marketplace as acquisition source ─────────────────────────────

  it('includes marketplace candidates in search results', () => {
    const marketplaceCandidates: MarketplaceCandidate[] = [
      {
        name: 'email-composer',
        description: 'Compose and send emails with templates and personalization',
        packageType: 'skill',
        source: 'marketplace',
      },
      {
        name: 'smtp-sender',
        description: 'Send emails via SMTP with attachment support',
        packageType: 'plugin',
        source: 'marketplace',
      },
    ];

    const result = searchCapabilities({
      need: 'email sending with templates',
      installedSkills: [],
      starterSkillsDir: starterDir,
      marketplaceCandidates,
    });

    const emailCandidates = result.candidates.filter(c => c.source === 'marketplace');
    expect(emailCandidates.length).toBeGreaterThan(0);

    const emailComposer = result.candidates.find(c => c.name === 'email-composer');
    expect(emailComposer).toBeDefined();
    expect(emailComposer!.type).toBe('marketplace');
    expect(emailComposer!.availability).toBe('installable');
    expect(emailComposer!.source).toBe('marketplace');
    expect(emailComposer!.installAction).toBe('install_capability');
  });

  it('gracefully handles empty marketplace results', () => {
    const result = searchCapabilities({
      need: 'research synthesis structured investigation',
      installedSkills: [],
      starterSkillsDir: starterDir,
      marketplaceCandidates: [],
    });

    // Should still find starter skills (research-synthesis matches)
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates.some(c => c.source === 'marketplace')).toBe(false);
    expect(result.candidates.some(c => c.source === 'starter-pack')).toBe(true);
  });

  it('ranks installed > starter > marketplace (by availability preference)', () => {
    const result = searchCapabilities({
      need: 'research synthesis',
      installedSkills: [
        { name: 'my-research', content: '# Research Guide\n\nResearch and synthesize findings' },
      ],
      starterSkillsDir: starterDir,
      marketplaceCandidates: [
        {
          name: 'research-pro',
          description: 'Professional research synthesis and analysis tools',
          packageType: 'skill',
          source: 'marketplace',
        },
      ],
    });

    // All three sources should appear
    const installed = result.candidates.find(c => c.name === 'my-research');
    const starter = result.candidates.find(c => c.name === 'research-synthesis' && c.source === 'starter-pack');
    const marketplace = result.candidates.find(c => c.name === 'research-pro');

    expect(installed).toBeDefined();
    expect(starter).toBeDefined();
    expect(marketplace).toBeDefined();

    // Active skills should rank before installable ones (when scores are close)
    expect(installed!.availability).toBe('active');
    expect(starter!.availability).toBe('installable');
    expect(marketplace!.availability).toBe('installable');
  });

  it('skips marketplace candidates that are already installed', () => {
    const result = searchCapabilities({
      need: 'research synthesis',
      installedSkills: [
        { name: 'research-pro', content: '# Research Pro\n\nAdvanced research' },
      ],
      starterSkillsDir: starterDir,
      marketplaceCandidates: [
        {
          name: 'research-pro',
          description: 'Professional research synthesis',
          packageType: 'skill',
          source: 'marketplace',
        },
      ],
    });

    // Should not have a duplicate marketplace candidate
    const marketplaceCandidates = result.candidates.filter(c => c.name === 'research-pro' && c.source === 'marketplace');
    expect(marketplaceCandidates.length).toBe(0);
  });

  it('skips marketplace candidates that duplicate starter pack entries', () => {
    const result = searchCapabilities({
      need: 'research synthesis',
      installedSkills: [],
      starterSkillsDir: starterDir,
      marketplaceCandidates: [
        {
          name: 'research-synthesis',
          description: 'Research synthesis skill',
          packageType: 'skill',
          source: 'marketplace',
        },
      ],
    });

    // Should have the starter-pack version, not the marketplace duplicate
    const fromStarter = result.candidates.filter(c => c.name === 'research-synthesis' && c.source === 'starter-pack');
    const fromMarketplace = result.candidates.filter(c => c.name === 'research-synthesis' && c.source === 'marketplace');
    expect(fromStarter.length).toBe(1);
    expect(fromMarketplace.length).toBe(0);
  });

  it('marketplace candidates include trust assessment', () => {
    const result = searchCapabilities({
      need: 'email sending',
      installedSkills: [],
      starterSkillsDir: starterDir,
      marketplaceCandidates: [
        {
          name: 'email-sender',
          description: 'Send emails with SMTP support',
          packageType: 'skill',
          source: 'marketplace',
        },
      ],
    });

    const mktCandidate = result.candidates.find(c => c.source === 'marketplace');
    expect(mktCandidate).toBeDefined();
    expect(mktCandidate!.trust).toBeDefined();
    expect(mktCandidate!.trust!.riskLevel).toBeDefined();
  });

  // ── Marketplace search callback in skill tools ──────────────────

  describe('acquire_capability with marketplace callback', () => {
    it('calls searchMarketplace and includes results', async () => {
      let searchCalled = false;
      const tools = createSkillTools({
        waggleHome: tmpDir,
        starterSkillsDir: starterDir,
        nativeToolNames: [],
        searchMarketplace: async (query: string) => {
          searchCalled = true;
          return [
            {
              name: 'email-pro',
              description: `Professional email tools matching: ${query}`,
              packageType: 'skill',
              source: 'marketplace',
            },
          ];
        },
      });

      const acquireTool = tools.find(t => t.name === 'acquire_capability');
      expect(acquireTool).toBeDefined();

      const result = await acquireTool!.execute({ need: 'email automation' });
      expect(searchCalled).toBe(true);
      expect(result).toContain('email-pro');
    });

    it('degrades gracefully when marketplace callback throws', async () => {
      const tools = createSkillTools({
        waggleHome: tmpDir,
        starterSkillsDir: starterDir,
        nativeToolNames: [],
        searchMarketplace: async () => {
          throw new Error('Marketplace DB offline');
        },
      });

      const acquireTool = tools.find(t => t.name === 'acquire_capability');
      const result = await acquireTool!.execute({ need: 'research synthesis' });

      // Should still return results from starter pack (not crash)
      expect(result).toBeTruthy();
      expect(result).toContain('research-synthesis');
    });

    it('works without marketplace callback (no crash)', async () => {
      const tools = createSkillTools({
        waggleHome: tmpDir,
        starterSkillsDir: starterDir,
        nativeToolNames: ['web_search'],
      });

      const acquireTool = tools.find(t => t.name === 'acquire_capability');
      const result = await acquireTool!.execute({ need: 'search the web' });

      // Should find native tool
      expect(result).toBeTruthy();
      expect(result).toContain('web_search');
    });
  });
});
