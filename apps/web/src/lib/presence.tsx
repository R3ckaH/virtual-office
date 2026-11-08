import type {
  Ack,
  ClientEventListeners,
  ClientEvents,
  FloorSnapshotDto,
  KnockDto,
  MeetingDto,
  PresencePersonDto,
  RoomDto,
  ServerEventListeners,
  SummonDto,
} from '@vo/shared';
import { IDLE_AWAY_MINUTES } from '@vo/shared';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { endSession, renewAccess, tokenStore } from './api';
import { useAuth } from './auth';
import { usePublicConfig } from './config';

type Connection = 'connecting' | 'online' | 'reconnecting' | 'offline';

export interface PresenceState {
  connection: Connection;
  me: string | null;
  rooms: RoomDto[];
  people: Record<string, PresencePersonDto>;
  meetings: MeetingDto[];
  /** knocks on the room I'm in */
  knocks: KnockDto[];
  /** invitations to join a meeting */
  summons: SummonDto[];
  /** the knock I'm waiting on */
  myKnock: KnockDto | null;
  /** the last answer to my knock (cleared after a moment) */
  knockAnswer: { roomId: string; accepted: boolean; byName: string } | null;
  send: <E extends keyof ClientEvents, T = unknown>(event: E, payload: ClientEvents[E]) => Promise<Ack<T>>;
  dismissSummon: (id: string) => void;
}

const empty: PresenceState = {
  connection: 'offline',
  me: null,
  rooms: [],
  people: {},
  meetings: [],
  knocks: [],
  summons: [],
  myKnock: null,
  knockAnswer: null,
  send: async () => ({ ok: false, message: 'Not connected to the office yet.', code: 'NOT_CONNECTED' }),
  dismissSummon: () => undefined,
};

const PresenceContext = createContext<PresenceState>(empty);

const TERMINAL = new Set(['SESSION_TIMEOUT', 'FORCED_LOGOUT', 'SESSION_ENDED', 'ACCOUNT_DEACTIVATED']);
const ACTIVITY = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove'] as const;

type VoSocket = Socket<ServerEventListeners, ClientEventListeners>;

/**
 * The live connection to the office: who's where, statuses, knocks and summons.
 * Connects while signed in and reports idle time (after IDLE_AWAY_MINUTES without input you show as Away).
 */
