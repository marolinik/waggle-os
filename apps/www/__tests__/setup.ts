import '@testing-library/jest-dom';
import { vi } from 'vitest';
import type { ReactNode } from 'react';

/**
 * jsdom does not implement `matchMedia`; our component queries
 * `prefers-reduced-motion` via plain CSS, but consumer code using matchMedia
 * (existing `Pricing` component paths, etc.) still needs a shim during tests.
 */
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

/**
 * Mock next-intl for unit tests. The `t()` function returns the namespaced
 * key (with ICU `{var}` placeholders interpolated), so tests can assert on
 * deterministic strings without needing a real `messages/en.json` round-trip.
 *
 * BrandPersonasCard tests check persona-data text (from `_data/personas.ts`,
 * not i18n) and passed-in prop overrides — never the default heading/
 * subtitle from i18n — so this mock is safe.
 */
vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => {
    return (key: string, params?: Record<string, string | number>) => {
      const fullKey = namespace ? `${namespace}.${key}` : key;
      if (!params) return fullKey;
      return Object.entries(params).reduce(
        (acc, [k, v]) => acc.replace(`{${k}}`, String(v)),
        fullKey,
      );
    };
  },
  NextIntlClientProvider: ({ children }: { children: ReactNode }) => children,
}));
