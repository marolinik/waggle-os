import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, Loader2, Unplug } from 'lucide-react';
import { adapter, type BrowserCompanionPairingStatus } from '@/lib/adapter';

const BrowserCompanionSettings = () => {
  const [status, setStatus] = useState<BrowserCompanionPairingStatus | null>(null);
  const [pairingCode, setPairingCode] = useState<{ code: string; expiresAt: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const nextStatus = await adapter.getBrowserCompanionPairing();
      setStatus(nextStatus);
      if (nextStatus.paired) setPairingCode(null);
      setError('');
    } catch {
      setError('Could not read Browser Companion pairing status.');
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!pairingCode) return;
    const remainingMs = pairingCode.expiresAt - Date.now();
    if (remainingMs <= 0) {
      setPairingCode(null);
      return;
    }
    const expiryTimer = window.setTimeout(() => setPairingCode(null), remainingMs);
    return () => window.clearTimeout(expiryTimer);
  }, [pairingCode]);

  const createCode = async () => {
    setBusy(true);
    setPairingCode(null);
    try {
      setPairingCode(await adapter.createBrowserCompanionPairingCode());
      setError('');
    } catch {
      setError('Could not create a pairing code.');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    setBusy(true);
    try {
      await adapter.revokeBrowserCompanionPairing();
      setPairingCode(null);
      setStatus({ paired: false, extensionId: null, pairedAt: null });
      await refresh();
    } catch {
      setError('Could not revoke Browser Companion pairing.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-3 rounded-xl bg-secondary/30 border border-border/30 space-y-2.5" data-testid="browser-companion-settings">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-display font-medium text-foreground flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5 text-honey" /> Browser Companion
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            Pair the extension with a short-lived, single-use code. Captures can write only to personal imported memory.
          </p>
        </div>
        <span className="text-[10px] text-muted-foreground shrink-0" data-testid="browser-companion-status">
          {status?.paired ? 'Paired' : 'Not paired'}
        </span>
      </div>

      {status?.paired && (
        <p className="text-[11px] text-status-healthy flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" /> Connected extension: {status.extensionId ?? 'Browser Companion'}
        </p>
      )}

      {pairingCode && (
        <div className="rounded-lg border border-honey/40 bg-honey/10 p-2" role="status">
          <p className="text-[10px] text-muted-foreground">Enter this code in the Browser Companion popup:</p>
          <p className="mt-1 font-mono text-lg tracking-[0.2em] text-honey" data-testid="browser-companion-code">
            {pairingCode.code}
          </p>
          <p className="text-[10px] text-muted-foreground">Expires {new Date(pairingCode.expiresAt).toLocaleTimeString()}.</p>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={busy}
            className="mt-2 px-2.5 py-1 text-[11px] rounded-md bg-secondary text-foreground disabled:opacity-50"
          >
            Check pairing
          </button>
        </div>
      )}

      {error && <p className="text-[11px] text-destructive" role="alert">{error}</p>}

      <div className="flex gap-2">
        {status && !status.paired && (
          <button
            type="button"
            onClick={() => void createCode()}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <KeyRound className="w-3 h-3" />}
            Generate one-time code
          </button>
        )}
        {status?.paired && (
          <button
            type="button"
            onClick={() => void revoke()}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-secondary text-foreground disabled:opacity-50"
          >
            <Unplug className="w-3 h-3" /> Revoke
          </button>
        )}
      </div>
    </div>
  );
};

export default BrowserCompanionSettings;
