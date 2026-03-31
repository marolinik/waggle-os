import { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';

const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Beta', href: '#beta' },
];

const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
      transition: 'all 0.3s',
      background: scrolled ? 'rgba(12,14,20,0.95)' : 'transparent',
      backdropFilter: scrolled ? 'blur(12px)' : undefined,
      borderBottom: scrolled ? '1px solid var(--hive-700)' : '1px solid transparent',
    }}>
      <div style={{ maxWidth: 1152, margin: '0 auto', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <a href="#" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none' }}>
          <img src="brand/waggle-logo.jpeg" alt="Waggle" style={{ width: 32, height: 32, borderRadius: 8 }} />
          <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--hive-50)' }}>Waggle</span>
        </a>

        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }} className="nav-desktop">
          {NAV_LINKS.map(l => (
            <a key={l.href} href={l.href} style={{ fontSize: 14, fontWeight: 500, color: 'var(--hive-300)', textDecoration: 'none', transition: 'color 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--honey-500)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--hive-300)')}>
              {l.label}
            </a>
          ))}
          <a href="https://github.com/marolinik/waggle-os" target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 14, fontWeight: 500, padding: '8px 16px', borderRadius: 8, color: 'var(--hive-200)', border: '1px solid var(--hive-600)', textDecoration: 'none' }}>
            GitHub
          </a>
        </div>

        <button className="nav-mobile-toggle" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle menu"
          style={{ padding: 8, color: 'var(--hive-200)', background: 'none', border: 'none', cursor: 'pointer' }}>
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {mobileOpen && (
        <div style={{ padding: '16px 24px', background: 'var(--hive-900)', borderTop: '1px solid var(--hive-700)' }}>
          {NAV_LINKS.map(l => (
            <a key={l.href} href={l.href} onClick={() => setMobileOpen(false)}
              style={{ display: 'block', fontSize: 14, fontWeight: 500, padding: '8px 0', color: 'var(--hive-200)', textDecoration: 'none' }}>
              {l.label}
            </a>
          ))}
        </div>
      )}

      <style>{`
        .nav-mobile-toggle { display: none; }
        @media (max-width: 768px) {
          .nav-desktop { display: none !important; }
          .nav-mobile-toggle { display: block !important; }
        }
      `}</style>
    </nav>
  );
};

export default Navbar;
