import { Download, Apple } from 'lucide-react';

const RELEASE_BASE = 'https://github.com/marolinik/waggle/releases/latest';

const Hero = () => (
  <section className="honeycomb-bg" style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', paddingTop: 64 }}>
    {/* Honey glow */}
    <div className="honey-pulse" style={{
      position: 'absolute', top: '30%', left: '50%', transform: 'translate(-50%, -50%)',
      width: 320, height: 320, borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(229,160,0,0.08) 0%, transparent 70%)', filter: 'blur(40px)',
    }} />

    <div style={{ position: 'relative', zIndex: 10, maxWidth: 800, margin: '0 auto', padding: '0 24px', textAlign: 'center' }}>
      <div style={{ marginBottom: 32 }}>
        <img src="brand/bee-orchestrator-dark.png" alt="Waggle AI Agent" className="float" style={{ width: 176, height: 176, margin: '0 auto' }} />
      </div>

      <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 16, color: 'var(--honey-500)' }}>
        Your AI Operating System
      </p>

      <h1 style={{ fontSize: 'clamp(40px, 6vw, 72px)', fontWeight: 800, lineHeight: 1.1, marginBottom: 24, color: 'var(--hive-50)' }}>
        AI Agents That <span style={{ color: 'var(--honey-400)' }}>Remember</span>
      </h1>

      <p style={{ fontSize: 'clamp(16px, 2vw, 20px)', maxWidth: 640, margin: '0 auto 40px', lineHeight: 1.6, color: 'var(--hive-300)' }}>
        A workspace where AI agents remember your context, connect to your tools,
        and improve with every interaction. Desktop-native. Privacy-first.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 16, marginBottom: 16 }}>
        <a href={RELEASE_BASE} target="_blank" rel="noopener noreferrer" className="btn-press"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '14px 28px', borderRadius: 12, fontSize: 14, fontWeight: 600, textDecoration: 'none', background: 'var(--honey-500)', color: 'var(--hive-950)', boxShadow: 'var(--shadow-honey)' }}>
          <Download size={18} /> Download for Windows
        </a>
        <a href={RELEASE_BASE} target="_blank" rel="noopener noreferrer" className="btn-press"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '14px 28px', borderRadius: 12, fontSize: 14, fontWeight: 600, textDecoration: 'none', color: 'var(--hive-100)', border: '1px solid var(--hive-600)' }}>
          <Apple size={18} /> Download for macOS
        </a>
      </div>

      <p style={{ fontSize: 12, color: 'var(--hive-400)' }}>Free for individuals. No credit card required.</p>
    </div>

    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 128, background: 'linear-gradient(to top, var(--hive-950), transparent)' }} />
  </section>
);

export default Hero;
