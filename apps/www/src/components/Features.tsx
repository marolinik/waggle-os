import { useRef, useEffect, useState } from 'react';

const FEATURES = [
  { icon: 'icon-remember-dark.jpeg', title: 'Memory That Grows', desc: 'Your AI remembers everything across sessions. Decisions, preferences, context — stored locally in your .mind file. 11 harvest adapters import your AI history from ChatGPT, Claude, Gemini, and more.' },
  { icon: 'icon-capabilities-dark.jpeg', title: '60+ Tools, 148 Integrations', desc: 'GitHub, Slack, Jira, Notion, Google Calendar — 30 native connectors plus 148 MCP servers. Your AI works inside your existing workflow.' },
  { icon: 'icon-settings-dark.jpeg', title: 'Privacy by Architecture', desc: 'Desktop-native. Your data never leaves your machine. AES-256 encrypted vault. SQLite-backed memory. Zero cloud dependency by default.' },
  { icon: 'icon-health-dark.jpeg', title: 'Self-Evolving Intelligence', desc: 'Agents learn from every interaction. The evolution engine traces, evaluates, and improves prompts across generations — your workspace gets smarter over time.' },
];

const Features = () => {
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
    <section id="features" style={{ padding: '96px 24px' }} ref={ref}>
      <div style={{ maxWidth: 1152, margin: '0 auto' }}>
        <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', textAlign: 'center', marginBottom: 12, color: 'var(--honey-500)' }}>
          Why Waggle
        </p>
        <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 700, textAlign: 'center', marginBottom: 16, color: 'var(--hive-50)' }}>
          Not another chatbot
        </h2>
        <p style={{ textAlign: 'center', maxWidth: 560, margin: '0 auto 64px', color: 'var(--hive-300)' }}>
          A full operating system for AI work. Memory, tools, agents — running on your machine.
        </p>

        <div className="features-grid">
          {FEATURES.map((f, i) => (
            <div key={f.title} className={`card-lift ${visible ? `card-enter card-enter-${i + 1}` : ''}`}
              style={{ background: 'var(--hive-900)', border: '1px solid var(--hive-700)', borderRadius: 16, padding: 24, opacity: visible ? undefined : 0 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, background: 'var(--honey-glow)' }}>
                <img src={`brand/${f.icon}`} alt="" style={{ width: 28, height: 28, borderRadius: 4 }} />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: 'var(--hive-50)' }}>{f.title}</h3>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--hive-300)' }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        .features-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
        @media (max-width: 1024px) { .features-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 640px) { .features-grid { grid-template-columns: 1fr; } }
      `}</style>
    </section>
  );
};

export default Features;
