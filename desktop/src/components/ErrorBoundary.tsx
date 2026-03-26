import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full"
            style={{ background: 'var(--bg-secondary)' }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" strokeLinecap="round" />
              <line x1="12" y1="16" x2="12.01" y2="16" strokeLinecap="round" />
            </svg>
          </div>
          <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>Something went wrong</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="rounded-md px-4 py-1.5 text-sm font-medium transition-opacity hover:opacity-80"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
