interface BrandMarkProps {
  readonly size?: number;
  readonly withWordmark?: boolean;
}

/**
 * Waggle brand mark: a hive cell (pointy-top hexagon) holding a honey core —
 * one memory node in the graph. Pure SVG so it stays crisp at every density
 * and inherits no JPEG artifacts (replaces the legacy logo.jpeg raster).
 */
export default function BrandMark({ size = 28, withWordmark = false }: BrandMarkProps) {
  const mark = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="Waggle"
    >
      <path
        d="M16 3 L27.26 9.5 L27.26 22.5 L16 29 L4.74 22.5 L4.74 9.5 Z"
        stroke="var(--honey-500, #e9a52c)"
        strokeWidth="2.4"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M16 10.8 L20.5 13.4 L20.5 18.6 L16 21.2 L11.5 18.6 L11.5 13.4 Z"
        fill="var(--honey-400, #f6c45a)"
      />
    </svg>
  );

  if (!withWordmark) return mark;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      {mark}
      <span
        style={{
          fontSize: 17,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          color: 'var(--hive-50, #f6f1e4)',
        }}
      >
        Waggle
      </span>
    </span>
  );
}
