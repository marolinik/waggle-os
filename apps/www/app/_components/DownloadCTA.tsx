'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { detectOSFromUserAgent, type OSId } from '../_lib/os-detection';
import { emit, events } from '../_lib/event-taxonomy';

interface DownloadCTAProps {
  readonly variant?: 'primary' | 'ghost';
  readonly size?: 'default' | 'small';
  readonly section: 'hero' | 'navbar' | 'solo-tier' | 'final-cta';
  readonly children?: ReactNode;
  readonly style?: CSSProperties;
}

const RELEASES_URL = 'https://github.com/marolinik/waggle-os/releases/latest';

/**
 * OS-aware download CTA. Renders a generic "Download" label at SSR + first
 * paint, then swaps to "Download for {os}" after hydration via
 * `navigator.userAgent` detection.
 *
 * Styling comes from the shared `.btn` primitives in globals.css so every
 * download button on the page is pixel-identical. Strings live in
 * `messages/en.json` under `landing.download_cta.*` with an ICU placeholder
 * for the OS name.
 */
export default function DownloadCTA({
  variant = 'primary',
  size = 'default',
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

  const label = children ?? (os ? t('with_os', { os }) : t('default'));

  const className = [
    'btn',
    variant === 'primary' ? 'btn-primary' : 'btn-ghost',
    size === 'small' ? 'btn-small' : '',
  ]
    .filter(Boolean)
    .join(' ');

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
      className={className}
      onClick={handleClick}
      style={style}
    >
      {label}
    </a>
  );
}
