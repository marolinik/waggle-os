import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DotLive } from './DotLive';

interface ModelPillProps {
  /** Routing mode, e.g. "auto". Omit to show the model alone. */
  mode?: string;
  model: string;
  onClick?: () => void;
  title?: string;
  className?: string;
}

/**
 * "auto · Claude Sonnet" model pill with a healthy live dot — sits in the Chat
 * context header. Becomes a button (with chevron) when `onClick` is supplied.
 */
export function ModelPill({ mode = 'auto', model, onClick, title, className }: ModelPillProps) {
  const content = (
    <>
      <DotLive tone="healthy" size={7} />
      <span className="font-mono text-[12px] text-[var(--text-2)]">
        {mode ? <span className="text-[var(--text-dim)]">{mode} · </span> : null}
        {model}
      </span>
      {onClick && <ChevronDown className="h-3.5 w-3.5 text-[var(--text-dim)]" />}
    </>
  );
  const base =
    'inline-flex items-center gap-1.5 rounded-full border border-[var(--line-soft)] bg-[var(--surface)] px-2.5 py-1';
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        className={cn(base, 'transition-colors hover:border-[var(--honey-line)]', className)}
      >
        {content}
      </button>
    );
  }
  return (
    <span title={title} className={cn(base, className)}>
      {content}
    </span>
  );
}
