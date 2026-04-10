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
  className?: string;
}

const BrandTile = ({ identity, size = 48, official = false, className = '' }: BrandTileProps) => {
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
        boxShadow: official
          ? `0 8px 24px -10px #${color}66, 0 0 0 2px rgba(229, 160, 0, 0.35)`
          : `0 8px 24px -12px #${color}66`,
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
    </div>
  );
};

export default BrandTile;
