import Navbar from './_components/Navbar';
import Hero from './_components/Hero';
import ProofPointsBand from './_components/ProofPointsBand';
import HowItWorks from './_components/HowItWorks';
import BrandPersonasCard from './_components/BrandPersonasCard';
import Pricing from './_components/Pricing';
import TrustBand from './_components/TrustBand';
import FinalCTA from './_components/FinalCTA';
import Footer from './_components/Footer';
import { resolveHeroVariant } from './_lib/hero-headline-resolver';

interface HomePageProps {
  readonly searchParams: Promise<{
    readonly p?: string | string[];
    readonly utm_source?: string | string[];
  }>;
}

/**
 * Waggle landing page — v3.2 (Sesija D §2.4).
 *
 * Renders the 8 locked sections in IA order:
 *   Navbar → Hero (5 variants resolved server-side from URL search params)
 *   → ProofPointsBand → HowItWorks → Personas (BrandPersonasCard wrapper)
 *   → Pricing → TrustBand → FinalCTA → Footer
 *
 * Hero variant resolution per amendment §1.1: explicit `?p=` overrides
 * `utm_source` heuristic; default → A (Marcus). Reading `searchParams`
 * makes the page dynamic per-request (acceptable for v1; no static
 * regen).
 */
export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const variantId = resolveHeroVariant({
    p: pickFirst(params.p),
    utm_source: pickFirst(params.utm_source),
  });

  return (
    <>
      <Navbar />
      <main>
        <Hero variantId={variantId} />
        <ProofPointsBand />
        <HowItWorks />
        <section
          id="personas"
          style={{ background: 'var(--hive-950, #08090c)' }}
          aria-labelledby="waggle-hive-heading"
        >
          <BrandPersonasCard
            eyebrow="Built for"
            heading="Thirteen ways people work. One memory layer."
            subtitle="Hunters chase, builders ship, orchestrators coordinate. Waggle remembers — across roles, across tools, across the moments in between."
          />
        </section>
        <Pricing />
        <TrustBand />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}

/** Coerce the search param shape to a single string (Next.js may pass arrays). */
function pickFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}
