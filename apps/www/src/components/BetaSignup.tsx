import { useState } from 'react';
import { Send } from 'lucide-react';

const BetaSignup = () => {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    // Placeholder — replace with Formspree or API endpoint
    window.open(`mailto:marko@egzakta.rs?subject=Waggle%20Beta%20Signup&body=Email:%20${encodeURIComponent(email)}`, '_blank');
    setSubmitted(true);
  };

  return (
    <section id="beta" className="py-24 px-6">
      <div className="max-w-3xl mx-auto text-center">
        <div className="relative inline-block mb-6">
          <img src="brand/bee-celebrating-dark.png" alt="Join the Beta" className="w-28 h-28 float mx-auto" />
        </div>

        <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: 'var(--hive-50)' }}>
          Join the Beta
        </h2>
        <p className="text-base mb-8 max-w-lg mx-auto" style={{ color: 'var(--hive-300)' }}>
          Be one of the first 50 users. Free Teams tier for 30 days.
          Direct Slack channel with the founding team.
        </p>

        {submitted ? (
          <div className="inline-flex items-center gap-2 px-6 py-3 rounded-xl"
            style={{ background: 'var(--honey-glow)', border: '1px solid rgba(229,160,0,0.3)' }}>
            <span className="text-sm font-medium" style={{ color: 'var(--honey-400)' }}>
              Thank you! We'll be in touch.
            </span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md mx-auto">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              className="flex-1 w-full px-4 py-3 rounded-xl text-sm outline-none transition-colors focus:border-[var(--honey-500)]"
              style={{ background: 'var(--hive-850)', color: 'var(--hive-50)', border: '1px solid var(--hive-600)' }}
            />
            <button type="submit"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all btn-press whitespace-nowrap"
              style={{ background: 'var(--honey-500)', color: 'var(--hive-950)', boxShadow: 'var(--shadow-honey)' }}>
              <Send className="w-4 h-4" />
              Join Beta
            </button>
          </form>
        )}
      </div>
    </section>
  );
};

export default BetaSignup;
