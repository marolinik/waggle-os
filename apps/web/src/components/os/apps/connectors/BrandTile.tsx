/**
 * BrandTile — the visual identity primitive for every MCP server.
 *
 * Renders a rounded square tile in the brand's signature color with either
 * the authentic SVG mark (from simple-icons) or a 1–2 character monogram.
 *
 * Styling follows Hive DS tokens — the tile itself owns the brand color, but
 * the ring, hover glow, and surrounding chrome are honey-accent so everything
 * still feels like it belongs in Waggle OS.
 */

import type { BrandIdentity } from './brand-identity';

interface BrandTileProps {
  identity: BrandIdentity;
  /** Tile size in px (square). Defaults to 48. */
  size?: number;
  /** Whether the tile is for an official MCP server — adds an honey ring. */
  official?: boolean;
  /** Whether the corresponding service is actively connected — adds an emerald ring. */
  connected?: boolean;
  className?: string;
}

/** Compose the box-shadow for a tile given its status flags. */
function buildShadow(color: string, official: boolean, connected: boolean): string {
  const dropShadow = `0 8px 24px -12px #${color}66`;
  // Connected takes precedence over official because it's a stronger signal.
  if (connected) return `${dropShadow}, 0 0 0 2px rgba(16, 185, 129, 0.55)`;
  if (official) return `${dropShadow}, 0 0 0 2px rgba(229, 160, 0, 0.35)`;
  return dropShadow;
}

const BrandTile = ({
  identity,
  size = 48,
  official = false,
  connected = false,
  className = '',
}: BrandTileProps) => {
  const { color, fg, svgPath, monogram } = identity;

  // The inner SVG mark sits in a 24x24 viewBox (simple-icons convention) —
  // scale it so the glyph takes ~58% of the tile for visual breathing room.
  const markSize = Math.round(size * 0.58);
  const monogramSize = Math.round(size * (monogram.length === 1 ? 0.5 : 0.38));

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-[14px] shadow-lg transition-all duration-200 group-hover:shadow-xl ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: `#${color}`,
        boxShadow: buildShadow(color, official, connected),
      }}
      aria-hidden="true"
    >
      {/* Subtle top-down gradient for depth */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 40%, rgba(0,0,0,0.08) 100%)',
        }}
      />

      {/* Inner ring for crisp edge definition */}
      <div
        className="pointer-events-none absolute inset-0 rounded-[14px]"
        style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)' }}
      />

      {/* Brand mark — real SVG when available, monogram fallback otherwise */}
      <div className="absolute inset-0 flex items-center justify-center">
        {svgPath ? (
          <svg
            width={markSize}
            height={markSize}
            viewBox="0 0 24 24"
            fill={fg === 'white' ? '#FFFFFF' : '#0B0C10'}
            role="img"
            aria-hidden="true"
          >
            <path d={svgPath} />
          </svg>
        ) : (
          <span
            className="font-display font-bold tracking-tight"
            style={{
              fontSize: monogramSize,
              color: fg === 'white' ? '#FFFFFF' : '#0B0C10',
              lineHeight: 1,
            }}
          >
            {monogram}
          </span>
        )}
      </div>

      {/* Honey-tinted hover shimmer — only visible on group hover */}
      <div
        className="pointer-events-none absolute inset-0 rounded-[14px] opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        style={{
          background:
            'radial-gradient(120% 80% at 50% 0%, rgba(229, 160, 0, 0.18) 0%, transparent 60%)',
        }}
      />

      {/* Connected indicator — tiny emerald dot in the bottom-right corner,
          sized proportionally to the tile so it works at 28, 32, 48, 64px. */}
      {connected && (
        <div
          className="pointer-events-none absolute rounded-full bg-emerald-400 ring-2 ring-background"
          style={{
            width: Math.max(6, Math.round(size * 0.18)),
            height: Math.max(6, Math.round(size * 0.18)),
            right: Math.max(2, Math.round(size * 0.06)),
            bottom: Math.max(2, Math.round(size * 0.06)),
            boxShadow: '0 0 8px rgba(16, 185, 129, 0.6)',
          }}
        />
      )}
    </div>
  );
};

export default BrandTile;
