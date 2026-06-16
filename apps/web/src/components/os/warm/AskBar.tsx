import { useState } from 'react';
import { Plus, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AskBarProps {
  placeholder?: string;
  onSubmit: (text: string) => void;
  /** Optional "+" affordance (quick-capture / attach). */
  onPlus?: () => void;
  cmdkHint?: boolean;
  className?: string;
}

/**
 * Full-width ask pill with a honey "+" affordance, a ⌘K hint, and a honey send
 * button — the Home composer. Enter submits (Shift+Enter is a newline-safe
 * no-op here since it's a single-line input).
 */
export function AskBar({
  placeholder = 'Start something new — “draft the board update from this week’s work”…',
  onSubmit,
  onPlus,
  cmdkHint = true,
  className,
}: AskBarProps) {
  const [value, setValue] = useState('');
  const submit = () => {
    const text = value.trim();
    if (!text) return;
    onSubmit(text);
    setValue('');
  };
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] px-2 py-2 transition-colors focus-within:border-[var(--honey-line)] focus-within:shadow-[var(--shadow-honey)]',
        className,
      )}
    >
      {onPlus && (
        <button
          type="button"
          aria-label="Quick capture"
          onClick={onPlus}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--honey)] hover:bg-[var(--honey-wash)]"
        >
          <Plus className="h-5 w-5" />
        </button>
      )}
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        aria-label="Ask Waggle"
        className="min-w-0 flex-1 bg-transparent px-2 text-[15px] text-[var(--text)] placeholder:text-[var(--text-dim)] focus:outline-none"
      />
      {cmdkHint && <kbd className="kbd hidden sm:inline-block">⌘K</kbd>}
      <button
        type="button"
        aria-label="Send"
        onClick={submit}
        disabled={!value.trim()}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--honey)] text-[#1a1407] transition-opacity disabled:opacity-40"
      >
        <ArrowUp className="h-5 w-5" />
      </button>
    </div>
  );
}
