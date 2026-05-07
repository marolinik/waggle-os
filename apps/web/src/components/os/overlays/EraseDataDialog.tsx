/**
 * EraseDataDialog — confirmation modal for the GDPR Art. 17 erasure flow.
 *
 * Triggered from Settings → General → "Erase All My Data". Renders three
 * sequential states:
 *  1. Warning + phrase input ("type the exact phrase to confirm")
 *  2. In-flight (calling adapter.eraseData)
 *  3. Success (shows receipt + "quit and relaunch" instruction)
 *
 * The intentional friction (typing the full phrase, not just clicking) is
 * the user-facing half of the route's confirmation gate. The other half
 * (server-side phrase + header validation) lives in
 * packages/server/src/local/routes/data-erase.ts. Both must match — if a
 * future i18n attempt translates the phrase here, the server stays in
 * English and a user typing the translated version gets a 400. Don't
 * translate this gate.
 *
 * Side effect on success: nothing visible changes immediately — the wipe
 * runs at next startup. The dialog presents the receipt + "quit Waggle
 * and relaunch" copy so the user knows they aren't done yet.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X, Trash2, CheckCircle2, Loader2 } from 'lucide-react';
import { adapter } from '@/lib/adapter';

interface EraseDataDialogProps {
  open: boolean;
  onClose: () => void;
}

const REQUIRED_PHRASE = 'I UNDERSTAND THIS IS PERMANENT';

interface EraseReceipt {
  requestedAt: string;
  markerPath: string;
  dataDirSnapshot: { fileCount: number; totalBytes: number };
  instruction: string;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default function EraseDataDialog({ open, onClose }: EraseDataDialogProps) {
  const [phrase, setPhrase] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<EraseReceipt | null>(null);

  const phraseMatches = phrase === REQUIRED_PHRASE;

  const handleErase = async () => {
    if (!phraseMatches || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await adapter.eraseData(phrase);
      setReceipt(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erase failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    // Don't reset receipt — if the user closes after a successful erase
    // and reopens, they'll just trigger another (idempotent) request.
    // Resetting phrase + error keeps the next open clean.
    setPhrase('');
    setError(null);
    setReceipt(null);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[220] flex items-center justify-center"
          onClick={!submitting ? handleClose : undefined}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-lg glass-strong rounded-2xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
            data-testid="erase-data-dialog"
          >
            {!submitting && (
              <button
                onClick={handleClose}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            {/* ── Success state ─────────────────────────────────────── */}
            {receipt ? (
              <div className="p-6 space-y-4" data-testid="erase-data-success">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-primary/10">
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                  </div>
                  <h2 className="text-lg font-display font-bold text-foreground">
                    Erasure scheduled
                  </h2>
                </div>
                <div className="rounded-xl bg-secondary/30 border border-border/30 p-3 text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Requested at</span>
                    <span className="text-foreground font-mono text-[11px]">
                      {new Date(receipt.requestedAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Files marked for deletion</span>
                    <span className="text-foreground">{receipt.dataDirSnapshot.fileCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total size</span>
                    <span className="text-foreground">{formatBytes(receipt.dataDirSnapshot.totalBytes)}</span>
                  </div>
                </div>
                <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-3">
                  <p className="text-xs text-foreground leading-relaxed">
                    {receipt.instruction}
                  </p>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  An <span className="font-mono">audit-receipt-*.json</span> file will be written to your data dir after relaunch — keep it as proof of erasure for compliance.
                </p>
                <div className="flex justify-end">
                  <button
                    onClick={handleClose}
                    className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-display text-sm font-semibold hover:bg-primary/90 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              /* ── Confirmation state ──────────────────────────────── */
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-destructive/10">
                    <AlertTriangle className="w-5 h-5 text-destructive" />
                  </div>
                  <h2 className="text-lg font-display font-bold text-foreground">
                    Erase all my data
                  </h2>
                </div>

                <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
                  <p>
                    This schedules a complete wipe of your data dir on next launch:
                    every memory frame, workspace, session, vault entry, and config
                    file. The wipe is <span className="text-foreground font-medium">not reversible</span> from the app — you'll need a previously-saved <span className="font-mono">.waggle-backup</span> file to restore.
                  </p>
                  <p>
                    Data already sent to cloud providers (Anthropic, OpenAI, Stripe, etc.) and Teams servers is <span className="text-foreground font-medium">not</span> erased by this action — see the data-handling policy for how to handle those separately.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] text-muted-foreground">
                    To confirm, type exactly: <span className="font-mono text-foreground">{REQUIRED_PHRASE}</span>
                  </label>
                  <input
                    type="text"
                    value={phrase}
                    onChange={e => setPhrase(e.target.value)}
                    disabled={submitting}
                    placeholder={REQUIRED_PHRASE}
                    className="w-full px-3 py-2 rounded-lg bg-secondary/30 border border-border/40 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-destructive/60 disabled:opacity-50"
                    data-testid="erase-data-phrase-input"
                    autoFocus
                  />
                </div>

                {error && (
                  <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-2.5 text-[11px] text-destructive">
                    {error}
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-1">
                  <button
                    onClick={handleClose}
                    disabled={submitting}
                    className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleErase}
                    disabled={!phraseMatches || submitting}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-destructive text-destructive-foreground font-display text-sm font-semibold hover:bg-destructive/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    data-testid="erase-data-confirm-button"
                  >
                    {submitting ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Erasing…</>
                    ) : (
                      <><Trash2 className="w-3.5 h-3.5" /> Erase all data</>
                    )}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
