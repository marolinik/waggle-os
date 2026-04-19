/**
 * M-30 — Knowledge Graph export helpers.
 *
 * Serializes an SVGSVGElement to a standalone SVG string with theme variables
 * resolved (so the exported file renders the same colors outside the app),
 * and builds a deterministic filename for the download.
 *
 * Pure / DOM-only — no React, no network. Safe to unit-test under jsdom.
 */

// Theme variables referenced inside the KG SVG markup. Resolved against
// document.documentElement and injected as inline style on the exported <svg>
// so the file renders standalone without the waggle-theme.css stylesheet.
export const KG_THEME_VARS: readonly string[] = [
  '--primary',
  '--foreground',
  '--muted-foreground',
  '--background',
  '--border',
  '--kg-person',
  '--kg-project',
  '--kg-concept',
  '--kg-org',
  '--kg-default',
] as const;

/**
 * Build the download filename — `waggle-knowledge-graph-YYYY-MM-DD.svg`.
 * ISO date (UTC) keeps it stable regardless of the user's timezone; matches
 * the backup-filename convention in SettingsApp.tsx.
 */
export function buildKgExportFilename(now: Date = new Date()): string {
  const iso = now.toISOString().slice(0, 10);
  return `waggle-knowledge-graph-${iso}.svg`;
}

/**
 * Read each theme variable off the root element and return the style-attribute
 * string to paste onto the exported SVG. Missing variables are skipped so we
 * don't emit empty declarations.
 */
export function resolveThemeStyleAttr(
  root: HTMLElement,
  vars: readonly string[] = KG_THEME_VARS,
): string {
  const computed = getComputedStyle(root);
  const declarations: string[] = [];
  for (const name of vars) {
    const value = computed.getPropertyValue(name).trim();
    if (value.length > 0) {
      declarations.push(`${name}: ${value}`);
    }
  }
  return declarations.join('; ');
}

/**
 * Serialize an SVGSVGElement to a complete standalone SVG document. The theme
 * variables referenced by `hsl(var(--foo))` strings inside the markup are
 * resolved on the clone so the exported file renders identically outside the
 * app. Caller owns the blob + URL lifecycle.
 */
export function serializeKgSvg(
  svg: SVGSVGElement,
  root: HTMLElement = document.documentElement,
): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;

  // xmlns is required for standalone rendering; React-rendered SVGs omit it.
  if (!clone.getAttribute('xmlns')) {
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }

  const themeStyle = resolveThemeStyleAttr(root);
  if (themeStyle.length > 0) {
    const existing = clone.getAttribute('style') ?? '';
    clone.setAttribute('style', existing.length > 0 ? `${existing}; ${themeStyle}` : themeStyle);
  }

  const serializer = new XMLSerializer();
  return `<?xml version="1.0" encoding="UTF-8"?>\n${serializer.serializeToString(clone)}`;
}

/**
 * Trigger a browser download of the serialized SVG. Caller provides the SVG
 * element; helper owns the blob/URL/anchor lifecycle and revokes the URL once
 * the click is dispatched.
 *
 * Returns the filename so callers can surface it in a toast.
 */
export function downloadKgSvg(
  svg: SVGSVGElement,
  filename: string = buildKgExportFilename(),
): string {
  const xml = serializeKgSvg(svg);
  const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return filename;
}
