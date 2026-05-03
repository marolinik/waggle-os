'use client';

import { useCallback, useState, type CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import DownloadCTA from './DownloadCTA';
import { emit, events } from '../_lib/event-taxonomy';

type BillingPeriod = 'monthly' | 'annual';
type TierId = 'SOLO' | 'PRO' | 'TEAMS';

interface TierDef {
  readonly id: TierId;
  readonly nsKey: 'solo' | 'pro' | 'teams';
  readonly highlighted: boolean;
  readonly hasNote: boolean;
  readonly bulletKeys: readonly string[];
  readonly ctaType: 'download' | 'stripe';
}

const TIER_DEFS: readonly TierDef[] = [
  {
    id: 'SOLO',
    nsKey: 'solo',
    highlighted: false,
    hasNote: true,
    bulletKeys: [
      'bullet_personal_memory',
      'bullet_all_llms',
      'bullet_local_first',
      'bullet_audit_reports',
      'bullet_apache_substrate',
      'bullet_community_support',
    ],
    ctaType: 'download',
  },
  {
    id: 'PRO',
    nsKey: 'pro',
    highlighted: true,
    hasNote: false,
    bulletKeys: [
      'bullet_everything_solo',
      'bullet_priority_sync',
      'bullet_advanced_queries',
      'bullet_key_vault',
      'bullet_free_trial',
      'bullet_support',
    ],
    ctaType: 'stripe',
  },
  {
    id: 'TEAMS',
    nsKey: 'teams',
    highlighted: false,
    hasNote: true,
    bulletKeys: [
      'bullet_everything_pro',
      'bullet_shared_memory',
      'bullet_sso_rbac',
      'bullet_soc2',
      'bullet_csm',
      'bullet_kvark_bridge',
    ],
    ctaType: 'stripe',
  },
];

interface ComparisonRow {
  readonly feature: string;
  readonly solo: string;
  readonly pro: string;
  readonly teams: string;
}

const COMPARISON_ROWS: readonly ComparisonRow[] = [
  { feature: 'Memory graph', solo: 'Personal', pro: 'Personal', teams: 'Shared (team)' },
  { feature: 'LLM providers', solo: 'All major', pro: 'All major + custom endpoints', teams: 'All major + custom + on-prem' },
  { feature: 'Devices', solo: '1', pro: 'Multi-device sync', teams: 'Multi-device + team sync' },
  { feature: 'EU AI Act audit reports', solo: '✓', pro: '✓', teams: '✓' },
  { feature: 'Local-first runtime', solo: '✓', pro: '✓', teams: '✓' },
  { feature: 'SSO / RBAC', solo: '—', pro: '—', teams: '✓' },
  { feature: 'Personal API key vault', solo: '—', pro: '✓', teams: '✓' },
  { feature: 'Advanced graph queries', solo: '—', pro: '✓', teams: '✓' },
  { feature: 'Support', solo: 'Community', pro: 'Email · 48h', teams: 'Dedicated account manager' },
  { feature: 'Trial', solo: '—', pro: '14-day, no card', teams: 'Team trial' },
  { feature: 'KVARK sovereign bridge', solo: '—', pro: '—', teams: '✓' },
];

const STRIPE_ENDPOINT =
  (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '') + '/api/stripe/checkout';

export default function Pricing() {
  const t = useTranslations('landing.pricing');
  const [billing, setBilling] = useState<BillingPeriod>('monthly');
  const [loading, setLoading] = useState<TierId | null>(null);

  const handleBillingChange = useCallback((mode: BillingPeriod) => {
    setBilling(mode);
    emit({ name: events.pricingBillingToggle, properties: { mode } });
  }, []);

  const handleStripeCheckout = useCallback(
    async (tier: TierId) => {
      setLoading(tier);
      emit({
        name: events.ctaClick,
        properties: { section: 'pricing', tier, billing },
      });
      try {
        const res = await fetch(STRIPE_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tier, billingPeriod: billing }),
        });
        if (res.ok) {
          const data = (await res.json()) as { url?: string };
          if (data.url) window.open(data.url, '_blank');
        } else {
          const err = (await res.json().catch(() => ({}))) as { message?: string };
          alert(err.message ?? t('errors.checkout_default'));
        }
      } catch {
        alert(t('errors.network'));
      } finally {
        setLoading(null);
      }
    },
    [billing, t],
  );

  return (
    <section id="pricing" style={sectionStyle}>
      <div style={containerStyle}>
        <header style={headerStyle}>
          <p style={eyebrowStyle}>{t('eyebrow')}</p>
          <h2 style={headlineStyle}>{t('headline')}</h2>
          <p style={subheadStyle}>{t('subhead')}</p>
        </header>

        <div role="group" aria-label={t('toggle.aria_group')} style={toggleRowStyle}>
          <button
            type="button"
            onClick={() => handleBillingChange('monthly')}
            style={billing === 'monthly' ? toggleActiveStyle : toggleInactiveStyle}
            aria-pressed={billing === 'monthly'}
          >
            {t('toggle.monthly')}
          </button>
          <button
            type="button"
            onClick={() => handleBillingChange('annual')}
            style={billing === 'annual' ? toggleActiveStyle : toggleInactiveStyle}
            aria-pressed={billing === 'annual'}
          >
            {t('toggle.annual')}{' '}
            <span style={{ color: 'var(--honey-400, #f5b731)', fontWeight: 600, marginLeft: 4 }}>
              {t('toggle.save_pill')}
            </span>
          </button>
        </div>

        <div style={tiersGridStyle} className="pricing-grid">
          {TIER_DEFS.map((tier) => {
            const priceKey = billing === 'monthly' ? 'price_monthly' : 'price_annual';
            return (
              <div
                key={tier.id}
                className="card-lift"
                style={{
                  ...cardStyle,
                  ...(tier.highlighted ? cardHighlightedStyle : null),
                }}
              >
                {tier.highlighted && (
                  <span style={badgeStyle}>{t('popular_badge')}</span>
                )}
                <h3 style={tierNameStyle}>{t(`tiers.${tier.nsKey}.name`)}</h3>
                <p style={tierTaglineStyle}>{t(`tiers.${tier.nsKey}.tagline`)}</p>
                <p style={tierAudienceStyle}>{t(`tiers.${tier.nsKey}.audience`)}</p>

                <p style={priceStyle}>
                  {t(`tiers.${tier.nsKey}.${priceKey}`)}
                  {tier.hasNote && (
                    <span style={priceNoteStyle}>
                      {' · '}
                      {t(`tiers.${tier.nsKey}.note`)}
                    </span>
                  )}
                </p>

                <ul style={bulletsStyle}>
                  {tier.bulletKeys.map((bk) => (
                    <li key={bk} style={bulletItemStyle}>
                      <Check
                        size={16}
                        style={{
                          color: 'var(--status-healthy, #34d399)',
                          flexShrink: 0,
                          marginTop: 2,
                        }}
                      />
                      <span>{t(`tiers.${tier.nsKey}.${bk}`)}</span>
                    </li>
                  ))}
                </ul>

                {tier.ctaType === 'download' ? (
                  <DownloadCTA
                    section="solo-tier"
                    variant="primary"
                    style={{ width: '100%' }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => handleStripeCheckout(tier.id)}
                    disabled={loading === tier.id}
                    className="btn-press"
                    style={tier.highlighted ? primaryCtaStyle : ghostCtaStyle}
                  >
                    {loading === tier.id ? t('loading') : t(`tiers.${tier.nsKey}.cta`)}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <details style={comparisonDetailsStyle}>
          <summary style={comparisonSummaryStyle}>{t('comparison.summary')}</summary>
          <div style={tableWrapperStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyleFeature} scope="col">{t('comparison.headers.feature')}</th>
                  <th style={thStyleValue} scope="col">{t('comparison.headers.solo')}</th>
                  <th style={thStyleValue} scope="col">{t('comparison.headers.pro')}</th>
                  <th style={thStyleValue} scope="col">{t('comparison.headers.teams')}</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row) => (
                  <tr key={row.feature}>
                    <td style={tdFeatureStyle}>{row.feature}</td>
                    <td style={tdValueStyle}>{row.solo}</td>
                    <td style={tdValueStyle}>{row.pro}</td>
                    <td style={tdValueStyle}>{row.teams}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>

      <style>{pricingResponsiveCss}</style>
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
  maxWidth: 640,
  margin: '0 auto 40px',
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
const toggleRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  gap: 6,
  padding: 4,
  background: 'var(--hive-900, #0c0e14)',
  border: '1px solid var(--hive-700, #1f2433)',
  borderRadius: 999,
  width: 'fit-content',
  margin: '0 auto 48px',
};
const toggleBaseStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  padding: '8px 18px',
  borderRadius: 999,
  border: 'none',
  cursor: 'pointer',
  fontFamily: "'Inter', system-ui, sans-serif",
};
const toggleActiveStyle: CSSProperties = {
  ...toggleBaseStyle,
  background: 'var(--hive-700, #1f2433)',
  color: 'var(--hive-50, #f0f2f7)',
};
const toggleInactiveStyle: CSSProperties = {
  ...toggleBaseStyle,
  background: 'transparent',
  color: 'var(--hive-300, #7d869e)',
};
const tiersGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 20,
  maxWidth: 1100,
  margin: '0 auto 48px',
};
const cardStyle: CSSProperties = {
  position: 'relative',
  borderRadius: 16,
  padding: 28,
  background: 'var(--hive-900, #0c0e14)',
  border: '1px solid var(--hive-700, #1f2433)',
  display: 'flex',
  flexDirection: 'column',
};
const cardHighlightedStyle: CSSProperties = {
  background: 'var(--hive-850, #11141c)',
  borderColor: 'var(--honey-500, #e5a000)',
  boxShadow: 'var(--shadow-honey)',
};
const badgeStyle: CSSProperties = {
  position: 'absolute',
  top: -12,
  left: '50%',
  transform: 'translateX(-50%)',
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  padding: '4px 12px',
  borderRadius: 999,
  background: 'var(--honey-500, #e5a000)',
  color: 'var(--hive-950, #08090c)',
};
const tierNameStyle: CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
  marginBottom: 4,
  color: 'var(--hive-50, #f0f2f7)',
};
const tierTaglineStyle: CSSProperties = {
  fontSize: 13,
  color: 'var(--hive-200, #b0b7cc)',
  marginBottom: 4,
};
const tierAudienceStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--hive-400, #5a6380)',
  marginBottom: 18,
};
const priceStyle: CSSProperties = {
  fontSize: 24,
  fontWeight: 700,
  color: 'var(--hive-50, #f0f2f7)',
  marginBottom: 24,
};
const priceNoteStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 400,
  color: 'var(--hive-400, #5a6380)',
};
const bulletsStyle: CSSProperties = {
  listStyle: 'none',
  padding: 0,
  marginBottom: 24,
  flexGrow: 1,
};
const bulletItemStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  fontSize: 13,
  color: 'var(--hive-200, #b0b7cc)',
  marginBottom: 10,
  lineHeight: 1.5,
};
const primaryCtaStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'center',
  padding: '12px 0',
  borderRadius: 12,
  fontSize: 14,
  fontWeight: 600,
  background: 'var(--honey-500, #e5a000)',
  color: 'var(--hive-950, #08090c)',
  boxShadow: 'var(--shadow-honey)',
  border: 'none',
  cursor: 'pointer',
  fontFamily: "'Inter', system-ui, sans-serif",
};
const ghostCtaStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'center',
  padding: '12px 0',
  borderRadius: 12,
  fontSize: 14,
  fontWeight: 600,
  background: 'var(--hive-800, #171b26)',
  color: 'var(--hive-100, #dce0eb)',
  border: '1px solid var(--hive-600, #2a3044)',
  cursor: 'pointer',
  fontFamily: "'Inter', system-ui, sans-serif",
};
const comparisonDetailsStyle: CSSProperties = {
  maxWidth: 1100,
  margin: '0 auto',
  borderRadius: 12,
  border: '1px solid var(--hive-700, #1f2433)',
  background: 'var(--hive-900, #0c0e14)',
  overflow: 'hidden',
};
const comparisonSummaryStyle: CSSProperties = {
  padding: '16px 24px',
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--hive-100, #dce0eb)',
  cursor: 'pointer',
  listStyle: 'none',
};
const tableWrapperStyle: CSSProperties = {
  overflowX: 'auto',
  borderTop: '1px solid var(--hive-700, #1f2433)',
};
const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
};
const thStyleFeature: CSSProperties = {
  textAlign: 'left',
  padding: '12px 16px',
  fontWeight: 600,
  color: 'var(--hive-200, #b0b7cc)',
  background: 'var(--hive-850, #11141c)',
  borderBottom: '1px solid var(--hive-700, #1f2433)',
};
const thStyleValue: CSSProperties = {
  ...thStyleFeature,
  textAlign: 'center',
};
const tdFeatureStyle: CSSProperties = {
  padding: '10px 16px',
  color: 'var(--hive-300, #7d869e)',
  borderBottom: '1px solid var(--hive-800, #171b26)',
};
const tdValueStyle: CSSProperties = {
  padding: '10px 16px',
  color: 'var(--hive-100, #dce0eb)',
  textAlign: 'center',
  borderBottom: '1px solid var(--hive-800, #171b26)',
};
const pricingResponsiveCss = `
  @media (max-width: 1023px) {
    .pricing-grid {
      grid-template-columns: 1fr !important;
      max-width: 480px;
      margin-left: auto !important;
      margin-right: auto !important;
    }
  }
`;
