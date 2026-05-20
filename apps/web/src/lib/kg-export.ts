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

/**
 * E-5 — PNG export. Rasterizes the serialized SVG via a canvas at the
 * given scale factor (default 2× for retina) and triggers a download.
 *
 * Resolves with the filename on success or rejects on rasterization
 * failure (image load error, canvas blob failure, dimensions missing).
 * Caller can decide whether to fall back to SVG export or surface a toast.
 */
export function buildKgPngFilename(now: Date = new Date()): string {
  const iso = now.toISOString().slice(0, 10);
  return `waggle-knowledge-graph-${iso}.png`;
}

export async function downloadKgPng(
  svg: SVGSVGElement,
  filename: string = buildKgPngFilename(),
  scale: number = 2,
): Promise<string> {
  // Read dimensions from viewBox first (responsive SVGs often lack
  // explicit width/height attrs), then fall back to width/height,
  // then to getBoundingClientRect.
  let width = 0;
  let height = 0;
  const viewBox = svg.getAttribute('viewBox');
  if (viewBox) {
    const parts = viewBox.split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      width = parts[2];
      height = parts[3];
    }
  }
  if (!width || !height) {
    const w = svg.getAttribute('width');
    const h = svg.getAttribute('height');
    width = w ? parseFloat(w) : 0;
    height = h ? parseFloat(h) : 0;
  }
  if (!width || !height) {
    const rect = svg.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
  }
  if (!width || !height) {
    throw new Error('Cannot rasterize SVG — no dimensions available');
  }

  const xml = serializeKgSvg(svg);
  const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load SVG into Image'));
      img.src = svgUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Canvas toBlob returned null'))),
        'image/png',
      );
    });

    const pngUrl = URL.createObjectURL(pngBlob);
    const a = document.createElement('a');
    a.href = pngUrl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(pngUrl);
    return filename;
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
