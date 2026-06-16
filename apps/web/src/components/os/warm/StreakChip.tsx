import { cn } from '@/lib/utils';

interface StreakChipProps {
  days: number;
  className?: string;
}

/**
 * 🔥 N-day streak chip (honey-wash fill / honey-line border) for the Home
 * greeting. The habit-loop mechanic lives on Home, not a standalone page
 * (SCREENS §15). `days` is currently a mock value — no backend streak field
 * exists yet (see PR3-BUILD-PLAN §5).
 */
export function StreakChip({ days, className }: StreakChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-[var(--honey-line)] bg-[var(--honey-wash)] px-3 py-1 text-[12.5px] font-medium text-[var(--text-2)]',
        className,
      )}
    >
      <span aria-hidden>🔥</span>
      <span>{days}-day streak</span>
    </span>
  );
}