export function PresenceProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const config = usePublicConfig();
  const [connection, setConnection] = useState<Connection>('offline');
  const [snapshot, setSnapshot] = useState<Pick<FloorSnapshotDto, 'me' | 'rooms' | 'meetings'> | null>(null);
  const [people, setPeople] = useState<Record<string, PresencePersonDto>>({});
  const [knocks, setKnocks] = useState<KnockDto[]>([]);
  const [summons, setSummons] = useState<SummonDto[]>([]);
  const [myKnock, setMyKnock] = useState<KnockDto | null>(null);
  const [knockAnswer, setKnockAnswer] = useState<PresenceState['knockAnswer']>(null);
  const socketRef = useRef<VoSocket | null>(null);

  const ready = status === 'signedIn' && config.isSuccess;
  const url = config.data?.realtimeUrl ?? undefined;

  useEffect(() => {
    if (!ready) return;
    setConnection('connecting');
    const socket: VoSocket = io(url ?? '', {
      path: '/socket.io',
      transports: ['websocket'],
      auth: (cb) => cb({ token: tokenStore.get() }),
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
    });
    socketRef.current = socket;
    let renewing = false;

    socket.on('connect', () => setConnection('online'));
    socket.on('disconnect', (reason) => setConnection(reason === 'io server disconnect' ? 'offline' : 'reconnecting'));
    socket.on('connect_error', (err: Error & { data?: { code?: string } }) => {
      const code = err.data?.code;
      if (code && TERMINAL.has(code)) {
        setConnection('offline');
        endSession(code, err.message);
        return;
      }
      if ((code === 'TOKEN_INVALID' || code === 'UNAUTHENTICATED') && !renewing) {
        // the access token expired: renew it, then try again (the server refused, so no auto-retry)
        renewing = true;
        setConnection('reconnecting');
        void renewAccess().then((ok) => {
          renewing = false;
          if (ok) socket.connect();
          else setConnection('offline');
        });
        return;
      }
      setConnection('reconnecting');
    });

    socket.on('floor:snapshot', (snap) => {
      setSnapshot({ me: snap.me, rooms: snap.rooms, meetings: snap.meetings });
      setPeople(Object.fromEntries(snap.people.map((p) => [p.userId, p])));
      setKnocks([]);
      setMyKnock(null);
    });
    socket.on('presence:update', (p) => setPeople((prev) => ({ ...prev, [p.userId]: p })));
    socket.on('rooms:update', (rooms) => setSnapshot((s) => (s ? { ...s, rooms } : s)));
    socket.on('meetings:update', (meetings) => setSnapshot((s) => (s ? { ...s, meetings } : s)));
    socket.on('knock:incoming', (k) => setKnocks((ks) => [...ks.filter((x) => x.id !== k.id), k]));
    socket.on('knock:closed', ({ id }) => {
      setKnocks((ks) => ks.filter((k) => k.id !== id));
      setMyKnock((k) => (k?.id === id ? null : k));
    });
    socket.on('knock:answered', (a) => {
      setMyKnock(null);
      setKnockAnswer({ roomId: a.roomId, accepted: a.accepted, byName: a.byName });
    });
    socket.on('summon:incoming', (s) => setSummons((ss) => [...ss.filter((x) => x.id !== s.id), s]));
    socket.on('summon:closed', ({ id }) => setSummons((ss) => ss.filter((s) => s.id !== id)));
    socket.on('session:ended', ({ code, message }) => {
      setConnection('offline');
      endSession(code, message);
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setConnection('offline');
      setSnapshot(null);
      setPeople({});
      setKnocks([]);
      setSummons([]);
      setMyKnock(null);
    };
  }, [ready, url]);

  // Away after a stretch without keyboard/mouse input (in this tab; the server combines tabs).
  useEffect(() => {
    if (connection !== 'online') return;
    const socket = socketRef.current;
    let last = Date.now();
    let idle = false;
    const mark = () => {
      last = Date.now();
      if (idle) {
        idle = false;
        socket?.emit('activity:idle', { idle: false });
      }
    };
    for (const e of ACTIVITY) window.addEventListener(e, mark, { passive: true });
    const timer = window.setInterval(() => {
      if (!idle && Date.now() - last > IDLE_AWAY_MINUTES * 60_000) {
        idle = true;
        socket?.emit('activity:idle', { idle: true });
      }
    }, 30_000);
    return () => {
      for (const e of ACTIVITY) window.removeEventListener(e, mark);
      window.clearInterval(timer);
    };
  }, [connection]);

  useEffect(() => {
    if (!knockAnswer) return;
    const t = window.setTimeout(() => setKnockAnswer(null), 6000);
    return () => window.clearTimeout(t);
  }, [knockAnswer]);

  const send = useCallback(<E extends keyof ClientEvents, T = unknown>(event: E, payload: ClientEvents[E]) => {
    const socket = socketRef.current;
    if (!socket?.connected) return Promise.resolve<Ack<T>>({ ok: false, message: 'You’re not connected to the office right now.', code: 'NOT_CONNECTED' });
    return new Promise<Ack<T>>((resolve) => {
      (socket as unknown as Socket).timeout(10_000).emit(event, payload, (err: Error | null, ack: Ack<T>) => {
        if (err) return resolve({ ok: false, message: 'The office didn’t answer. Check your connection and try again.', code: 'TIMEOUT' });
        if (ack.ok && event === 'knock:send') setMyKnock((ack as { ok: true; data?: unknown }).data as KnockDto);
        resolve(ack);
      });
    });
  }, []);

  const dismissSummon = useCallback((id: string) => setSummons((ss) => ss.filter((s) => s.id !== id)), []);

  const value = useMemo<PresenceState>(
    () => ({
      connection,
      me: snapshot?.me ?? null,
      rooms: snapshot?.rooms ?? [],
      meetings: snapshot?.meetings ?? [],
      people,
      knocks,
      summons,
      myKnock,
      knockAnswer,
      send,
      dismissSummon,
    }),
    [connection, snapshot, people, knocks, summons, myKnock, knockAnswer, send, dismissSummon],
  );
  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}

export const usePresence = () => useContext(PresenceContext);

/** People who are connected right now, grouped by room id. */
export function useOccupants() {
  const { people } = usePresence();
  return useMemo(() => {
    const byRoom = new Map<string, PresencePersonDto[]>();
    for (const p of Object.values(people)) {
      if (!p.roomId || p.status === 'OFFLINE') continue;
      const list = byRoom.get(p.roomId) ?? [];
      list.push(p);
      byRoom.set(p.roomId, list);
    }
    return byRoom;
  }, [people]);
}
