import type { Metadata } from 'next';
import type { CSSProperties } from 'react';

export const metadata: Metadata = {
  title: 'Cookie Policy — Waggle',
  description:
    'Cookie policy for Waggle OS by Egzakta Group d.o.o.',
  robots: { index: false, follow: false },
};

export default function CookiesPage() {
  return (
    <article>
      <h1 style={h1Style}>Cookie Policy</h1>
      <p style={pendingNoteStyle}>
        Day-0 placeholder text. Final version pending Egzakta Group legal
        counsel review.
      </p>
      <p style={metaLineStyle}>
        <strong>Effective date:</strong> [Day-0 launch date] · <strong>Last updated:</strong> [Day-0 launch date]
      </p>
      <p style={paragraphStyle}>
        This Cookie Policy explains how Waggle OS uses cookies and similar
        technologies on its web properties (the marketing site at
        waggle-os.ai and any in-product web views).
      </p>

      <h2 style={h2Style}>1. What cookies are</h2>
      <p style={paragraphStyle}>
        Cookies are small text files stored by your browser when you visit a
        website. They allow the site to remember information about your
        visit (e.g., your login state). Similar technologies include local
        storage, session storage, and pixels.
      </p>

      <h2 style={h2Style}>2. Cookies we use</h2>

      <h3 style={h3Style}>Strictly necessary</h3>
      <p style={paragraphStyle}>
        These cookies are required for the Service to function and cannot be
        disabled.
      </p>
      <ul style={listStyle}>
        <li style={listItemStyle}>
          <strong>Clerk session cookies</strong> — keep you logged in. Set by{' '}
          <code>clerk.waggle-os.ai</code>. Cleared on logout.
        </li>
        <li style={listItemStyle}>
          <strong>CSRF protection</strong> — prevents cross-site request
          forgery. Cleared on tab close.
        </li>
      </ul>

      <h3 style={h3Style}>Analytics (opt-in)</h3>
      <p style={paragraphStyle}>
        These cookies are loaded only if you opt in via Settings → Privacy →
        &ldquo;Allow anonymous product analytics.&rdquo; Default is opt-out.
      </p>
      <ul style={listStyle}>
        <li style={listItemStyle}>
          <strong>PostHog cookies</strong> (<code>ph_*</code>) — capture
          anonymous usage events for product improvement. We do not use
          PostHog session recordings, do not capture form inputs, and do not
          link analytics to your account email.
        </li>
      </ul>

      <h2 style={h2Style}>3. No advertising or social-media tracking</h2>
      <p style={paragraphStyle}>
        We do not use third-party advertising networks, social-media pixels
        (Meta, TikTok, X), or cross-site tracking. We do not sell or share
        data with advertisers.
      </p>

      <h2 style={h2Style}>4. Managing cookies</h2>
      <p style={paragraphStyle}>
        You can clear cookies through your browser settings. For granular
        control of the analytics cookie, use Settings → Privacy in the
        Waggle product.
      </p>

      <h2 style={h2Style}>5. Changes to this policy</h2>
      <p style={paragraphStyle}>
        We may update this Cookie Policy. Material changes will be announced
        via the product and email.
      </p>

      <h2 style={h2Style}>6. Contact</h2>
      <p style={paragraphStyle}>
        Email: <strong>privacy@egzakta.com</strong>
      </p>
    </article>
  );
}

const h1Style: CSSProperties = {
  fontSize: 'clamp(28px, 4vw, 36px)',
  fontWeight: 700,
  marginBottom: 24,
  color: 'var(--hive-50, #f0f2f7)',
};

const h2Style: CSSProperties = {
  fontSize: 'clamp(18px, 2.4vw, 22px)',
  fontWeight: 600,
  marginTop: 32,
  marginBottom: 12,
  color: 'var(--hive-50, #f0f2f7)',
};

const h3Style: CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  marginTop: 16,
  marginBottom: 8,
  color: 'var(--hive-100, #d4dae6)',
};

const pendingNoteStyle: CSSProperties = {
  fontSize: 13,
  fontStyle: 'italic',
  color: 'var(--honey-400, #f5b731)',
  background: 'rgba(229, 160, 0, 0.06)',
  border: '1px solid var(--honey-500, #e5a000)',
  borderRadius: 8,
  padding: '12px 16px',
  marginBottom: 24,
};

const metaLineStyle: CSSProperties = {
  fontSize: 13,
  color: 'var(--hive-300, #8993ab)',
  marginBottom: 24,
};

const paragraphStyle: CSSProperties = {
  fontSize: 15,
  lineHeight: 1.7,
  color: 'var(--hive-200, #b0b7cc)',
  marginBottom: 16,
};

const listStyle: CSSProperties = {
  paddingLeft: 24,
  marginBottom: 16,
  color: 'var(--hive-200, #b0b7cc)',
};

const listItemStyle: CSSProperties = {
  fontSize: 15,
  lineHeight: 1.7,
  marginBottom: 8,
};
