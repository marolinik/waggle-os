import type { CSSProperties } from 'react';
import { getTranslations } from 'next-intl/server';

/**
 * Comparison beat (Block 4a — homepage SOFT/UNNAMED variant) per N2 spine.
 *
 * Mirrors TrustBand: a centered single column with eyebrow + headline +
 * body paragraph. Uses the SOFT/UNNAMED copy only — the NAMED OpenClaw/
 * Hermes variant belongs on /for/power-users, NOT the homepage.
 *
 * All strings load from `messages/en.json` under `landing.comparison.*`.
 */
export default async function ComparisonBeat() {
  const t = await getTranslations('landing.comparison');

  return (
    <section id="comparison" style={sectionStyle} className="honeycomb-bg">
      <div style={containerStyle}>
        <p style={eyebrowStyle}>{t('eyebrow')}</p>
        <h2 style={headlineStyle}>{t('headline')}</h2>
        <p style={bodyStyle}>{t('body')}</p>
      </div>
    </section>
  );
}

const sectionStyle: CSSProperties = {
  padding: '96px 24px',
  fontFamily: "var(--sans)",
  position: 'relative',
};
const containerStyle: CSSProperties = {
  maxWidth: 800,
  margin: '0 auto',
  textAlign: 'center',
};
const eyebrowStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  marginBottom: 16,
  color: 'var(--honey-500, #e9a52c)',
};
const headlineStyle: CSSProperties = {
  fontSize: 'clamp(24px, 3.4vw, 36px)',
  fontWeight: 700,
  lineHeight: 1.25,
  color: 'var(--hive-50, #f6f1e4)',
  marginBottom: 20,
  maxWidth: 720,
  marginLeft: 'auto',
  marginRight: 'auto',
};
const bodyStyle: CSSProperties = {
  fontSize: 16,
  lineHeight: 1.7,
  color: 'var(--hive-300, #c8bfa9)',
  maxWidth: 680,
  margin: '0 auto',
};
