import { io, Socket } from 'socket.io-client';
import type { Ack, FloorSnapshotDto, ServerEvents } from '@vo/shared';

type Events = { [K in keyof ServerEvents]: ServerEvents[K] };

export interface Client {
  socket: Socket;
  me: string;
  snapshot: FloorSnapshotDto;
  received: { event: keyof Events; data: unknown }[];
  waitFor<E extends keyof Events>(event: E, match?: (d: Events[E]) => boolean, ms?: number): Promise<Events[E]>;
  send<T = unknown>(event: string, payload: unknown): Promise<Ack<T>>;
  close(): void;
}

/** A real Socket.IO client signed in with an access token; resolves once the floor snapshot arrives. */
export function connectSocket(url: string, token: string, track: Client[]): Promise<Client> {
  return new Promise((resolve, reject) => {
    const socket = io(url, { transports: ['websocket'], auth: { token }, reconnection: false, forceNew: true });
    const received: Client['received'] = [];
    const waiters: { event: string; match: (d: unknown) => boolean; resolve: (d: unknown) => void }[] = [];
    socket.onAny((event: keyof Events, data: unknown) => {
      received.push({ event, data });
      for (const w of [...waiters]) {
        if (w.event === event && w.match(data)) {
          waiters.splice(waiters.indexOf(w), 1);
          w.resolve(data);
        }
      }
    });
    const client: Client = {
      socket,
      me: '',
      snapshot: undefined as unknown as FloorSnapshotDto,
      received,
      waitFor: (event, match = () => true, ms = 3000) =>
        new Promise((res, rej) => {
          const hit = received.find((r) => r.event === event && match(r.data as never));
          if (hit) return res(hit.data as never);
          const t = setTimeout(() => rej(new Error(`timed out waiting for ${event}`)), ms);
          waiters.push({ event, match: match as (d: unknown) => boolean, resolve: (d) => (clearTimeout(t), res(d as never)) });
        }),
      send: (event, payload) => new Promise((res) => socket.emit(event, payload, res)),
      close: () => socket.disconnect(),
    };
    socket.once('floor:snapshot', (snap: FloorSnapshotDto) => {
      client.snapshot = snap;
      client.me = snap.me;
      track.push(client);
      resolve(client);
    });
    socket.once('connect_error', (e: Error & { data?: { code?: string } }) => reject(Object.assign(e, { code: e.data?.code })));
  });
}
