export type OSId = 'macOS' | 'Windows' | 'Linux';

/**
 * Best-effort OS detection from a User-Agent string.
 *
 * Mac/iPhone/iPad → macOS, Windows → Windows, everything else → Linux.
 *
 * Used client-side by `<DownloadCTA />` after hydration so the page can stay
 * statically prerendered while still showing OS-specific labels per visitor.
 */
export function detectOSFromUserAgent(ua: string): OSId {
  if (/Mac|iPhone|iPad/i.test(ua)) return 'macOS';
  if (/Windows/i.test(ua)) return 'Windows';
  return 'Linux';
}
