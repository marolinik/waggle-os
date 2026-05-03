'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { Menu, X, Download } from 'lucide-react';

interface NavLink {
  readonly key: string;
  readonly href: string;
  readonly external?: boolean;
}

const NAV_LINKS: readonly NavLink[] = [
  { key: 'how_it_works', href: '#how-it-works' },
  { key: 'personas', href: '#personas' },
  { key: 'pricing', href: '#pricing' },
  { key: 'open_source', href: 'https://github.com/marolinik/waggle-os', external: true },
  { key: 'audit', href: '#trust' },
];

const RELEASES_URL = 'https://github.com/marolinik/waggle-os/releases/latest';

/**
 * Top navigation per v3.2 dump. All strings under `landing.navbar.*`.
 *
 * Stays a Client Component for scroll-aware backdrop blur + mobile menu state.
 */
export default function Navbar() {
  const t = useTranslations('landing.navbar');
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return (
    <nav
      style={{
        ...navStyle,
        background: scrolled ? 'rgba(12,14,20,0.95)' : 'transparent',
        backdropFilter: scrolled ? 'blur(12px)' : undefined,
        borderBottom: scrolled
          ? '1px solid var(--hive-700, #1f2433)'
          : '1px solid transparent',
      }}
    >
      <div style={containerStyle}>
        <a href="#hero" style={brandLinkStyle} aria-label="Waggle">
          <img
            src="/brand/waggle-logo.jpeg"
            alt="Waggle"
            width={32}
            height={32}
            style={logoStyle}
          />
          <span style={brandTextStyle}>Waggle</span>
          <span style={versionPillStyle}>v1.0</span>
        </a>

        <div style={desktopNavStyle} className="nav-desktop">
          {NAV_LINKS.map((l) => (
            <a
              key={l.key}
              href={l.href}
              {...(l.external ? { target: '_blank', rel: 'noopener noreferrer' } : null)}
              style={navLinkStyle}
              className="nav-link"
            >
              {t(`links.${l.key}`)}
            </a>
          ))}
          <a href="#" style={signInLinkStyle} className="nav-link">
            {t('ctas.sign_in')}
          </a>
          <a
            href={RELEASES_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={downloadButtonStyle}
            className="btn-press"
          >
            <Download size={14} />
            {t('ctas.download')}
          </a>
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          style={mobileToggleStyle}
          className="nav-mobile-toggle"
          aria-label={t('aria.toggle_menu')}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {mobileOpen && (
        <div style={mobileMenuStyle}>
          {NAV_LINKS.map((l) => (
            <a
              key={l.key}
              href={l.href}
              {...(l.external ? { target: '_blank', rel: 'noopener noreferrer' } : null)}
              onClick={() => setMobileOpen(false)}
              style={mobileLinkStyle}
            >
              {t(`links.${l.key}`)}
            </a>
          ))}
          <a
            href={RELEASES_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...mobileLinkStyle, color: 'var(--honey-400, #f5b731)', fontWeight: 600 }}
            onClick={() => setMobileOpen(false)}
          >
            {t('ctas.download_mobile')}
          </a>
        </div>
      )}

      <style>{navResponsiveCss}</style>
    </nav>
  );
}

const navStyle: CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  zIndex: 50,
  transition: 'background 0.3s, border-color 0.3s',
  fontFamily: "'Inter', system-ui, sans-serif",
};
const containerStyle: CSSProperties = {
  maxWidth: 1200,
  margin: '0 auto',
  padding: '0 24px',
  height: 64,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};
const brandLinkStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  textDecoration: 'none',
};
const logoStyle: CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 8,
  display: 'block',
};
const brandTextStyle: CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  color: 'var(--hive-50, #f0f2f7)',
};
const versionPillStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 500,
  padding: '2px 8px',
  borderRadius: 999,
  background: 'var(--hive-800, #171b26)',
  color: 'var(--hive-400, #5a6380)',
  fontFamily: "'JetBrains Mono', monospace",
  letterSpacing: '0.02em',
};
const desktopNavStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 28,
};
const navLinkStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--hive-300, #7d869e)',
  textDecoration: 'none',
  transition: 'color 0.2s',
};
const signInLinkStyle: CSSProperties = {
  ...navLinkStyle,
  color: 'var(--hive-200, #b0b7cc)',
};
const downloadButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 13,
  fontWeight: 600,
  padding: '8px 14px',
  borderRadius: 8,
  background: 'var(--honey-500, #e5a000)',
  color: 'var(--hive-950, #08090c)',
  textDecoration: 'none',
  boxShadow: 'var(--shadow-honey)',
};
const mobileToggleStyle: CSSProperties = {
  display: 'none',
  padding: 8,
  color: 'var(--hive-200, #b0b7cc)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
};
const mobileMenuStyle: CSSProperties = {
  padding: '16px 24px',
  background: 'var(--hive-900, #0c0e14)',
  borderTop: '1px solid var(--hive-700, #1f2433)',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};
const mobileLinkStyle: CSSProperties = {
  display: 'block',
  fontSize: 14,
  fontWeight: 500,
  padding: '10px 0',
  color: 'var(--hive-200, #b0b7cc)',
  textDecoration: 'none',
};
const navResponsiveCss = `
  .nav-link:hover { color: var(--honey-500, #e5a000); }
  @media (max-width: 1023px) {
    .nav-desktop { display: none !important; }
    .nav-mobile-toggle { display: block !important; }
  }
`;
