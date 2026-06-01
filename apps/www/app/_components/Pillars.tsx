import type { CSSProperties } from 'react';
import { getTranslations } from 'next-intl/server';

const PILLAR_KEYS = [
  'pillar_01',
  'pillar_02',
  'pillar_03',
  'pillar_04',
  'pillar_05',
] as const;

/**
 * The Five Pillars section (Block 3) per N2 landing story spine.
 *
 * Mirrors HowItWorks: a centered header + an `.map`-ed grid of zero-padded
 * title/body items. Copy-first cards (no bee imagery) using the honey-dot
 * numbered style. 5-up responsive grid that collapses to 2-up then 1-up,
 * matching the ProofPointsBand media-query convention.
 *
 * All strings load from `messages/en.json` under `landing.pillars.*`.
 */
export default async function Pillars() {
  const t = await getTranslations('landing.pillars');

  return (
    <section id="pillars" style={sectionStyle} className="honeycomb-bg">
      <div style={containerStyle}>
        <header style={headerStyle}>
          <h2 style={headlineStyle}>{t('headline')}</h2>
        </header>

        <ul style={gridStyle} className="pillars-grid">
          {PILLAR_KEYS.map((key, i) => (
            <li key={key} style={cardStyle} className="card-lift">
              <span style={numberStyle} aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3 style={titleStyle}>{t(`${key}.title`)}</h3>
              <p style={bodyStyle}>{t(`${key}.body`)}</p>
            </li>
          ))}
        </ul>
      </div>

      <style>{pillarsResponsiveCss}</style>
    </section>
  );
}

const sectionStyle: CSSProperties = {
  padding: '96px 24px',
  fontFamily: "'Inter', system-ui, sans-serif",
};
const containerStyle: CSSProperties = { maxWidth: 1200, margin: '0 auto' };
const headerStyle: CSSProperties = {
  textAlign: 'center',
  maxWidth: 800,
  margin: '0 auto 64px',
};
const headlineStyle: CSSProperties = {
  fontSize: 'clamp(24px, 3.4vw, 36px)',
  fontWeight: 700,
  lineHeight: 1.3,
  color: 'var(--hive-50, #f0f2f7)',
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
  minHeight: 240,
};
const numberStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  fontFamily: "'JetBrains Mono', monospace",
  letterSpacing: '0.1em',
  color: 'var(--honey-400, #f5b731)',
};
const titleStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  color: 'var(--hive-50, #f0f2f7)',
  marginTop: 4,
};
const bodyStyle: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.6,
  color: 'var(--hive-300, #7d869e)',
  marginTop: 4,
};
const pillarsResponsiveCss = `
  @media (max-width: 1024px) {
    .pillars-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
  }
  @media (max-width: 540px) {
    .pillars-grid { grid-template-columns: 1fr !important; }
  }
`;
