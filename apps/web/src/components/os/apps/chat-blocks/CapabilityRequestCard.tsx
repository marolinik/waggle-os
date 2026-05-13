import { useState } from 'react';
import { Loader2, Download, CheckCircle2, XCircle, Package, ShieldCheck } from 'lucide-react';
import { adapter } from '@/lib/adapter';
import { useToast } from '@/hooks/use-toast';

export interface CapabilityRequest {
  name: string;
  source: string;
  kind?: 'skill' | 'marketplace';
  reason?: string;
}

interface CapabilityRequestCardProps {
  request: CapabilityRequest;
}

type Phase = 'pending' | 'installing' | 'installed' | 'declined' | 'failed';

/**
 * Inline install affordance for agent capability requests.
 *
 * Parsed out of agent text by TextBlock when it spots a recommendation to
 * call `install_capability with name "X" and source "Y"`. Render gives the
 * user a one-click Install button without leaving the conversation — they
 * can also Dismiss to keep the agent's proposal visible without acting on it.
 *
 * `starter-pack` routes to /api/skills/starter-pack/:id (always allowed —
 * starter skills are bundled). `marketplace` routes to /api/marketplace/install
 * which is tier-gated and may dispatch the UpgradeModal on 403.
 */
export default function CapabilityRequestCard({ request }: CapabilityRequestCardProps) {
  const [phase, setPhase] = useState<Phase>('pending');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { toast } = useToast();

  const isMarketplace = request.kind === 'marketplace' || request.source === 'marketplace';

  const handleInstall = async () => {
    setPhase('installing');
    setErrorMessage(null);
    try {
      if (isMarketplace) {
        // Marketplace requires numeric packageId. The agent only knows the
        // name, so resolve via search first. If we miss, surface a hint.
        const searchRes = await fetch(`${adapter.getServerUrl()}/api/marketplace/search?query=${encodeURIComponent(request.name)}&limit=1`);
        const searchData = await searchRes.json().catch(() => ({ packages: [] }));
        const pkg = (searchData.packages ?? [])[0];
        if (!pkg) {
          throw new Error(`Marketplace package "${request.name}" not found`);
        }
        const res = await fetch(`${adapter.getServerUrl()}/api/marketplace/install`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ packageId: pkg.id }),
        });
        if (res.status === 403) {
          window.dispatchEvent(new CustomEvent('waggle:tier-insufficient', {
            detail: { required: 'PRO', actual: 'FREE', message: `Installing "${request.name}" needs a Pro plan or active trial.` },
          }));
          setPhase('failed');
          setErrorMessage('Upgrade required');
          return;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? body.message ?? `Install failed (${res.status})`);
        }
      } else {
        // Starter pack — no auth, always allowed.
        await adapter.installPack(request.name);
      }
      setPhase('installed');
      toast({ title: 'Installed', description: `${request.name} is now active.` });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Install failed';
      setPhase('failed');
      setErrorMessage(message);
      toast({ title: 'Install failed', description: message, variant: 'destructive' });
    }
  };

  const handleDecline = () => {
    setPhase('declined');
  };

  return (
    <div
      data-testid="capability-request-card"
      className="my-2 rounded-xl border border-primary/40 bg-primary/5 p-3"
    >
      <div className="flex items-start gap-3">
        <div className="p-1.5 rounded-lg bg-primary/15 shrink-0 mt-0.5">
          <Package className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-display font-semibold text-foreground">
              Install <span className="text-primary">{request.name}</span>?
            </span>
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground font-display">
              {isMarketplace ? 'marketplace' : request.source}
            </span>
          </div>
          {request.reason && (
            <p className="text-xs text-muted-foreground mt-1">{request.reason}</p>
          )}
          <div className="flex items-center gap-2 mt-2.5">
            {phase === 'pending' && (
              <>
                <button
                  type="button"
                  onClick={handleInstall}
                  data-testid="capability-request-install"
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 font-display transition-colors"
                >
                  <Download className="w-3 h-3" /> Install
                </button>
                <button
                  type="button"
                  onClick={handleDecline}
                  data-testid="capability-request-decline"
                  className="px-2.5 py-1 text-xs rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 font-display transition-colors"
                >
                  Dismiss
                </button>
                {!isMarketplace && (
                  <span className="ml-auto flex items-center gap-1 text-[11px] text-emerald-400">
                    <ShieldCheck className="w-3 h-3" /> Bundled
                  </span>
                )}
              </>
            )}
            {phase === 'installing' && (
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" /> Installing…
              </span>
            )}
            {phase === 'installed' && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-display">
                <CheckCircle2 className="w-3.5 h-3.5" /> Installed — available immediately
              </span>
            )}
            {phase === 'declined' && (
              <span className="text-xs text-muted-foreground italic">Dismissed</span>
            )}
            {phase === 'failed' && (
              <span className="flex items-center gap-1.5 text-xs text-destructive">
                <XCircle className="w-3.5 h-3.5" /> {errorMessage ?? 'Install failed'}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
