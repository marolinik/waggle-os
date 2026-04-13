/**
 * Markdown Source Adapter — parses .md files into importable items.
 *
 * Splits markdown by top-level headings (# or ##).
 * Each section becomes a separate UniversalImportItem.
 * Extracts entities from heading names and bold terms.
 */

import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import type { SourceAdapter, UniversalImportItem } from './types.js';

interface MarkdownSection {
  heading: string;
  level: number;
  content: string;
}

function splitByHeadings(text: string): MarkdownSection[] {
  const lines = text.split('\n');
  const sections: MarkdownSection[] = [];
  let currentHeading = '';
  let currentLevel = 0;
  let currentLines: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      // Flush previous section
      if (currentLines.length > 0 || currentHeading) {
        sections.push({
          heading: currentHeading,
          level: currentLevel,
          content: currentLines.join('\n').trim(),
        });
      }
      currentHeading = headingMatch[2].trim();
      currentLevel = headingMatch[1].length;
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  // Flush last section
  if (currentLines.length > 0 || currentHeading) {
    sections.push({
      heading: currentHeading,
      level: currentLevel,
      content: currentLines.join('\n').trim(),
    });
  }

  return sections.filter(s => s.content.length > 0);
}

function extractBoldTerms(text: string): string[] {
  const matches = text.matchAll(/\*\*([^*]+)\*\*/g);
  const terms: string[] = [];
  for (const m of matches) {
    const term = m[1].trim();
    if (term.length > 1 && term.length < 80) {
      terms.push(term);
    }
  }
  return [...new Set(terms)];
}

export class MarkdownAdapter implements SourceAdapter {
  readonly sourceType = 'markdown' as const;
  readonly displayName = 'Markdown';

  parse(input: unknown): UniversalImportItem[] {
    if (typeof input !== 'string') return [];

    // Input can be a file path or raw markdown content
    let content: string;
    let sourcePath: string | undefined;

    if (input.length < 500 && !input.includes('\n')) {
      // Likely a file path
      try {
        if (fs.existsSync(input)) {
          content = fs.readFileSync(input, 'utf-8');
          sourcePath = input;
        } else {
          // Treat as raw content
          content = input;
        }
      } catch {
        content = input;
      }
    } else {
      content = input;
    }

    if (!content.trim()) return [];

    const sections = splitByHeadings(content);

    // If no headings found, treat entire content as one item
    if (sections.length === 0) {
      return [{
        id: randomUUID(),
        source: 'markdown',
        type: 'document',
        title: sourcePath ? sourcePath.split(/[\\/]/).pop()?.replace('.md', '') ?? 'Document' : 'Document',
        content: content.slice(0, 4000),
        timestamp: new Date().toISOString(),
        metadata: {
          ...(sourcePath && { filePath: sourcePath }),
          contentType: 'note',
        },
      }];
    }

    const items: UniversalImportItem[] = [];
    const docTitle = sourcePath?.split(/[\\/]/).pop()?.replace('.md', '');

    for (const section of sections) {
      const boldTerms = extractBoldTerms(section.content);
      const entities = boldTerms.slice(0, 10).map(t => ({ name: t, type: 'concept' }));

      items.push({
        id: randomUUID(),
        source: 'markdown',
        type: 'document',
        title: section.heading || docTitle || 'Untitled section',
        content: section.content.slice(0, 4000),
        timestamp: new Date().toISOString(),
        metadata: {
          ...(sourcePath && { filePath: sourcePath }),
          headingLevel: section.level,
          contentType: 'note',
          ...(entities.length > 0 && { entities }),
        },
      });
    }

    return items;
  }
}
