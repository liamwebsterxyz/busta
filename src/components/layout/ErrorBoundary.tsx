import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): State {
    return { error, info: null };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ error, info });
    console.error("[ErrorBoundary]", error, info);
  }

  reset = () => {
    this.setState({ error: null, info: null });
  };

  clearStorage = () => {
    try {
      localStorage.removeItem("busta:v0");
    } catch {
      /* ignore */
    }
    location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full w-full items-center justify-center p-8">
        <div className="max-w-2xl rounded-lg border border-red-300 bg-red-50 p-6 text-sm">
          <h1 className="mb-2 text-base font-semibold text-red-700">
            Something went wrong rendering busta
          </h1>
          <pre className="mb-3 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-white p-3 text-xs">
            {this.state.error.message}
            {"\n\n"}
            {this.state.error.stack}
          </pre>
          {this.state.info?.componentStack && (
            <details className="mb-3 text-xs">
              <summary className="cursor-pointer text-red-700">Component stack</summary>
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-white p-3">
                {this.state.info.componentStack}
              </pre>
            </details>
          )}
          <div className="flex gap-2">
            <button
              onClick={this.reset}
              className="rounded border border-red-300 bg-white px-3 py-1.5 text-red-700 hover:bg-red-100"
            >
              Try again
            </button>
            <button
              onClick={this.clearStorage}
              className="rounded border border-red-300 bg-white px-3 py-1.5 text-red-700 hover:bg-red-100"
            >
              Clear local data + reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
