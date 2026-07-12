/**
 * AccountlessNotice — warm-Hive PR7b Auth (design screen 13) honest local-first state.
 *
 * The design's own "you don't need this to start" framing (recon 03 §2b/§5/§8). Shown
 * when hosted Clerk auth is NOT configured, which is the desktop's default accountless
 * path. It NEVER renders a fabricated identity, a fake SSO button,
 * or a sign-in that does nothing (F1/F10): the only action is to continue into the
 * fully-local app. B2 renders the real themed Clerk <SignIn/> only with explicit
 * enablement plus a valid key.
 */
import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';

export default function AccountlessNotice() {
  const navigate = useNavigate();

  return (
    <div className="text-center">
      <div className="w-[60px] h-[60px] rounded-2xl mx-auto mb-6 grid place-items-center bg-[var(--honey-wash)] border border-[var(--honey-line)]">
        <Check className="w-7 h-7 text-honey" strokeWidth={2.2} />
      </div>

      <h1 className="text-[26px] font-display font-semibold tracking-[-0.02em] text-foreground">
        You’re running fully local.
      </h1>
      <p className="mt-3 text-[14.5px] leading-relaxed text-[var(--text-muted)]">
        Waggle works on your machine right away — your memory, agents, and skills need no
        account. Create one only when you want to sync across devices or join a team.
      </p>

      {/* the design's honey .localnote trust banner */}
      <div className="mt-5 p-3.5 rounded-[12px] text-left bg-[var(--honey-wash)] border border-[var(--honey-line)]">
        <p className="text-[12.5px] leading-relaxed text-[var(--text-2)]">
          <b className="text-foreground">You don’t need this to start.</b> Your data stays on
          this device until you choose to sync.
        </p>
      </div>

      <button
        onClick={() => navigate('/home')}
        className="mt-6 w-full py-3 rounded-[11px] text-[14.5px] font-[650] bg-primary text-primary-foreground hover:bg-[var(--honey-bright)] transition-colors"
      >
        Continue to Waggle →
      </button>
    </div>
  );
}
