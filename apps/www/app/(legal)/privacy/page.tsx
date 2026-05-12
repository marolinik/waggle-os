import type { Metadata } from 'next';
import type { CSSProperties } from 'react';

export const metadata: Metadata = {
  title: 'Privacy Policy — Waggle',
  description:
    'Privacy policy for Waggle OS by Egzakta Group d.o.o.',
  robots: { index: false, follow: false },
};

export default function PrivacyPage() {
  return (
    <article>
      <h1 style={h1Style}>Privacy Policy</h1>
      <p style={pendingNoteStyle}>
        Day-0 placeholder text. Final version pending Egzakta Group legal
        counsel review.
      </p>
      <p style={metaLineStyle}>
        <strong>Effective date:</strong> [Day-0 launch date] · <strong>Last updated:</strong> [Day-0 launch date]
      </p>
      <p style={paragraphStyle}>
        Waggle OS is provided by Egzakta Group d.o.o. (&ldquo;Egzakta&rdquo;,
        &ldquo;we&rdquo;, &ldquo;us&rdquo;), a company registered in the
        Republic of Serbia. This Privacy Policy explains what personal data
        we collect, how we use it, and your rights.
      </p>

      <h2 style={h2Style}>1. Data we collect</h2>
      <ul style={listStyle}>
        <li style={listItemStyle}>
          <strong>Account data</strong>: when you sign up via Clerk, we collect
          your email address, display name, and optional profile information.
          Clerk Inc. processes this data as an authentication sub-processor
          under their own privacy policy (
          <a href="https://clerk.com/privacy" style={linkStyle}>
            clerk.com/privacy
          </a>
          ).
        </li>
        <li style={listItemStyle}>
          <strong>Subscription data</strong>: when you upgrade to Pro or Teams,
          Stripe Inc. processes your payment information. We never see or
          store your card details — Stripe returns only a customer ID and
          subscription status to us (
          <a href="https://stripe.com/privacy" style={linkStyle}>
            stripe.com/privacy
          </a>
          ).
        </li>
        <li style={listItemStyle}>
          <strong>Product analytics</strong>: with your opt-in (default off),
          we collect anonymous usage events (onboarding completion, feature
          interactions) via PostHog Inc. to improve the product. You can opt
          out at any time in Settings → Privacy (
          <a href="https://posthog.com/privacy" style={linkStyle}>
            posthog.com/privacy
          </a>
          ).
        </li>
        <li style={listItemStyle}>
          <strong>Local memory</strong>: Waggle OS stores your conversations,
          memories, and harvested content <strong>locally on your device</strong>{' '}
          in a SQLite database (the <code>.waggle/</code> directory). We do
          not transmit this data to our servers. If you choose to enable
          shared team workspaces (Teams tier), encrypted memory bundles are
          stored on our infrastructure for synchronization; you control which
          workspaces sync.
        </li>
      </ul>

      <h2 style={h2Style}>2. How we use your data</h2>
      <ul style={listStyle}>
        <li style={listItemStyle}>
          Provide the Service (authentication, subscription management, support).
        </li>
        <li style={listItemStyle}>
          Improve the Service (analytics where you&rsquo;ve opted in).
        </li>
        <li style={listItemStyle}>
          Comply with legal obligations (tax records, fraud prevention).
        </li>
        <li style={listItemStyle}>
          We do not sell your personal data and do not use it for advertising.
        </li>
      </ul>

      <h2 style={h2Style}>3. Where your data lives</h2>
      <ul style={listStyle}>
        <li style={listItemStyle}>
          Account and subscription data: Clerk and Stripe (US- and EU-region
          processors).
        </li>
        <li style={listItemStyle}>
          Analytics (opt-in only): PostHog (US-region).
        </li>
        <li style={listItemStyle}>
          Memory and conversations: your device. Optionally your Teams
          workspace bundle.
        </li>
        <li style={listItemStyle}>
          Egzakta&rsquo;s own systems: minimal account and billing metadata in
          encrypted storage.
        </li>
      </ul>

      <h2 style={h2Style}>4. Your rights (GDPR and similar regimes)</h2>
      <p style={paragraphStyle}>
        You have the right to access, rectify, port, restrict, or delete your
        personal data, and to object to processing. To exercise these rights,
        email <strong>privacy@egzakta.com</strong>. We aim to respond within
        30 days.
      </p>
      <p style={paragraphStyle}>
        Local memory data: you can erase all locally-stored data at any time
        via Settings → Privacy → Erase All Data. This is irreversible and
        does not require contacting us.
      </p>

      <h2 style={h2Style}>5. Retention</h2>
      <ul style={listStyle}>
        <li style={listItemStyle}>
          Account data: retained while your account is active plus 90 days
          after deletion for billing reconciliation.
        </li>
        <li style={listItemStyle}>
          Subscription data: retained per Stripe&rsquo;s record-keeping
          requirements (typically 7 years for accounting).
        </li>
        <li style={listItemStyle}>
          Analytics (opt-in only): retained 12 months.
        </li>
        <li style={listItemStyle}>
          Local memory: retained until you delete it. Egzakta has no access.
        </li>
      </ul>

      <h2 style={h2Style}>6. Cookies and tracking</h2>
      <p style={paragraphStyle}>
        We use strictly-necessary cookies for authentication (Clerk session)
        and, with your opt-in, analytics cookies (PostHog). See our{' '}
        <a href="/cookies" style={linkStyle}>
          Cookie Policy
        </a>
        .
      </p>

      <h2 style={h2Style}>7. Changes to this policy</h2>
      <p style={paragraphStyle}>
        We may update this policy. Material changes will be announced via the
        product and email. Continued use after a change means you accept the
        updated terms.
      </p>

      <h2 style={h2Style}>8. Contact</h2>
      <p style={paragraphStyle}>
        Egzakta Group d.o.o.
        <br />
        [Egzakta registered address — to be filled before public launch]
        <br />
        Email: <strong>privacy@egzakta.com</strong>
        <br />
        Data Protection Officer: <strong>dpo@egzakta.com</strong>
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

const linkStyle: CSSProperties = {
  color: 'var(--honey-400, #f5b731)',
  textDecoration: 'underline',
};
