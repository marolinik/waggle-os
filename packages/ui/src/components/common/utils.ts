/**
 * Utility functions for common components.
 */

/**
 * Format a token count for compact display.
 * <1000: raw number, <1M: Xk, >=1M: XM
 */
export function formatTokenCount(tokens: number): string {
  if (tokens < 1000) return String(tokens);
  if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}k`;
  return `${(tokens / 1000000).toFixed(1)}M`;
}

/**
 * Format a dollar cost for compact, human-friendly display.
 * C4: Changed from raw $22.944 to friendlier format.
 * <$0.01: shows in cents, <$1: $0.XX, <$100: $X.XX, >=100: ~$XXX
 */
export function formatCost(dollars: number): string {
  if (dollars < 0.01) return `${(dollars * 100).toFixed(1)}\u00A2`;
  if (dollars < 1) return `$${dollars.toFixed(2)}`;
  if (dollars < 100) return `$${dollars.toFixed(2)}`;
  return `~$${Math.round(dollars)}`;
}
