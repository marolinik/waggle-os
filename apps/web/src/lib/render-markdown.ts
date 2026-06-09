/**
 * Lightweight markdown-to-HTML for memory frame display.
 * Handles: bold, italic, inline code, links, line breaks.
 * NOT a full markdown parser — just the most common patterns.
 *
 * Security (S04 review HIGH, 2026-06-09): output is injected via
 * dangerouslySetInnerHTML by every consumer (MemoryCenterTab, MemoryApp,
 * WikiTab) over potentially-untrusted harvested content. Two defenses, both
 * required and both exercised below:
 *  1. Escape & < > AND " before any tag is emitted — escaping `"` closes the
 *     attribute-breakout vector (e.g. `[x](" onmouseover="alert(1))`).
 *  2. Allowlist the link href scheme — only http(s) / root-relative / anchor
 *     URLs become live links; anything else (javascript:, data:, vbscript:)
 *     renders as inert text. Closes the `[x](javascript:…)` vector.
 */
export function renderSimpleMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="px-1 py-0.5 rounded bg-muted text-xs font-mono">$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label: string, url: string) => {
      const u = String(url).trim();
      const safe = /^https?:\/\//i.test(u) || u.startsWith('/') || u.startsWith('#');
      return safe
        ? `<a href="${u}" class="text-primary underline" target="_blank" rel="noopener noreferrer">${label}</a>`
        : `${label} (${u})`;
    })
    .replace(/\n/g, '<br />');
}
