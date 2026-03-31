import { Shield, Server } from 'lucide-react';

const Enterprise = () => (
  <section className="py-24 px-6 honeycomb-bg">
    <div className="max-w-4xl mx-auto text-center">
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-8"
        style={{ background: 'var(--honey-glow)', border: '1px solid rgba(229,160,0,0.2)' }}>
        <Shield className="w-4 h-4" style={{ color: 'var(--honey-500)' }} />
        <span className="text-xs font-semibold" style={{ color: 'var(--honey-400)' }}>Sovereign AI</span>
      </div>

      <h2 className="text-3xl md:text-4xl font-bold mb-6" style={{ color: 'var(--hive-50)' }}>
        Your data. Your infrastructure. Your rules.
      </h2>

      <p className="text-base max-w-2xl mx-auto mb-6 leading-relaxed" style={{ color: 'var(--hive-300)' }}>
        Waggle runs on your machine. For enterprises needing on-premise deployment
        with sovereign AI models — Qwen, Mistral, Llama — on dedicated hardware,
        we offer <strong style={{ color: 'var(--hive-100)' }}>KVARK</strong>, our enterprise AI platform.
      </p>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-8">
        <a href="mailto:marko@egzakta.rs?subject=Waggle%20Enterprise%20%2F%20KVARK"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold border transition-all btn-press hover:border-[var(--honey-500)]"
          style={{ color: 'var(--hive-100)', borderColor: 'var(--hive-600)' }}>
          <Server className="w-4 h-4" />
          Contact for Enterprise
        </a>
      </div>
    </div>
  </section>
);

export default Enterprise;
