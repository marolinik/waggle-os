import type { CSSProperties } from 'react';
import { getTranslations } from 'next-intl/server';
import DownloadCTA from './DownloadCTA';
import HeroVisual from './HeroVisual';
import { heroVariantsMeta, type HeroVariantId } from '../_data/hero-variants';

interface HeroProps {
  readonly variantId: HeroVariantId;
}

/**
 * Hero section — 5-variant copy resolved server-side from URL search params
 * via `_lib/hero-headline-resolver.ts`. Variant A (Marcus, default) renders
 * with split-color headline (lead in cool light + honey emphasis); B-E use
 * single-sentence headlines.
 *
 * Microcopy strip below CTAs is v3.2 LOCKED (lock #1):
 *   "17 AI platforms · Local-first · Apache 2.0 · EU AI Act ready"
 *
 * All strings load from `messages/en.json` under `landing.hero.*`.
 * `<HeroVisual>` is a Client Component (animations + dev variant tabs);
 * this server component composes it directly.
 */
export default async function Hero({ variantId }: HeroProps) {
  const meta = heroVariantsMeta[variantId];
  const t = await getTranslations('landing.hero');
  const tv = await getTranslations(`landing.hero.${meta.i18nKey}`);

  return (
    <section id="hero" style={sectionStyle} className="honeycomb-bg">
      <div style={containerStyle} className="hero-grid">
        {/* Left column — text + CTAs */}
        <div style={leftColStyle}>
          <p style={eyebrowStyle}>{tv('eyebrow')}</p>

          <h1 style={headlineStyle}>
            {tv('headline_lead')}
            {meta.hasEmphasis ? (
              <>
                {' '}
                <span style={{ color: 'var(--honey-400, #f5b731)' }}>
                  {tv('headline_emphasis')}
                </span>
              </>
            ) : null}
          </h1>

          <p style={subheadStyle}>{tv('subhead')}</p>
          <p style={bodyStyle}>{tv('body')}</p>

          <div style={ctaRowStyle}>
            <DownloadCTA section="hero" variant="primary" />
            <a href="#how-it-works" style={secondaryCTAStyle} className="btn-press">
              {t('secondary_cta')}
            </a>
          </div>

          {/* v3.2 LOCKED (lock #1) */}
          <p style={microcopyStyle}>{t('microcopy')}</p>
        </div>

        {/* Right column — SVG hive diagram */}
        <div style={rightColStyle}>
          <HeroVisual initialVariant={variantId} />
        </div>
      </div>

      <style>{heroResponsiveCss}</style>
    </section>
  );
}

const sectionStyle: CSSProperties = {
  position: 'relative',
  paddingTop: 128,
  paddingBottom: 96,
  paddingLeft: 24,
  paddingRight: 24,
  overflow: 'hidden',
  fontFamily: "'Inter', system-ui, sans-serif",
};

const containerStyle: CSSProperties = {
  maxWidth: 1200,
  margin: '0 auto',
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 64,
  alignItems: 'center',
};

const leftColStyle: CSSProperties = { maxWidth: 560 };

const rightColStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const eyebrowStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  marginBottom: 16,
  color: 'var(--honey-500, #e5a000)',
};

const headlineStyle: CSSProperties = {
  fontSize: 'clamp(36px, 5vw, 60px)',
  fontWeight: 800,
  lineHeight: 1.1,
  marginBottom: 20,
  color: 'var(--hive-50, #f0f2f7)',
  letterSpacing: '-0.01em',
};

const subheadStyle: CSSProperties = {
  fontSize: 'clamp(16px, 1.6vw, 18px)',
  lineHeight: 1.5,
  marginBottom: 16,
  color: 'var(--hive-200, #b0b7cc)',
};

const bodyStyle: CSSProperties = {
  fontSize: 14,
  lineHeight: 1.6,
  marginBottom: 32,
  color: 'var(--hive-300, #7d869e)',
};

const ctaRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 12,
  marginBottom: 20,
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
  color: 'var(--hive-100, #dce0eb)',
  border: '1px solid var(--hive-600, #2a3044)',
  fontFamily: "'Inter', system-ui, sans-serif",
};

const microcopyStyle: CSSProperties = {
  fontSize: 12,
  fontFamily: "'JetBrains Mono', monospace",
  color: 'var(--hive-400, #5a6380)',
  letterSpacing: '0.02em',
};

const heroResponsiveCss = `
  @media (max-width: 1023px) {
    .hero-grid {
      grid-template-columns: 1fr !important;
      gap: 48px !important;
    }
  }
`;
