import { getTranslations } from 'next-intl/server';
import Navbar from './_components/Navbar';
import Hero from './_components/Hero';
import HowItWorks from './_components/HowItWorks';
import Pillars from './_components/Pillars';
import ComparisonBeat from './_components/ComparisonBeat';
import ProofPointsBand from './_components/ProofPointsBand';
import WowBeat from './_components/WowBeat';
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
 * Waggle landing page — N2 IA.
 *
 * Spec IA order: hero → how-it-works → pillars → comparison → proof → wow →
 * trust → pricing → final CTA. The Personas section (not in the spec IA) is
 * kept, placed between WowBeat and TrustBand.
 *
 * Hero variant still resolves server-side from URL search params (the A/B
 * resolver infra is intact) but the Hero renders the committed flat copy.
 * Personas wrapper copy lives in `messages/en.json` under
 * `landing.personas_section.*`.
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
        <HowItWorks />
        <Pillars />
        <ComparisonBeat />
        <ProofPointsBand />
        <WowBeat />
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
        <TrustBand />
        <Pricing />
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
