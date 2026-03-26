/**
 * ErrorBoundary — Catches render errors in view subtrees.
 *
 * React error boundaries must be class components (no hook equivalent exists).
 * Each view is wrapped with its own ErrorBoundary to isolate crashes.
 */

import React from 'react';

export interface ErrorBoundaryProps {
  viewName: string;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error(`[ErrorBoundary:${this.props.viewName}]`, error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full p-8">
          <div className="max-w-md w-full rounded-lg border border-destructive/50 bg-card p-6 text-center shadow-sm">
            <div className="text-3xl mb-3">!</div>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              Something went wrong in {this.props.viewName}
            </h2>
            {this.state.error?.message && (
              <p className="text-sm text-muted-foreground mb-4 font-mono bg-secondary/50 rounded px-3 py-2 break-words">
                {this.state.error.message}
              </p>
            )}
            <button
              type="button"
              onClick={this.handleRetry}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
