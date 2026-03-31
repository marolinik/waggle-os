import { Component, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  appName: string;
  onClose?: () => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[${this.props.appName}] Render error:`, error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
          <AlertTriangle className="w-8 h-8 text-destructive/60" />
          <p className="text-sm font-display font-medium text-foreground">
            {this.props.appName} encountered an error
          </p>
          <p className="text-xs text-muted-foreground max-w-xs">
            {this.state.error?.message || 'Something went wrong'}
          </p>
          {this.props.onClose && (
            <button
              onClick={this.props.onClose}
              className="mt-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-muted hover:bg-muted/80 transition-colors"
            >
              Close Window
            </button>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

export default AppErrorBoundary;
