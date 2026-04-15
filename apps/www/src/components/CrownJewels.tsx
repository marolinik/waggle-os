import { useRef, useEffect, useState } from 'react';
import { Brain, Zap, Shield, BarChart3, FileText, RefreshCw } from 'lucide-react';

const MEMORY_FEATURES = [
  { icon: Brain, title: 'Harvest Your AI History', desc: 'Import conversations from ChatGPT, Claude, Gemini, Perplexity — 11 adapters. Your scattered AI knowledge, unified.' },
  { icon: FileText, title: 'Wiki Compiler', desc: 'Your memories auto-compile into navigable wiki pages. Entity pages, concept summaries, synthesis views — a living knowledge base.' },
  { icon: Shield, title: 'EU AI Act Ready', desc: 'Interaction logging, model inventory, audit trail — compliance by default. Generate boardroom-grade PDF reports in one click.' },
];

const EVOLUTION_FEATURES = [
  { icon: RefreshCw, title: 'Self-Improving Prompts', desc: 'GEPA + EvolveSchema iterate across generations. Each generation is scored, gated, and deployed — closed-loop optimization.' },
  { icon: BarChart3, title: 'Proven Results', desc: 'Gemma 4 + Waggle evolution ranked above raw Opus 4.6 by 4 independent blind judges. Cheap models at flagship quality.' },
  { icon: Zap, title: 'Skills Auto-Extract', desc: 'Repeated workflows become reusable skills. Personal → workspace → team → enterprise promotion chain. Your best patterns persist.' },
];

const CrownJewels = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold: 0.1 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section style={{ padding: '96px 24px' }} ref={ref}>
      <div style={{ maxWidth: 1152, margin: '0 auto' }}>
        {/* Memory Section */}
        <div style={{ marginBottom: 96 }}>
          <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', textAlign: 'center', marginBottom: 12, color: 'var(--honey-500)' }}>
            Crown Jewel #1
          </p>
          <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 700, textAlign: 'center', marginBottom: 16, color: 'var(--hive-50)' }}>
            AI with memory that <span style={{ color: 'var(--honey-400)' }}>complies by default</span>
          </h2>
          <p style={{ textAlign: 'center', maxWidth: 600, margin: '0 auto 48px', color: 'var(--hive-300)' }}>
            Every conversation builds your knowledge graph. Every interaction is logged for compliance.
            Your AI history from every platform, unified in one local-first memory.
          </p>
          <div className="jewels-grid">
            {MEMORY_FEATURES.map((f, i) => (
              <div key={f.title} className={`card-lift ${visible ? `card-enter card-enter-${i + 1}` : ''}`}
                style={{ background: 'var(--hive-900)', border: '1px solid var(--hive-700)', borderRadius: 16, padding: 24, opacity: visible ? undefined : 0 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14, background: 'rgba(229,160,0,0.12)' }}>
                  <f.icon size={20} style={{ color: 'var(--honey-400)' }} />
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: 'var(--hive-50)' }}>{f.title}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--hive-300)' }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Evolution Section */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', textAlign: 'center', marginBottom: 12, color: 'var(--accent-color, #a78bfa)' }}>
            Crown Jewel #2
          </p>
          <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 700, textAlign: 'center', marginBottom: 16, color: 'var(--hive-50)' }}>
            Cheap models at <span style={{ color: 'var(--accent-color, #a78bfa)' }}>flagship tier</span>
          </h2>
          <p style={{ textAlign: 'center', maxWidth: 600, margin: '0 auto 48px', color: 'var(--hive-300)' }}>
            Self-evolution means your agents get better without you switching to a more expensive model.
            Open-weight models + Waggle evolution = quality that rivals the most expensive APIs.
          </p>
          <div className="jewels-grid">
            {EVOLUTION_FEATURES.map((f, i) => (
              <div key={f.title} className={`card-lift ${visible ? `card-enter card-enter-${i + 1}` : ''}`}
                style={{ background: 'var(--hive-900)', border: '1px solid var(--hive-700)', borderRadius: 16, padding: 24, opacity: visible ? undefined : 0 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14, background: 'rgba(167,139,250,0.12)' }}>
                  <f.icon size={20} style={{ color: 'var(--accent-color, #a78bfa)' }} />
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: 'var(--hive-50)' }}>{f.title}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--hive-300)' }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        .jewels-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
        @media (max-width: 1024px) { .jewels-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 640px) { .jewels-grid { grid-template-columns: 1fr; } }
      `}</style>
    </section>
  );
};

export default CrownJewels;
