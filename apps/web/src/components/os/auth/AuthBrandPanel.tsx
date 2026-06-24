/**
 * AuthBrandPanel — warm-Hive PR7b Auth (design screen 13) left brand panel.
 *
 * Pure custom layout chrome (recon 03 §1/§2e): hex "W" lockup + pitch + two trust
 * lines, on a warm gradient with a soft honey radial wash (the honeycomb stand-in).
 * Hidden below `lg` (the design hides the panel < 820px; mobile = form only). No auth
 * state lives here — it never renders identity.
 */
import { Shield, ArrowRight } from 'lucide-react';

export default function AuthBrandPanel() {
  return (
    <div
      className="hidden lg:flex flex-col justify-between p-14 border-r border-[var(--line-soft)] relative overflow-hidden"
      style={{ background: 'linear-gradient(160deg, var(--bg-2), var(--bg))' }}
    >
      {/* soft honey radial wash — the honeycomb texture stand-in */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(58% 48% at 30% 28%, var(--honey-wash), transparent 70%)' }}
      />

      {/* brand lockup */}
      <div className="relative flex items-center gap-3">
        <div
          className="w-9 h-9 grid place-items-center text-[var(--primary-foreground)] font-bold text-[16px]"
          style={{
            background: 'linear-gradient(150deg, var(--honey-bright), var(--honey-deep))',
            clipPath: 'polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)',
          }}
        >
          W
        </div>
        <span className="text-[18px] font-display font-semibold text-foreground tracking-tight">Waggle</span>
      </div>

      {/* pitch (verbatim, recon 03 §2e) */}
      <div className="relative max-w-[420px]">
        <h2 className="text-[30px] leading-tight font-display font-semibold text-foreground tracking-[-0.02em]">
          Your work follows you, <em className="not-italic text-primary">everywhere.</em>
        </h2>
        <p className="mt-4 text-[15px] leading-relaxed text-[var(--text-2)]">
          Sign in to sync your hive across devices, collaborate with a team, and pick up any
          project exactly where you left off — on any machine.
        </p>
      </div>

      {/* trust lines (verbatim, recon 03 §2e) */}
      <div className="relative grid gap-3">
        <div className="flex items-center gap-2.5 text-[13.5px] text-[var(--text-muted)]">
          <Shield className="w-4 h-4 shrink-0 text-primary" strokeWidth={2} />
          An account is optional — Waggle runs fully local without one
        </div>
        <div className="flex items-center gap-2.5 text-[13.5px] text-[var(--text-muted)]">
          <ArrowRight className="w-4 h-4 shrink-0 text-primary" strokeWidth={2} />
          Your memory stays yours; sign-in only adds sync
        </div>
      </div>
    </div>
  );
}
