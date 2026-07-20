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
 *     attribute-breakout vector used by event-handler payloads.
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

/** Non-code inline rules over ALREADY-ESCAPED text. */
function applyStyledText(escaped: string, protectedHrefToken = ''): string {
  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label: string, url: string) => {
      const u = String(url).trim();
      const safeScheme = /^https?:\/\//i.test(u) || u.startsWith('/') || u.startsWith('#');
      // A protected inline-code token is valid in link text, but never in an
      // href: restoring a <code> tag inside an attribute would be unsafe.
      const safe = safeScheme && (!protectedHrefToken || !u.includes(protectedHrefToken));
      return safe
        ? `<a href="${u}" class="text-honey underline" target="_blank" rel="noopener noreferrer">${label}</a>`
        : `${label} (${u})`;
    });
}

/** Inline rules over ALREADY-ESCAPED text, with code isolated first. */
function applyInline(escaped: string): string {
  let placeholderPrefix = '\uE000WAGGLE_CODE_';
  while (escaped.includes(placeholderPrefix)) placeholderPrefix = `\uE000${placeholderPrefix}`;
  const codeSegments: string[] = [];
  const codePattern = /`([^`\n]+)`/g;
  const protectedText = escaped.replace(codePattern, (_match, code: string) => {
    const index = codeSegments.push(code) - 1;
    return `${placeholderPrefix}${index}\uE001`;
  });
  let rendered = applyStyledText(protectedText, placeholderPrefix);

  for (let index = 0; index < codeSegments.length; index++) {
    const token = `${placeholderPrefix}${index}\uE001`;
    const code = `<code class="px-1 py-0.5 rounded bg-muted text-xs font-mono">${codeSegments[index]}</code>`;
    rendered = rendered.split(token).join(code);
  }
  return rendered;
}

function renderCodeBlock(lines: string[], language: string): string {
  const languageAttribute = language ? ` data-language="${language}"` : '';
  return `<pre class="my-2 max-w-full overflow-x-auto rounded-lg bg-muted p-3 text-xs leading-relaxed"><code class="font-mono whitespace-pre"${languageAttribute}>${lines.join('\n')}</code></pre>`;
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
  let fence: { language: string; lines: string[] } | null = null;

  for (const line of lines) {
    if (fence) {
      if (/^\s*```\s*$/.test(line)) {
        out.push(renderCodeBlock(fence.lines, fence.language));
        fence = null;
      } else {
        fence.lines.push(line);
      }
      continue;
    }

    const fenceStart = /^\s*```\s*([A-Za-z0-9_+-]*)\s*$/.exec(line);
    if (fenceStart) {
      fence = { language: fenceStart[1], lines: [] };
      continue;
    }

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

  // During streaming, an opening fence may arrive before its closing marker.
  // Render the partial body as code now; the next full-source render will close it.
  if (fence) out.push(renderCodeBlock(fence.lines, fence.language));

  return out.join('');
}
