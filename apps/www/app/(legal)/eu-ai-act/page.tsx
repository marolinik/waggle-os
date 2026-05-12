import type { Metadata } from 'next';
import type { CSSProperties } from 'react';

export const metadata: Metadata = {
  title: 'EU AI Act Statement — Waggle',
  description:
    'EU AI Act compliance statement for Waggle OS by Egzakta Group d.o.o.',
  robots: { index: false, follow: false },
};

export default function EuAiActPage() {
  return (
    <article>
      <h1 style={h1Style}>EU AI Act Statement</h1>
      <p style={pendingNoteStyle}>
        Day-0 placeholder text. Final version pending Egzakta Group legal
        counsel review.
      </p>
      <p style={metaLineStyle}>
        <strong>Effective date:</strong> [Day-0 launch date] · <strong>Last updated:</strong> [Day-0 launch date]
      </p>
      <p style={paragraphStyle}>
        Egzakta Group d.o.o. (&ldquo;we&rdquo;) publishes this statement to
        describe how Waggle OS relates to Regulation (EU) 2024/1689
        (&ldquo;EU AI Act&rdquo;). Our intent is to be a transparent
        participant in the AI value chain, even as the EU AI Act&rsquo;s
        provisions phase in through 2026.
      </p>

      <h2 style={h2Style}>1. Our role in the AI value chain</h2>
      <p style={paragraphStyle}>
        Waggle OS is a <strong>deployer</strong> (sometimes called
        &ldquo;deployer of AI systems&rdquo;) under EU AI Act terminology
        when end-users install the Waggle desktop application and use it
        for their own purposes. Egzakta is <strong>not</strong> a provider
        of general-purpose AI models (GPAI providers — defined in Article
        51). Waggle OS routes user requests to third-party AI providers
        (Anthropic, OpenAI, Mistral, and others). The underlying GPAI
        providers fulfill the obligations applicable to them.
      </p>

      <h2 style={h2Style}>2. Article 50 — transparency obligations</h2>
      <p style={paragraphStyle}>
        We comply with the transparency obligations of Article 50 by:
      </p>
      <ul style={listStyle}>
        <li style={listItemStyle}>
          <strong>Clearly labeling AI-generated output</strong>: the Waggle
          UI marks AI-generated responses as such; the user always knows
          they are interacting with an AI system.
        </li>
        <li style={listItemStyle}>
          <strong>Disclosing system prompts on request</strong>: users can
          view the active persona&rsquo;s system prompt in Settings →
          Personas → [persona] → System Prompt.
        </li>
        <li style={listItemStyle}>
          <strong>No deepfake generation</strong>: Waggle OS does not
          generate synthetic images, audio, or video that could be confused
          with authentic media.
        </li>
      </ul>

      <h2 style={h2Style}>3. Article 5 — prohibited practices</h2>
      <p style={paragraphStyle}>
        Waggle OS does not implement, encourage, or facilitate any
        prohibited AI practice under Article 5, including:
      </p>
      <ul style={listStyle}>
        <li style={listItemStyle}>
          Subliminal manipulation or exploitation of vulnerabilities.
        </li>
        <li style={listItemStyle}>
          Social scoring of natural persons.
        </li>
        <li style={listItemStyle}>
          Real-time remote biometric identification in publicly accessible
          spaces.
        </li>
        <li style={listItemStyle}>
          Emotion inference in workplace or education contexts.
        </li>
      </ul>

      <h2 style={h2Style}>4. High-risk AI systems</h2>
      <p style={paragraphStyle}>
        Waggle OS in its default consumer configuration is not a high-risk
        AI system under Annex III. If users deploy Waggle OS for high-risk
        purposes (e.g., employment screening, credit scoring), the deployer
        is responsible for fulfilling the obligations applicable to that
        high-risk system.
      </p>

      <h2 style={h2Style}>5. General-purpose AI (GPAI) considerations</h2>
      <p style={paragraphStyle}>
        Waggle OS depends on GPAI models provided by third parties. Those
        providers publish their own EU AI Act compliance information:
      </p>
      <ul style={listStyle}>
        <li style={listItemStyle}>
          Anthropic:{' '}
          <a href="https://www.anthropic.com/eu-ai-act" style={linkStyle}>
            anthropic.com/eu-ai-act
          </a>
        </li>
        <li style={listItemStyle}>
          OpenAI:{' '}
          <a href="https://openai.com/eu-ai-act" style={linkStyle}>
            openai.com/eu-ai-act
          </a>
        </li>
        <li style={listItemStyle}>
          Mistral:{' '}
          <a href="https://mistral.ai/eu-ai-act" style={linkStyle}>
            mistral.ai/eu-ai-act
          </a>
        </li>
      </ul>

      <h2 style={h2Style}>6. Risk management and documentation</h2>
      <p style={paragraphStyle}>
        Egzakta maintains internal documentation of:
      </p>
      <ul style={listStyle}>
        <li style={listItemStyle}>
          Models routed to and their provenance.
        </li>
        <li style={listItemStyle}>
          Safety testing for the persona system and behavioral spec.
        </li>
        <li style={listItemStyle}>
          The evolution subsystem (see arxiv paper, pending submission).
        </li>
        <li style={listItemStyle}>
          User-facing transparency mechanisms.
        </li>
      </ul>
      <p style={paragraphStyle}>
        We will publish a public AI risk management summary by Article
        50&rsquo;s effective date (2026-08-02 for Article 50 obligations).
      </p>

      <h2 style={h2Style}>7. Data protection alignment</h2>
      <p style={paragraphStyle}>
        Personal data handling is governed by our{' '}
        <a href="/privacy" style={linkStyle}>
          Privacy Policy
        </a>{' '}
        and the GDPR. We do not train AI models on user data without
        explicit consent. Local memory data never leaves the user&rsquo;s
        device unless they explicitly enable team sharing (Teams tier).
      </p>

      <h2 style={h2Style}>
        8. Contact for data subject and EU AI Act inquiries
      </h2>
      <p style={paragraphStyle}>
        Email: <strong>ai-compliance@egzakta.com</strong>
        <br />
        Data Protection Officer: <strong>dpo@egzakta.com</strong>
        <br />
        Registered representative for EU AI Act purposes: [to be designated
        if/when Egzakta has no Union establishment per Article 25].
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
