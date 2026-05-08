import type { CSSProperties, ReactNode } from 'react';
import Navbar from '../_components/Navbar';
import Footer from '../_components/Footer';

/**
 * Layout for the legal route group: /privacy, /terms, /cookies, /eu-ai-act.
 *
 * Wraps each legal page with the same Navbar + Footer chrome as the landing
 * page so the legal pages don't feel like a separate microsite. The route
 * group `(legal)` is invisible in the URL — pages are reachable at their
 * top-level paths.
 */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Navbar />
      <main style={mainStyle}>{children}</main>
      <Footer />
    </>
  );
}

const mainStyle: CSSProperties = {
  maxWidth: 760,
  margin: '120px auto 96px',
  padding: '0 24px',
  fontFamily: "'Inter', system-ui, sans-serif",
  color: 'var(--hive-100, #dce0eb)',
};
