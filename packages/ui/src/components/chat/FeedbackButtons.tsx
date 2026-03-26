/**
 * FeedbackButtons — thumbs up/down feedback on each agent message.
 *
 * Appears below agent messages. On thumbs down, shows an inline reason
 * dropdown + optional detail text. After submit, shows a brief "Thanks!"
 * confirmation then hides.
 */

import { useState, useCallback } from 'react';

// ── Types ──────────────────────────────────────────────────────────────

export type FeedbackRating = 'up' | 'down';

export type FeedbackReason =
  | 'wrong_answer'
  | 'too_verbose'
  | 'wrong_tool'
  | 'too_slow'
  | 'other';

export interface FeedbackButtonsProps {
  sessionId: string;
  messageIndex: number;
  onFeedback: (rating: FeedbackRating, reason?: FeedbackReason, detail?: string) => void;
}

// ── Reason options ─────────────────────────────────────────────────────

const REASON_OPTIONS: Array<{ value: FeedbackReason; label: string }> = [
  { value: 'wrong_answer', label: 'Wrong answer' },
  { value: 'too_verbose', label: 'Too verbose' },
  { value: 'wrong_tool', label: 'Wrong tool used' },
  { value: 'too_slow', label: 'Too slow' },
  { value: 'other', label: 'Other' },
];

// ── Component ──────────────────────────────────────────────────────────

type FeedbackState = 'idle' | 'reason_form' | 'submitted';

export function FeedbackButtons({ sessionId: _sessionId, messageIndex: _messageIndex, onFeedback }: FeedbackButtonsProps) {
  const [state, setState] = useState<FeedbackState>('idle');
  const [reason, setReason] = useState<FeedbackReason>('wrong_answer');
  const [detail, setDetail] = useState('');

  const handleThumbsUp = useCallback(() => {
    onFeedback('up');
    setState('submitted');
  }, [onFeedback]);

  const handleThumbsDown = useCallback(() => {
    setState('reason_form');
  }, []);

  const handleSubmitReason = useCallback(() => {
    onFeedback('down', reason, detail || undefined);
    setState('submitted');
  }, [onFeedback, reason, detail]);

  const handleCancel = useCallback(() => {
    setState('idle');
    setReason('wrong_answer');
    setDetail('');
  }, []);

  // After submission, show a brief thanks message
  if (state === 'submitted') {
    return (
      <div className="feedback-buttons feedback-buttons--submitted inline-flex items-center gap-1 text-[11px] text-muted-foreground py-0.5">
        <span>Thanks for the feedback!</span>
      </div>
    );
  }

  // Reason form (shown after thumbs down)
  if (state === 'reason_form') {
    return (
      <div className="feedback-buttons feedback-buttons--form flex flex-col gap-1.5 py-1.5 max-w-[280px]">
        <div className="flex items-center gap-1.5">
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as FeedbackReason)}
            className="text-[11px] px-1.5 py-0.5 rounded border border-border bg-muted text-foreground outline-none flex-1"
          >
            {REASON_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <input
          type="text"
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder="Optional detail..."
          maxLength={200}
          className="text-[11px] px-1.5 py-[3px] rounded border border-border bg-muted text-foreground outline-none"
        />
        <div className="flex gap-1.5">
          <button
            onClick={handleSubmitReason}
            className="text-[11px] px-2.5 py-0.5 rounded border border-border bg-primary text-primary-foreground cursor-pointer"
          >
            Submit
          </button>
          <button
            onClick={handleCancel}
            className="text-[11px] px-2.5 py-0.5 rounded border border-border bg-transparent text-muted-foreground cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Default idle state: thumbs up / thumbs down buttons
  return (
    <div className="feedback-buttons feedback-buttons--idle inline-flex items-center gap-1 py-0.5">
      <button
        onClick={handleThumbsUp}
        title="Good response"
        className="feedback-btn feedback-btn--up bg-transparent border-none cursor-pointer text-[13px] px-1 py-px rounded text-muted-foreground opacity-60 transition-[opacity,color] duration-150 hover:opacity-100 hover:text-green-500"
      >
        {'\u25B2'}
      </button>
      <button
        onClick={handleThumbsDown}
        title="Needs improvement"
        className="feedback-btn feedback-btn--down bg-transparent border-none cursor-pointer text-[13px] px-1 py-px rounded text-muted-foreground opacity-60 transition-[opacity,color] duration-150 hover:opacity-100 hover:text-destructive"
      >
        {'\u25BC'}
      </button>
    </div>
  );
}
