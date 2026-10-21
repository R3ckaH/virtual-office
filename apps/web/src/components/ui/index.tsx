import { clsx } from 'clsx';
import { Loader2, X } from 'lucide-react';
import {
  ButtonHTMLAttributes,
  forwardRef,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  useEffect,
  useId,
  useRef,
} from 'react';

/* ------------------------------ Button ------------------------------ */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const variants: Record<Variant, string> = {
  primary: 'bg-brand text-brand-ink hover:bg-brand/90 shadow-sm',
  secondary: 'bg-surface text-ink border border-line hover:bg-sunken',
  ghost: 'text-ink hover:bg-sunken',
  danger: 'bg-danger text-white hover:bg-danger/90 dark:text-canvas',
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; loading?: boolean }
>(function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, type = 'button', ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        size === 'sm' && 'h-8 px-3 text-sm',
        size === 'md' && 'h-10 px-4 text-sm',
        size === 'lg' && 'h-12 px-5 text-base',
        variants[variant],
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

/* ------------------------------ Fields ------------------------------ */

const control =
  'w-full rounded-lg border border-line bg-surface px-3 text-[15px] text-ink placeholder:text-muted/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:bg-sunken aria-[invalid=true]:border-danger';

interface FieldProps {
  label: string;
  error?: string;
  hint?: ReactNode;
  children: (ids: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
  className?: string;
}

/** Label + control + hint/error, wired up with aria-describedby. */
export function Field({ label, error, hint, children, className }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  return (
    <div className={clsx('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {children({ id, describedBy: [hintId, errId].filter(Boolean).join(' ') || undefined, invalid: !!error })}
      {hint && !error && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={clsx(control, 'h-10', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={clsx(control, 'h-10 pr-8', className)} {...rest}>
      {children}
    </select>
  );
});

/* ------------------------------ Display ----------------------------- */

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'ok' | 'warn' | 'danger' | 'brand'; children: ReactNode }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium',
        tone === 'neutral' && 'bg-sunken text-muted',
        tone === 'ok' && 'bg-ok/10 text-ok',
        tone === 'warn' && 'bg-warn/10 text-warn',
        tone === 'danger' && 'bg-danger/10 text-danger',
        tone === 'brand' && 'bg-brand/10 text-brand-fg',
      )}
    >
      {children}
    </span>
  );
}

export function Alert({ tone = 'danger', children, title }: { tone?: 'danger' | 'ok' | 'warn' | 'info'; title?: string; children: ReactNode }) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={clsx(
        'rounded-lg border px-3.5 py-3 text-sm',
        tone === 'danger' && 'border-danger/30 bg-danger/5 text-danger',
        tone === 'ok' && 'border-ok/30 bg-ok/5 text-ok',
        tone === 'warn' && 'border-warn/30 bg-warn/5 text-warn',
        tone === 'info' && 'border-brand/30 bg-brand/5 text-ink',
      )}
    >
      {title && <p className="font-semibold">{title}</p>}
      <div>{children}</div>
    </div>
  );
}

export function Panel({ title, action, children, className, description }: { title?: ReactNode; description?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx('rounded-card border border-line bg-surface', className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            {title && <h2 className="text-base font-semibold">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 text-muted">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      <span className="text-sm">{label}…</span>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-line px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  );
}

/* ------------------------------ Dialog ------------------------------ */

/** Native <dialog>: focus trap, Esc to close and inert background come from the browser. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal?.();
      // Native dialogs focus the first control (the close button); prefer the marked primary action.
      d.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
    if (!open && d.open) d.close?.();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={clsx(
        'w-[calc(100%-2rem)] rounded-card border border-line bg-surface p-0 text-ink shadow-2xl',
        size === 'sm' && 'max-w-sm',
        size === 'md' && 'max-w-lg',
        size === 'lg' && 'max-w-2xl',
      )}
    >
      {open && (
        <div>
          <div className="flex items-start gap-4 border-b border-line px-5 py-4">
            <div className="flex-1">
              <h2 id={titleId} className="text-lg font-semibold">
                {title}
              </h2>
              {description && <p className="mt-1 text-sm text-muted">{description}</p>}
            </div>
            <button type="button" onClick={onClose} className="-mr-1 rounded-md p-1 text-muted hover:bg-sunken hover:text-ink" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-line bg-sunken/50 px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

/* ---------------------------- Pagination ---------------------------- */

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 pt-4 text-sm text-muted">
      <span className="tabular">
        {from}–{to} of {total}
      </span>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </nav>
  );
}
