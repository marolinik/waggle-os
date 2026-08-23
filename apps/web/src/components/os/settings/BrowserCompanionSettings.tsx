import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, KeyRound, Loader2, Unplug } from 'lucide-react';
import { adapter, type BrowserCompanionPairingStatus } from '@/lib/adapter';

const BrowserCompanionSettings = () => {
  const [status, setStatus] = useState<BrowserCompanionPairingStatus | null>(null);
  const [pairingCode, setPairingCode] = useState<{ code: string; expiresAt: number } | null>(null);
  const [busy, setBusy] = useState<'generate' | 'check' | 'revoke' | null>(null);
  const [error, setError] = useState('');
  const refreshId = useRef(0);

  const refresh = useCallback(async (showBusy = false) => {
    const requestId = ++refreshId.current;
    if (showBusy) setBusy('check');
    try {
      const nextStatus = await adapter.getBrowserCompanionPairing();
      if (requestId !== refreshId.current) return;
      setStatus(nextStatus);
      if (nextStatus.paired) setPairingCode(null);
      setError('');
    } catch {
      if (requestId !== refreshId.current) return;
      setError('Could not read Browser Companion pairing status.');
    } finally {
      if (showBusy && requestId === refreshId.current) setBusy(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => { refreshId.current += 1; };
  }, [refresh]);

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
    setBusy('generate');
    setPairingCode(null);
    try {
      setPairingCode(await adapter.createBrowserCompanionPairingCode());
      setError('');
    } catch {
      setError('Could not create a pairing code.');
    } finally {
      setBusy(null);
    }
  };

  const revoke = async () => {
    refreshId.current += 1;
    setBusy('revoke');
    try {
      await adapter.revokeBrowserCompanionPairing();
      setPairingCode(null);
      setStatus({ paired: false, extensionId: null, pairedAt: null });
      setError('');
    } catch {
      setError('Could not revoke Browser Companion pairing.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section
      className="p-3 rounded-xl bg-secondary/30 border border-border/30 space-y-2.5"
      data-testid="browser-companion-settings"
      aria-labelledby="browser-companion-title"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 id="browser-companion-title" className="text-xs font-display font-medium text-foreground flex items-center gap-1.5">
            <KeyRound aria-hidden="true" className="w-3.5 h-3.5 text-honey" /> Browser Companion
          </h4>
          <p className="text-[11px] text-muted-foreground mt-1">
            Pair the extension with a short-lived, single-use code. Captures can write only to personal imported memory.
          </p>
        </div>
        <span
          className="text-[10px] text-muted-foreground shrink-0"
          data-testid="browser-companion-status"
          role="status"
          aria-live="polite"
        >
          {status?.paired ? 'Paired' : status ? 'Not paired' : error ? 'Unavailable' : 'Checking…'}
        </span>
      </div>

      {status?.paired && (
        <p className="text-[11px] text-status-healthy flex items-center gap-1">
          <CheckCircle2 aria-hidden="true" className="w-3 h-3" /> Connected extension: {status.extensionId ?? 'Browser Companion'}
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
            onClick={() => void refresh(true)}
            disabled={busy !== null}
            className="mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-md bg-secondary px-2.5 py-1 text-[11px] text-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            {busy === 'check' && <Loader2 aria-hidden="true" className="w-3 h-3 animate-spin motion-reduce:animate-none" />}
            {busy === 'check' ? 'Checking…' : 'Check pairing'}
          </button>
        </div>
      )}

      {error && <p className="text-[11px] text-destructive" role="alert">{error}</p>}

      <div className="flex gap-2">
        {status && !status.paired && (
          <button
            type="button"
            onClick={() => void createCode()}
            disabled={busy !== null}
            className="flex min-h-8 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            {busy === 'generate'
              ? <Loader2 aria-hidden="true" className="w-3 h-3 animate-spin motion-reduce:animate-none" />
              : <KeyRound aria-hidden="true" className="w-3 h-3" />}
            {busy === 'generate' ? 'Generating…' : 'Generate one-time code'}
          </button>
        )}
        {status?.paired && (
          <button
            type="button"
            onClick={() => void revoke()}
            disabled={busy !== null}
            className="flex min-h-8 items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-xs text-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            {busy === 'revoke'
              ? <Loader2 aria-hidden="true" className="w-3 h-3 animate-spin motion-reduce:animate-none" />
              : <Unplug aria-hidden="true" className="w-3 h-3" />}
            {busy === 'revoke' ? 'Revoking…' : 'Revoke'}
          </button>
        )}
      </div>
    </section>
  );
};

export default BrowserCompanionSettings;
