import { useRef, useEffect, useState } from 'react';

const STEPS = [
  { bee: 'bee-builder-dark.png', number: '01', title: 'Install & Launch', desc: 'Download, install, open. Works immediately with local AI embeddings. No account required. Your .mind file is created on first launch.' },
  { bee: 'bee-connector-dark.png', number: '02', title: 'Configure Your Workspace', desc: 'Connect your tools, set up agent personas, define your workflow. Or use a template — one click, not one thousand words.' },
  { bee: 'bee-researcher-dark.png', number: '03', title: 'Let Agents Work', desc: 'Ask questions, delegate tasks, review results. Agents use your context automatically. Approve or correct — they learn from both.' },
];

const HowItWorks = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold: 0.15 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="how-it-works" className="honeycomb-bg" style={{ padding: '96px 24px' }} ref={ref}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', textAlign: 'center', marginBottom: 12, color: 'var(--honey-500)' }}>How It Works</p>
        <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 700, textAlign: 'center', marginBottom: 64, color: 'var(--hive-50)' }}>Three steps to productive AI</h2>

        <div className="steps-grid">
          {STEPS.map((s, i) => (
            <div key={s.number} className={visible ? `card-enter card-enter-${i + 1}` : ''} style={{ textAlign: 'center', opacity: visible ? undefined : 0 }}>
              <div style={{ position: 'relative', display: 'inline-block', marginBottom: 24 }}>
                <img src={`brand/${s.bee}`} alt={s.title} className="float" style={{ width: 96, height: 96 }} />
                <span style={{ position: 'absolute', top: -8, right: -8, width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, background: 'var(--honey-500)', color: 'var(--hive-950)' }}>
                  {s.number}
                </span>
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: 'var(--hive-50)' }}>{s.title}</h3>
              <p style={{ fontSize: 14, lineHeight: 1.6, maxWidth: 280, margin: '0 auto', color: 'var(--hive-300)' }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        .steps-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 32px; }
        @media (max-width: 768px) { .steps-grid { grid-template-columns: 1fr; gap: 48px; } }
      `}</style>
    </section>
  );
};

export default HowItWorks;
