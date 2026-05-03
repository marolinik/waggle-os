import type { CSSProperties } from 'react';

interface Step {
  readonly number: string;
  readonly title: string;
  readonly bee: string;
  readonly body: string;
}

/**
 * 3-step "How It Works" section per v3.2 locked copy.
 *
 * Step 02 ending is v3.2 LOCKED (lock #5):
 *   "...persists across providers, sessions, and machines, automatically."
 * (replaces legacy "...without you doing a thing.")
 */
const STEPS: readonly Step[] = [
  {
    number: '01',
    title: 'Install once',
    bee: '/brand/bee-builder-dark.png',
    body: 'Download the desktop app, choose your LLM provider — local, frontier, or both. Waggle starts capturing the moment you begin working.',
  },
  {
    number: '02',
    title: 'Work normally',
    bee: '/brand/bee-connector-dark.png',
    body: 'Use any AI like before. Switch models mid-thread. The memory persists across providers, sessions, and machines, automatically.',
  },
  {
    number: '03',
    title: "Compound, don't repeat",
    bee: '/brand/bee-researcher-dark.png',
    body: 'Every conversation builds your knowledge graph. The next prompt starts where the last one left off. You never paste the same context twice.',
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" style={sectionStyle} className="honeycomb-bg">
      <div style={containerStyle}>
        <header style={headerStyle}>
          <p style={eyebrowStyle}>How it works</p>
          <h2 style={headlineStyle}>Three steps. No new habits.</h2>
          <p style={subheadStyle}>
            Waggle stays out of the way. You install it once, keep using the AI you already
            use, and your context starts compounding.
          </p>
        </header>

        <ol style={stepsGridStyle} className="how-grid">
          {STEPS.map((step) => (
            <li key={step.number} style={stepItemStyle}>
              <div style={beeWrapperStyle}>
                <img src={step.bee} alt="" width={96} height={96} style={beeImgStyle} />
                <span style={stepNumberStyle} aria-hidden="true">
                  {step.number}
                </span>
              </div>
              <h3 style={stepTitleStyle}>{step.title}</h3>
              <p style={stepBodyStyle}>{step.body}</p>
            </li>
          ))}
        </ol>
      </div>

      <style>{howResponsiveCss}</style>
    </section>
  );
}

const sectionStyle: CSSProperties = {
  padding: '96px 24px',
  fontFamily: "'Inter', system-ui, sans-serif",
};

const containerStyle: CSSProperties = {
  maxWidth: 960,
  margin: '0 auto',
};

const headerStyle: CSSProperties = {
  textAlign: 'center',
  maxWidth: 640,
  margin: '0 auto 64px',
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

const stepsGridStyle: CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 32,
};

const stepItemStyle: CSSProperties = {
  textAlign: 'center',
};

const beeWrapperStyle: CSSProperties = {
  position: 'relative',
  display: 'inline-block',
  marginBottom: 24,
};

const beeImgStyle: CSSProperties = {
  width: 96,
  height: 96,
  objectFit: 'contain',
};

const stepNumberStyle: CSSProperties = {
  position: 'absolute',
  top: -8,
  right: -8,
  width: 32,
  height: 32,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 12,
  fontWeight: 700,
  background: 'var(--honey-500, #e5a000)',
  color: 'var(--hive-950, #08090c)',
};

const stepTitleStyle: CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  marginBottom: 12,
  color: 'var(--hive-50, #f0f2f7)',
};

const stepBodyStyle: CSSProperties = {
  fontSize: 14,
  lineHeight: 1.6,
  maxWidth: 280,
  margin: '0 auto',
  color: 'var(--hive-300, #7d869e)',
};

const howResponsiveCss = `
  @media (max-width: 768px) {
    .how-grid {
      grid-template-columns: 1fr !important;
      gap: 48px !important;
    }
  }
`;
