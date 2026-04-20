/**
 * Obsidian Vault Adapter (M-12)
 *
 * Writes compiled wiki pages to a user-specified directory in a shape
 * Obsidian reads natively:
 *   {outDir}/
 *     _index.md                  — table of contents grouped by page type
 *     entity/{slug}.md           — one file per compiled entity page
 *     concept/{slug}.md          — one file per compiled concept page
 *     synthesis/{slug}.md        — one file per synthesis page
 *
 * YAML frontmatter is preserved as-is — Obsidian reads `type:`, `confidence:`,
 * etc. The body is rewritten only to convert raw `[[Display Name]]` wikilinks
 * into the `[[slug|Display Name]]` alias form so the links resolve against
 * our slug-based filenames.
 *
 * This adapter does NOT call an LLM, does NOT mutate state.compile watermarks,
 * and is safe to call repeatedly — files are overwritten on each export.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PageRecord } from '../types.js';

export interface ObsidianExportResult {
  outDir: string;
  filesWritten: number;
  indexPath: string;
  byType: Record<string, number>;
}

/**
 * Transform `[[Display Name]]` wikilinks to `[[slug|Display Name]]` so they
 * resolve against slug-named files. Leaves `[[already-a-slug]]` and
 * `[[slug|Display]]` forms alone.
 */
function transformWikilinks(markdown: string, nameToSlug: Map<string, string>): string {
  return markdown.replace(/\[\[([^\]|]+?)\]\]/g, (match, inner: string) => {
    const trimmed = inner.trim();
    // If the target is already a known slug (present in nameToSlug values),
    // leave it alone.
    for (const slug of nameToSlug.values()) {
      if (slug === trimmed) return match;
    }
    // Otherwise try to resolve as a display name.
    const slug = nameToSlug.get(trimmed.toLowerCase());
    return slug ? `[[${slug}|${trimmed}]]` : match;
  });
}

function buildIndex(pages: PageRecord[]): string {
  const byType: Record<string, PageRecord[]> = {};
  for (const page of pages) {
    (byType[page.pageType] ??= []).push(page);
  }
  const lines: string[] = [];
  lines.push('---');
  lines.push('type: index');
  lines.push(`generated_at: ${new Date().toISOString()}`);
  lines.push(`total_pages: ${pages.length}`);
  lines.push('---');
  lines.push('');
  lines.push('# Waggle Wiki Index');
  lines.push('');
  lines.push(`Exported ${pages.length} page(s) from your Waggle memory.`);
  lines.push('');

  const order: Array<[string, string]> = [
    ['entity', 'Entities'],
    ['concept', 'Concepts'],
    ['synthesis', 'Cross-Source Syntheses'],
  ];

  for (const [type, heading] of order) {
    const group = byType[type];
    if (!group || group.length === 0) continue;
    lines.push(`## ${heading} (${group.length})`);
    lines.push('');
    for (const page of group) {
      lines.push(`- [[${page.slug}|${page.name}]] — ${page.sourceCount} source(s)`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Write the given pages to a directory shaped for Obsidian.
 *
 * @param pages  page records from CompilationState.getAllPages()
 * @param outDir absolute directory path — created if missing. Must be writable.
 * @returns      paths actually written + per-type counts
 */
export function writeToObsidianVault(pages: PageRecord[], outDir: string): ObsidianExportResult {
  fs.mkdirSync(outDir, { recursive: true });

  // Build name → slug map for the wikilink transform. Case-insensitive
  // lookup so `[[Project Alpha]]` resolves to `project-alpha`.
  const nameToSlug = new Map<string, string>();
  for (const page of pages) {
    nameToSlug.set(page.name.toLowerCase(), page.slug);
  }

  const byType: Record<string, number> = {};
  let filesWritten = 0;

  for (const page of pages) {
    // Index + health pages are virtual — skip them; we write our own index.
    if (page.pageType === 'index' || page.pageType === 'health') continue;

    const typeDir = path.join(outDir, page.pageType);
    fs.mkdirSync(typeDir, { recursive: true });

    const content = transformWikilinks(page.markdown, nameToSlug);
    const filePath = path.join(typeDir, `${page.slug}.md`);
    fs.writeFileSync(filePath, content, 'utf-8');

    filesWritten++;
    byType[page.pageType] = (byType[page.pageType] ?? 0) + 1;
  }

  const indexPath = path.join(outDir, '_index.md');
  fs.writeFileSync(indexPath, buildIndex(pages), 'utf-8');
  filesWritten++;

  return { outDir, filesWritten, indexPath, byType };
}
