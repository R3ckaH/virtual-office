import type { PresencePersonDto, PresenceStatus, RoomDto } from '@vo/shared';
import { IDLE_AWAY_MINUTES, PRESENCE_LABELS, PRESENCE_STATUSES, ROOM_KIND_LABELS, roomAccess } from '@vo/shared';
import { clsx } from 'clsx';
import { BellRing, DoorOpen, MessageSquare, Phone, Video, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { FloorPlan } from '@/components/floor/FloorPlan';
import { StatusDot } from '@/components/presence/StatusDot';
import { Alert, Button, Dialog, PageHeader, Panel, Spinner } from '@/components/ui';
import { Avatar } from '@/components/ui/avatar';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth';
import { useCalls } from '@/lib/calls';
import { cityOf, formatRelative, formatTime } from '@/lib/format';
import { useOccupants, usePresence } from '@/lib/presence';

export function FloorPage() {
  const { user } = useAuth();
  const presence = usePresence();
  const { me, rooms, people, meetings, connection, myKnock, knockAnswer, send } = presence;
  const occupants = useOccupants();
  const toast = useToast();
  const [selected, setSelected] = useState<string | null>(null);
  const [knockRoom, setKnockRoom] = useState<RoomDto | null>(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const all = useMemo(() => Object.values(people).sort((a, b) => a.fullName.localeCompare(b.fullName)), [people]);
  const online = all.filter((p) => p.status !== 'OFFLINE' && p.roomId);
  const offline = all.filter((p) => p.status === 'OFFLINE');
  const mine = me ? people[me] : undefined;
  const accent = getComputedBrand() ?? '#2563EB';

  async function goTo(room: RoomDto) {
    if (!me || !mine) return;
    if (mine.roomId === room.id) return toast(`You’re already in ${room.name}.`);
    if (myKnock) return toast('You’re already waiting at a door.');
    const inside = (occupants.get(room.id) ?? []).filter((p) => p.userId !== me);
    if (roomAccess({ ...room, occupantCount: inside.length }, me) === 'knock') return setKnockRoom(room);
    if (inside.length >= room.capacity) return toast(`${room.name} is full right now.`, 'danger');
    const res = await send('room:enter', { roomId: room.id });
    if (!res.ok) {
      if (res.code === 'KNOCK_REQUIRED') return setKnockRoom(room);
      toast(res.message, 'danger');
    }
  }

  async function knock(room: RoomDto) {
    setKnockRoom(null);
    const res = await send('knock:send', { roomId: room.id });
    if (!res.ok) toast(res.message, 'danger');
  }

  if (connection !== 'online' && !me) {
    return (
      <>
        <PageHeader title="Office floor" />
        {connection === 'offline' ? (
          <Alert tone="warn" title="Can’t reach the office">
            The live connection isn’t available right now. Check your internet connection; the page reconnects on its own.
          </Alert>
        ) : (
          <Spinner label="Walking in…" />
        )}
      </>
    );
  }

  const selectedPerson = selected ? people[selected] : undefined;
  const knockInside = knockRoom ? (occupants.get(knockRoom.id) ?? []).filter((p) => p.userId !== me) : [];
  const waitingAt = myKnock ? rooms.find((r) => r.id === myKnock.roomId) : undefined;
  const myRoom = mine?.roomId ? rooms.find((r) => r.id === mine.roomId) : undefined;

  return (
    <>
      <PageHeader
        title="Office floor"
        description={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              {online.length} in the office · {offline.length} offline
            </span>
            {connection !== 'online' && (
              <span className="inline-flex items-center gap-1.5 text-warn" role="status">
                <span className="h-2 w-2 animate-pulse rounded-full bg-warn" aria-hidden /> Reconnecting…
              </span>
            )}
          </span>
        }
      />

      {waitingAt && (
        <div role="status" className="mb-4 flex items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 text-sm">
          <DoorOpen className="h-4 w-4 text-brand-fg" aria-hidden />
          Knock knock. Waiting for someone in {waitingAt.name} to let you in…
        </div>
      )}

      {myRoom && myRoom.kind !== 'OPEN' && myRoom.kind !== 'BREAK' && <RoomCallBar room={myRoom} others={(occupants.get(myRoom.id) ?? []).length - 1} />}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-3">
          <FloorPlan
            rooms={rooms}
            people={online}
            me={me}
            meetings={meetings}
            selectedId={selected}
            knockRoomId={myKnock?.roomId ?? null}
            admittedRoomId={knockAnswer?.accepted ? knockAnswer.roomId : null}
            accent={accent}
            onSelect={(id) => setSelected((s) => (s === id ? null : id))}
            onRoomClick={(r) => void goTo(r)}
          />
          <Legend />
          <p className="text-sm text-muted">
            Click a room and you walk there; doors slide open as you pass. Private offices need a knock. With Follow on, the camera rides behind you as you walk.
          </p>
        </div>

        <div className="space-y-4">
          {selectedPerson ? (
            <PersonCard
              person={selectedPerson}
              isMe={selectedPerson.userId === me}
              room={rooms.find((r) => r.id === selectedPerson.roomId)}
              now={now}
              onClose={() => setSelected(null)}
              onGo={(r) => void goTo(r)}
            />
          ) : (
            <Panel title="Who’s where">
              <ul className="space-y-3">
                {rooms.map((r) => {
                  const list = occupants.get(r.id) ?? [];
                  if (!list.length) return null;
                  return (
                    <li key={r.id}>
                      <p className="text-xs font-medium text-muted">{r.name}</p>
                      <ul className="mt-1 space-y-0.5">
                        {list.map((p) => (
                          <PersonRow key={p.userId} p={p} isMe={p.userId === me} onClick={() => setSelected(p.userId)} />
                        ))}
                      </ul>
                    </li>
                  );
                })}
              </ul>
              {offline.length > 0 && (
                <div className="mt-4 border-t border-line pt-3">
                  <p className="text-xs font-medium text-muted">Offline</p>
                  <ul className="mt-1 space-y-0.5">
                    {offline.map((p) => (
                      <PersonRow key={p.userId} p={p} isMe={false} onClick={() => setSelected(p.userId)} />
                    ))}
                  </ul>
                </div>
              )}
            </Panel>
          )}
          {me && <HostPanel />}
          {mine && (
            <p className="px-1 text-xs text-muted">
              Signed in as {user?.fullName}. Your status changes on its own: meeting rooms show In a meeting, the break room and timesheet breaks show On break, and {IDLE_AWAY_MINUTES} minutes without activity shows Away.
            </p>
          )}
        </div>
      </div>

      <Dialog
        open={!!knockRoom}
        onClose={() => setKnockRoom(null)}
        title={knockRoom ? `Knock on ${knockRoom.name}?` : ''}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setKnockRoom(null)}>
              Cancel
            </Button>
            <Button onClick={() => knockRoom && void knock(knockRoom)} disabled={!knockInside.length} data-autofocus>
              Knock
            </Button>
          </>
        }
      >
        {knockRoom && (
          <p className="text-sm">
            {!knockInside.length
              ? `No one is in ${knockRoom.name} right now, so there’s no one to let you in.`
              : knockInside.every((p) => p.status === 'BUSY')
                ? `${knockInside[0].fullName} is busy. You’ll walk to the door and they’ll see your knock when they’re free.`
                : `You’ll walk to the door and knock. ${knockInside.map((p) => p.fullName).join(', ')} will get a notification and can let you in.`}
          </p>
        )}
      </Dialog>
    </>
  );
}

