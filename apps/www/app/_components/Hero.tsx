import type { CSSProperties } from 'react';
import { getTranslations } from 'next-intl/server';
import DownloadCTA from './DownloadCTA';
import HeroVisual from './HeroVisual';
import type { HeroVariantId } from '../_data/hero-variants';

interface HeroProps {
  readonly variantId: HeroVariantId;
}

const MICROCOPY_KEYS = [
  'microcopy_local_first',
  'microcopy_any_model',
  'microcopy_data',
] as const;

/**
 * Hero section — N2 single committed variant.
 *
 * The 5-variant A/B infra (resolver, `heroVariantsMeta`, HeroVisual dev tabs)
 * stays intact: `variantId` is still resolved server-side in `page.tsx` and
 * passed to `<HeroVisual initialVariant={variantId} />` for the dev variant
 * tabs. The Hero COPY no longer switches by variant — it reads the committed
 * FLAT keys under `landing.hero.*`. The `variant_*` blocks remain in en.json
 * as inert data for the resolver/dev-tabs only.
 *
 * The headline ("Be the expert. We'll be the AI.") renders with the second
 * sentence in honey for visual parity with the prior split-color treatment.
 * The single microcopy line is replaced by the 3 committed chips.
 *
 * All strings load from `messages/en.json` under `landing.hero.*`.
 * `<HeroVisual>` is a Client Component (animations + dev variant tabs);
 * this server component composes it directly.
 */
export default async function Hero({ variantId }: HeroProps) {
  const t = await getTranslations('landing.hero');

  // Committed headline is one locked string ("Be the expert. We'll be the
  // AI."). Split on the first sentence boundary to render the second sentence
  // in honey for visual parity with the prior split-color treatment, while
  // keeping the copy i18n-driven (no hardcoded JSX literal that could drift
  // from en.json). Falls back to the whole string if the boundary is absent.
  const headline = t('headline');
  const splitAt = headline.indexOf('. ');
  const headlineLead = splitAt >= 0 ? headline.slice(0, splitAt + 1) : headline;
  const headlineEmphasis = splitAt >= 0 ? headline.slice(splitAt + 2) : '';

  return (
    <section id="hero" style={sectionStyle} className="honeycomb-bg">
      <div style={containerStyle} className="hero-grid">
        {/* Left column — text + CTAs */}
        <div style={leftColStyle}>
          <p style={eyebrowStyle}>{t('eyebrow')}</p>

          <h1 style={headlineStyle}>
            {headlineLead}
            {headlineEmphasis ? (
              <>
                {' '}
                <span style={{ color: 'var(--honey-400, #f5b731)' }}>
                  {headlineEmphasis}
                </span>
              </>
            ) : null}
          </h1>

          <p style={subheadStyle}>{t('subhead')}</p>

          <div style={ctaRowStyle}>
            <DownloadCTA section="hero" variant="primary" />
            <a href="#how-it-works" style={secondaryCTAStyle} className="btn-press">
              {t('secondary_cta')}
            </a>
          </div>

          <ul style={microcopyStyle} className="hero-microcopy">
            {MICROCOPY_KEYS.map((key) => (
              <li key={key} style={microcopyItemStyle}>
                <span aria-hidden="true" style={microcopyDotStyle} />
                {t(key)}
              </li>
            ))}
          </ul>
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
  marginBottom: 32,
  color: 'var(--hive-200, #b0b7cc)',
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
  listStyle: 'none',
  padding: 0,
  margin: 0,
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 16,
  rowGap: 8,
  fontSize: 12,
  fontFamily: "'JetBrains Mono', monospace",
  color: 'var(--hive-400, #5a6380)',
  letterSpacing: '0.02em',
};

const microcopyItemStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
};

const microcopyDotStyle: CSSProperties = {
  width: 4,
  height: 4,
  borderRadius: '50%',
  background: 'var(--honey-500, #e5a000)',
  display: 'inline-block',
};

const heroResponsiveCss = `
  @media (max-width: 1023px) {
    .hero-grid {
      grid-template-columns: 1fr !important;
      gap: 48px !important;
    }
  }
`;
