import type { MetadataRoute } from 'next';

/**
 * Robots policy: index the marketing surface, keep auth/billing/internal
 * design-QA routes out of the index. Served at /robots.txt by the App
 * Router metadata convention.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/account', '/sign-in', '/sign-up', '/design/', '/api/'],
      },
    ],
    sitemap: 'https://waggle-os.ai/sitemap.xml',
  };
}
