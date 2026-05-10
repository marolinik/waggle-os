/**
 * Shared text chunking utility for harvest adapters.
 *
 * Splits text into chunks by paragraph boundaries (double-newline),
 * respecting a configurable maximum character length per chunk.
 */

const DEFAULT_MAX_LENGTH = 2000;

export function chunkByParagraphs(text: string, maxLen: number = DEFAULT_MAX_LENGTH): string[] {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (current.length + trimmed.length + 2 > maxLen && current.length > 0) {
      chunks.push(current.trim());
      current = trimmed;
    } else {
      current += (current ? '\n\n' : '') + trimmed;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}
