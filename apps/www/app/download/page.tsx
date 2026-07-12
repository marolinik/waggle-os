import type { CSSProperties } from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Download Waggle',
  description:
    'Download status and installer availability for Waggle OS desktop.',
};

const HEADING = 'Download Waggle';
const STATUS =
  'Windows and macOS installers are being prepared for the signed public release.';
const BODY =
  'Until those installers are published, you can inspect the source repository or contact Egzakta for early access.';
const SOURCE_CTA = 'View source on GitHub';
const CONTACT_CTA = 'Request installer access';

const SOURCE_URL = 'https://github.com/marolinik/waggle-os';
const CONTACT_URL = 'mailto:hello@egzakta.com?subject=Waggle%20installer%20access';

export default function DownloadPage() {
  return (
    <main style={pageStyle}>
      <section style={sectionStyle} aria-labelledby="download-heading">
        <p style={eyebrowStyle}>Desktop app</p>
        <h1 id="download-heading" style={h1Style}>
          {HEADING}
        </h1>
        <p style={statusStyle}>{STATUS}</p>
        <p style={bodyStyle}>{BODY}</p>
        <div style={actionsStyle}>
          <a href={SOURCE_URL} style={primaryLinkStyle}>
            {SOURCE_CTA}
          </a>
          <a href={CONTACT_URL} style={secondaryLinkStyle}>
            {CONTACT_CTA}
          </a>
        </div>
      </section>
    </main>
  );
}

const pageStyle: CSSProperties = {
  minHeight: '100vh',
  padding: '120px 24px 80px',
  background: 'var(--page, #0e0c07)',
  color: 'var(--hive-100, #ece3d0)',
};

const sectionStyle: CSSProperties = {
  maxWidth: 760,
  margin: '0 auto',
};

const eyebrowStyle: CSSProperties = {
  color: 'var(--honey-400, #f6c45a)',
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  marginBottom: 16,
};

const h1Style: CSSProperties = {
  color: 'var(--hive-50, #f6f1e4)',
  fontSize: 'clamp(36px, 7vw, 68px)',
  lineHeight: 1,
  margin: '0 0 24px',
};

const statusStyle: CSSProperties = {
  color: 'var(--hive-100, #ece3d0)',
  fontSize: 'clamp(18px, 2.4vw, 24px)',
  lineHeight: 1.45,
  margin: '0 0 14px',
  maxWidth: 680,
};

const bodyStyle: CSSProperties = {
  color: 'var(--hive-300, #948a73)',
  fontSize: 16,
  lineHeight: 1.7,
  margin: '0 0 32px',
  maxWidth: 640,
};

const actionsStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 12,
};

const baseLinkStyle: CSSProperties = {
  borderRadius: 8,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 44,
  padding: '0 18px',
  fontWeight: 700,
  textDecoration: 'none',
};

const primaryLinkStyle: CSSProperties = {
  ...baseLinkStyle,
  background: 'var(--honey-500, #e9a52c)',
  color: 'var(--hive-950, #0e0c07)',
};

const secondaryLinkStyle: CSSProperties = {
  ...baseLinkStyle,
  border: '1px solid var(--line-soft, rgba(236, 227, 208, 0.14))',
  color: 'var(--hive-100, #ece3d0)',
};
