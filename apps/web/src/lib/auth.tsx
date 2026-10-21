import type { LoginInput, LoginResponse, MeDto, MfaChallengeResponse, Permission } from '@vo/shared';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, apiRaw, configureApi, readCookie, tokenStore } from './api';

type Status = 'loading' | 'signedIn' | 'signedOut';

export interface SignOutNotice {
  code: string;
  message: string;
}

interface AuthState {
  status: Status;
  user: MeDto | null;
  sessionTimeoutMinutes: number;
  notice: SignOutNotice | null;
  clearNotice: () => void;
  login: (input: LoginInput) => Promise<MfaChallengeResponse | null>;
  loginMfa: (mfaToken: string, code: string) => Promise<void>;
  logout: (reason?: 'user' | 'timeout') => Promise<void>;
  setUser: (u: MeDto) => void;
  can: (p: Permission) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUserState] = useState<MeDto | null>(null);
  const [timeout, setTimeoutMinutes] = useState(30);
  const [notice, setNotice] = useState<SignOutNotice | null>(null);
  const refreshTimer = useRef<number>();

  const clearLocal = useCallback(() => {
    tokenStore.set(null);
    window.clearTimeout(refreshTimer.current);
    setUserState(null);
    setStatus('signedOut');
    qc.clear();
  }, [qc]);

  const accept = useCallback((r: LoginResponse) => {
    tokenStore.set(r.accessToken);
    setUserState(r.user);
    setTimeoutMinutes(r.sessionTimeoutMinutes);
    setStatus('signedIn');
    // Renew the access token a minute before it expires.
    window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => void refresh(), Math.max(30, r.expiresIn - 60) * 1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inFlight = useRef<Promise<boolean> | null>(null);
  const refresh = useCallback((): Promise<boolean> => {
    // One refresh at a time per tab (page load, timer and 401 retries can overlap).
    inFlight.current ??= (async () => {
      if (!readCookie('vo_csrf')) {
        clearLocal();
        return false;
      }
      try {
        accept(await apiRaw<LoginResponse>('/auth/refresh', { method: 'POST' }));
        return true;
      } catch (e) {
        if (e instanceof ApiError && e.code && e.code !== 'UNAUTHENTICATED') setNotice({ code: e.code, message: e.message });
        clearLocal();
        return false;
      }
    })().finally(() => (inFlight.current = null));
    return inFlight.current;
  }, [accept, clearLocal]);

  useEffect(() => {
    configureApi({
      refresh,
      onSessionEnd: (code, message) => {
        setNotice({ code, message });
        clearLocal();
      },
    });
    void refresh(); // restore the session on page load
    return () => window.clearTimeout(refreshTimer.current);
  }, [refresh, clearLocal]);

  const login = useCallback(
    async (input: LoginInput) => {
      const r = await apiRaw<LoginResponse | MfaChallengeResponse>('/auth/login', { method: 'POST', json: input });
      if (r.mfaRequired) return r;
      setNotice(null);
      accept(r);
      return null;
    },
    [accept],
  );

  const loginMfa = useCallback(
    async (mfaToken: string, code: string) => {
      const r = await apiRaw<LoginResponse>('/auth/login/mfa', { method: 'POST', json: { mfaToken, code } });
      setNotice(null);
      accept(r);
    },
    [accept],
  );

  const logout = useCallback(
    async (reason: 'user' | 'timeout' = 'user') => {
      try {
        await apiRaw('/auth/logout', { method: 'POST', json: { reason } });
      } finally {
        if (reason === 'timeout') {
          setNotice({ code: 'SESSION_TIMEOUT', message: 'You were signed out after a period of inactivity.' });
        }
        clearLocal();
      }
    },
    [clearLocal],
  );

  const value = useMemo<AuthState>(
    () => ({
      status,
      user,
      sessionTimeoutMinutes: timeout,
      notice,
      clearNotice: () => setNotice(null),
      login,
      loginMfa,
      logout,
      setUser: setUserState,
      can: (p) => !!user?.permissions.includes(p),
    }),
    [status, user, timeout, notice, login, loginMfa, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
