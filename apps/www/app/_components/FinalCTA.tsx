import type { CSSProperties } from 'react';
import DownloadCTA from './DownloadCTA';

/**
 * Final CTA section — closes the page with a primary download + secondary
 * "Compare tiers" CTA, plus a one-sentence KVARK bridge per amendment §1.5.
 *
 * Subhead is v3.2 LOCKED (lock #6):
 *   "Free for individuals. Pro for power users. Teams for organizations.
 *    KVARK for sovereign deployments."
 */
const KVARK_CONTACT = 'mailto:kvark@egzakta.com?subject=Waggle%20%E2%86%92%20KVARK%20sovereign%20deployment';

export default function FinalCTA() {
  return (
    <section id="cta" style={sectionStyle}>
      <div style={containerStyle}>
        <h2 style={headlineStyle}>
          Stop pasting context. Start using AI that remembers.
        </h2>

        <p style={subheadStyle}>
          Free for individuals. Pro for power users. Teams for organizations. KVARK for
          sovereign deployments.
        </p>

        <div style={ctaRowStyle}>
          <DownloadCTA section="final-cta" variant="primary" />
          <a href="#pricing" style={secondaryCTAStyle} className="btn-press">
            Compare tiers →
          </a>
        </div>

        <div style={kvarkBridgeStyle}>
          <span style={kvarkTextStyle}>
            Need it on your organization&apos;s sovereign infrastructure?
          </span>{' '}
          <a href={KVARK_CONTACT} style={kvarkLinkStyle}>
            Talk to KVARK team →
          </a>
        </div>
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

const subheadStyle: CSSProperties = {
  fontSize: 16,
  lineHeight: 1.6,
  color: 'var(--hive-300, #7d869e)',
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
  color: 'var(--hive-100, #dce0eb)',
  border: '1px solid var(--hive-600, #2a3044)',
  fontFamily: "'Inter', system-ui, sans-serif",
};

const kvarkBridgeStyle: CSSProperties = {
  marginTop: 16,
  padding: '20px 24px',
  borderRadius: 12,
  background: 'var(--hive-900, #0c0e14)',
  border: '1px solid var(--hive-700, #1f2433)',
  fontSize: 14,
  lineHeight: 1.6,
};

const kvarkTextStyle: CSSProperties = {
  color: 'var(--hive-300, #7d869e)',
};

const kvarkLinkStyle: CSSProperties = {
  color: 'var(--honey-400, #f5b731)',
  fontWeight: 600,
  textDecoration: 'none',
};
