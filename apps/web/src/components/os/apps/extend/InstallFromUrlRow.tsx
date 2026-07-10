/**
 * Install-from-URL affordance (steal #11 — multi-source skill install).
 *
 * Collapsed to a single text button under the marketplace search; expanding
 * reveals a source input (SKILL.md URL / GitHub URL / owner-repo shorthand /
 * .zip URL) plus an optional SHA-256 field. Submitting never installs
 * directly — the server resolves + scans the skill and holds it as a
 * create_skill approval, so the row's success state points at Approvals.
 */
import { useState } from 'react';
import { Link2, Loader2 } from 'lucide-react';
import { adapter } from '@/lib/adapter';

interface InstallFromUrlRowProps {
  /** Surfaces the held-for-approval note in the parent's shelf-note slot. */
  onHeld: (note: string) => void;
}

export default function InstallFromUrlRow({ onHeld }: InstallFromUrlRowProps) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState('');
  const [sha256, setSha256] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = source.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await adapter.installSkillFromUrl(trimmed, sha256.trim() || undefined);
      const body = await res.json().catch(() => ({})) as { error?: string; name?: string };
      if (!res.ok) {
        setError(body.error ?? `Install failed (${res.status})`);
        return;
      }
      onHeld(`Skill "${body.name ?? trimmed}" is held for your approval — review the exact content in Approvals before it installs.`);
      setSource('');
      setSha256('');
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Install failed');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        data-testid="install-from-url-toggle"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-honey transition-colors"
      >
        <Link2 className="w-3 h-3" aria-hidden />
        Install skill from URL
      </button>
    );
  }

  return (
    <div data-testid="install-from-url-row" className="space-y-1.5 rounded-lg border border-border/30 bg-muted/20 p-2.5">
      <div className="flex items-center gap-2">
        <input
          data-testid="install-from-url-source"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
          placeholder="SKILL.md URL, GitHub URL, owner/repo, or .zip URL"
          className="flex-1 bg-background/60 border border-border/40 rounded-md px-2 py-1 text-xs focus:outline-none focus:border-honey/50"
          disabled={busy}
        />
        <button
          data-testid="install-from-url-submit"
          onClick={() => void submit()}
          disabled={busy || !source.trim()}
          className="text-xs px-2.5 py-1 rounded-md bg-honey/15 text-honey border border-honey/30 hover:bg-honey/25 disabled:opacity-50 transition-colors"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-label="Resolving skill" /> : 'Review & install'}
        </button>
        <button
          onClick={() => { setOpen(false); setError(null); }}
          className="text-[11px] text-muted-foreground hover:text-foreground"
          disabled={busy}
        >
          Cancel
        </button>
      </div>
      <input
        data-testid="install-from-url-sha"
        value={sha256}
        onChange={(e) => setSha256(e.target.value)}
        placeholder="SHA-256 (optional — enforced when provided; recommended for .zip)"
        className="w-full bg-background/60 border border-border/40 rounded-md px-2 py-1 text-[11px] text-muted-foreground focus:outline-none focus:border-honey/50"
        disabled={busy}
      />
      <p className="text-[10px] text-muted-foreground/70">
        Nothing installs directly — the skill is fetched, security-scanned, and held in Approvals for your review.
      </p>
      {error && (
        <p role="alert" data-testid="install-from-url-error" className="text-[11px] text-destructive">{error}</p>
      )}
    </div>
  );
}
