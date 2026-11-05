import React, { Component, ErrorInfo, ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Bvelt Radar UI ErrorBoundary caught an error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-6 flex flex-col items-center justify-center font-sans">
          <div className="max-w-md w-full bg-slate-900 border border-red-500/40 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center space-x-3 text-red-400">
              <span className="text-2xl">⚠️</span>
              <h1 className="text-xl font-extrabold text-white">Bvelt Radar</h1>
            </div>
            <p className="text-xs text-slate-400 font-medium">
              Se ha producido un error al renderizar la interfaz:
            </p>
            <div className="bg-slate-950 border border-red-900/50 p-3 rounded-xl font-mono text-xs text-red-300 break-words overflow-auto max-h-48">
              {this.state.error?.message || String(this.state.error) || 'Error desconocido'}
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-500 text-white font-semibold text-sm rounded-xl transition shadow-lg shadow-red-600/20"
            >
              Reintentar / Cargar de nuevo
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

try {
  const rootElement = document.getElementById('root');
  if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </React.StrictMode>
    );
  } else {
    document.body.innerText = 'Error fatal: No se encontró el elemento #root en el DOM.';
  }
} catch (err: any) {
  console.error('Fatal initialization error:', err);
  if (typeof document !== 'undefined' && document.body) {
    document.body.innerText = `Error fatal al iniciar React: ${err?.message || String(err)}`;
  }
}
