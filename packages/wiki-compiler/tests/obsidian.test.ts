/**
 * Obsidian adapter unit tests (M-12).
 *
 * Covers: filesystem layout, wikilink alias transform, index generation,
 * idempotent re-run (files overwritten cleanly), skip of index/health pages.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { writeToObsidianVault } from '../src/adapters/obsidian.js';
import type { PageRecord } from '../src/types.js';

function seedPages(): PageRecord[] {
  return [
    {
      slug: 'project-alpha',
      pageType: 'entity',
      name: 'Project Alpha',
      contentHash: 'h1',
      markdown: `---
type: entity
name: Project Alpha
confidence: 0.9
---

# Project Alpha

Project Alpha is led by [[Marko]] and involves [[Egzakta Advisory]].

See also [[Strategy Consulting]] for broader context.
`,
      frameIds: '[1,2,3]',
      compiledAt: '2026-04-20T00:00:00.000Z',
      sourceCount: 3,
    },
    {
      slug: 'marko',
      pageType: 'entity',
      name: 'Marko',
      contentHash: 'h2',
      markdown: `---
type: entity
name: Marko
---

# Marko

The lead consultant.`,
      frameIds: '[1]',
      compiledAt: '2026-04-20T00:00:00.000Z',
      sourceCount: 1,
    },
    {
      slug: 'egzakta-advisory',
      pageType: 'entity',
      name: 'Egzakta Advisory',
      contentHash: 'h3',
      markdown: `---
type: entity
name: Egzakta Advisory
---

# Egzakta Advisory

Strategy consulting firm.`,
      frameIds: '[2]',
      compiledAt: '2026-04-20T00:00:00.000Z',
      sourceCount: 1,
    },
    {
      slug: 'strategy-consulting',
      pageType: 'concept',
      name: 'Strategy Consulting',
      contentHash: 'h4',
      markdown: `---
type: concept
---

# Strategy Consulting

Services offered.`,
      frameIds: '[3]',
      compiledAt: '2026-04-20T00:00:00.000Z',
      sourceCount: 1,
    },
    {
      // Virtual index page — should be SKIPPED by the writer.
      slug: 'index',
      pageType: 'index',
      name: 'Wiki Index',
      contentHash: 'h5',
      markdown: 'should not be written',
      frameIds: '[]',
      compiledAt: '2026-04-20T00:00:00.000Z',
      sourceCount: 0,
    },
  ];
}

describe('writeToObsidianVault', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-obsidian-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes one file per non-virtual page in a per-type subdirectory', () => {
    const result = writeToObsidianVault(seedPages(), tmpDir);

    expect(result.outDir).toBe(tmpDir);
    // 3 entities + 1 concept + 1 _index.md = 5 total (index/health skipped)
    expect(result.filesWritten).toBe(5);
    expect(result.byType.entity).toBe(3);
    expect(result.byType.concept).toBe(1);
    expect(result.byType.index).toBeUndefined();

    expect(fs.existsSync(path.join(tmpDir, 'entity', 'project-alpha.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'entity', 'marko.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'entity', 'egzakta-advisory.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'concept', 'strategy-consulting.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '_index.md'))).toBe(true);
  });

  it('transforms [[Display Name]] wikilinks to [[slug|Display Name]]', () => {
    writeToObsidianVault(seedPages(), tmpDir);
    const content = fs.readFileSync(path.join(tmpDir, 'entity', 'project-alpha.md'), 'utf-8');

    // Linked-by-name entities get the alias form.
    expect(content).toContain('[[marko|Marko]]');
    expect(content).toContain('[[egzakta-advisory|Egzakta Advisory]]');
    expect(content).toContain('[[strategy-consulting|Strategy Consulting]]');
    // Raw display-name wikilinks should NOT remain.
    expect(content).not.toContain('[[Marko]]');
    expect(content).not.toContain('[[Egzakta Advisory]]');
  });

  it('leaves already-slug wikilinks alone', () => {
    const pages: PageRecord[] = [{
      slug: 'main',
      pageType: 'entity',
      name: 'Main',
      contentHash: 'h',
      markdown: `# Main\n\nLinks to [[marko]] which is already a slug.`,
      frameIds: '[]',
      compiledAt: '2026-04-20T00:00:00.000Z',
      sourceCount: 1,
    }, {
      slug: 'marko',
      pageType: 'entity',
      name: 'Marko',
      contentHash: 'h2',
      markdown: '# Marko',
      frameIds: '[]',
      compiledAt: '2026-04-20T00:00:00.000Z',
      sourceCount: 1,
    }];
    writeToObsidianVault(pages, tmpDir);
    const content = fs.readFileSync(path.join(tmpDir, 'entity', 'main.md'), 'utf-8');
    expect(content).toContain('[[marko]]');
    expect(content).not.toContain('[[marko|marko]]');
  });

  it('writes _index.md with pages grouped by type', () => {
    writeToObsidianVault(seedPages(), tmpDir);
    const indexContent = fs.readFileSync(path.join(tmpDir, '_index.md'), 'utf-8');

    expect(indexContent).toContain('# Waggle Wiki Index');
    expect(indexContent).toContain('## Entities (3)');
    expect(indexContent).toContain('## Concepts (1)');
    expect(indexContent).toContain('[[project-alpha|Project Alpha]]');
    expect(indexContent).toContain('[[strategy-consulting|Strategy Consulting]]');
    // The virtual index page should NOT appear in the index itself.
    expect(indexContent).not.toContain('[[index|');
  });

  it('preserves YAML frontmatter as-is', () => {
    writeToObsidianVault(seedPages(), tmpDir);
    const content = fs.readFileSync(path.join(tmpDir, 'entity', 'project-alpha.md'), 'utf-8');
    expect(content).toMatch(/^---\n/);
    expect(content).toMatch(/type: entity\nname: Project Alpha\nconfidence: 0\.9\n---/);
  });

  it('is idempotent — re-running overwrites files cleanly', () => {
    writeToObsidianVault(seedPages(), tmpDir);
    const first = fs.readFileSync(path.join(tmpDir, 'entity', 'project-alpha.md'), 'utf-8');

    // Mutate one page's markdown and rerun.
    const pages = seedPages();
    pages[0].markdown = pages[0].markdown.replace('Strategy Consulting', 'Ops Consulting');
    writeToObsidianVault(pages, tmpDir);
    const second = fs.readFileSync(path.join(tmpDir, 'entity', 'project-alpha.md'), 'utf-8');

    expect(second).not.toBe(first);
    expect(second).toContain('Ops Consulting');
  });

  it('creates outDir if it does not exist', () => {
    const nested = path.join(tmpDir, 'does', 'not', 'exist', 'yet');
    expect(fs.existsSync(nested)).toBe(false);
    const result = writeToObsidianVault(seedPages(), nested);
    expect(fs.existsSync(nested)).toBe(true);
    expect(result.filesWritten).toBeGreaterThan(0);
  });
});
