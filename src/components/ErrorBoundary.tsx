import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Button } from './ui/button';
import { AlertOctagon } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Reusable React Error Boundary class component.
 * Isolates component runtime exceptions and prevents complete application crashes.
 */
export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log crash details
    console.error('ErrorBoundary caught an exception:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <Card className="border-rose-900 bg-rose-950/20 text-white p-6 max-w-lg mx-auto my-12 text-center space-y-4">
          <CardHeader className="flex flex-col items-center pb-2">
            <AlertOctagon className="h-12 w-12 text-rose-500 mb-2 animate-bounce" />
            <CardTitle className="text-lg font-bold">
              {this.props.fallbackTitle || 'Section System Crash'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <p className="text-slate-400">
              A runtime component exception was intercepted. Operational control has been isolated to prevent cascade failures.
            </p>
            <div className="bg-slate-950 p-2.5 rounded text-left overflow-x-auto text-[10px] text-rose-300 font-mono">
              {this.state.error?.toString() || 'Unknown runtime error'}
            </div>
            <Button 
              onClick={this.handleReset}
              className="bg-rose-700 hover:bg-rose-600 text-white font-semibold"
            >
              Reset Station & Reload
            </Button>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}
