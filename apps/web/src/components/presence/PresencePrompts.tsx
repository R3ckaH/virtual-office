import { BellRing, DoorOpen } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { usePresence } from '@/lib/presence';

/**
 * Knocks on your room and invitations to a meeting, shown wherever you are in the app.
 * Answers to your own knocks arrive as toasts.
 */
export function PresencePrompts() {
  const { knocks, summons, rooms, knockAnswer, send, dismissSummon } = usePresence();
  const toast = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const lastAnswer = useRef<typeof knockAnswer>(null);

  useEffect(() => {
    if (!knockAnswer || knockAnswer === lastAnswer.current) return;
    lastAnswer.current = knockAnswer;
    const room = rooms.find((r) => r.id === knockAnswer.roomId)?.name ?? 'the room';
    toast(knockAnswer.accepted ? `${knockAnswer.byName} let you into ${room}.` : `${knockAnswer.byName} can’t let you into ${room} right now.`, knockAnswer.accepted ? 'ok' : 'danger');
  }, [knockAnswer, rooms, toast]);

  if (!knocks.length && !summons.length) return null;
  const roomName = (id: string) => rooms.find((r) => r.id === id)?.name ?? 'your room';

  async function answer(kind: 'knock' | 'summon', id: string, accept: boolean) {
    setBusy(id);
    const res = await send(kind === 'knock' ? 'knock:answer' : 'summon:answer', { id, accept });
    setBusy(null);
    if (kind === 'summon') dismissSummon(id);
    if (!res.ok) return toast(res.message, 'danger');
    if (kind === 'summon' && accept) navigate('/floor');
  }

  return (
    <div aria-live="assertive" className="fixed bottom-4 left-1/2 z-50 flex w-[min(26rem,calc(100%-2rem))] -translate-x-1/2 flex-col gap-2 lg:left-auto lg:right-4 lg:translate-x-0">
      {knocks.map((k) => (
        <div key={k.id} role="alertdialog" aria-label={`${k.fromName} is knocking`} className="flex items-start gap-3 rounded-card border border-line bg-surface p-4 shadow-xl">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand-fg">
            <DoorOpen className="h-5 w-5" aria-hidden />
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold">{k.fromName} is knocking</p>
            <p className="text-sm text-muted">at the door of {roomName(k.roomId)}</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => void answer('knock', k.id, true)} loading={busy === k.id} data-autofocus>
                Let them in
              </Button>
              <Button size="sm" variant="secondary" onClick={() => void answer('knock', k.id, false)} disabled={busy === k.id}>
                Not now
              </Button>
            </div>
          </div>
        </div>
      ))}
      {summons.map((s) => (
        <div key={s.id} role="alertdialog" aria-label={`${s.hostName} is calling you`} className="flex items-start gap-3 rounded-card border border-warn/40 bg-surface p-4 shadow-xl">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warn/15 text-warn">
            <BellRing className="h-5 w-5" aria-hidden />
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold">{s.hostName} is calling you</p>
            <p className="text-sm text-muted">to a meeting in {s.roomName}</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => void answer('summon', s.id, true)} loading={busy === s.id}>
                Join now
              </Button>
              <Button size="sm" variant="secondary" onClick={() => void answer('summon', s.id, false)} disabled={busy === s.id}>
                Not now
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
