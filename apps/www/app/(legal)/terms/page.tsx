import type { Metadata } from 'next';
import type { CSSProperties } from 'react';

export const metadata: Metadata = {
  title: 'Terms of Service — Waggle',
  description:
    'Terms of Service for Waggle OS by Egzakta Group d.o.o.',
  robots: { index: false, follow: false },
};

export default function TermsPage() {
  return (
    <article>
      <h1 style={h1Style}>Terms of Service</h1>
      <p style={pendingNoteStyle}>
        Day-0 placeholder text. Final version pending Egzakta Group legal
        counsel review.
      </p>
      <p style={metaLineStyle}>
        <strong>Effective date:</strong> [Day-0 launch date] · <strong>Last updated:</strong> [Day-0 launch date]
      </p>
      <p style={paragraphStyle}>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your use of Waggle
        OS (the &ldquo;Service&rdquo;), provided by Egzakta Group d.o.o.
        (&ldquo;Egzakta&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). By
        creating an account or installing the Waggle desktop application, you
        agree to these Terms.
      </p>

      <h2 style={h2Style}>1. The Service</h2>
      <p style={paragraphStyle}>
        Waggle OS is a desktop AI agent platform with persistent local memory.
        The Service includes the Waggle desktop application, the cloud-hosted
        account infrastructure, and optional team collaboration features.
      </p>

      <h2 style={h2Style}>2. Account</h2>
      <p style={paragraphStyle}>
        You must be at least 16 years old to use the Service. You are
        responsible for maintaining the confidentiality of your account
        credentials. You agree to provide accurate and current information
        when creating an account.
      </p>

      <h2 style={h2Style}>3. Acceptable use</h2>
      <p style={paragraphStyle}>You agree not to:</p>
      <ul style={listStyle}>
        <li style={listItemStyle}>
          Use the Service to violate any law or third-party rights.
        </li>
        <li style={listItemStyle}>
          Attempt to reverse-engineer, modify, or interfere with the
          Service&rsquo;s protections.
        </li>
        <li style={listItemStyle}>
          Use the Service to generate content that infringes intellectual
          property, defames individuals, or violates privacy.
        </li>
        <li style={listItemStyle}>
          Submit data you do not have the right to submit (including
          confidential or copyrighted third-party content).
        </li>
        <li style={listItemStyle}>
          Use the Service to develop or train competing AI products.
        </li>
      </ul>

      <h2 style={h2Style}>4. Subscription and billing</h2>
      <p style={paragraphStyle}>
        Free tier: available at no cost, subject to documented usage limits.
        Pro tier (USD 19/month): unlocks advanced features and unlimited
        memory. Teams tier (USD 49/seat/month): adds shared workspaces and
        team collaboration.
      </p>
      <p style={paragraphStyle}>
        Subscriptions are billed in advance through Stripe. Auto-renewal is
        on by default; you can cancel at any time in account settings.
        Cancellations take effect at the end of the current billing period.
        We do not refund partial periods except where required by law.
      </p>

      <h2 style={h2Style}>5. Trial</h2>
      <p style={paragraphStyle}>
        A free 15-day trial of all features is available to new accounts. If
        you do not subscribe at trial end, your account converts to the Free
        tier and trial features become inaccessible. Trial data is retained
        per the{' '}
        <a href="/privacy" style={linkStyle}>
          Privacy Policy
        </a>
        .
      </p>

      <h2 style={h2Style}>6. Intellectual property</h2>
      <p style={paragraphStyle}>
        You retain ownership of content you create, store, or process via the
        Service. You grant Egzakta a limited license to host and process your
        content solely to provide the Service.
      </p>
      <p style={paragraphStyle}>
        Egzakta retains all rights in the Service, including source code,
        documentation, and marketing materials. Open-source components are
        governed by their respective licenses (notably Apache 2.0 for the
        hive-mind substrate).
      </p>

      <h2 style={h2Style}>7. Disclaimer of warranties</h2>
      <p style={paragraphStyle}>
        The Service is provided &ldquo;as is&rdquo; without warranties of any
        kind. We do not warrant that the Service will be uninterrupted,
        error-free, or that AI-generated outputs will be accurate, complete,
        or fit for any particular purpose. You are responsible for verifying
        AI-generated content before acting on it.
      </p>

      <h2 style={h2Style}>8. Limitation of liability</h2>
      <p style={paragraphStyle}>
        To the maximum extent permitted by law, Egzakta&rsquo;s total
        liability for any claim arising from the Service is limited to the
        fees you paid Egzakta in the 12 months preceding the claim. We are
        not liable for indirect, incidental, or consequential damages.
      </p>

      <h2 style={h2Style}>9. Termination</h2>
      <p style={paragraphStyle}>
        Either party may terminate at any time. We may suspend or terminate
        your account for material breach of these Terms. Upon termination,
        you may export your data for 30 days; after that, we may delete your
        account data in accordance with the Privacy Policy.
      </p>

      <h2 style={h2Style}>10. Governing law</h2>
      <p style={paragraphStyle}>
        These Terms are governed by the laws of the Republic of Serbia.
        Disputes shall be resolved in the competent courts of Belgrade,
        Serbia, except where mandatory consumer protection laws in your
        jurisdiction provide otherwise.
      </p>

      <h2 style={h2Style}>11. Changes to the Terms</h2>
      <p style={paragraphStyle}>
        We may update these Terms. Material changes will be announced at
        least 30 days in advance via the product and email. Continued use
        after the change means you accept the updated Terms.
      </p>

      <h2 style={h2Style}>12. Contact</h2>
      <p style={paragraphStyle}>
        Egzakta Group d.o.o.
        <br />
        [Egzakta registered address — to be filled before public launch]
        <br />
        Email: <strong>legal@egzakta.com</strong>
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
