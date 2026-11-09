import { clsx } from 'clsx';
import { AlertCircle, CheckCircle2, MessageSquare, X } from 'lucide-react';
import { createContext, ReactNode, useCallback, useContext, useState } from 'react';

type Tone = 'ok' | 'danger' | 'info';
interface ToastAction {
  label: string;
  onClick: () => void;
}
interface Toast {
  id: number;
  tone: Tone;
  message: string;
  action?: ToastAction;
}

type Push = (message: string, tone?: Tone, action?: ToastAction) => void;
const ToastContext = createContext<Push>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback<Push>(
    (message, tone = 'ok', action) => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t.slice(-3), { id, tone, message, action }]);
      window.setTimeout(() => dismiss(id), action ? 8000 : 5000);
    },
    [dismiss],
  );
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(24rem,calc(100%-2rem))] flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} role={t.tone === 'danger' ? 'alert' : 'status'} className="pointer-events-auto flex items-start gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-sm shadow-lg">
            {t.tone === 'ok' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden />
            ) : t.tone === 'info' ? (
              <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-brand-fg" aria-hidden />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
            )}
            <p className={clsx('min-w-0 flex-1 break-words', t.tone === 'danger' && 'text-danger')}>{t.message}</p>
            {t.action && (
              <button
                type="button"
                className="rounded px-1 font-medium text-brand-fg hover:underline"
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button type="button" className="rounded text-muted hover:text-ink" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
