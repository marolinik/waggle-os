/**
 * Phase 1 #7 — Pending Imports Reminder banner.
 *
 * Surfaces a dismissible banner above MemoryApp's tab bar reminding users who
 * skipped the wizard's Memory Import step that they can import six months of
 * AI history at any time. Re-shows on a 7-day cadence after dismissal until
 * the user actually heads to the Harvest tab (which retires the banner).
 *
 * Auto-detect upgrade: when `adapter.scanClaudeCode()` reports `found=true`,
 * the banner swaps to a stronger one-click variant ("Found N Claude Code
 * conversations on this machine — import them now?"). Detection signature
 * (item count) is tracked in localStorage so the user dismissing the
 * default copy still sees the upgraded copy when CC is later detected.
 */

import { useState, useEffect } from 'react';
import { Upload, Zap, X, ExternalLink } from 'lucide-react';
import { adapter } from '@/lib/adapter';
import {
  shouldShowImportReminder,
  readDismissedAt,
  writeDismissedAt,
  readRetired,
  writeRetired,
} from '@/lib/import-reminder-state';

interface ImportReminderBannerProps {
  /** Hook directly into the parent's `onboardingCompleted` flag. */
  onboardingCompleted: boolean;
  /** Total number of memory frames in this profile. Used as a proxy for
   *  "has the user imported anything yet?" — combined with the `retired`
   *  flag this gates eligibility. */
  totalFrameCount: number;
  /** Switch the parent's tab to Harvest. Wired by MemoryApp. */
  onOpenHarvest: () => void;
}

interface ClaudeCodeDetect {
  found: boolean;
  itemCount: number;
  path: string;
}

const ImportReminderBanner = ({
  onboardingCompleted,
  totalFrameCount,
  onOpenHarvest,
}: ImportReminderBannerProps) => {
  // Visibility check runs once on mount + recomputes when key inputs change.
  const [visible, setVisible] = useState(false);
  const [ccDetect, setCcDetect] = useState<ClaudeCodeDetect | null>(null);

  useEffect(() => {
    const eligible = shouldShowImportReminder({
      onboardingCompleted,
      // Proxy: any frame at all means the user has SOMETHING in memory. The
      // banner is most valuable for users who skipped import AND haven't
      // captured chat-side memory either. This keeps the banner from
      // shouting at active users who legitimately don't want to import.
      // Per the design doc's "Trigger eligibility" open question, v1 ships
      // the conservative gate.
      harvestEventCount: totalFrameCount,
      permanentlyRetired: readRetired(),
      lastDismissedIso: readDismissedAt(),
    });
    setVisible(eligible);
  }, [onboardingCompleted, totalFrameCount]);

  // Auto-detect Claude Code on mount; banner upgrades to the one-click
  // variant when found. Sidecar offline → silent fallback to default copy.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await adapter.scanClaudeCode();
        if (!cancelled && data?.found) setCcDetect(data);
      } catch {
        /* sidecar offline — keep default copy */
      }
    })();
    return () => { cancelled = true; };
  }, [visible]);

  if (!visible) return null;

  const handleDismiss = () => {
    writeDismissedAt(new Date().toISOString());
    setVisible(false);
  };

  const handleOpenHarvest = () => {
    // CTA fulfils intent; banner retires permanently. The Harvest tab is
    // now the sole surface — re-showing the banner would be noise.
    writeRetired();
    setVisible(false);
    onOpenHarvest();
  };

  if (ccDetect?.found) {
    return (
      <div
        data-testid="import-reminder-banner-cc"
        className="px-4 py-2.5 border-b border-primary/30 bg-primary/10 flex items-center gap-3"
      >
        <Zap className="w-4 h-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-display font-medium text-foreground truncate">
            Found {ccDetect.itemCount} Claude Code conversations on this machine.
          </p>
          <p className="text-[11px] text-muted-foreground truncate">
            One click to extract decisions and preferences into your memory.
          </p>
        </div>
        <button
          onClick={handleOpenHarvest}
          data-testid="import-reminder-cta"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-display font-semibold hover:bg-primary/90 transition-colors shrink-0"
        >
          Harvest now <ExternalLink className="w-3 h-3" />
        </button>
        <button
          onClick={handleDismiss}
          aria-label="Dismiss reminder"
          data-testid="import-reminder-dismiss"
          className="p-1 rounded hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div
      data-testid="import-reminder-banner"
      className="px-4 py-2.5 border-b border-border/40 bg-secondary/40 flex items-center gap-3"
    >
      <Upload className="w-4 h-4 text-primary shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-display font-medium text-foreground truncate">
          You can import 6 months of your AI history any time.
        </p>
        <p className="text-[11px] text-muted-foreground truncate">
          ChatGPT, Claude, Gemini, Perplexity, Cursor — plus 14 more sources.
        </p>
      </div>
      <button
        onClick={handleOpenHarvest}
        data-testid="import-reminder-cta"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/60 text-foreground text-xs font-display font-semibold hover:bg-muted transition-colors shrink-0"
      >
        Open Harvest <ExternalLink className="w-3 h-3" />
      </button>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss reminder"
        data-testid="import-reminder-dismiss"
        className="p-1 rounded hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

export default ImportReminderBanner;
