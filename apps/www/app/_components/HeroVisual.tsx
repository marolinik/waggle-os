'use client';

import { useState, type CSSProperties } from 'react';
import { heroVariants, type HeroVariantId } from '../_data/hero-variants';

interface HeroVisualProps {
  readonly initialVariant?: HeroVariantId;
}

/**
 * Hero visualization — macOS-style window mockup containing a central
 * rotating hexagon (the hive) connected to 4 LLM provider chips, with a
 * stat strip at the bottom.
 *
 * Numbers per amendment §1.1 (v3.2 LOCKED): 12,847 EDGES · 17 PROVIDERS ·
 * 42ms P99 RECALL · 0 CLOUD CALLS. Lock #2 swaps the legacy "4 PROVIDERS"
 * for "17 PROVIDERS" — reflects actual harvest scope from Memory app
 * Pass 7 verification (ChatGPT/Claude/Claude Code/Claude Desktop/Gemini/
 * AI Studio/Perplexity/Grok/Cursor/Manus/GenSpark/Qwen/MiniMax/z.ai/Other +
 * 2 more = 17).
 *
 * Animations (hexagon rotation + concentric pulse rings) are suppressed
 * via `@media (prefers-reduced-motion: reduce)`.
 *
 * Variant tabs (A · Marcus through E · Petra) are dev-only — visible only
 * when `process.env.NODE_ENV !== 'production'`.
 */
export default function HeroVisual({ initialVariant = 'A' }: HeroVisualProps) {
  const [activeVariant, setActiveVariant] = useState<HeroVariantId>(initialVariant);
  const showDevTabs = process.env.NODE_ENV !== 'production';

  const variantIds: readonly HeroVariantId[] = ['A', 'B', 'C', 'D', 'E'];

  return (
    <div style={containerStyle} aria-label="Waggle hive memory visualization">
      {/* macOS-style window frame */}
      <div style={windowFrameStyle}>
        <div style={titleBarStyle}>
          <div style={trafficLightsStyle} aria-hidden="true">
            <span style={{ ...dotStyle, background: '#3a3f4a' }} />
            <span style={{ ...dotStyle, background: '#3a3f4a' }} />
            <span style={{ ...dotStyle, background: '#3a3f4a' }} />
          </div>
          <span style={titleStyleLeft}>~/.waggle/hive · live</span>
          <span style={titleStyleRight}>local · signed · 42ms</span>
        </div>

        {/* Body — SVG diagram */}
        <div style={bodyStyle}>
          <svg
            viewBox="0 0 480 320"
            xmlns="http://www.w3.org/2000/svg"
            style={{ width: '100%', height: 'auto', display: 'block' }}
            role="img"
            aria-label="Hive memory connecting four LLM providers"
          >
            {/* Connecting lines from each chip to the central hex */}
            <line x1="80" y1="60" x2="240" y2="160" stroke="#3d4560" strokeWidth="1" />
            <line x1="400" y1="60" x2="240" y2="160" stroke="#3d4560" strokeWidth="1" />
            <line x1="80" y1="260" x2="240" y2="160" stroke="#3d4560" strokeWidth="1" />
            <line x1="400" y1="260" x2="240" y2="160" stroke="#3d4560" strokeWidth="1" />

            {/* Concentric pulse rings around the central hex */}
            <g className="hive-pulse-ring">
              <polygon
                points="240,120 275,140 275,180 240,200 205,180 205,140"
                fill="none"
                stroke="#e5a000"
                strokeOpacity="0.18"
                strokeWidth="1"
                transform="scale(2) translate(-120, -80)"
              />
            </g>
            <g className="hive-pulse-ring hive-pulse-ring-2">
              <polygon
                points="240,120 275,140 275,180 240,200 205,180 205,140"
                fill="none"
                stroke="#e5a000"
                strokeOpacity="0.28"
                strokeWidth="1"
                transform="scale(1.5) translate(-80, -55)"
              />
            </g>

            {/* Central rotating hexagon */}
            <g className="hive-pulse-hex">
              <polygon
                points="240,128 268,144 268,176 240,192 212,176 212,144"
                fill="none"
                stroke="#e5a000"
                strokeWidth="2"
              />
            </g>

            {/* "your hive" label below central hex */}
            <text
              x="240"
              y="220"
              fill="#a0a3ad"
              fontSize="11"
              fontFamily="'JetBrains Mono', monospace"
              textAnchor="middle"
              letterSpacing="0.05em"
            >
              your hive
            </text>

            {/* 4 LLM provider chips */}
            <ChipLabel x={80} y={60} primary="claude · sonnet" sub="recall" />
            <ChipLabel x={400} y={60} primary="gpt · 5" sub="recall" />
            <ChipLabel x={80} y={260} primary="qwen · local" sub="commit" />
            <ChipLabel x={400} y={260} primary="gemini · 2.5" sub="recall" />
          </svg>
        </div>

        {/* Stat strip — v3.2 LOCKED text per amendment §1.1 */}
        <div style={statsStripStyle}>
          <Stat value="12,847" label="EDGES" />
          <span style={statSeparator}>·</span>
          <Stat value="17" label="PROVIDERS" />
          <span style={statSeparator}>·</span>
          <Stat value="42ms" label="P99 RECALL" />
          <span style={statSeparator}>·</span>
          <Stat value="0" label="CLOUD CALLS" />
        </div>
      </div>

      {/* Dev-only variant tabs */}
      {showDevTabs && (
        <div style={devTabsStyle} role="tablist" aria-label="Hero variant preview (dev only)">
          {variantIds.map((id) => {
            const isActive = id === activeVariant;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveVariant(id)}
                style={{
                  ...devTabStyle,
                  ...(isActive ? devTabActiveStyle : null),
                }}
              >
                {id} · {heroVariants[id].persona}
              </button>
            );
          })}
        </div>
      )}

      <style>{scopedCss}</style>
    </div>
  );
}

