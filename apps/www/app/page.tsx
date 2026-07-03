import { getTranslations } from 'next-intl/server';
import Navbar from './_components/Navbar';
import Hero from './_components/Hero';
import ProblemTurn from './_components/ProblemTurn';
import HowItWorks from './_components/HowItWorks';
import MemoryDiagram from './_components/MemoryDiagram';
import ProofBand from './_components/ProofBand';
import FeatureGrid from './_components/FeatureGrid';
import SovereigntyBand from './_components/SovereigntyBand';
import BrandPersonasCard from './_components/BrandPersonasCard';
import OpenSource from './_components/OpenSource';
import Pricing from './_components/Pricing';
import FinalCTA from './_components/FinalCTA';
import Footer from './_components/Footer';

/**
 * Waggle landing page — 2026-07 rebuild.
 *
 * Narrative spine: promise (hero) → problem → how it works → what's
 * actually different (memory) → proof (LoCoMo) → breadth (features) →
 * trust (sovereignty) → brand moment (personas) → open source → pricing →
 * close. Every section reads its copy from `messages/en.json`; every
 * factual claim traces to the repo (see docs/superpowers/specs/
 * 2026-07-03-www-marketing-site-design.md §1).
 */
export default async function HomePage() {
  const t = await getTranslations('landing.personas_section');
  const a11y = await getTranslations('landing.a11y');

  return (
    <>
      <a href="#main" className="skip-link">
        {a11y('skip')}
      </a>
      <Navbar />
      <main id="main">
        <Hero />
        <ProblemTurn />
        <HowItWorks />
        <MemoryDiagram />
        <ProofBand />
        <FeatureGrid />
        <SovereigntyBand />
        <section
          id="personas"
          style={{ background: 'var(--hive-950, #0e0c07)' }}
          aria-labelledby="waggle-hive-heading"
        >
          <BrandPersonasCard
            eyebrow={t('eyebrow')}
            heading={t('heading')}
            subtitle={t('subtitle')}
          />
        </section>
        <OpenSource />
        <Pricing />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
