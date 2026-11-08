import type { PresenceStatus } from '@vo/shared';
import { PRESENCE_LABELS } from '@vo/shared';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Panel } from '@/components/ui';
import { Avatar } from '@/components/ui/avatar';
import { usePresence } from '@/lib/presence';
import { StatusDot } from './StatusDot';

const ORDER: PresenceStatus[] = ['AVAILABLE', 'IN_MEETING', 'BUSY', 'ON_BREAK', 'AWAY'];

/** Home: who's in the office right now, with a way onto the floor. */
export function OfficeNowCard() {
  const { people, rooms, me, connection } = usePresence();
  const online = Object.values(people).filter((p) => p.status !== 'OFFLINE' && p.userId !== me);
  const counts = ORDER.map((s) => [s, online.filter((p) => p.status === s).length] as const).filter(([, n]) => n > 0);
  const mine = me ? people[me] : undefined;
  const myRoom = rooms.find((r) => r.id === mine?.roomId);

  return (
    <Panel
      title="In the office now"
      description={myRoom ? `You’re in ${myRoom.name}.` : connection === 'online' ? undefined : 'Connecting to the office…'}
      action={
        <Link to="/floor" className="inline-flex items-center gap-1 text-sm font-medium text-brand-fg hover:underline">
          Open the floor <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      }
    >
      {online.length === 0 ? (
        <p className="text-sm text-muted">{connection === 'online' ? 'No one else is here yet.' : ' '}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <ul className="flex -space-x-2" aria-label="People in the office">
            {online.slice(0, 8).map((p) => (
              <li key={p.userId} title={`${p.fullName}, ${PRESENCE_LABELS[p.status]}`} className="rounded-full ring-2 ring-surface">
                <Avatar name={p.fullName} src={p.avatarUrl} size="sm" />
              </li>
            ))}
            {online.length > 8 && <li className="flex h-7 w-7 items-center justify-center rounded-full bg-sunken text-2xs font-semibold ring-2 ring-surface">+{online.length - 8}</li>}
          </ul>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {counts.map(([s, n]) => (
              <li key={s} className="inline-flex items-center gap-1.5">
                <StatusDot status={s} />
                <span className="font-medium tabular">{n}</span> <span className="text-muted">{PRESENCE_LABELS[s].toLowerCase()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}