interface ChipLabelProps {
  readonly x: number;
  readonly y: number;
  readonly primary: string;
  readonly sub: string;
}

function ChipLabel({ x, y, primary, sub }: ChipLabelProps) {
  return (
    <g>
      <rect
        x={x - 56}
        y={y - 16}
        width="112"
        height="32"
        rx="6"
        fill="#0f1218"
        stroke="#1f2433"
        strokeWidth="1"
      />
      <text
        x={x}
        y={y - 1}
        fill="#dce0eb"
        fontSize="10"
        fontFamily="'JetBrains Mono', monospace"
        textAnchor="middle"
      >
        {primary}
      </text>
      <text
        x={x}
        y={y + 11}
        fill="#7d869e"
        fontSize="8"
        fontFamily="'JetBrains Mono', monospace"
        textAnchor="middle"
      >
        {sub}
      </text>
    </g>
  );
}

interface StatProps {
  readonly value: string;
  readonly label: string;
}

function Stat({ value, label }: StatProps) {
  return (
    <span style={statItemStyle}>
      <span style={statValueStyle}>{value}</span>
      <span style={statLabelStyle}>{label}</span>
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────── */
/* Styles                                                              */
/* ────────────────────────────────────────────────────────────────── */

const containerStyle: CSSProperties = {
  width: '100%',
  maxWidth: 560,
  margin: '0 auto',
  fontFamily: "'Inter', system-ui, sans-serif",
};

const windowFrameStyle: CSSProperties = {
  borderRadius: 12,
  overflow: 'hidden',
  border: '1px solid var(--hive-700, #1f2433)',
  background: 'linear-gradient(180deg, #0f1218 0%, #080a0f 100%)',
  boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
};

const titleBarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '8px 14px',
  borderBottom: '1px solid var(--hive-700, #1f2433)',
  background: '#11141c',
};

const trafficLightsStyle: CSSProperties = {
  display: 'flex',
  gap: 6,
  marginRight: 8,
};

const dotStyle: CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: '50%',
  display: 'block',
};

const titleStyleLeft: CSSProperties = {
  fontSize: 11,
  color: 'var(--hive-300, #7d869e)',
  fontFamily: "'JetBrains Mono', monospace",
};

const titleStyleRight: CSSProperties = {
  marginLeft: 'auto',
  fontSize: 11,
  color: 'var(--hive-400, #5a6380)',
  fontFamily: "'JetBrains Mono', monospace",
};

const bodyStyle: CSSProperties = {
  padding: '24px 16px',
  background: '#080a0f',
};

const statsStripStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: '10px 14px',
  borderTop: '1px solid var(--hive-700, #1f2433)',
  background: '#0a0c12',
  flexWrap: 'wrap',
};

const statItemStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'baseline',
  gap: 6,
  fontFamily: "'JetBrains Mono', monospace",
};

const statValueStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--hive-100, #dce0eb)',
};

const statLabelStyle: CSSProperties = {
  fontSize: 9,
  color: 'var(--hive-400, #5a6380)',
  letterSpacing: '0.08em',
};

const statSeparator: CSSProperties = {
  color: 'var(--hive-500, #3d4560)',
  fontSize: 11,
};

const devTabsStyle: CSSProperties = {
  display: 'flex',
  gap: 6,
  marginTop: 12,
  padding: 6,
  background: '#0c0e14',
  border: '1px dashed var(--hive-600, #2a3044)',
  borderRadius: 8,
  flexWrap: 'wrap',
};

const devTabStyle: CSSProperties = {
  flex: '1 1 auto',
  padding: '6px 10px',
  fontSize: 10,
  fontFamily: "'JetBrains Mono', monospace",
  color: 'var(--hive-300, #7d869e)',
  background: 'transparent',
  border: '1px solid transparent',
  borderRadius: 4,
  cursor: 'pointer',
};

const devTabActiveStyle: CSSProperties = {
  color: 'var(--honey-400, #f5b731)',
  border: '1px solid var(--hive-600, #2a3044)',
  background: '#11141c',
};

const scopedCss = `
  .hive-pulse-hex {
    transform-origin: 240px 160px;
    animation: hive-rotate 30s linear infinite;
  }
  .hive-pulse-ring {
    transform-origin: 240px 160px;
    animation: hive-pulse-ring 4s ease-in-out infinite;
  }
  .hive-pulse-ring-2 {
    animation-delay: 2s;
  }
  @keyframes hive-rotate {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes hive-pulse-ring {
    0%, 100% { opacity: 0.1; }
    50%      { opacity: 0.35; }
  }
  @media (prefers-reduced-motion: reduce) {
    .hive-pulse-hex, .hive-pulse-ring {
      animation: none;
    }
  }
`;
