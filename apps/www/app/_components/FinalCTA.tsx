import type { CSSProperties } from 'react';
import { getTranslations } from 'next-intl/server';
import DownloadCTA from './DownloadCTA';

const KVARK_CONTACT =
  'mailto:kvark@egzakta.com?subject=Waggle%20%E2%86%92%20KVARK%20sovereign%20deployment';

/**
 * Final CTA section — closes the page with a primary download + secondary
 * "Compare tiers" CTA, plus a one-sentence KVARK bridge per amendment §1.5.
 *
 * Subhead is v3.2 LOCKED (lock #6). All strings live under
 * `landing.final_cta.*` in `messages/en.json`.
 */
export default async function FinalCTA() {
  const t = await getTranslations('landing.final_cta');

  return (
    <section id="cta" style={sectionStyle}>
      <div style={containerStyle}>
        <h2 style={headlineStyle}>{t('headline')}</h2>
        <p style={subheadStyle}>{t('subhead')}</p>

        <div style={ctaRowStyle}>
          <DownloadCTA section="final-cta" variant="primary" />
          <a href="#pricing" style={secondaryCTAStyle} className="btn-press">
            {t('compare_cta')}
          </a>
        </div>

        <div style={kvarkBridgeStyle}>
          <span style={kvarkTextStyle}>{t('kvark_text')}</span>{' '}
          <a href={KVARK_CONTACT} style={kvarkLinkStyle}>
            {t('kvark_cta')}
          </a>
        </div>
      </div>
    </section>
  );
}

const sectionStyle: CSSProperties = {
  padding: '96px 24px',
  background: 'var(--hive-950, #0e0c07)',
  fontFamily: "var(--sans)",
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
  color: 'var(--hive-50, #f6f1e4)',
  marginBottom: 16,
};
const subheadStyle: CSSProperties = {
  fontSize: 16,
  lineHeight: 1.6,
  color: 'var(--hive-300, #c8bfa9)',
  marginBottom: 32,
};
const ctaRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'center',
  gap: 12,
  marginBottom: 32,
};
const secondaryCTAStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '14px 24px',
  borderRadius: 12,
  fontSize: 14,
  fontWeight: 600,
  textDecoration: 'none',
  color: 'var(--hive-100, #ece3d0)',
  border: '1px solid var(--hive-600, #4a4030)',
  fontFamily: "var(--sans)",
};
const kvarkBridgeStyle: CSSProperties = {
  marginTop: 16,
  padding: '20px 24px',
  borderRadius: 12,
  background: 'var(--hive-900, #14110b)',
  border: '1px solid var(--hive-700, #272117)',
  fontSize: 14,
  lineHeight: 1.6,
};
const kvarkTextStyle: CSSProperties = { color: 'var(--hive-300, #c8bfa9)' };
const kvarkLinkStyle: CSSProperties = {
  color: 'var(--honey-400, #f6c45a)',
  fontWeight: 600,
  textDecoration: 'none',
};
