import type { CSSProperties } from 'react';
import { getTranslations } from 'next-intl/server';
import { proofPoints } from '../_data/proof-points';

/**
 * SOTA Proof Band — 5 cards in v3.2 LOCKED order.
 *
 * Card content lives in `_data/proof-points.ts` (still as TS const, since
 * it's a structured data file rather than JSX literals — and `proofPoints`
 * is consumed via `{card.field}` interpolation, not as JSX text).
 *
 * Section header strings live in `messages/en.json` under `landing.proof.*`.
 */
export default async function ProofPointsBand() {
  const t = await getTranslations('landing.proof');

  return (
    <section id="proof" style={sectionStyle}>
      <div style={containerStyle}>
        <header style={headerStyle}>
          <p style={eyebrowStyle}>{t('eyebrow')}</p>
          <h2 style={headlineStyle}>{t('headline')}</h2>
          <p style={subheadStyle}>{t('subhead')}</p>
        </header>

        <ul style={gridStyle} className="proof-grid">
          {proofPoints.map((card) => (
            <li key={card.id} style={cardStyle} className="card-lift">
              <p style={captionStyle}>{card.caption}</p>
              <p style={statStyle}>{card.stat}</p>
              <h3 style={nameStyle}>{card.name}</h3>
              <p style={descriptionStyle}>{card.description}</p>
            </li>
          ))}
        </ul>
      </div>

      <style>{proofResponsiveCss}</style>
    </section>
  );
}

const sectionStyle: CSSProperties = {
  padding: '96px 24px',
  background: 'var(--hive-950, #08090c)',
  fontFamily: "'Inter', system-ui, sans-serif",
};
const containerStyle: CSSProperties = { maxWidth: 1200, margin: '0 auto' };
const headerStyle: CSSProperties = {
  textAlign: 'center',
  maxWidth: 640,
  margin: '0 auto 64px',
};
const eyebrowStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  marginBottom: 12,
  color: 'var(--honey-500, #e5a000)',
};
const headlineStyle: CSSProperties = {
  fontSize: 'clamp(28px, 4vw, 40px)',
  fontWeight: 700,
  marginBottom: 16,
  color: 'var(--hive-50, #f0f2f7)',
};
const subheadStyle: CSSProperties = {
  fontSize: 16,
  lineHeight: 1.6,
  color: 'var(--hive-300, #7d869e)',
};
const gridStyle: CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
  display: 'grid',
  gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
  gap: 16,
};
const cardStyle: CSSProperties = {
  background: 'var(--hive-900, #0c0e14)',
  border: '1px solid var(--hive-700, #1f2433)',
  borderRadius: 16,
  padding: 24,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  minHeight: 220,
};
const captionStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  color: 'var(--hive-400, #5a6380)',
  fontFamily: "'JetBrains Mono', monospace",
};
const statStyle: CSSProperties = {
  fontSize: 'clamp(24px, 3vw, 32px)',
  fontWeight: 800,
  color: 'var(--honey-400, #f5b731)',
  fontFamily: "'JetBrains Mono', monospace",
  letterSpacing: '-0.02em',
  marginTop: 4,
};
const nameStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--hive-100, #dce0eb)',
  marginTop: 4,
};
const descriptionStyle: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.5,
  color: 'var(--hive-300, #7d869e)',
  marginTop: 8,
};
const proofResponsiveCss = `
  @media (max-width: 1024px) {
    .proof-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
  }
  @media (max-width: 540px) {
    .proof-grid { grid-template-columns: 1fr !important; }
  }
`;
