import { getRequestConfig } from 'next-intl/server';

/**
 * next-intl request config.
 *
 * v1 ships English-only — single locale, no `/[locale]` routing. Locale is
 * hardcoded to `en`; messages load from `../messages/en.json`. Adding more
 * locales later is a config-only change (set up middleware + match
 * `[locale]` segment in app/).
 */
export default getRequestConfig(async () => {
  const locale = 'en';
  const messages = (await import(`../messages/${locale}.json`)).default;
  return { locale, messages };
});
