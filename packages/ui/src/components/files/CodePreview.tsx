/**
 * CodePreview — displays code content with optional line numbers.
 *
 * Accepts pre-highlighted HTML (from Shiki in the desktop app) or plain text.
 * Actual syntax highlighting integration is deferred to the desktop app layer.
 */

import DOMPurify from 'dompurify';

export interface CodePreviewProps {
  content: string;
  language?: string;
  lineNumbers?: boolean;
  highlightedHtml?: string;  // Pre-rendered HTML from Shiki
}

export function CodePreview({ content, language, lineNumbers = true, highlightedHtml }: CodePreviewProps) {
  const lines = content.split('\n');

  return (
    <div className="code-preview bg-background rounded overflow-auto text-sm font-mono">
      {/* Language badge */}
      {language && (
        <div className="code-preview__lang px-3 py-1 text-xs text-muted-foreground border-b border-border">
          {language}
        </div>
      )}

      {/* Shiki pre-rendered HTML path (trusted content from desktop app shell) */}
      {highlightedHtml ? (
        <div
          className="code-preview__content code-preview__highlighted py-2 px-3 overflow-x-auto"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(highlightedHtml, { ALLOWED_TAGS: ['span', 'pre', 'code', 'div'], ALLOWED_ATTR: ['class', 'style'] }) }}
        />
      ) : (
        <div className="code-preview__content flex">
          {/* Line numbers gutter */}
          {lineNumbers && (
            <div className="code-preview__gutter select-none text-right pr-3 pl-3 py-2 text-muted-foreground/60 border-r border-border">
              {lines.map((_, i) => (
                <div key={i} className="leading-5">
                  {i + 1}
                </div>
              ))}
            </div>
          )}

          {/* Code body */}
          <pre className="code-preview__body flex-1 py-2 px-3 overflow-x-auto">
            <code>
              {lines.map((line, i) => (
                <div key={i} className="leading-5 text-foreground">
                  {line || '\u00A0'}
                </div>
              ))}
            </code>
          </pre>
        </div>
      )}
    </div>
  );
}
