import type { CallDto, JoinDto } from '@vo/shared';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/ui/toast';
import { api, ApiError } from './api';
import { usePresence } from './presence';

export interface Reminder {
  meetingId: string;
  title: string;
  start: string;
}

export interface CallsState {
  /** the call you're in (one at a time) */
  active: JoinDto | null;
  minimized: boolean;
  setMinimized: (v: boolean) => void;
  /** names of the people still ringing, for a call you started */
  ringing: string[];
  incoming: CallDto[];
  reminders: Reminder[];
  /** set while a join request is in flight (meeting id, user id or room id) */
  pending: string | null;
  joinMeeting: (meetingId: string) => Promise<void>;
  callPeople: (userIds: string[], names: string[]) => Promise<void>;
  joinRoomCall: (roomId: string) => Promise<void>;
  answer: (meetingId: string) => Promise<void>;
  decline: (meetingId: string) => Promise<void>;
  dismissReminder: (meetingId: string) => void;
  /** you left the call (from the call screen) */
  left: () => void;
  /** someone joined your outgoing call */
  answered: () => void;
}

const CallsContext = createContext<CallsState | null>(null);

const message = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Try again.');

/** The video call you're in, calls ringing for you, and meeting reminders. Lives above the pages so a call survives navigation. */
export function CallsProvider({ children }: { children: ReactNode }) {
  const { on } = usePresence();
  const toast = useToast();
  const qc = useQueryClient();
  const [active, setActive] = useState<JoinDto | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [ringing, setRinging] = useState<string[]>([]);
  const [incoming, setIncoming] = useState<CallDto[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [pending, setPending] = useState<string | null>(null);

  const start = useCallback((j: JoinDto) => {
    setActive(j);
    setMinimized(false);
    setIncoming((list) => list.filter((c) => c.meetingId !== j.meetingId));
    setReminders((list) => list.filter((r) => r.meetingId !== j.meetingId));
  }, []);

  const run = useCallback(
    async (key: string, fn: () => Promise<JoinDto>) => {
      if (pending) return;
      setPending(key);
      try {
        start(await fn());
      } catch (e) {
        toast(message(e), 'danger');
      } finally {
        setPending(null);
      }
    },
    [pending, start, toast],
  );

  const joinMeeting = useCallback((id: string) => run(id, () => api<JoinDto>(`/meetings/${id}/join`, { method: 'POST' })), [run]);
  const joinRoomCall = useCallback((roomId: string) => run(roomId, () => api<JoinDto>(`/rooms/${roomId}/call`, { method: 'POST' })), [run]);
  const callPeople = useCallback(
    (userIds: string[], names: string[]) =>
      run(userIds.join(','), async () => {
        const j = await api<JoinDto>('/calls', { method: 'POST', json: { userIds } });
        setRinging(names);
        return j;
      }),
    [run],
  );
  const answer = useCallback((id: string) => joinMeeting(id), [joinMeeting]);
  const decline = useCallback(
    async (id: string) => {
      setIncoming((list) => list.filter((c) => c.meetingId !== id));
      await api(`/calls/${id}/decline`, { method: 'POST' }).catch(() => undefined);
    },
    [],
  );

  const left = useCallback(() => {
    if (active?.kind === 'INSTANT' && active.isHost && ringing.length) {
      void api(`/calls/${active.meetingId}/cancel`, { method: 'POST' }).catch(() => undefined);
    }
    setRinging([]);
    setActive(null);
    setMinimized(false);
    void qc.invalidateQueries({ queryKey: ['meetings'] });
  }, [active, ringing.length, qc]);

  const answered = useCallback(() => setRinging([]), []);

  useEffect(() => {
    const offs = [
      on('call:incoming', (c) => {
        if (active?.meetingId === c.meetingId) return;
        setIncoming((list) => [...list.filter((x) => x.meetingId !== c.meetingId), c]);
      }),
      on('call:ended', (e) => {
        setIncoming((list) => list.filter((c) => c.meetingId !== e.meetingId));
        if (active?.meetingId !== e.meetingId) return;
        if (e.reason === 'declined') {
          setRinging((names) => names.filter((n) => n !== e.byName));
          toast(`${e.byName ?? 'They'} can’t take the call right now.`, 'danger');
        }
        if (e.reason === 'timeout') {
          setRinging([]);
          toast('No answer. You can stay in the call or hang up.', 'danger');
        }
      }),
      on('meeting:reminder', (r) => setReminders((list) => [...list.filter((x) => x.meetingId !== r.meetingId), r])),
      on('meetings:changed', () => void qc.invalidateQueries({ queryKey: ['meetings'] })),
    ];
    return () => offs.forEach((off) => off());
  }, [on, active, toast, qc]);

  // reminders tidy themselves up an hour after the start
  useEffect(() => {
    if (!reminders.length) return;
    const t = window.setInterval(() => setReminders((list) => list.filter((r) => Date.parse(r.start) > Date.now() - 60 * 60_000)), 60_000);
    return () => window.clearInterval(t);
  }, [reminders.length]);

  const dismissReminder = useCallback((id: string) => setReminders((list) => list.filter((r) => r.meetingId !== id)), []);

  const value = useMemo<CallsState>(
    () => ({ active, minimized, setMinimized, ringing, incoming, reminders, pending, joinMeeting, callPeople, joinRoomCall, answer, decline, dismissReminder, left, answered }),
    [active, minimized, ringing, incoming, reminders, pending, joinMeeting, callPeople, joinRoomCall, answer, decline, dismissReminder, left, answered],
  );
  return <CallsContext.Provider value={value}>{children}</CallsContext.Provider>;
}

const noop = async () => undefined;
const outside: CallsState = {
  active: null,
  minimized: false,
  setMinimized: () => undefined,
  ringing: [],
  incoming: [],
  reminders: [],
  pending: null,
  joinMeeting: noop,
  callPeople: noop,
  joinRoomCall: noop,
  answer: noop,
  decline: noop,
  dismissReminder: () => undefined,
  left: () => undefined,
  answered: () => undefined,
};

/** Works outside the provider too (returns a no-op state), so pages render in isolation. */
export const useCalls = () => useContext(CallsContext) ?? outside;
