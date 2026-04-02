/**
 * LockedFeature — tier-gated UI wrapper.
 *
 * Renders children if the user's tier meets the requirement.
 * Renders an upgrade overlay if not.
 * Reads tier from TierContext (server-backed, never localStorage).
 */

import { useState, type ReactNode } from 'react';
import { type Tier, tierSatisfies } from '@waggle/shared';
import { useTier } from '@/hooks/useTier';
import { Button } from '@/components/ui/button';

interface LockedFeatureProps {
  /** Minimum tier required to access this feature */
  requiredTier: Tier;
  /** Human-readable name shown in the upgrade overlay */
  featureName?: string;
  /** The gated content */
  children: ReactNode;
}

export function LockedFeature({ requiredTier, featureName, children }: LockedFeatureProps) {
  const { tier, refresh } = useTier();
  const hasAccess = tierSatisfies(tier, requiredTier);

  if (hasAccess) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      {/* Blurred content preview */}
      <div className="pointer-events-none select-none blur-sm opacity-40" aria-hidden>
        {children}
      </div>

      {/* Upgrade overlay */}
      <div className="absolute inset-0 flex items-center justify-center">
        <UpgradeCard
          requiredTier={requiredTier}
          featureName={featureName}
          onUpgraded={refresh}
        />
      </div>
    </div>
  );
}

function UpgradeCard({
  requiredTier,
  featureName,
  onUpgraded,
}: {
  requiredTier: Tier;
  featureName?: string;
  onUpgraded: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpgrade = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: requiredTier }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { message?: string }).message ?? 'Checkout failed');
        return;
      }

      const { url } = await res.json();
      if (url) {
        // Open in system browser (Tauri) or new tab (web)
        try {
          const { open } = await import('@tauri-apps/plugin-shell');
          await open(url);
        } catch {
          window.open(url, '_blank');
        }
        // Wait a moment then refresh tier in case user completes quickly
        setTimeout(() => { onUpgraded(); }, 5000);
      }
    } catch {
      setError('Could not connect to server');
    } finally {
      setLoading(false);
    }
  };

  const tierDisplayNames: Record<Tier, string> = {
    SOLO: 'Solo',
    BASIC: 'Basic',
    TEAMS: 'Teams',
    ENTERPRISE: 'Enterprise',
  };

  return (
    <div
      className="rounded-xl border p-6 text-center max-w-xs shadow-lg"
      style={{ backgroundColor: 'var(--hive-900)', borderColor: 'var(--hive-700)' }}
    >
      <div className="text-2xl mb-2">🔒</div>
      {featureName && (
        <h3 className="text-sm font-semibold text-foreground mb-1">{featureName}</h3>
      )}
      <p className="text-xs text-muted-foreground mb-4">
        Available on <span className="font-medium text-foreground">{tierDisplayNames[requiredTier]}</span> and above
      </p>
      {error && (
        <p className="text-xs text-red-400 mb-2">{error}</p>
      )}
      <Button
        onClick={handleUpgrade}
        disabled={loading}
        size="sm"
        style={{ backgroundColor: 'var(--honey-500)', color: 'var(--hive-950)' }}
      >
        {loading ? 'Opening checkout...' : `Upgrade to ${tierDisplayNames[requiredTier]}`}
      </Button>
    </div>
  );
}