/** The brand color as a hex string, for inline styles on the floor plan. */
function getComputedBrand(): string | null {
  if (typeof window === 'undefined') return null;
  const v = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim();
  if (!v) return null;
  const parts = v.split(/[\s,]+/).map(Number);
  if (parts.length < 3 || parts.some(Number.isNaN)) return null;
  return `#${parts
    .slice(0, 3)
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('')}`;
}

function Legend() {
  const shown: PresenceStatus[] = PRESENCE_STATUSES.filter((s) => s !== 'OFFLINE');
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted" aria-label="Status colors">
      {shown.map((s) => (
        <li key={s}>
          <StatusDot status={s} label />
        </li>
      ))}
    </ul>
  );
}

function PersonRow({ p, isMe, onClick }: { p: PresencePersonDto; isMe: boolean; onClick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-sunken">
        <StatusDot status={p.status} />
        <span className={clsx('flex-1 truncate', p.status === 'OFFLINE' && 'text-muted')}>{isMe ? `${p.fullName} (you)` : p.fullName}</span>
        {p.message && <span className="max-w-[8rem] truncate text-xs text-muted">{p.message}</span>}
      </button>
    </li>
  );
}

function PersonCard({
  person: p,
  isMe,
  room,
  now,
  onClose,
  onGo,
}: {
  person: PresencePersonDto;
  isMe: boolean;
  room: RoomDto | undefined;
  now: Date;
  onClose: () => void;
  onGo: (r: RoomDto) => void;
}) {
  const { me, people } = usePresence();
  const { callPeople, pending, active } = useCalls();
  const myRoomId = me ? people[me]?.roomId ?? null : null;
  const online = p.status !== 'OFFLINE';
  const access = room && me ? roomAccess({ ...room, occupantCount: 1 }, me) : 'enter';
  return (
    <Panel>
      <div className="flex items-start gap-3">
        <Avatar name={p.fullName} src={p.avatarUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{isMe ? `${p.fullName} (you)` : p.fullName}</p>
          <p className="text-sm text-muted">{[p.title, p.departmentName].filter(Boolean).join(' · ') || '—'}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-md p-1 text-muted hover:bg-sunken hover:text-ink" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Status</dt>
          <dd>
            <StatusDot status={p.status} label />
          </dd>
        </div>
        {p.message && (
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Message</dt>
            <dd className="text-right">{p.message}</dd>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Local time</dt>
          <dd className="tabular">
            {formatTime(now, p.timezone)} <span className="text-muted">in {cityOf(p.timezone)}</span>
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">{online ? 'Where' : 'Last seen'}</dt>
          <dd className="text-right">{online ? room?.name ?? 'Walking' : p.lastSeenAt ? formatRelative(p.lastSeenAt) : 'Not yet'}</dd>
        </div>
      </dl>
      {!isMe && (
        <div className="mt-4 flex flex-wrap gap-2">
          {online && room && room.id !== myRoomId && (
            <Button size="sm" onClick={() => onGo(room)}>
              {access === 'knock' ? `Knock on ${room.name}` : `Go to ${room.name}`}
            </Button>
          )}
          <Button size="sm" variant="secondary" disabled title="Chat arrives in Phase 5">
            <MessageSquare className="h-4 w-4" aria-hidden /> Message
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={!online || !!active}
            loading={pending === p.userId}
            title={!online ? `${p.fullName} is offline` : active ? 'Leave your current call first' : undefined}
            onClick={() => void callPeople([p.userId], [p.fullName])}
          >
            <Phone className="h-4 w-4" aria-hidden /> Call
          </Button>
        </div>
      )}
      {!isMe && online && p.status === 'BUSY' && <p className="mt-2 text-xs text-muted">{p.fullName.split(' ')[0]} is busy. Call only if it can’t wait.</p>}
      {!isMe && <p className="mt-2 text-xs text-muted">Messages arrive with Chat.</p>}
    </Panel>
  );
}

/** In a meeting room or office: the room's own video call, for people who aren't on the floor together in person. */
function RoomCallBar({ room, others }: { room: RoomDto; others: number }) {
  const { joinRoomCall, pending, active } = useCalls();
  const inThisCall = active?.kind === 'ROOM' && active.title === `${room.name} call`;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 text-sm">
      <Video className="h-4 w-4 text-brand-fg" aria-hidden />
      <span className="flex-1">
        You’re in <strong className="font-semibold">{room.name}</strong>
        {others > 0 ? ` with ${others} ${others === 1 ? 'other person' : 'others'}.` : '.'} Start a video call here and anyone who walks in can join.
      </span>
      <Button size="sm" onClick={() => void joinRoomCall(room.id)} loading={pending === room.id} disabled={!!active}>
        {inThisCall ? 'In the call' : 'Join the room call'}
      </Button>
    </div>
  );
}

/** For room owners (e.g. the Senior Pastor): call people to your room, and end the meeting to send them back. */
function HostPanel() {
  const { me, rooms, people, meetings, send } = usePresence();
  const toast = useToast();
  const hostRooms = rooms.filter((r) => r.ownerId === me && (r.kind === 'LEADERS' || r.memberIds.length > 0));
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  if (!hostRooms.length) return null;

  return (
    <>
      {hostRooms.map((room) => {
        const meeting = meetings.find((m) => m.roomId === room.id);
        const members = room.memberIds.map((id) => people[id]).filter(Boolean);
        const here = members.filter((p) => p.roomId === room.id);
        const callable = members.filter((p) => p.status !== 'OFFLINE' && p.roomId !== room.id);
        const chosen = callable.filter((p) => picked[p.userId]).map((p) => p.userId);

        async function call(ids: string[]) {
          setBusy(true);
          const res = await send<'summon:send', { sent: number; offline: string[] }>('summon:send', { roomId: room.id, userIds: ids });
          setBusy(false);
          if (!res.ok) return toast(res.message, 'danger');
          setPicked({});
          const n = res.data?.sent ?? 0;
          toast(n ? `Called ${n} ${n === 1 ? 'person' : 'people'} to ${room.name}. They’ve been notified.` : 'Everyone you called is already here or offline.');
        }
        async function end() {
          setBusy(true);
          const res = await send('meeting:end', { roomId: room.id });
          setBusy(false);
          if (!res.ok) return toast(res.message, 'danger');
          toast('Meeting ended. Everyone is heading back.');
        }

        return (
          <Panel
            key={room.id}
            title={
              <span className="inline-flex items-center gap-2">
                <BellRing className="h-4 w-4 text-warn" aria-hidden /> {room.name}
              </span>
            }
            description={`${ROOM_KIND_LABELS[room.kind]} · ${here.length} of ${members.length} members here`}
          >
            {meeting && (
              <p className="mb-3 rounded-lg bg-warn/10 px-3 py-2 text-sm">
                In session{meeting.pendingIds.length ? ` · waiting for ${meeting.pendingIds.map((id) => people[id]?.fullName.split(' ')[0]).filter(Boolean).join(', ')}` : ''}
              </p>
            )}
            {members.length === 0 ? (
              <p className="text-sm text-muted">Add members to this room on the Rooms page to call them here.</p>
            ) : (
              <ul className="space-y-1">
                {members.map((p) => {
                  const canCall = p.status !== 'OFFLINE' && p.roomId !== room.id;
                  return (
                    <li key={p.userId}>
                      <label className={clsx('flex items-center gap-2 rounded-md px-1.5 py-1 text-sm', canCall ? 'cursor-pointer hover:bg-sunken' : 'opacity-70')}>
                        <input type="checkbox" disabled={!canCall} checked={!!picked[p.userId]} onChange={(e) => setPicked((s) => ({ ...s, [p.userId]: e.target.checked }))} className="h-4 w-4 accent-[rgb(var(--brand))]" />
                        <span className="flex-1 truncate">{p.fullName}</span>
                        <span className="text-xs text-muted">{p.roomId === room.id ? 'Here' : PRESENCE_LABELS[p.status]}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" disabled={!chosen.length} loading={busy} onClick={() => void call(chosen)}>
                Call selected
              </Button>
              <Button size="sm" variant="secondary" disabled={!callable.length || busy} onClick={() => void call(callable.map((p) => p.userId))}>
                Call everyone online
              </Button>
              {meeting && (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void end()}>
                  End meeting
                </Button>
              )}
            </div>
          </Panel>
        );
      })}
    </>
  );
}
