import { useRef, useEffect, useState, useCallback } from 'react';
import { Check } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL ?? 'https://cloud.waggle-os.ai';

const TIERS = [
  {
    id: 'SOLO' as const, name: 'Solo', price: 'Free', period: '', target: 'For individual power users',
    cta: 'Download Free', ctaHref: 'https://github.com/marolinik/waggle/releases/latest', highlighted: false, stripeCheckout: false,
    features: ['5 workspaces', 'Local in-process embeddings', '53+ tools, 29 connectors', 'Community skills marketplace', 'Persistent .mind file', 'AES-256 encrypted vault'],
  },
  {
    id: 'BASIC' as const, name: 'Basic', price: '$15', period: '/mo', target: 'For power users who need more',
    cta: 'Start Basic', ctaHref: '', highlighted: true, stripeCheckout: true,
    features: ['Everything in Solo, plus:', 'Unlimited workspaces', 'All embedding providers', 'Sub-agent spawning', 'Custom skills', 'Priority support'],
  },
  {
    id: 'TEAMS' as const, name: 'Teams', price: '$79', period: '/mo per seat', target: 'For teams and organizations',
    cta: 'Talk to Us', ctaHref: 'mailto:marko@egzakta.rs?subject=Waggle%20Teams%20Inquiry', highlighted: false, stripeCheckout: false,
    features: ['Everything in Basic, plus:', 'Shared workspaces', 'Team skill library', 'Cloud sync', 'Admin panel & audit log', 'Self-host option', 'Dedicated support'],
  },
];

const Pricing = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold: 0.1 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleStripeCheckout = useCallback(async (tierId: string) => {
    setLoading(tierId);
    try {
      const res = await fetch(`${API_URL}/api/stripe/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: tierId, billingPeriod: 'monthly' }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.url) window.open(data.url, '_blank');
      } else {
        const err = await res.json().catch(() => ({}));
        alert((err as { message?: string }).message ?? 'Checkout unavailable. Please try again later.');
      }
    } catch {
      alert('Could not connect to server. Please try again later.');
    }
    setLoading(null);
  }, []);

  return (
    <section id="pricing" style={{ padding: '96px 24px' }} ref={ref}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', textAlign: 'center', marginBottom: 12, color: 'var(--honey-500)' }}>Pricing</p>
        <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 700, textAlign: 'center', marginBottom: 16, color: 'var(--hive-50)' }}>Start free. Scale when ready.</h2>
        <p style={{ textAlign: 'center', maxWidth: 520, margin: '0 auto 64px', color: 'var(--hive-300)' }}>
          Every plan includes local-first architecture, encrypted vault, auto-context injection, and the community skills marketplace.
        </p>

        <div className="pricing-grid">
          {TIERS.map((t, i) => (
            <div key={t.name} className={`card-lift ${visible ? `card-enter card-enter-${i + 1}` : ''}`}
              style={{
                position: 'relative', borderRadius: 16, padding: 28,
                background: t.highlighted ? 'var(--hive-850)' : 'var(--hive-900)',
                border: `1px solid ${t.highlighted ? 'var(--honey-500)' : 'var(--hive-700)'}`,
                boxShadow: t.highlighted ? 'var(--shadow-honey)' : undefined,
                opacity: visible ? undefined : 0,
              }}>
              {t.highlighted && (
                <span style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '4px 12px', borderRadius: 999, background: 'var(--honey-500)', color: 'var(--hive-950)' }}>
                  Most Popular
                </span>
              )}
              <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, color: 'var(--hive-50)' }}>{t.name}</h3>
              <p style={{ fontSize: 12, marginBottom: 16, color: 'var(--hive-400)' }}>{t.target}</p>
              <div style={{ marginBottom: 24 }}>
                <span style={{ fontSize: 40, fontWeight: 800, color: 'var(--hive-50)' }}>{t.price}</span>
                {t.period && <span style={{ fontSize: 14, marginLeft: 4, color: 'var(--hive-400)' }}>{t.period}</span>}
              </div>
              <ul style={{ listStyle: 'none', padding: 0, marginBottom: 32 }}>
                {t.features.map(f => (
                  <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, color: 'var(--hive-200)', marginBottom: 12 }}>
                    <Check size={16} style={{ color: 'var(--status-healthy)', flexShrink: 0, marginTop: 2 }} />
                    {f}
                  </li>
                ))}
              </ul>
              {t.stripeCheckout ? (
                <button
                  onClick={() => handleStripeCheckout(t.id)}
                  disabled={loading === t.id}
                  className="btn-press"
                  style={{
                    display: 'block', width: '100%', textAlign: 'center', padding: '12px 0', borderRadius: 12, fontSize: 14, fontWeight: 600,
                    cursor: loading === t.id ? 'wait' : 'pointer',
                    background: 'var(--honey-500)', color: 'var(--hive-950)', boxShadow: 'var(--shadow-honey)',
                    border: 'none',
                  }}
                >
                  {loading === t.id ? 'Loading...' : t.cta}
                </button>
              ) : (
                <a href={t.ctaHref} target={t.ctaHref.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" className="btn-press"
                  style={{
                    display: 'block', textAlign: 'center', padding: '12px 0', borderRadius: 12, fontSize: 14, fontWeight: 600, textDecoration: 'none',
                    ...(t.highlighted
                      ? { background: 'var(--honey-500)', color: 'var(--hive-950)', boxShadow: 'var(--shadow-honey)' }
                      : { background: 'var(--hive-800)', color: 'var(--hive-100)', border: '1px solid var(--hive-600)' }),
                  }}>
                  {t.cta}
                </a>
              )}
            </div>
          ))}
        </div>
      </div>

      <style>{`
        .pricing-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
        @media (max-width: 1024px) { .pricing-grid { grid-template-columns: 1fr; max-width: 400px; margin: 0 auto; } }
      `}</style>
    </section>
  );
};

export default Pricing;
