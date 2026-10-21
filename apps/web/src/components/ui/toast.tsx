import { clsx } from 'clsx';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';
import { createContext, ReactNode, useCallback, useContext, useState } from 'react';

interface Toast {
  id: number;
  tone: 'ok' | 'danger';
  message: string;
}

const ToastContext = createContext<(message: string, tone?: Toast['tone']) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: Toast['tone'] = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, tone, message }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(24rem,calc(100%-2rem))] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'danger' ? 'alert' : 'status'}
            className="pointer-events-auto flex items-start gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-sm shadow-lg"
          >
            {t.tone === 'ok' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
            )}
            <p className={clsx('flex-1', t.tone === 'danger' && 'text-danger')}>{t.message}</p>
            <button
              type="button"
              className="rounded text-muted hover:text-ink"
              onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
