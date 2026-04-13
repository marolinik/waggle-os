/**
 * URL Source Adapter — fetches web pages and extracts readable content.
 *
 * Uses built-in fetch + basic HTML stripping.
 * Splits content by sections if headings are present.
 */

import { randomUUID } from 'node:crypto';
import type { SourceAdapter, UniversalImportItem } from './types.js';

/** Strip HTML tags and decode common entities. Returns plain text. */
function stripHtml(html: string): string {
  // Remove script and style blocks entirely
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, '');
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, '');
  text = text.replace(/<header[\s\S]*?<\/header>/gi, '');

  // Convert headings to markdown-style
  text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n');
  text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n');
  text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n');

  // Convert paragraphs and breaks to newlines
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<li[^>]*>/gi, '\n- ');

  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode common HTML entities
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, ' ');

  // Collapse excessive whitespace
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

/** Extract <title> from HTML. */
function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].trim().replace(/\s+/g, ' ') : undefined;
}

/** Extract meta description from HTML. */
function extractDescription(html: string): string | undefined {
  const match = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["'][^>]*>/i)
    ?? html.match(/<meta[^>]*content=["']([\s\S]*?)["'][^>]*name=["']description["'][^>]*>/i);
  return match ? match[1].trim() : undefined;
}

export class UrlAdapter implements SourceAdapter {
  readonly sourceType = 'url' as const;
  readonly displayName = 'Web URL';

  parse(input: unknown): UniversalImportItem[] {
    // Synchronous parse — for pre-fetched HTML content
    if (typeof input !== 'string') return [];

    // If input looks like HTML, parse it directly
    if (input.includes('<html') || input.includes('<body') || input.includes('<div')) {
      return this.parseHtml(input, undefined);
    }

    // If input is a URL, return empty — caller should use fetchAndParse()
    if (input.startsWith('http://') || input.startsWith('https://')) {
      return [];
    }

    return [];
  }

  /** Fetch a URL and parse its content. Async because of network I/O. */
  async fetchAndParse(url: string): Promise<UniversalImportItem[]> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Waggle-Memory/1.0 (knowledge harvester)',
        'Accept': 'text/html,application/xhtml+xml,text/plain',
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') ?? '';
    const body = await response.text();

    if (contentType.includes('text/html') || contentType.includes('xhtml')) {
      return this.parseHtml(body, url);
    }

    // Plain text or other — treat as plaintext
    return [{
      id: randomUUID(),
      source: 'url',
      type: 'document',
      title: url,
      content: body.slice(0, 4000),
      timestamp: new Date().toISOString(),
      metadata: { sourceUrl: url, contentType: 'article' },
    }];
  }

  private parseHtml(html: string, sourceUrl: string | undefined): UniversalImportItem[] {
    const title = extractTitle(html) ?? sourceUrl ?? 'Web page';
    const description = extractDescription(html);
    const plainText = stripHtml(html);

    if (!plainText || plainText.length < 50) return [];

    // For short pages, return as single item
    if (plainText.length <= 4000) {
      return [{
        id: randomUUID(),
        source: 'url',
        type: 'document',
        title,
        content: plainText,
        timestamp: new Date().toISOString(),
        metadata: {
          ...(sourceUrl && { sourceUrl }),
          ...(description && { description }),
          contentType: 'article',
        },
      }];
    }

    // For longer pages, split by headings
    const sections = plainText.split(/\n(?=#{1,3}\s)/);
    const items: UniversalImportItem[] = [];

    for (const section of sections) {
      const trimmed = section.trim();
      if (trimmed.length < 30) continue;

      const headingMatch = trimmed.match(/^#{1,3}\s+(.+)/);
      const sectionTitle = headingMatch ? headingMatch[1].trim() : title;

      items.push({
        id: randomUUID(),
        source: 'url',
        type: 'document',
        title: sectionTitle === title ? title : `${title} — ${sectionTitle}`,
        content: trimmed.slice(0, 4000),
        timestamp: new Date().toISOString(),
        metadata: {
          ...(sourceUrl && { sourceUrl }),
          contentType: 'article',
        },
      });
    }

    return items.length > 0 ? items : [{
      id: randomUUID(),
      source: 'url',
      type: 'document',
      title,
      content: plainText.slice(0, 4000),
      timestamp: new Date().toISOString(),
      metadata: {
        ...(sourceUrl && { sourceUrl }),
        contentType: 'article',
      },
    }];
  }
}
