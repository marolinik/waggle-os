/**
 * SplashScreen — startup progress display.
 *
 * Pure presentational component: receives phase, message, progress, and optional error.
 * No hooks or side effects — all state is driven by props.
 */

import React from 'react';

export interface SplashScreenProps {
  /** Current startup phase identifier */
  phase: string;
  /** Human-readable status message */
  message: string;
  /** Progress value from 0 to 1 */
  progress: number;
  /** Optional error message */
  error?: string;
}

export function SplashScreen({ phase: _phase, message, progress, error }: SplashScreenProps): React.ReactElement {
  const percentage = Math.round(progress * 100);

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-background text-foreground font-sans">
      {/* Logo area */}
      <div className="text-5xl font-bold mb-8 tracking-wide text-primary">
        Waggle
      </div>

      {/* Phase message */}
      <div className="text-base mb-6 text-muted-foreground min-h-[1.5em]">
        {error ? error : message}
      </div>

      {/* Progress bar */}
      <div className="w-[300px] h-1.5 rounded-sm bg-muted overflow-hidden">
        <div
          className={`h-full rounded-sm transition-[width] duration-300 ease-in-out ${error ? 'bg-destructive' : 'bg-primary'}`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Percentage */}
      <div className="text-sm mt-3 text-muted-foreground">
        {error ? 'Error' : `${percentage}%`}
      </div>
    </div>
  );
}
