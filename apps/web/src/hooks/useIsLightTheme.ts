import { useEffect, useState } from 'react';

/**
 * Subscribe to the live `data-theme` attribute on <html>. Returns `true` when
 * the user is in light mode, `false` in dark. Updates reactively when the
 * theme toggles elsewhere in the app.
 *
 * Single source of truth: `document.documentElement.getAttribute('data-theme')`.
 * Dark is the implicit default (no attribute set).
 */
export function useIsLightTheme(): boolean {
  const read = () =>
    typeof document !== 'undefined' &&
    document.documentElement.getAttribute('data-theme') === 'light';

  const [isLight, setIsLight] = useState<boolean>(read);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const sync = () => setIsLight(read());
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    // Catch any change that slipped in between initial read and observer attach.
    sync();
    return () => observer.disconnect();
  }, []);

  return isLight;
}
