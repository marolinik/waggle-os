/**
 * Notion workspace export adapter (M-13)
 *
 * Writes compiled wiki pages to a user's Notion workspace as child pages
 * under a user-chosen root. Uses the Notion REST API directly (no SDK)
 * so we don't add @notionhq/client to the dep graph.
 *
 * Re-run strategy (per M-13 decision memo — delta):
 *   - Unchanged (content_hash matches existing notion_page_id)  -> skip API call
 *   - New page (no notion_page_id)                              -> POST /v1/pages
 *   - Changed page (content_hash differs)                       -> archive old + create new
 *
 * Keeping the converter standalone (no library dep) is intentional — our
 * markdown output is narrow and predictable (H1-H3, paragraphs, bullets,
 * blockquotes, inline links). A dependency would inherit edge-case
 * handling for features we don't emit.
 */

import type { PageRecord, WikiPageType } from '../types.js';

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
/** Notion API caps block children per request at 100. */
const BLOCK_BATCH_SIZE = 100;

export interface NotionExportOptions {
  /** Integration token (from notion.so/my-integrations — Internal Integration). */
  token: string;
  /** Root page ID under which to create child pages. UUIDs with or without dashes accepted. */
  rootPageId: string;
}

export interface NotionExportStats {
  byType: Record<WikiPageType, number>;
  pagesCreated: number;
  pagesUpdated: number;
  pagesUnchanged: number;
  pagesFailed: number;
  errors: { slug: string; message: string }[];
}

export interface NotionStateHelpers {
  getNotionPageId(slug: string): string | null;
  setNotionPageId(slug: string, pageId: string): void;
  clearNotionPageId(slug: string): void;
  /** Used to detect "did content change since last export?". */
  getPageContentHash(slug: string): string | null;
  setPageContentHash?(slug: string, hash: string): void;
}

export interface NotionBlock {
  object: 'block';
  type: string;
  [key: string]: unknown;
}

interface RichText {
  type: 'text';
  text: { content: string; link?: { url: string } | null };
  annotations?: {
    bold?: boolean;
    italic?: boolean;
    code?: boolean;
  };
}

/** Strip a leading YAML frontmatter block (--- ... ---) if present. */
export function stripFrontmatter(markdown: string): { body: string; title?: string } {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { body: markdown };
  const yaml = match[1];
  const body = match[2];
  const nameMatch = yaml.match(/^name:\s*(.+)$/m);
  return { body, title: nameMatch?.[1]?.trim() };
}

/**
 * Parse a markdown-text segment into Notion rich_text items, preserving
 * inline links `[text](url)`, `**bold**`, `*italic*`, and `` `code` ``.
 * Intentionally narrow — our wiki pages do not use more than this.
 */
export function toRichText(text: string): RichText[] {
  if (!text) return [];
  const out: RichText[] = [];
  const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = linkRe.exec(text)) !== null) {
    if (match.index > lastIdx) {
      const slice = text.slice(lastIdx, match.index);
      out.push(...parseEmphasis(slice));
    }
    out.push({
      type: 'text',
      text: { content: match[1], link: { url: match[2] } },
    });
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) {
    out.push(...parseEmphasis(text.slice(lastIdx)));
  }
  return out;
}

/** Handle **bold**, *italic*, `code`. No nesting — our markdown does not nest these. */
function parseEmphasis(text: string): RichText[] {
  if (!text) return [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  const parts = text.split(re);
  return parts.filter(p => p.length > 0).map(p => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return { type: 'text' as const, text: { content: p.slice(2, -2) }, annotations: { bold: true } };
    }
    if (p.startsWith('*') && p.endsWith('*')) {
      return { type: 'text' as const, text: { content: p.slice(1, -1) }, annotations: { italic: true } };
    }
    if (p.startsWith('`') && p.endsWith('`')) {
      return { type: 'text' as const, text: { content: p.slice(1, -1) }, annotations: { code: true } };
    }
    return { type: 'text' as const, text: { content: p } };
  });
}

/**
 * Convert our wiki markdown body (frontmatter already stripped) into an
 * ordered array of Notion blocks. Only handles: H1-H3, paragraphs, bullets,
 * blockquotes. Lines that do not match become paragraphs.
 */
