/**
 * Wave T Lane B §2 — the ExtensionCard metadata budget. `buildMetaChips`
 * dedupes the repeated connector chip and produces a priority-ordered set the
 * card caps at META_VISIBLE_CAP + a "+N" overflow chip.
 */
import { describe, it, expect } from 'vitest';
import type { Extension } from '@/lib/extension-catalog';
import { buildMetaChips, META_VISIBLE_CAP, displayExtensionName } from './ExtensionCard';

const base: Extension = {
  id: 'x',
  name: 'X',
  description: 'd',
  type: 'connector',
  source: 'registry',
  installed: false,
  lifecycle: 'available',
  installable: true,
  kind: 'federated',
};

describe('buildMetaChips — metadata budget', () => {
  it('dedupes the repeated connector chip (type vs multi-form source glyph)', () => {
    const chips = buildMetaChips({ ...base, type: 'connector', sources: ['connector', 'mcp'] });
    const connectors = chips.filter(c => c.label.toLowerCase() === 'connector');
    expect(connectors).toHaveLength(1);
    // the OTHER form still surfaces as a glyph chip so the row still reads multi-form
    expect(chips.some(c => c.sourceForm && c.label === 'MCP')).toBe(true);
  });

  it('orders type → source glyphs → category → trust → source, so the first glyph stays visible', () => {
    const chips = buildMetaChips({
      ...base, type: 'connector', category: 'comms', trust: 'official', sources: ['connector', 'mcp'],
    });
    expect(chips.map(c => c.label)).toEqual(['connector', 'MCP', 'comms', 'official', 'registry']);
    // the first source-form chip lands inside the visible cap
    const firstGlyph = chips.slice(0, META_VISIBLE_CAP).find(c => c.sourceForm);
    expect(firstGlyph?.label).toBe('MCP');
  });

  it('caps to META_VISIBLE_CAP visible with the rest overflowing', () => {
    const chips = buildMetaChips({
      ...base, type: 'connector', category: 'comms', trust: 'official', sources: ['connector', 'mcp'],
    });
    expect(chips.slice(0, META_VISIBLE_CAP)).toHaveLength(3);
    expect(chips.slice(META_VISIBLE_CAP).map(c => c.label)).toEqual(['official', 'registry']);
  });

  it('emits no glyph chips for a single-form extension', () => {
    const chips = buildMetaChips({ ...base, type: 'skill', kind: 'package', category: 'data' });
    expect(chips.some(c => c.sourceForm)).toBe(false);
    expect(chips.map(c => c.label)).toEqual(['skill', 'data', 'registry']);
  });
});

describe('displayExtensionName — humanize scraped slugs (Wave X Lane D)', () => {
  it('humanizes a mixed-case scraped slug that the old all-lowercase guard bailed on', () => {
    // The R18-V6 judge's exact example — previously rendered raw because
    // "chatDeny" failed the all-lowercase regex.
    expect(displayExtensionName('awesome-claude-plugin-chatDeny-slides-creator'))
      .toBe('Claude Chat Deny Slides Creator');
  });
  it('drops awesome/plugin noise and title-cases the rest', () => {
    expect(displayExtensionName('awesome-notion-plugin')).toBe('Notion');
  });
  it('uppercases known acronyms', () => {
    expect(displayExtensionName('notion-mcp')).toBe('Notion MCP');
    expect(displayExtensionName('openai-api-client')).toBe('Openai API Client');
  });
  it('title-cases a plain lowercase slug (unchanged prior behavior)', () => {
    expect(displayExtensionName('agent-skills')).toBe('Agent Skills');
    expect(displayExtensionName('gmail')).toBe('Gmail');
  });
  it('leaves curated brand names untouched', () => {
    for (const n of ['Gmail', 'GitHub', '1Password', 'Slack']) {
      expect(displayExtensionName(n)).toBe(n);
    }
  });
  it('never blanks an all-noise name', () => {
    expect(displayExtensionName('awesome-plugin')).toBe('awesome-plugin');
  });
});
