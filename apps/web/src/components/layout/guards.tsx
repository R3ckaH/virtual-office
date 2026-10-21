import type { Permission } from '@vo/shared';
import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { EmptyState, Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';

export function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner label="Opening the office" />
    </div>
  );
}

/** Sends signed-out visitors to the login page, then back to where they were going. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'signedOut') {
    const next = location.pathname + location.search;
    return <Navigate to={`/login${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`} replace />;
  }
  return <>{children}</>;
}

/** Page-level role check. The API enforces the same rule; this just avoids showing a broken page. */
export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { can } = useAuth();
  if (!can(permission)) {
    return (
      <EmptyState title="You don't have access to this page">
        Ask an administrator if you think you should.
      </EmptyState>
    );
  }
  return <>{children}</>;
}

export function RedirectIfSignedIn({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const params = new URLSearchParams(useLocation().search);
  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'signedIn') {
    const next = params.get('next');
    return <Navigate to={next && next.startsWith('/') && !next.startsWith('//') ? next : '/'} replace />;
  }
  return <>{children}</>;
}
