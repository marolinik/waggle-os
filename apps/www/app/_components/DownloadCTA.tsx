'use client';

import { useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
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

const DOWNLOAD_URL = '/download';

const subscribeToClientEnvironment = () => () => {};
const getClientOS = () => detectOSFromUserAgent(navigator.userAgent);
const getServerOS = (): null => null;

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
  const os = useSyncExternalStore<OSId | null>(
    subscribeToClientEnvironment,
    getClientOS,
    getServerOS,
  );

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
      href={DOWNLOAD_URL}
      className={className}
      onClick={handleClick}
      style={style}
    >
      {label}
    </a>
  );
}
