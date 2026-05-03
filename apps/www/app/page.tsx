import { getTranslations } from 'next-intl/server';
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
 * Waggle landing page — v3.2 (Sesija D §3.2 with full i18n).
 *
 * Renders 8 locked sections in IA order. Hero variant resolves server-side
 * from URL search params per amendment §1.1; Personas wrapper copy lives in
 * `messages/en.json` under `landing.personas_section.*`.
 */
export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const variantId = resolveHeroVariant({
    p: pickFirst(params.p),
    utm_source: pickFirst(params.utm_source),
  });

  const t = await getTranslations('landing.personas_section');

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
            eyebrow={t('eyebrow')}
            heading={t('heading')}
            subtitle={t('subtitle')}
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

function pickFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}
