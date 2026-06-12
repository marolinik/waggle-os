/**
 * render-markdown — locks the chat/memory markdown renderers, including the
 * S04 security posture (escape-first + href scheme allowlist) that was
 * previously review-verified but not test-locked.
 */
import { describe, it, expect } from 'vitest';
import { renderSimpleMarkdown, renderChatMarkdown } from './render-markdown';

describe('renderSimpleMarkdown', () => {
  it('renders bold, italic, code, and line breaks', () => {
    const html = renderSimpleMarkdown('**b** *i* `c`\nnext');
    expect(html).toContain('<strong>b</strong>');
    expect(html).toContain('<em>i</em>');
    expect(html).toContain('>c</code>');
    expect(html).toContain('<br />');
  });

  it('escapes raw HTML before any tag is emitted', () => {
    const html = renderSimpleMarkdown('<script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('refuses javascript: links (renders as inert text)', () => {
    const html = renderSimpleMarkdown('[x](javascript:alert(1))');
    expect(html).not.toContain('<a ');
    expect(html).toContain('x (javascript:alert(1))');
  });

  it('escapes quotes to block attribute breakout', () => {
    const html = renderSimpleMarkdown('[x](" onmouseover="alert(1))');
    expect(html).not.toContain('onmouseover="');
  });
});

describe('renderChatMarkdown', () => {
  it('renders headings as block strongs, not literal hashes', () => {
    const html = renderChatMarkdown('# Title\n## Section\n### Sub');
    expect(html).not.toContain('# Title');
    expect(html).toContain('>Title</strong>');
    expect(html).toContain('>Section</strong>');
    expect(html).toContain('>Sub</strong>');
  });

  it('renders bullets and numbered lists', () => {
    const html = renderChatMarkdown('- one\n* two\n1. three\n2) four');
    expect(html).toContain('•&nbsp;one');
    expect(html).toContain('•&nbsp;two');
    expect(html).toContain('1.&nbsp;three');
    expect(html).toContain('2.&nbsp;four');
  });

  it('renders horizontal rules', () => {
    expect(renderChatMarkdown('---')).toContain('<hr');
  });

  it('applies inline rules inside headings and bullets', () => {
    const html = renderChatMarkdown('## **Period covered:** April');
    expect(html).toContain('<strong>Period covered:</strong>');
  });

  it('escapes raw HTML in every line shape', () => {
    const html = renderChatMarkdown('# <img src=x onerror=alert(1)>\n- <script>x</script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script>');
  });

  it('refuses javascript: links', () => {
    const html = renderChatMarkdown('[x](javascript:alert(1))');
    expect(html).not.toContain('<a ');
  });

  it('preserves blank-line spacing between paragraphs', () => {
    const html = renderChatMarkdown('a\n\nb');
    expect(html).toContain('<span class="block h-2">');
  });
});
