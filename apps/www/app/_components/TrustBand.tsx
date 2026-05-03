import type { CSSProperties } from 'react';
import { getTranslations } from 'next-intl/server';

const SIGNAL_KEYS = [
  'zero_cloud',
  'eu_ai_act',
  'apache',
  'arxiv',
  'egzakta',
] as const;

const SIGNAL_HREFS: Partial<Record<(typeof SIGNAL_KEYS)[number], string>> = {
  arxiv: '#',
};

/**
 * Trust Band — Egzakta backing block + 5 trust signals per v3.2 dump.
 *
 * All strings live in `messages/en.json` under `landing.trust.*` (header)
 * and `landing.trust.signals.*` (signal labels).
 */
export default async function TrustBand() {
  const t = await getTranslations('landing.trust');

  return (
    <section id="trust" style={sectionStyle} className="honeycomb-bg">
      <div style={containerStyle}>
        <p style={eyebrowBadgeStyle}>{t('eyebrow_badge')}</p>
        <h2 style={headlineStyle}>{t('headline')}</h2>
        <p style={subheadStyle}>{t('subhead')}</p>

        <ul style={signalsStyle} className="trust-signals">
          {SIGNAL_KEYS.map((key) => {
            const href = SIGNAL_HREFS[key];
            const label = t(`signals.${key}`);
            return (
              <li key={key} style={signalItemStyle}>
                <span aria-hidden="true" style={signalDotStyle} />
                {href ? (
                  <a href={href} style={signalLinkStyle}>
                    {label}
                  </a>
                ) : (
                  <span style={signalLabelStyle}>{label}</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <style>{trustResponsiveCss}</style>
    </section>
  );
}

const sectionStyle: CSSProperties = {
  padding: '96px 24px',
  fontFamily: "'Inter', system-ui, sans-serif",
  position: 'relative',
};
const containerStyle: CSSProperties = {
  maxWidth: 960,
  margin: '0 auto',
  textAlign: 'center',
};
const eyebrowBadgeStyle: CSSProperties = {
  display: 'inline-block',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  padding: '6px 14px',
  borderRadius: 999,
  background: 'var(--honey-glow, rgba(229,160,0,0.12))',
  border: '1px solid rgba(229,160,0,0.2)',
  color: 'var(--honey-400, #f5b731)',
  marginBottom: 20,
};
const headlineStyle: CSSProperties = {
  fontSize: 'clamp(22px, 3vw, 28px)',
  fontWeight: 700,
  lineHeight: 1.3,
  color: 'var(--hive-50, #f0f2f7)',
  marginBottom: 16,
  maxWidth: 800,
  marginLeft: 'auto',
  marginRight: 'auto',
};
const subheadStyle: CSSProperties = {
  fontSize: 15,
  lineHeight: 1.6,
  color: 'var(--hive-300, #7d869e)',
  maxWidth: 720,
  margin: '0 auto 48px',
};
const signalsStyle: CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'center',
  gap: 24,
  rowGap: 12,
};
const signalItemStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  fontSize: 13,
};
const signalDotStyle: CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: 'var(--honey-500, #e5a000)',
  display: 'inline-block',
};
const signalLabelStyle: CSSProperties = {
  color: 'var(--hive-200, #b0b7cc)',
  fontFamily: "'Inter', system-ui, sans-serif",
};
const signalLinkStyle: CSSProperties = {
  ...signalLabelStyle,
  textDecoration: 'underline',
  textDecorationColor: 'var(--hive-600, #2a3044)',
  textUnderlineOffset: 4,
};
const trustResponsiveCss = `
  @media (max-width: 640px) {
    .trust-signals {
      flex-direction: column !important;
      align-items: flex-start !important;
      max-width: 320px;
      margin-left: auto !important;
      margin-right: auto !important;
    }
  }
`;
