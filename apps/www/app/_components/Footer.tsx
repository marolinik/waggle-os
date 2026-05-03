import type { CSSProperties } from 'react';

interface FooterLink {
  readonly label: string;
  readonly href: string;
  readonly external?: boolean;
}

const PRODUCT_LINKS: readonly FooterLink[] = [
  { label: 'Download', href: 'https://github.com/marolinik/waggle-os/releases/latest', external: true },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Personas', href: '#personas' },
  { label: 'How it works', href: '#how-it-works' },
];

const RESEARCH_LINKS: readonly FooterLink[] = [
  { label: 'arxiv preprint', href: '#', external: true },
  { label: 'Methodology', href: '#', external: true },
  { label: 'Benchmarks', href: '#', external: true },
  { label: 'Changelog', href: '#' },
];

const COMPANY_LINKS: readonly FooterLink[] = [
  { label: 'About Egzakta', href: 'https://egzakta.com', external: true },
  { label: 'Blog', href: '#' },
  { label: 'Press', href: '#' },
  { label: 'Contact', href: 'mailto:hello@egzakta.com' },
];

const LEGAL_LINKS: readonly FooterLink[] = [
  { label: 'Terms', href: '/legal/terms' },
  { label: 'Privacy', href: '/legal/privacy' },
  { label: 'EU AI Act statement', href: '/legal/eu-ai-act' },
  { label: 'Apache 2.0 license', href: 'https://github.com/marolinik/waggle-os/blob/main/LICENSE', external: true },
];

interface ColumnProps {
  readonly title: string;
  readonly links: ReadonlyArray<FooterLink>;
}

function Column({ title, links }: ColumnProps) {
  return (
    <div>
      <h3 style={columnTitleStyle}>{title}</h3>
      <ul style={columnListStyle}>
        {links.map((l) => (
          <li key={l.label} style={{ marginBottom: 8 }}>
            <a
              href={l.href}
              {...(l.external ? { target: '_blank', rel: 'noopener noreferrer' } : null)}
              style={columnLinkStyle}
            >
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Footer() {
  return (
    <footer id="footer" style={footerStyle}>
      <div style={topGridStyle} className="footer-grid">
        {/* Brand block */}
        <div style={brandBlockStyle}>
          <span style={wordmarkStyle}>Waggle</span>
          <p style={brandDescriptionStyle}>
            The AI workspace where memory persists. Local-first, model-agnostic,
            audit-ready.
          </p>
          <p style={attributionStyle}>
            A product of Egzakta Group · waggle-os.ai
          </p>
        </div>

        <Column title="Product" links={PRODUCT_LINKS} />
        <Column title="Research" links={RESEARCH_LINKS} />
        <Column title="Company" links={COMPANY_LINKS} />
        <Column title="Legal" links={LEGAL_LINKS} />
      </div>

      <div style={baseLineStyle} className="footer-baseline">
        <span>© 2026 Egzakta Advisory · Waggle is a product of Egzakta Group</span>
        <span style={baseLineRightStyle}>
          v1.0 · waggle-os.ai · built calmly across DACH · CEE · UK
        </span>
      </div>

      <style>{footerResponsiveCss}</style>
    </footer>
  );
}

/* ────────────────────────────────────────────────────────────────── */

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

const brandBlockStyle: CSSProperties = {
  maxWidth: 320,
};

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

const columnListStyle: CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
};

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
    .footer-grid {
      grid-template-columns: 1fr 1fr 1fr !important;
      gap: 32px !important;
    }
  }
  @media (max-width: 640px) {
    .footer-grid {
      grid-template-columns: 1fr 1fr !important;
    }
    .footer-baseline {
      justify-content: flex-start !important;
      flex-direction: column;
    }
  }
`;
