import { useEffect, useRef, useState } from 'react';
import { Plus, ArrowUp, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { cmdKLabel } from '@/lib/platform';

interface TransientDraftState {
  value: string;
  revision: number;
  pending: boolean;
  listeners: Set<() => void>;
}

// Opt-in, process-memory-only continuity for a draft whose async save may
// outlive its route. Nothing here is written to browser or disk storage.
const transientDrafts = new Map<string, TransientDraftState>();

const getTransientDraft = (key: string): TransientDraftState => {
  const existing = transientDrafts.get(key);
  if (existing) return existing;
  const created: TransientDraftState = {
    value: '', revision: 0, pending: false, listeners: new Set(),
  };
  transientDrafts.set(key, created);
  return created;
};

const notifyTransientDraft = (draft: TransientDraftState) => {
  draft.listeners.forEach(listener => listener());
};

interface AskBarProps {
  placeholder?: string;
  onSubmit: (text: string) => void | boolean | Promise<void | boolean>;
  /** Optional "+" affordance — receives the current trimmed input (quick note);
   *  callers open the command palette when the input is empty (no dead button). */
  onPlus?: (text: string) => void | boolean | Promise<void | boolean>;
  /** Optional keystroke tap — lets a host use the bar as a live filter too
   *  (Marketplace single smart input). Fires with '' when the bar clears. */
  onChange?: (text: string) => void;
  /** Process-memory-only draft continuity across route unmount/remount. */
  transientDraftKey?: string;
  cmdkHint?: boolean;
  /** Submit affordance intent. 'send' (default) is the Home composer up-arrow;
   *  'search' swaps to a magnifier + "Search" label so a search bar doesn't read
   *  as a scroll-to-top control (R10 Lane C). */
  submitVariant?: 'send' | 'search';
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
  onChange,
  transientDraftKey,
  cmdkHint = true,
  submitVariant = 'send',
  className,
}: AskBarProps) {
  const initialDraft = transientDraftKey ? getTransientDraft(transientDraftKey) : null;
  const [value, setValue] = useState(initialDraft?.value ?? '');
  const [submitting, setSubmitting] = useState(initialDraft?.pending ?? false);
  const valueRef = useRef(initialDraft?.value ?? '');
  const inputRevisionRef = useRef(initialDraft?.revision ?? 0);
  const submittingRef = useRef(initialDraft?.pending ?? false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  useEffect(() => {
    if (!transientDraftKey) return;
    const draft = getTransientDraft(transientDraftKey);
    const sync = () => {
      valueRef.current = draft.value;
      inputRevisionRef.current = draft.revision;
      submittingRef.current = draft.pending;
      if (!mountedRef.current) return;
      setValue(draft.value);
      setSubmitting(draft.pending);
    };
    draft.listeners.add(sync);
    sync();
    return () => {
      draft.listeners.delete(sync);
      if (!draft.pending && !draft.value && draft.listeners.size === 0) {
        transientDrafts.delete(transientDraftKey);
      }
    };
  }, [transientDraftKey]);
  const setAndTap = (next: string) => {
    valueRef.current = next;
    inputRevisionRef.current += 1;
    if (transientDraftKey) {
      const draft = getTransientDraft(transientDraftKey);
      draft.value = next;
      draft.revision = inputRevisionRef.current;
      notifyTransientDraft(draft);
    } else {
      setValue(next);
    }
    onChange?.(next);
  };
  const runAction = async (
    action: (text: string) => void | boolean | Promise<void | boolean>,
    text: string,
  ) => {
    if (!text || submittingRef.current) return;
    const submittedRevision = inputRevisionRef.current;
    submittingRef.current = true;
    if (transientDraftKey) {
      const draft = getTransientDraft(transientDraftKey);
      draft.pending = true;
      notifyTransientDraft(draft);
    } else {
      setSubmitting(true);
    }
    try {
      const result = action(text);
      const accepted = result && typeof (result as PromiseLike<void | boolean>).then === 'function'
        ? await result
        : result;
      const currentRevision = transientDraftKey
        ? getTransientDraft(transientDraftKey).revision
        : inputRevisionRef.current;
      if (accepted !== false && currentRevision === submittedRevision) {
        if (transientDraftKey) {
          const draft = getTransientDraft(transientDraftKey);
          draft.value = '';
          draft.revision += 1;
          notifyTransientDraft(draft);
          if (mountedRef.current) onChange?.('');
        } else if (mountedRef.current) {
          setAndTap('');
        }
      }
    } catch {
      // The caller owns user-facing error detail; preserve the draft for retry.
    } finally {
      submittingRef.current = false;
      if (transientDraftKey) {
        const draft = getTransientDraft(transientDraftKey);
        draft.pending = false;
        notifyTransientDraft(draft);
        if (!draft.value && draft.listeners.size === 0) transientDrafts.delete(transientDraftKey);
      } else if (mountedRef.current) {
        setSubmitting(false);
      }
    }
  };
  const submit = () => runAction(onSubmit, valueRef.current.trim());
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
          disabled={submitting}
          onClick={() => {
            const text = valueRef.current.trim();
            if (!text) {
              onPlus('');
              return;
            }
            void runAction(onPlus, text);
          }}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--honey-text)] hover:bg-[var(--honey-wash)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <Plus className="h-5 w-5" />
        </button>
      )}
      <input
        name="ask-waggle"
        autoComplete="off"
        value={value}
        aria-busy={submitting}
        onChange={(e) => setAndTap(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder={placeholder}
        aria-label="Ask Waggle"
        className="min-w-0 flex-1 rounded-md bg-transparent px-2 text-[15px] text-[var(--text)] placeholder:text-[var(--text-dim)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]"
      />
      {cmdkHint && <kbd className="kbd hidden sm:inline-block">{cmdKLabel}</kbd>}
      {submitVariant === 'search' ? (
        <button
          type="button"
          aria-label="Search"
          onClick={() => { void submit(); }}
          disabled={submitting || !value.trim()}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-[var(--honey)] px-3.5 text-[13px] font-medium text-[#1a1407] transition-opacity disabled:opacity-40"
        >
          <Search className="h-4 w-4" />
          <span className="hidden sm:inline">Search</span>
        </button>
      ) : (
        <button
          type="button"
          aria-label="Send"
          onClick={() => { void submit(); }}
          disabled={submitting || !value.trim()}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--honey)] text-[#1a1407] transition-opacity disabled:opacity-40"
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
