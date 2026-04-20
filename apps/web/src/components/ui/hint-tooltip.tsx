/**
 * HintTooltip — minimal-diff replacement for `title=""` attributes.
 *
 * P17: native HTML `title=""` is styled inconsistently across browsers,
 * lacks a11y affordances (no keyboard focus reveal), and doesn't render
 * line breaks. This wrapper keeps the call site nearly as short as
 * `title=""` while delegating to the Radix Tooltip primitives we already
 * mount app-wide in App.tsx's <TooltipProvider>.
 *
 * Usage:
 *   <HintTooltip content="Good response">
 *     <button onClick={...}><ThumbsUp /></button>
 *   </HintTooltip>
 *
 * Passing an empty / falsy content returns the child directly — useful
 * for conditional hints (`content={active ? 'Unpin' : 'Pin'}` degrades
 * to bare child if both are empty, never crashes).
 */
import * as React from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export interface HintTooltipProps {
  /** Tooltip text or node. Falsy values render children without a tooltip. */
  content: React.ReactNode;
  /** Single interactive child (button/a/etc). Radix requires ref-forwarding. */
  children: React.ReactElement;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  /** Milliseconds before the tooltip appears on hover. Default 200. */
  delay?: number;
  /** Extra classes for the content pill. */
  className?: string;
}

export function HintTooltip({
  content,
  children,
  side = 'top',
  align = 'center',
  delay = 200,
  className,
}: HintTooltipProps) {
  if (!content) return children;
  return (
    <Tooltip delayDuration={delay}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} align={align} className={className}>
        {content}
      </TooltipContent>
    </Tooltip>
  );
}
