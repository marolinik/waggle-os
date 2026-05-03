'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { detectOSFromUserAgent, type OSId } from '../_lib/os-detection';
import { emit, events } from '../_lib/event-taxonomy';

interface DownloadCTAProps {
  readonly variant?: 'primary' | 'ghost';
  readonly section: 'hero' | 'solo-tier' | 'final-cta';
  readonly children?: ReactNode;
  readonly style?: CSSProperties;
}

const RELEASES_URL = 'https://github.com/marolinik/waggle-os/releases/latest';

const PRIMARY_STYLE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  padding: '14px 28px',
  borderRadius: 12,
  fontSize: 14,
  fontWeight: 600,
  textDecoration: 'none',
  background: 'var(--honey-500, #e5a000)',
  color: 'var(--hive-950, #08090c)',
  boxShadow: 'var(--shadow-honey)',
  cursor: 'pointer',
  border: 'none',
  fontFamily: "'Inter', system-ui, sans-serif",
};

const GHOST_STYLE: CSSProperties = {
  ...PRIMARY_STYLE,
  background: 'transparent',
  color: 'var(--hive-100, #dce0eb)',
  border: '1px solid var(--hive-600, #2a3044)',
  boxShadow: undefined,
};

/**
 * OS-aware download CTA. Renders a generic "Download" label at SSR + first
 * paint, then swaps to "Download for {os}" after hydration via
 * `navigator.userAgent` detection.
 *
 * Strings live in `messages/en.json` under `landing.download_cta.*` with an
 * ICU placeholder for the OS name.
 */
export default function DownloadCTA({
  variant = 'primary',
  section,
  children,
  style,
}: DownloadCTAProps) {
  const t = useTranslations('landing.download_cta');
  const [os, setOS] = useState<OSId | null>(null);

  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      setOS(detectOSFromUserAgent(navigator.userAgent));
    }
  }, []);

  const label =
    children ?? (os ? t('with_os', { os }) : t('default'));
  const baseStyle = variant === 'primary' ? PRIMARY_STYLE : GHOST_STYLE;

  const handleClick = () => {
    emit({
      name: events.ctaClick,
      properties: { section, os: os ?? 'unknown' },
    });
  };

  return (
    <a
      href={RELEASES_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="btn-press"
      onClick={handleClick}
      style={{ ...baseStyle, ...style }}
    >
      {label}
    </a>
  );
}
