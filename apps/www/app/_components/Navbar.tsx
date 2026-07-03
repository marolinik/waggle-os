'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { SignInButton, UserButton, Show } from '@clerk/nextjs';
import BrandMark from './BrandMark';
import DownloadCTA from './DownloadCTA';
import styles from './Navbar.module.css';

/* Absolute-path anchors so the navbar also works from /privacy, /terms,
   and the other legal pages that render this chrome. */
const NAV_ITEMS = [
  { href: '/#how-it-works', key: 'how_it_works' },
  { href: '/#memory', key: 'memory' },
  { href: '/#proof', key: 'benchmark' },
  { href: '/#open-source', key: 'open_source' },
  { href: '/#pricing', key: 'pricing' },
] as const;

/**
 * Fixed top navigation. Transparent over the hero, gains a blurred backdrop
 * + hairline border after a small scroll. Collapses to a menu button below
 * 860px; the mobile panel reuses the same anchor list.
 *
 * Stays a Client Component for scroll-aware backdrop + menu state. All
 * strings under `landing.navbar.*`.
 */
export default function Navbar() {
  const t = useTranslations('landing.navbar');
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const headerClass = [
    styles.header,
    scrolled || open ? styles.headerScrolled : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <header className={headerClass}>
      <div className={styles.inner}>
        <a href="/" className={styles.brand} aria-label={t('aria.home')}>
          <BrandMark withWordmark />
        </a>

        <nav className={styles.nav} aria-label={t('aria.primary')}>
          {NAV_ITEMS.map((item) => (
            <a key={item.key} href={item.href} className={styles.navLink}>
              {t(`links.${item.key}`)}
            </a>
          ))}
        </nav>

        <div className={styles.actions}>
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button type="button" className={styles.signIn}>
                {t('ctas.sign_in')}
              </button>
            </SignInButton>
          </Show>
          <Show when="signed-in">
            <UserButton />
          </Show>
          <DownloadCTA section="navbar" size="small">
            {t('ctas.download')}
          </DownloadCTA>
          <button
            type="button"
            className={styles.menuButton}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={t('aria.toggle_menu')}
            onClick={() => setOpen((v) => !v)}
          >
            <MenuIcon open={open} />
          </button>
        </div>
      </div>

      {open ? (
        <nav
          id="mobile-nav"
          className={styles.mobilePanel}
          aria-label={t('aria.primary')}
        >
          {NAV_ITEMS.map((item) => (
            <a
              key={item.key}
              href={item.href}
              className={styles.mobileLink}
              onClick={() => setOpen(false)}
            >
              {t(`links.${item.key}`)}
            </a>
          ))}
          <div className={styles.mobileActions}>
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button
                  type="button"
                  className={styles.signIn}
                  style={{ display: 'inline-flex' }}
                >
                  {t('ctas.sign_in')}
                </button>
              </SignInButton>
            </Show>
            <Show when="signed-in">
              <UserButton />
            </Show>
          </div>
        </nav>
      ) : null}
    </header>
  );
}

function MenuIcon({ open }: { readonly open: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
    >
      {open ? (
        <path
          d="M4 4 L14 14 M14 4 L4 14"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M2 5 H16 M2 9 H16 M2 13 H16"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
