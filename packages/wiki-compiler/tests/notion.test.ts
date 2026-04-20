/**
 * Notion adapter unit tests (M-13)
 *
 * Pure-function coverage for the markdown→blocks converter, rich-text
 * builder, frontmatter stripper, and page-id extractor. Network paths
 * (`createNotionPage`, `writeToNotionWorkspace`) are not unit-tested —
 * they need a mocked fetch and belong in an integration test.
 */

import { describe, it, expect } from 'vitest';
import {
  markdownToBlocks,
  toRichText,
  stripFrontmatter,
  extractNotionPageId,
} from '../src/adapters/notion.js';

describe('stripFrontmatter', () => {
  it('removes a leading YAML block and extracts name', () => {
    const input = `---
type: entity
name: Project Alpha
confidence: 0.9
---

# Body starts here`;
    const out = stripFrontmatter(input);
    expect(out.title).toBe('Project Alpha');
    expect(out.body.trimStart()).toBe('# Body starts here');
  });

  it('returns full markdown and no title when frontmatter is absent', () => {
    const input = `# Just a header\n\nNo frontmatter.`;
    const out = stripFrontmatter(input);
    expect(out.title).toBeUndefined();
    expect(out.body).toBe(input);
  });

  it('handles frontmatter without a name field', () => {
    const input = `---\ntype: concept\n---\n\nBody`;
    const out = stripFrontmatter(input);
    expect(out.title).toBeUndefined();
    expect(out.body.trimStart()).toBe('Body');
  });
});

describe('toRichText', () => {
  it('returns empty array for empty input', () => {
    expect(toRichText('')).toEqual([]);
  });

  it('wraps plain text in a single rich_text item', () => {
    const out = toRichText('Hello world');
    expect(out).toEqual([{ type: 'text', text: { content: 'Hello world' } }]);
  });

  it('converts [text](url) into a linked rich_text item', () => {
    const out = toRichText('See [Notion](https://notion.so) docs.');
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({ type: 'text', text: { content: 'See ' } });
    expect(out[1]).toEqual({
      type: 'text',
      text: { content: 'Notion', link: { url: 'https://notion.so' } },
    });
    expect(out[2]).toEqual({ type: 'text', text: { content: ' docs.' } });
  });

  it('applies bold, italic, and code annotations', () => {
    const out = toRichText('Plain **bold** *italic* `code` end');
    // split produces: "Plain ", "**bold**", " ", "*italic*", " ", "`code`", " end"
    const bold = out.find(t => t.text.content === 'bold');
    const italic = out.find(t => t.text.content === 'italic');
    const code = out.find(t => t.text.content === 'code');
    expect(bold?.annotations?.bold).toBe(true);
    expect(italic?.annotations?.italic).toBe(true);
    expect(code?.annotations?.code).toBe(true);
  });
});

describe('markdownToBlocks', () => {
  it('maps H1/H2/H3 to heading_1/heading_2/heading_3 blocks', () => {
    const md = `# H1 Heading\n\n## H2 Heading\n\n### H3 Heading`;
    const blocks = markdownToBlocks(md);
    expect(blocks).toHaveLength(3);
    expect(blocks[0].type).toBe('heading_1');
    expect(blocks[1].type).toBe('heading_2');
    expect(blocks[2].type).toBe('heading_3');
    const h1 = blocks[0] as any;
    expect(h1.heading_1.rich_text[0].text.content).toBe('H1 Heading');
  });

  it('maps "- item" and "* item" bullets to bulleted_list_item', () => {
    const md = `- First\n- Second\n* Third`;
    const blocks = markdownToBlocks(md);
    expect(blocks).toHaveLength(3);
    for (const b of blocks) expect(b.type).toBe('bulleted_list_item');
    const first = blocks[0] as any;
    expect(first.bulleted_list_item.rich_text[0].text.content).toBe('First');
  });

  it('maps "> quote" to quote block', () => {
    const md = `> A quote line`;
    const blocks = markdownToBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('quote');
    const q = blocks[0] as any;
    expect(q.quote.rich_text[0].text.content).toBe('A quote line');
  });

  it('consolidates adjacent non-special lines into a single paragraph', () => {
    const md = `First line.\nSecond line continues.\n\nNew paragraph here.`;
    const blocks = markdownToBlocks(md);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe('paragraph');
    expect(blocks[1].type).toBe('paragraph');
    const p1 = blocks[0] as any;
    expect(p1.paragraph.rich_text[0].text.content).toBe('First line. Second line continues.');
  });

  it('flushes paragraphs when a heading interrupts the block', () => {
    const md = `A paragraph line.\n# Heading\nNext paragraph.`;
    const blocks = markdownToBlocks(md);
    expect(blocks.map(b => b.type)).toEqual(['paragraph', 'heading_1', 'paragraph']);
  });

  it('preserves inline links inside paragraphs', () => {
    const md = `See [Notion](https://notion.so) for more.`;
    const blocks = markdownToBlocks(md);
    const p = blocks[0] as any;
    expect(p.type).toBe('paragraph');
    const linkItem = p.paragraph.rich_text.find((t: any) => t.text.link);
    expect(linkItem.text.content).toBe('Notion');
    expect(linkItem.text.link.url).toBe('https://notion.so');
  });

  it('returns empty array for empty input', () => {
    expect(markdownToBlocks('')).toEqual([]);
    expect(markdownToBlocks('   \n\n  ')).toEqual([]);
  });
});

describe('extractNotionPageId', () => {
  it('accepts a dashed UUID', () => {
    const id = '12345678-1234-1234-1234-123456789abc';
    expect(extractNotionPageId(id)).toBe(id);
  });

  it('accepts an undashed 32-hex id', () => {
    const id = '123456781234123412341234567890ab';
    expect(extractNotionPageId(id)).toBe(id);
  });

  it('extracts the id from a notion URL', () => {
    const url = 'https://www.notion.so/Workspace/Some-Page-Title-123456781234123412341234567890ab';
    expect(extractNotionPageId(url)).toBe('123456781234123412341234567890ab');
  });

  it('returns null for a non-hex input', () => {
    expect(extractNotionPageId('not-a-notion-page')).toBeNull();
    expect(extractNotionPageId('')).toBeNull();
  });
});
