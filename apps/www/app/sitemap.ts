import type { MetadataRoute } from 'next';

const BASE_URL = 'https://waggle-os.ai';

/**
 * Sitemap for crawler discovery. Served at `/sitemap.xml` automatically
 * by Next.js App Router from this metadata route convention.
 *
 * Includes the homepage + the public-facing methodology docs page (Day 0
 * Trust Band Card 4 link target per Path D landing decoupling). The
 * `/design/personas` route is intentionally omitted — it's robots-blocked
 * via metadata and discovery is URL-only per amendment §1.4.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    {
      url: `${BASE_URL}/`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/docs/methodology`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
  ];
}