export function markdownToBlocks(body: string): NotionBlock[] {
  const blocks: NotionBlock[] = [];
  const lines = body.split(/\r?\n/);
  let paragraph: string[] = [];

  const flushParagraph = () => {
    const content = paragraph.join(' ').trim();
    if (content) {
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: toRichText(content) },
      });
    }
    paragraph = [];
  };

  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (trimmed === '') {
      flushParagraph();
      continue;
    }

    const h = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (h) {
      flushParagraph();
      const level = h[1].length as 1 | 2 | 3;
      const text = h[2];
      const type = `heading_${level}` as const;
      blocks.push({
        object: 'block',
        type,
        [type]: { rich_text: toRichText(text) },
      });
      continue;
    }

    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      blocks.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: { rich_text: toRichText(bullet[1]) },
      });
      continue;
    }

    const quote = trimmed.match(/^>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      blocks.push({
        object: 'block',
        type: 'quote',
        quote: { rich_text: toRichText(quote[1]) },
      });
      continue;
    }

    paragraph.push(trimmed);
  }
  flushParagraph();

  return blocks;
}

/**
 * Extract a UUID page id from either a plain id (abc123...) or a Notion
 * page URL. Returns the id with or without dashes — Notion accepts both.
 */
export function extractNotionPageId(urlOrId: string): string | null {
  const trimmed = urlOrId.trim();
  const hexMatch = trimmed.match(/([a-f0-9]{8}-?[a-f0-9]{4}-?[a-f0-9]{4}-?[a-f0-9]{4}-?[a-f0-9]{12})/i);
  return hexMatch ? hexMatch[1] : null;
}

function notionHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

async function createNotionPage(
  token: string,
  rootPageId: string,
  title: string,
  blocks: NotionBlock[],
): Promise<{ id: string }> {
  const firstBatch = blocks.slice(0, BLOCK_BATCH_SIZE);
  const res = await fetch(`${NOTION_API}/pages`, {
    method: 'POST',
    headers: notionHeaders(token),
    body: JSON.stringify({
      parent: { page_id: rootPageId },
      properties: {
        title: {
          title: [{ text: { content: title.slice(0, 200) } }],
        },
      },
      children: firstBatch,
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Notion create failed (${res.status}): ${err.slice(0, 300)}`);
  }
  const data = await res.json() as { id: string };

  let cursor = BLOCK_BATCH_SIZE;
  while (cursor < blocks.length) {
    const batch = blocks.slice(cursor, cursor + BLOCK_BATCH_SIZE);
    const appendRes = await fetch(`${NOTION_API}/blocks/${data.id}/children`, {
      method: 'PATCH',
      headers: notionHeaders(token),
      body: JSON.stringify({ children: batch }),
    });
    if (!appendRes.ok) {
      const err = await appendRes.text().catch(() => appendRes.statusText);
      throw new Error(`Notion append failed (${appendRes.status}): ${err.slice(0, 300)}`);
    }
    cursor += BLOCK_BATCH_SIZE;
  }

  return data;
}

async function archiveNotionPage(token: string, pageId: string): Promise<void> {
  const res = await fetch(`${NOTION_API}/pages/${pageId}`, {
    method: 'PATCH',
    headers: notionHeaders(token),
    body: JSON.stringify({ archived: true }),
  });
  if (!res.ok) {
    // Archive-failure is tolerable — worst case the user sees two pages.
    // We swallow it here so the caller can still create the new page.
  }
}

/**
 * Export every compiled page to Notion. Skips index/health virtual pages.
 * Runs sequentially to respect Notion's rate limit (~3 req/sec).
 */
export async function writeToNotionWorkspace(
  pages: PageRecord[],
  opts: NotionExportOptions,
  state: NotionStateHelpers,
): Promise<NotionExportStats> {
  const stats: NotionExportStats = {
    byType: {} as Record<WikiPageType, number>,
    pagesCreated: 0,
    pagesUpdated: 0,
    pagesUnchanged: 0,
    pagesFailed: 0,
    errors: [],
  };

  for (const page of pages) {
    if (page.pageType === 'index' || page.pageType === 'health') continue;

    try {
      const existingId = state.getNotionPageId(page.slug);
      const existingHash = state.getPageContentHash(page.slug);
      if (existingId && existingHash === page.contentHash) {
        stats.pagesUnchanged++;
        continue;
      }

      const { body, title: frontmatterTitle } = stripFrontmatter(page.markdown);
      const blocks = markdownToBlocks(body);
      const title = frontmatterTitle ?? page.name;

      if (existingId) {
        await archiveNotionPage(opts.token, existingId);
        state.clearNotionPageId(page.slug);
      }

      const created = await createNotionPage(opts.token, opts.rootPageId, title, blocks);
      state.setNotionPageId(page.slug, created.id);
      if (existingId) stats.pagesUpdated++;
      else stats.pagesCreated++;
      stats.byType[page.pageType] = (stats.byType[page.pageType] ?? 0) + 1;
    } catch (err) {
      stats.pagesFailed++;
      stats.errors.push({
        slug: page.slug,
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return stats;
}
