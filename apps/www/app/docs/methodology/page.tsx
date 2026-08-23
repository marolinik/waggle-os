import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import BrandMark from '../../_components/BrandMark';

/**
 * /docs/methodology — Day 0 Trust Band Card 4 link target per Path D landing
 * decoupling (PM 2026-05-02).
 *
 * Renders `docs/methodology.md` (committed at repo root, see SHA `7d1e0fc`)
 * via react-markdown + remark-gfm. The file is read at module-load time;
 * combined with `force-static`, the markdown is baked into the build output
 * — no per-request file I/O, no runtime fs dependency.
 *
 * Path resolution: `process.cwd()` at `next build` is `apps/www/`; going up
 * two levels (`../../docs/methodology.md`) hits the repo-root docs directory.
 *
 * Visual design per PM ratification: hive-950 background, hive-100 body
 * text, honey-500 link accent. No nav, no sidebar — single-page docs with
 * a back-to-landing link in the footer.
 */
const METHODOLOGY_MD = readFileSync(
  resolve(process.cwd(), '..', '..', 'docs', 'methodology.md'),
  'utf-8',
);

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Methodology — Waggle',
  description:
    "How Waggle's memory is evaluated: LoCoMo (N=1,540) under the prior leader's own protocol and judge (GPT-4.1-mini answerer+judge) — 86.49%, a new state of the art (+4.54pp over the prior best), reproducible offline.",
  alternates: { canonical: 'https://waggle-os.ai/docs/methodology' },
  robots: { index: true, follow: true },
};

export default function MethodologyPage() {
  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <Link href="/" style={brandLinkStyle}>
          <BrandMark withWordmark />
          <span style={separatorStyle}>·</span>
          <span style={crumbStyle}>Methodology</span>
        </Link>
      </header>

      <article style={articleStyle} className="methodology-prose">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{METHODOLOGY_MD}</ReactMarkdown>
      </article>

      <footer style={footerStyle}>
        <Link href="/" style={backLinkStyle}>
          ← Back to Waggle
        </Link>
      </footer>

      <style>{scopedCss}</style>
    </main>
  );
}

const pageStyle: CSSProperties = {
  minHeight: '100vh',
  background: 'var(--hive-950, #0e0c07)',
  color: 'var(--hive-100, #ece3d0)',
  fontFamily: "var(--sans)",
  paddingTop: 24,
  paddingBottom: 48,
};

const headerStyle: CSSProperties = {
  maxWidth: 800,
  margin: '0 auto 48px',
  padding: '0 24px',
};

const brandLinkStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  textDecoration: 'none',
  color: 'var(--hive-200, #d8cfba)',
  fontSize: 14,
};

const separatorStyle: CSSProperties = {
  color: 'var(--hive-400, #948a73)',
};

const crumbStyle: CSSProperties = {
  color: 'var(--hive-300, #c8bfa9)',
};

const articleStyle: CSSProperties = {
  maxWidth: 800,
  margin: '0 auto',
  padding: '0 24px',
};

const footerStyle: CSSProperties = {
  maxWidth: 800,
  margin: '64px auto 0',
  padding: '24px',
  borderTop: '1px solid var(--hive-700, #272117)',
  textAlign: 'center',
};

const backLinkStyle: CSSProperties = {
  display: 'inline-block',
  fontSize: 14,
  color: 'var(--honey-400, #f6c45a)',
  textDecoration: 'none',
  fontWeight: 600,
};

/* Markdown prose styling — scoped to .methodology-prose */
const scopedCss = `
  .methodology-prose {
    font-size: 16px;
    line-height: 1.65;
    color: var(--hive-100, #ece3d0);
  }
  .methodology-prose h1 {
    font-size: clamp(28px, 4vw, 36px);
    font-weight: 800;
    color: var(--hive-50, #f6f1e4);
    margin-top: 0;
    margin-bottom: 24px;
    letter-spacing: -0.01em;
  }
  .methodology-prose h2 {
    font-size: clamp(22px, 3vw, 26px);
    font-weight: 700;
    color: var(--hive-50, #f6f1e4);
    margin-top: 48px;
    margin-bottom: 16px;
  }
  .methodology-prose h3 {
    font-size: 18px;
    font-weight: 600;
    color: var(--hive-100, #ece3d0);
    margin-top: 32px;
    margin-bottom: 12px;
  }
  .methodology-prose h4 {
    font-size: 15px;
    font-weight: 600;
    color: var(--hive-200, #d8cfba);
    margin-top: 24px;
    margin-bottom: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .methodology-prose p {
    margin: 0 0 16px;
    color: var(--hive-200, #d8cfba);
  }
  .methodology-prose a {
    color: var(--honey-400, #f6c45a);
    text-decoration: underline;
    text-decoration-color: var(--honey-600, #c07e16);
    text-underline-offset: 3px;
  }
  .methodology-prose a:hover {
    color: var(--honey-300, #f9d27e);
  }
  .methodology-prose strong {
    color: var(--hive-50, #f6f1e4);
    font-weight: 600;
  }
  .methodology-prose em {
    color: var(--hive-100, #ece3d0);
    font-style: italic;
  }
  .methodology-prose ul,
  .methodology-prose ol {
    margin: 0 0 20px;
    padding-left: 24px;
    color: var(--hive-200, #d8cfba);
  }
  .methodology-prose li {
    margin-bottom: 8px;
  }
  .methodology-prose li > p {
    margin-bottom: 8px;
  }
  .methodology-prose code {
    font-family: 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace;
    font-size: 0.88em;
    padding: 2px 6px;
    border-radius: 4px;
    background: var(--hive-900, #14110b);
    color: var(--honey-300, #f9d27e);
    border: 1px solid var(--hive-800, #1f1a12);
  }
  .methodology-prose pre {
    margin: 16px 0 24px;
    padding: 16px 20px;
    background: var(--hive-900, #14110b);
    border: 1px solid var(--hive-700, #272117);
    border-radius: 8px;
    overflow-x: auto;
  }
  .methodology-prose pre code {
    background: transparent;
    border: none;
    padding: 0;
    color: var(--hive-100, #ece3d0);
    font-size: 13px;
    line-height: 1.5;
  }
  .methodology-prose blockquote {
    margin: 0 0 20px;
    padding: 4px 16px;
    border-left: 3px solid var(--honey-500, #e9a52c);
    background: rgba(233, 165, 44, 0.04);
    color: var(--hive-200, #d8cfba);
    font-style: italic;
  }
  .methodology-prose blockquote p {
    margin-bottom: 8px;
  }
  .methodology-prose hr {
    margin: 40px 0;
    border: none;
    border-top: 1px solid var(--hive-700, #272117);
  }
  .methodology-prose table {
    width: 100%;
    border-collapse: collapse;
    margin: 16px 0 24px;
    font-size: 14px;
  }
  .methodology-prose th,
  .methodology-prose td {
    padding: 8px 12px;
    text-align: left;
    border-bottom: 1px solid var(--hive-800, #1f1a12);
  }
  .methodology-prose th {
    background: var(--hive-850, #1a160f);
    color: var(--hive-100, #ece3d0);
    font-weight: 600;
    border-bottom: 1px solid var(--hive-700, #272117);
  }
  .methodology-prose td {
    color: var(--hive-200, #d8cfba);
  }
`;
