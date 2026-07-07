import { useState } from 'react';
import { Loader2, Download, Plug, Zap, CheckCircle2, XCircle, Package, ShieldCheck } from 'lucide-react';
import { adapter } from '@/lib/adapter';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { useInstallStore } from '@/providers/InstallProvider';
import { describeError, type InstallOutcome, type InstallTarget } from '@/lib/install-store';

export interface CapabilityRequest {
  name: string;
  source: string;
  kind?: 'skill' | 'marketplace' | 'connector' | 'mcp';
  reason?: string;
  /** Connector registry id (kind 'connector'); defaults to `name`. */
  connectorId?: string;
  /** Connector auth method — token-paste vs OAuth-redirect (kind 'connector'). */
  authType?: string;
}

interface CapabilityRequestCardProps {
  request: CapabilityRequest;
}

type Phase = 'pending' | 'installing' | 'installed' | 'declined' | 'failed';

/**
 * Inline install affordance for agent capability requests (PR4 Variation B,
 * screen 09). Parsed out of agent text by TextBlock from a
 * `<!--waggle:capability_request {…}-->` marker (or the legacy phrasing) so the
 * user can act without leaving the conversation.
 *
 * Type-aware, routed through the SHARED install store so a chat install
 * reflects in the Marketplace grid + count bar immediately ("sync"):
 *   connector → vault-aware token-paste (OAuth → Hub, D3); FE-direct connect —
 *               the token NEVER transits the boolean approval channel.
 *   mcp       → store enable (PRO + SecurityGate ride along server-side).
 *   marketplace → resolve packageId by name, then store install.
 *   starter   → installPack (bundled; the store does not track on-disk skills).
 */
export default function CapabilityRequestCard({ request }: CapabilityRequestCardProps) {
  const [phase, setPhase] = useState<Phase>('pending');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [token, setToken] = useState('');
  const { toast } = useToast();
  const { install } = useInstallStore();

  const kind: NonNullable<CapabilityRequest['kind']> =
    request.kind ?? (request.source === 'marketplace' ? 'marketplace' : 'skill');
  const isConnector = kind === 'connector';
  const isMcp = kind === 'mcp';
  const isMarketplace = kind === 'marketplace' || request.source === 'marketplace';
  const isStarter = !isConnector && !isMcp && !isMarketplace;

  const verb = isConnector ? 'Connect' : isMcp ? 'Enable' : 'Install';

  /** Map a store outcome → the card's terminal phase (the store already
   *  toasted; tier dispatched the upgrade event via the adapter). */
  const applyOutcome = (outcome: InstallOutcome) => {
    if (outcome.ok) { setPhase('installed'); return; }
    setPhase('failed');
    setErrorMessage(
      outcome.reason === 'tier' ? 'Upgrade required'
        : outcome.reason === 'security' ? 'Blocked by the security scan'
          : outcome.reason === 'needs-credentials' ? 'A token is required'
            : 'Install failed',
    );
  };

  const handleInstall = async () => {
    // Connector: OAuth can't finish inline (D3) → hand off to the Hub; token
    // connectors reveal an inline paste row (the actual connect runs on submit).
    if (isConnector) {
      if (request.authType === 'oauth2') {
        window.dispatchEvent(new CustomEvent('waggle:open-app', { detail: { appId: 'connectors' } }));
        return;
      }
      setShowToken(true);
      return;
    }

    setPhase('installing');
    setErrorMessage(null);
    try {
      if (isMcp) {
        applyOutcome(await install({ id: `mcp:${request.name}`, type: 'mcp', kind: 'federated', name: request.name }));
        return;
      }
      if (isMarketplace) {
        // The agent knows the name, not the numeric package id — resolve it.
        const searchRes = await adapter.searchMarketplace(request.name, 1);
        const searchData = await searchRes.json().catch(() => ({ packages: [] }));
        const pkg = (searchData.packages ?? [])[0] as { id?: number; waggle_install_type?: string } | undefined;
        if (!pkg?.id) throw new Error(`Marketplace package "${request.name}" not found`);
        const target: InstallTarget = {
          id: `pkg:${pkg.id}`, type: pkg.waggle_install_type === 'mcp' ? 'mcp' : 'skill',
          kind: 'package', name: request.name, packageId: pkg.id,
        };
        applyOutcome(await install(target));
        return;
      }
      // Starter pack — bundled, no auth; not store-tracked (on-disk skill).
      await adapter.installPack(request.name);
      setPhase('installed');
      toast({ title: 'Installed', description: `${request.name} is now active.` });
    } catch (err) {
      const message = describeError(err);
      setPhase('failed');
      setErrorMessage(message);
      toast({ title: 'Install failed', description: message, variant: 'destructive' });
    }
  };

  const submitToken = async () => {
    setPhase('installing');
    setErrorMessage(null);
    const outcome = await install(
      { id: `connector:${request.connectorId ?? request.name}`, type: 'connector', kind: 'federated', name: request.name },
      { token: token.trim() },
    );
    setShowToken(false);
    setToken('');
    applyOutcome(outcome);
  };

  const handleDecline = () => setPhase('declined');

  const VerbIcon = isConnector ? Plug : isMcp ? Zap : Download;

  return (
    <div
      data-testid="capability-request-card"
      className="my-2 rounded-xl border border-primary/40 bg-primary/5 p-3"
    >
      <div className="flex items-start gap-3">
        <div className="p-1.5 rounded-lg bg-primary/15 shrink-0 mt-0.5">
          <Package className="w-4 h-4 text-honey" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-display font-semibold text-foreground">
              {verb} <span className="text-honey">{request.name}</span>?
            </span>
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground font-display">
              {kind}
            </span>
          </div>
          {request.reason && (
            <p className="text-xs text-muted-foreground mt-1">{request.reason}</p>
          )}

          {/* Vault-aware connector token-paste — FE-direct connect; the token
              never touches the boolean approval channel (D3). */}
          {showToken && (
            <div className="flex items-center gap-1.5 mt-2">
              <Input
                type="password"
                value={token}
                onChange={e => setToken(e.target.value)}
                placeholder="Paste API token — stored in your vault"
                data-testid="capability-connector-token-input"
                className="flex-1 h-7 text-[11px]"
                autoFocus
              />
              <button
                type="button"
                onClick={() => void submitToken()}
                disabled={token.trim() === '' || phase === 'installing'}
                data-testid="capability-connector-token-submit"
                className="px-2 py-1 text-[11px] rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 transition-colors disabled:opacity-50"
              >
                Connect
              </button>
              <button
                type="button"
                onClick={() => { setShowToken(false); setToken(''); }}
                className="px-2 py-1 text-[11px] rounded-lg text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          <div className="flex items-center gap-2 mt-2.5">
            {phase === 'pending' && !showToken && (
              <>
                <button
                  type="button"
                  onClick={() => void handleInstall()}
                  data-testid="capability-request-install"
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 font-display transition-colors"
                >
                  <VerbIcon className="w-3 h-3" /> {verb}
                </button>
                <button
                  type="button"
                  onClick={handleDecline}
                  data-testid="capability-request-decline"
                  className="px-2.5 py-1 text-xs rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 font-display transition-colors"
                >
                  Dismiss
                </button>
                {isStarter && (
                  <span className="ml-auto flex items-center gap-1 text-[11px] text-emerald-400">
                    <ShieldCheck className="w-3 h-3" /> Bundled
                  </span>
                )}
              </>
            )}
            {phase === 'installing' && (
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" /> Working…
              </span>
            )}
            {phase === 'installed' && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-display">
                <CheckCircle2 className="w-3.5 h-3.5" /> Done — available immediately
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
