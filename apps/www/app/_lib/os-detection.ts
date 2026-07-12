export type OSId = 'macOS' | 'Windows' | 'Linux';

/**
 * Best-effort desktop OS detection from a User-Agent string.
 *
 * Mobile/tablet visitors return null so download CTAs stay generic instead of
 * promising a desktop installer for the wrong platform.
 */
export function detectOSFromUserAgent(ua: string): OSId | null {
  if (/iPhone|iPad|iPod|Android|Mobile|Tablet/i.test(ua)) return null;
  if (/Mac/i.test(ua)) return 'macOS';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Linux/i.test(ua)) return 'Linux';
  return null;
}
