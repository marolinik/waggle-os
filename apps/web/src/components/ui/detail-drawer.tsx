import { useState, type ReactNode } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from './sheet';

/**
 * Right-side detail drawer (UX-Refactor Phase 2 DS) — a thin, opinionated wrap
 * of ui/sheet for object detail (Memory, Artifact, …). Standardises the
 * header/scrollable-body/footer layout so each object screen's drawer looks the
 * same. Reused by the Memory Center (S04) and Artifact Center (S05).
 */
interface DetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Right-aligned header adornments (badges, kind label). */
  headerExtra?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function DetailDrawer({ open, onOpenChange, title, subtitle, headerExtra, footer, children, className }: DetailDrawerProps) {
  // Every open gets a fresh Sheet. Reopening one that is still animating out
  // (a list row clicked during the exit) otherwise reuses a half-unmounted
  // Radix dialog: its overlay remounts AFTER the content and paints over it at
  // the same z-index, and focus is never moved back inside.
  const [openCount, setOpenCount] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setOpenCount((count) => count + 1);
  }

  return (
    <Sheet key={openCount} open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={`flex flex-col w-full sm:max-w-md gap-0 ${className ?? ''}`}>
        <SheetHeader className="pr-8">
          <div className="flex items-start justify-between gap-2">
            <SheetTitle className="text-base leading-snug">{title}</SheetTitle>
            {headerExtra && <div className="flex items-center gap-1 shrink-0">{headerExtra}</div>}
          </div>
          {subtitle && <SheetDescription>{subtitle}</SheetDescription>}
        </SheetHeader>
        <div className="flex-1 overflow-y-auto py-4 space-y-4">{children}</div>
        {footer && <SheetFooter className="border-t border-border pt-3">{footer}</SheetFooter>}
      </SheetContent>
    </Sheet>
  );
}
