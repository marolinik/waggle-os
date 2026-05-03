/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Match the existing `apps/web` philosophy: build outputs are tree-shakeable
  // ESM, modern image formats served via Next.js's built-in optimizer.
  images: {
    formats: ['image/avif', 'image/webp'],
  },
};

export default nextConfig;
