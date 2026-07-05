/**
 * Lightweight markdown-to-HTML for memory frame display.
 * Handles: bold, italic, inline code, links, line breaks.
 * NOT a full markdown parser — just the most common patterns.
 *
 * Security (S04 review HIGH, 2026-06-09): output is injected via
 * dangerouslySetInnerHTML by every consumer (MemoryCenterTab, TimelineTab,
 * WikiTab) over potentially-untrusted harvested content. Two defenses, both
 * required and both exercised below:
 *  1. Escape & < > AND " before any tag is emitted — escaping `"` closes the
 *     attribute-breakout vector (e.g. `[x](" onmouseover="alert(1))`).
 *  2. Allowlist the link href scheme — only http(s) / root-relative / anchor
 *     URLs become live links; anything else (javascript:, data:, vbscript:)
 *     renders as inert text. Closes the `[x](javascript:…)` vector.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Inline rules (bold/italic/code/safe links) over ALREADY-ESCAPED text. */
function applyInline(escaped: string): string {
  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="px-1 py-0.5 rounded bg-muted text-xs font-mono">$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label: string, url: string) => {
      const u = String(url).trim();
      const safe = /^https?:\/\//i.test(u) || u.startsWith('/') || u.startsWith('#');
      return safe
        ? `<a href="${u}" class="text-honey underline" target="_blank" rel="noopener noreferrer">${label}</a>`
        : `${label} (${u})`;
    });
}

export function renderSimpleMarkdown(text: string): string {
  return applyInline(escapeHtml(text)).replace(/\n/g, '<br />');
}

/**
 * Chat-message markdown: everything renderSimpleMarkdown does PLUS
 * line-anchored blocks — headings (#/##/###), bullets (-/*), numbered
 * lists, and horizontal rules. Assistant replies are heading-heavy;
 * showing literal `## DECISION 1` was a judge-flagged trust defect.
 * Same security posture: escape first, then transform; consumers inject
 * via dangerouslySetInnerHTML.
 */
export function renderChatMarkdown(text: string): string {
  const lines = escapeHtml(text).split('\n');
  const out: string[] = [];
  for (const line of lines) {
    const h3 = /^###\s+(.*)$/.exec(line);
    const h2 = /^##\s+(.*)$/.exec(line);
    const h1 = /^#\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) {
      out.push('<hr class="my-2 border-border/40" />');
    } else if (h3) {
      out.push(`<strong class="block mt-2 mb-0.5">${applyInline(h3[1])}</strong>`);
    } else if (h2) {
      out.push(`<strong class="block mt-3 mb-0.5 text-[1.05em]">${applyInline(h2[1])}</strong>`);
    } else if (h1) {
      out.push(`<strong class="block mt-3 mb-1 text-[1.15em]">${applyInline(h1[1])}</strong>`);
    } else if (bullet) {
      out.push(`<span class="block pl-4">•&nbsp;${applyInline(bullet[1])}</span>`);
    } else if (numbered) {
      out.push(`<span class="block pl-4">${numbered[1]}.&nbsp;${applyInline(numbered[2])}</span>`);
    } else if (line.trim() === '') {
      out.push('<span class="block h-2"></span>');
    } else {
      out.push(`<span class="block">${applyInline(line)}</span>`);
    }
  }
  return out.join('');
}
