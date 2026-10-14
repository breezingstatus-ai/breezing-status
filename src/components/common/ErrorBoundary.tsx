import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Breezing Status HD ErrorBoundary caught error:', error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[280px] w-full flex items-center justify-center p-6 bg-[#F8F9F7] dark:bg-[#101713] text-[#19241E] dark:text-[#F2F6F2]">
          <div className="max-w-md w-full bg-white dark:bg-[#1A241E] border border-[#E4EAE5] dark:border-[#334539] rounded-2xl p-6 text-center shadow-lg space-y-4">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-[#19241E] dark:text-[#F2F6F2]">
              {this.props.fallbackTitle || 'Something interrupted this view'}
            </h3>
            <p className="text-xs text-[#748078] dark:text-[#A7B8AC] leading-relaxed">
              We've protected your status session. You can retry safely or refresh to resume normally.
            </p>
            <div className="flex gap-2.5 justify-center pt-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#173B2A] dark:bg-[#58C994] text-white dark:text-[#101713] text-xs font-semibold hover:opacity-95 transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Try Again</span>
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#E4EAE5] dark:border-[#334539] hover:bg-[#F1F5F1] dark:hover:bg-[#25332A] text-xs font-semibold transition-all"
              >
                <Home className="w-3.5 h-3.5" />
                <span>Reload App</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
