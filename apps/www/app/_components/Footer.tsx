import type { CSSProperties } from 'react';
import { getTranslations } from 'next-intl/server';

interface FooterLink {
  readonly key: string;
  readonly href: string;
  readonly external?: boolean;
}

const PRODUCT_LINKS: readonly FooterLink[] = [
  { key: 'download', href: 'https://github.com/marolinik/waggle-os/releases/latest', external: true },
  { key: 'pricing', href: '#pricing' },
  { key: 'personas', href: '#personas' },
  { key: 'how_it_works', href: '#how-it-works' },
];

const RESEARCH_LINKS: readonly FooterLink[] = [
  { key: 'arxiv', href: '#', external: true },
  { key: 'methodology', href: '#', external: true },
  { key: 'benchmarks', href: '#', external: true },
  { key: 'changelog', href: '#' },
];

const COMPANY_LINKS: readonly FooterLink[] = [
  { key: 'about_egzakta', href: 'https://egzakta.com', external: true },
  { key: 'blog', href: '#' },
  { key: 'press', href: '#' },
  { key: 'contact', href: 'mailto:hello@egzakta.com' },
];

const LEGAL_LINKS: readonly FooterLink[] = [
  { key: 'terms', href: '/legal/terms' },
  { key: 'privacy', href: '/legal/privacy' },
  { key: 'eu_ai_act', href: '/legal/eu-ai-act' },
  { key: 'apache', href: 'https://github.com/marolinik/waggle-os/blob/main/LICENSE', external: true },
];

const COLUMN_DEFS = [
  { ns: 'product', links: PRODUCT_LINKS },
  { ns: 'research', links: RESEARCH_LINKS },
  { ns: 'company', links: COMPANY_LINKS },
  { ns: 'legal', links: LEGAL_LINKS },
] as const;

export default async function Footer() {
  const t = await getTranslations('landing.footer');

  return (
    <footer id="footer" style={footerStyle}>
      <div style={topGridStyle} className="footer-grid">
        <div style={brandBlockStyle}>
          <span style={wordmarkStyle}>{t('brand.wordmark')}</span>
          <p style={brandDescriptionStyle}>{t('brand.description')}</p>
          <p style={attributionStyle}>{t('brand.attribution')}</p>
        </div>

        {COLUMN_DEFS.map((col) => (
          <div key={col.ns}>
            <h3 style={columnTitleStyle}>{t(`columns.${col.ns}.title`)}</h3>
            <ul style={columnListStyle}>
              {col.links.map((l) => (
                <li key={l.key} style={{ marginBottom: 8 }}>
                  <a
                    href={l.href}
                    {...(l.external ? { target: '_blank', rel: 'noopener noreferrer' } : null)}
                    style={columnLinkStyle}
                  >
                    {t(`columns.${col.ns}.links.${l.key}`)}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div style={baseLineStyle} className="footer-baseline">
        <span>{t('base_line.left')}</span>
        <span style={baseLineRightStyle}>{t('base_line.right')}</span>
      </div>

      <style>{footerResponsiveCss}</style>
    </footer>
  );
}

const footerStyle: CSSProperties = {
  padding: '64px 24px 32px',
  background: 'var(--hive-950, #08090c)',
  borderTop: '1px solid var(--hive-700, #1f2433)',
  fontFamily: "'Inter', system-ui, sans-serif",
};
const topGridStyle: CSSProperties = {
  maxWidth: 1200,
  margin: '0 auto 48px',
  display: 'grid',
  gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
  gap: 48,
};
const brandBlockStyle: CSSProperties = { maxWidth: 320 };
const wordmarkStyle: CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
  color: 'var(--hive-50, #f0f2f7)',
  display: 'block',
  marginBottom: 12,
};
const brandDescriptionStyle: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.6,
  color: 'var(--hive-300, #7d869e)',
  marginBottom: 12,
};
const attributionStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--hive-400, #5a6380)',
};
const columnTitleStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  color: 'var(--hive-200, #b0b7cc)',
  marginBottom: 16,
};
const columnListStyle: CSSProperties = { listStyle: 'none', padding: 0, margin: 0 };
const columnLinkStyle: CSSProperties = {
  fontSize: 13,
  color: 'var(--hive-300, #7d869e)',
  textDecoration: 'none',
};
const baseLineStyle: CSSProperties = {
  maxWidth: 1200,
  margin: '0 auto',
  paddingTop: 24,
  borderTop: '1px solid var(--hive-800, #171b26)',
  display: 'flex',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: 12,
  fontSize: 12,
  color: 'var(--hive-500, #3d4560)',
};
const baseLineRightStyle: CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
};
const footerResponsiveCss = `
  @media (max-width: 1023px) {
    .footer-grid { grid-template-columns: 1fr 1fr 1fr !important; gap: 32px !important; }
  }
  @media (max-width: 640px) {
    .footer-grid { grid-template-columns: 1fr 1fr !important; }
    .footer-baseline { justify-content: flex-start !important; flex-direction: column; }
  }
`;
