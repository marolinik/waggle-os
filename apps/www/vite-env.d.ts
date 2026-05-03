// Legacy ambient type declaration for `import.meta.env.*` references in
// `apps/www/src/`. Currently used by `src/components/Pricing.tsx:4` to read
// `VITE_API_URL`.
//
// Delete this file in §2 once the legacy `src/components/` tree is fully
// ported to Next.js (and the env reference is migrated to
// `process.env.NEXT_PUBLIC_API_URL`).

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
