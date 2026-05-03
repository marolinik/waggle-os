/**
 * Homepage placeholder for the Next.js 15 App Router scaffold (§1).
 *
 * The full landing page (Navbar, Hero, ProofPointsBand, Features, CrownJewels,
 * HowItWorks, Pricing, Enterprise, BetaSignup, Footer) ports in §2 from
 * `apps/www/src/components/`. This placeholder gives the scaffold a working
 * route at `/` immediately — verifies layout + globals.css + font loading
 * end-to-end without depending on §2 component work.
 */
export default function HomePage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--hive-950, #08090c)',
        color: 'var(--hive-50, #f0f2f7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 640 }}>
        <h1
          style={{
            fontSize: 'clamp(28px, 4vw, 40px)',
            fontWeight: 700,
            margin: 0,
            color: 'var(--honey-400, #f5b731)',
            letterSpacing: '-0.01em',
          }}
        >
          Waggle
        </h1>
        <p
          style={{
            marginTop: 16,
            fontSize: 16,
            lineHeight: 1.5,
            color: 'var(--hive-300, #a0a3ad)',
          }}
        >
          Next.js 15 App Router scaffold — full landing page ports in §2.
        </p>
      </div>
    </main>
  );
}
