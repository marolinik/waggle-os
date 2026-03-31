const Footer = () => (
  <footer className="py-12 px-6 border-t" style={{ borderColor: 'var(--hive-700)' }}>
    <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
      <div className="flex items-center gap-3">
        <img src="brand/waggle-logo.jpeg" alt="Waggle" className="w-6 h-6 rounded" />
        <span className="text-sm font-semibold" style={{ color: 'var(--hive-200)' }}>Waggle</span>
        <span className="text-xs" style={{ color: 'var(--hive-500)' }}>Your AI Agent Workspace</span>
      </div>

      <div className="flex items-center gap-6 text-xs" style={{ color: 'var(--hive-400)' }}>
        <a href="https://github.com/marolinik/waggle-os" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--hive-200)] transition-colors">
          GitHub
        </a>
        <a href="mailto:marko@egzakta.rs" className="hover:text-[var(--hive-200)] transition-colors">
          Contact
        </a>
      </div>

      <p className="text-xs" style={{ color: 'var(--hive-500)' }}>
        Built in Belgrade, Serbia. &copy; 2026 Egzakta Group
      </p>
    </div>
  </footer>
);

export default Footer;
