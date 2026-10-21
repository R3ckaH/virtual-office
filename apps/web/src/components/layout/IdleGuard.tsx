import { useEffect, useRef, useState } from 'react';
import { Button, Dialog } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const PING_EVERY_MS = 60_000; // tell the server about activity at most once a minute
const WARN_BEFORE_MS = 2 * 60_000; // show the warning 2 minutes before sign-out
const CHECK_EVERY_MS = 5_000;
const EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove'] as const;

interface SessionStatus {
  lastActivityAt: string;
  expiresAt: string;
  sessionTimeoutMinutes: number;
}

/**
 * Signs the user out after the company's inactivity timeout (default 30 min), with a warning first.
 * Real input (mouse, keys, touch) counts as activity; background requests don't.
 * Before warning, it asks the server so activity in another tab keeps this one alive.
 */
export function IdleGuard() {
  const { sessionTimeoutMinutes, logout } = useAuth();
  const timeoutMs = sessionTimeoutMinutes * 60_000;
  const lastActivity = useRef(Date.now());
  const lastPing = useRef(0);
  const pending = useRef(false);
  const [warning, setWarning] = useState(false);
  const [remaining, setRemaining] = useState(timeoutMs);
  const warningRef = useRef(false);
  warningRef.current = warning;

  useEffect(() => {
    // Opening or reloading the app is activity too.
    lastPing.current = Date.now();
    void api('/auth/activity', { method: 'POST' }).catch(() => undefined);
  }, []);

  useEffect(() => {
    let lastMove = 0;
    const onActivity = (e: Event) => {
      if (warningRef.current) return; // require an explicit choice once the warning is up
      const now = Date.now();
      if (e.type === 'mousemove' && now - lastMove < 1000) return;
      lastMove = now;
      lastActivity.current = now;
      if (now - lastPing.current > PING_EVERY_MS && !pending.current) {
        pending.current = true;
        lastPing.current = now;
        api<SessionStatus>('/auth/activity', { method: 'POST' })
          .catch(() => undefined)
          .finally(() => (pending.current = false));
      }
    };
    EVENTS.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true }));
    return () => EVENTS.forEach((ev) => window.removeEventListener(ev, onActivity));
  }, []);

  useEffect(() => {
    let syncing = false;
    const tick = async () => {
      const left = timeoutMs - (Date.now() - lastActivity.current);
      if (left <= 0) {
        setWarning(false);
        void logout('timeout');
        return;
      }
      if (left <= WARN_BEFORE_MS && !warningRef.current && !syncing) {
        syncing = true;
        try {
          const s = await api<SessionStatus>('/auth/session');
          const server = new Date(s.lastActivityAt).getTime();
          if (server > lastActivity.current) lastActivity.current = server; // another tab was active
        } catch {
          /* session already ended: the API layer handles sign-out */
        } finally {
          syncing = false;
        }
        const after = timeoutMs - (Date.now() - lastActivity.current);
        if (after <= WARN_BEFORE_MS) setWarning(true);
      }
      setRemaining(Math.max(0, timeoutMs - (Date.now() - lastActivity.current)));
    };
    const id = window.setInterval(() => void tick(), CHECK_EVERY_MS);
    return () => window.clearInterval(id);
  }, [timeoutMs, logout]);

  // Smooth countdown while the dialog is open.
  useEffect(() => {
    if (!warning) return;
    const id = window.setInterval(() => setRemaining(Math.max(0, timeoutMs - (Date.now() - lastActivity.current))), 1000);
    return () => window.clearInterval(id);
  }, [warning, timeoutMs]);

  const stay = async () => {
    lastActivity.current = Date.now();
    lastPing.current = Date.now();
    setWarning(false);
    await api('/auth/activity', { method: 'POST' }).catch(() => undefined);
  };

  const secs = Math.ceil(remaining / 1000);
  const mm = Math.floor(secs / 60);
  const ss = String(secs % 60).padStart(2, '0');

  return (
    <Dialog
      open={warning}
      onClose={() => void stay()}
      title="Are you still there?"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => void logout('user')}>
            Sign out
          </Button>
          <Button onClick={() => void stay()} data-autofocus>
            Stay signed in
          </Button>
        </>
      }
    >
      <p className="text-muted">
        For security, you&apos;ll be signed out in{' '}
        <span className="tabular font-semibold text-ink">
          {mm}:{ss}
        </span>{' '}
        because there&apos;s been no activity for a while.
      </p>
    </Dialog>
  );
}
