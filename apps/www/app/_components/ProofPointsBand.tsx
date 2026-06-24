import type { CSSProperties } from 'react';
import { getTranslations } from 'next-intl/server';
import { proofPoints } from '../_data/proof-points';

/**
 * Proof Band — N2 honest 3-chip set.
 *
 * Card content lives in `_data/proof-points.ts` (still as TS const, since
 * it's a structured data file rather than JSX literals — and `proofPoints`
 * is consumed via `{card.field}` interpolation, not as JSX text).
 *
 * Section header strings live in `messages/en.json` under `landing.proof.*`.
 * A methodology footnote (`proof.methodology`) renders under the header. The
 * `proof.human_quote` slot is a LAUNCH-BLOCKER placeholder: it is intentionally
 * empty in en.json, so the figure is guarded and renders NOTHING until one real
 * tester quote is supplied — never a fabricated testimonial.
 */
export default async function ProofPointsBand() {
  const t = await getTranslations('landing.proof');
  const humanQuote = t('human_quote');

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

        <details style={methodologyStyle}>
          <summary style={methodologySummaryStyle}>How this is measured</summary>
          <p style={methodologyBodyStyle}>{t('methodology')}</p>
        </details>

        {humanQuote ? (
          <figure style={quoteStyle}>
            <blockquote style={quoteTextStyle}>{humanQuote}</blockquote>
          </figure>
        ) : null}
      </div>

      <style>{proofResponsiveCss}</style>
    </section>
  );
}

const sectionStyle: CSSProperties = {
  padding: '96px 24px',
  background: 'var(--hive-950, #0e0c07)',
  fontFamily: "var(--sans)",
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
  color: 'var(--honey-500, #e9a52c)',
};
const headlineStyle: CSSProperties = {
  fontSize: 'clamp(28px, 4vw, 40px)',
  fontWeight: 700,
  marginBottom: 16,
  color: 'var(--hive-50, #f6f1e4)',
};
const subheadStyle: CSSProperties = {
  fontSize: 16,
  lineHeight: 1.6,
  color: 'var(--hive-300, #c8bfa9)',
};
const gridStyle: CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 16,
};
const cardStyle: CSSProperties = {
  background: 'var(--hive-900, #14110b)',
  border: '1px solid var(--hive-700, #272117)',
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
  color: 'var(--hive-400, #948a73)',
  fontFamily: "var(--mono)",
};
const statStyle: CSSProperties = {
  fontSize: 'clamp(24px, 3vw, 32px)',
  fontWeight: 800,
  color: 'var(--honey-400, #f6c45a)',
  fontFamily: "var(--mono)",
  letterSpacing: '-0.02em',
  marginTop: 4,
};
const nameStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--hive-100, #ece3d0)',
  marginTop: 4,
};
const descriptionStyle: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.5,
  color: 'var(--hive-300, #c8bfa9)',
  marginTop: 8,
};
const methodologyStyle: CSSProperties = {
  maxWidth: 720,
  margin: '40px auto 0',
  textAlign: 'left',
  fontFamily: "var(--sans)",
};
const methodologySummaryStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  color: 'var(--hive-300, #c8bfa9)',
  cursor: 'pointer',
};
const methodologyBodyStyle: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.6,
  color: 'var(--hive-400, #948a73)',
  marginTop: 12,
};
const quoteStyle: CSSProperties = {
  maxWidth: 640,
  margin: '40px auto 0',
  textAlign: 'center',
};
const quoteTextStyle: CSSProperties = {
  margin: 0,
  fontSize: 18,
  lineHeight: 1.5,
  fontStyle: 'italic',
  color: 'var(--hive-100, #ece3d0)',
};
const proofResponsiveCss = `
  @media (max-width: 1024px) {
    .proof-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
  }
  @media (max-width: 540px) {
    .proof-grid { grid-template-columns: 1fr !important; }
  }
`;
