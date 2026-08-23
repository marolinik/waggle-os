import { useRef, useState } from 'react';
import { Loader2, Download, CheckCircle2, XCircle, Package, ShieldCheck } from 'lucide-react';
import { adapter, AdapterHttpError } from '@/lib/adapter';
import { useToast } from '@/hooks/use-toast';
import { useInstallStore } from '@/providers/InstallProvider';
import { describeError } from '@/lib/install-store';

export interface CapabilityRequest {
  name: string;
  source: string;
  kind?: 'skill' | 'marketplace' | 'connector' | 'mcp';
  reason?: string;
  proposalId?: string;
  expiresAt?: string;
  packageId?: number;
  sourceId?: number;
  publisher?: string;
  version?: string;
  installType?: 'skill' | 'plugin' | 'mcp';
  manifestDigest?: string;
  riskStatus?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'CLEAN';
  riskScore?: number;
  riskContentHash?: string;
  riskBlocked?: boolean;
  riskDigest?: string;
  /** Reserved parser metadata; not authorized by the current card contract. */
  connectorId?: string;
  /** Reserved parser metadata; not authorized by the current card contract. */
  authType?: string;
}

interface CapabilityRequestCardProps {
  request: CapabilityRequest;
  workspaceId?: string | null;
  sessionId?: string | null;
}

type Phase = 'pending' | 'installing' | 'installed' | 'declined' | 'failed';

/**
 * Inline install affordance for agent capability requests (PR4 Variation B,
 * screen 09). Rendered only from a completed acquire_capability tool result so
 * the user can act without leaving the conversation.
 *
 * The current trusted producer contract supports bundled starter-pack skills
 * and exact-name marketplace packages. Connector and MCP proposals use their
 * dedicated flows and are rejected here until they carry canonical IDs.
 */
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function CapabilityRequestCard({
  request,
  workspaceId,
  sessionId,
}: CapabilityRequestCardProps) {
  const [phase, setPhase] = useState<Phase>('pending');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const installStarted = useRef(false);
  const { toast } = useToast();
  const { confirmPackageProposal } = useInstallStore();

  const kind = request.kind;
  const marketplaceIdentity = Number.isSafeInteger(request.packageId)
    && (request.packageId ?? 0) > 0
    && Number.isSafeInteger(request.sourceId)
    && (request.sourceId ?? 0) > 0
    && typeof request.proposalId === 'string'
    && UUID_V4_RE.test(request.proposalId)
    && typeof request.expiresAt === 'string'
    && Number.isFinite(Date.parse(request.expiresAt))
    && Date.parse(request.expiresAt) > Date.now()
    && typeof request.publisher === 'string'
    && request.publisher.trim().length > 0
    && typeof request.version === 'string'
    && request.version.trim().length > 0
    && typeof request.manifestDigest === 'string'
    && /^sha256:[0-9a-f]{64}$/i.test(request.manifestDigest)
    && typeof request.riskStatus === 'string'
    && ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'CLEAN'].includes(request.riskStatus)
    && typeof request.riskScore === 'number'
    && Number.isFinite(request.riskScore)
    && typeof request.riskContentHash === 'string'
    && /^(?:|[0-9a-f]{64})$/i.test(request.riskContentHash)
    && typeof request.riskBlocked === 'boolean'
    && typeof request.riskDigest === 'string'
    && /^sha256:[0-9a-f]{64}$/i.test(request.riskDigest)
    && typeof workspaceId === 'string'
    && workspaceId.length > 0
    && typeof sessionId === 'string'
    && sessionId.length > 0
    && (request.installType === 'skill'
      || request.installType === 'plugin'
      || request.installType === 'mcp');
  const supportedRoute = (request.source === 'starter-pack' && kind === 'skill')
    || (request.source === 'marketplace' && kind === 'marketplace' && marketplaceIdentity);
  const isMarketplace = request.source === 'marketplace' && kind === 'marketplace';
  const isStarter = request.source === 'starter-pack' && kind === 'skill';

  if (!supportedRoute) return null;

  const handleInstall = async () => {
    if (installStarted.current) return;
    installStarted.current = true;
    setPhase('installing');
    setErrorMessage(null);
    try {
      if (isMarketplace) {
        await confirmPackageProposal(
          request.packageId!,
          request.proposalId!,
          workspaceId!,
          sessionId!,
        );
        setPhase('installed');
        toast({ title: 'Installed', description: `${request.name} is now active.` });
        return;
      }
      // Starter pack — bundled, no auth; not store-tracked (on-disk skill).
      await adapter.installPack(request.name);
      setPhase('installed');
      toast({ title: 'Installed', description: `${request.name} is now active.` });
    } catch (err) {
      const proposalMessage = err instanceof AdapterHttpError
        ? ({
          CAPABILITY_PROPOSAL_NOT_AVAILABLE: 'This install request is no longer available.',
          CAPABILITY_PROPOSAL_EXPIRED: 'This install request expired. Ask Waggle to find it again.',
          CAPABILITY_PROPOSAL_ALREADY_USED: 'This install request was already used.',
        } as const)[err.code as 'CAPABILITY_PROPOSAL_NOT_AVAILABLE'
          | 'CAPABILITY_PROPOSAL_EXPIRED'
          | 'CAPABILITY_PROPOSAL_ALREADY_USED']
        : undefined;
      const message = proposalMessage ?? describeError(err);
      setPhase('failed');
      setErrorMessage(message);
      toast({ title: 'Install failed', description: message, variant: 'destructive' });
    }
  };

  const handleDecline = () => setPhase('declined');

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
              Install <span className="text-honey">{request.name}</span>?
            </span>
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground font-display">
              {kind}
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
                  onClick={() => void handleInstall()}
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
