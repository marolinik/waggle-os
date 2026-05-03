import type { CSSProperties } from 'react';
import { getTranslations } from 'next-intl/server';

const STEP_BEES = [
  '/brand/bee-builder-dark.png',
  '/brand/bee-connector-dark.png',
  '/brand/bee-researcher-dark.png',
] as const;

const STEP_KEYS = ['step_01', 'step_02', 'step_03'] as const;

/**
 * 3-step "How It Works" section per v3.2 locked copy.
 *
 * Step 02 ending is v3.2 LOCKED (lock #5):
 *   "...persists across providers, sessions, and machines, automatically."
 *
 * All strings load from `messages/en.json` under `landing.how_it_works.*`.
 */
export default async function HowItWorks() {
  const t = await getTranslations('landing.how_it_works');

  return (
    <section id="how-it-works" style={sectionStyle} className="honeycomb-bg">
      <div style={containerStyle}>
        <header style={headerStyle}>
          <p style={eyebrowStyle}>{t('eyebrow')}</p>
          <h2 style={headlineStyle}>{t('headline')}</h2>
          <p style={subheadStyle}>{t('subhead')}</p>
        </header>

        <ol style={stepsGridStyle} className="how-grid">
          {STEP_KEYS.map((key, i) => (
            <li key={key} style={stepItemStyle}>
              <div style={beeWrapperStyle}>
                <img
                  src={STEP_BEES[i]}
                  alt=""
                  width={96}
                  height={96}
                  loading="lazy"
                  decoding="async"
                  style={beeImgStyle}
                />
                <span style={stepNumberStyle} aria-hidden="true">
                  {t(`${key}.number`)}
                </span>
              </div>
              <h3 style={stepTitleStyle}>{t(`${key}.title`)}</h3>
              <p style={stepBodyStyle}>{t(`${key}.body`)}</p>
            </li>
          ))}
        </ol>
      </div>

      <style>{howResponsiveCss}</style>
    </section>
  );
}

const sectionStyle: CSSProperties = {
  padding: '96px 24px',
  fontFamily: "'Inter', system-ui, sans-serif",
};
const containerStyle: CSSProperties = { maxWidth: 960, margin: '0 auto' };
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
const stepsGridStyle: CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 32,
};
const stepItemStyle: CSSProperties = { textAlign: 'center' };
const beeWrapperStyle: CSSProperties = {
  position: 'relative',
  display: 'inline-block',
  marginBottom: 24,
};
const beeImgStyle: CSSProperties = { width: 96, height: 96, objectFit: 'contain' };
const stepNumberStyle: CSSProperties = {
  position: 'absolute',
  top: -8,
  right: -8,
  width: 32,
  height: 32,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 12,
  fontWeight: 700,
  background: 'var(--honey-500, #e5a000)',
  color: 'var(--hive-950, #08090c)',
};
const stepTitleStyle: CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  marginBottom: 12,
  color: 'var(--hive-50, #f0f2f7)',
};
const stepBodyStyle: CSSProperties = {
  fontSize: 14,
  lineHeight: 1.6,
  maxWidth: 280,
  margin: '0 auto',
  color: 'var(--hive-300, #7d869e)',
};
const howResponsiveCss = `
  @media (max-width: 768px) {
    .how-grid { grid-template-columns: 1fr !important; gap: 48px !important; }
  }
`;
