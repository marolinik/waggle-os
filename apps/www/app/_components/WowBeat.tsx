import type { CSSProperties } from 'react';
import { getTranslations } from 'next-intl/server';

/**
 * The "Wow" beat (Block 6) per N2 landing story spine.
 *
 * Mirrors FinalCTA's centered headline + subhead layout, minus the CTA
 * buttons and KVARK bridge — an emotional close placed just before the
 * Trust band.
 *
 * All strings load from `messages/en.json` under `landing.wow.*`.
 */
export default async function WowBeat() {
  const t = await getTranslations('landing.wow');

  return (
    <section id="wow" style={sectionStyle}>
      <div style={containerStyle}>
        <h2 style={headlineStyle}>{t('headline')}</h2>
        <p style={bodyStyle}>{t('body')}</p>
      </div>
    </section>
  );
}

const sectionStyle: CSSProperties = {
  padding: '96px 24px',
  background: 'var(--hive-950, #08090c)',
  fontFamily: "'Inter', system-ui, sans-serif",
};
const containerStyle: CSSProperties = {
  maxWidth: 720,
  margin: '0 auto',
  textAlign: 'center',
};
const headlineStyle: CSSProperties = {
  fontSize: 'clamp(28px, 4vw, 40px)',
  fontWeight: 700,
  lineHeight: 1.2,
  color: 'var(--hive-50, #f0f2f7)',
  marginBottom: 16,
};
const bodyStyle: CSSProperties = {
  fontSize: 16,
  lineHeight: 1.7,
  color: 'var(--hive-300, #7d869e)',
};
