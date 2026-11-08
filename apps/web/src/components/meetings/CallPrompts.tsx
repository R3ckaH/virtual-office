import { CalendarClock, Phone, PhoneOff } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@/components/ui';
import { useCalls } from '@/lib/calls';
import { formatTime } from '@/lib/format';

/** A soft ring (two short tones) while a call is waiting, using Web Audio so there's no sound file to load. */
function useRingTone(on: boolean) {
  useEffect(() => {
    if (!on) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    let ctx: AudioContext | null = null;
    try {
      ctx = new Ctx();
    } catch {
      return;
    }
    const beep = () => {
      if (!ctx) return;
      for (const [at, freq] of [[0, 660], [0.25, 880]] as const) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
        g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.2);
        o.connect(g).connect(ctx.destination);
        o.start(ctx.currentTime + at);
        o.stop(ctx.currentTime + at + 0.22);
      }
    };
    beep();
    const t = window.setInterval(beep, 2500);
    return () => {
      window.clearInterval(t);
      void ctx?.close();
    };
  }, [on]);
}

/** Calls ringing for you and "starting soon" reminders, shown wherever you are in the app. */
export function CallPrompts() {
  const { incoming, reminders, answer, decline, joinMeeting, dismissReminder, pending, active } = useCalls();
  useRingTone(incoming.length > 0);
  const soon = reminders.filter((r) => r.meetingId !== active?.meetingId);
  if (!incoming.length && !soon.length) return null;
  return (
    <div aria-live="assertive" className="fixed left-1/2 top-4 z-50 flex w-[min(30rem,calc(100%-2rem))] -translate-x-1/2 flex-col gap-2">
      {incoming.map((c) => (
        <div key={c.meetingId} role="alertdialog" aria-label={`${c.fromName} is calling`} className="flex items-center gap-3 rounded-card border border-ok/40 bg-surface p-4 shadow-2xl">
          <span className="flex h-10 w-10 shrink-0 animate-pulse items-center justify-center rounded-full bg-ok/15 text-ok">
            <Phone className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{c.fromName} is calling</p>
            <p className="text-sm text-muted">Video call</p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => void decline(c.meetingId)} aria-label={`Decline call from ${c.fromName}`}>
            <PhoneOff className="h-4 w-4" aria-hidden /> <span className="max-sm:sr-only">Decline</span>
          </Button>
          <Button size="sm" onClick={() => void answer(c.meetingId)} loading={pending === c.meetingId} data-autofocus>
            <Phone className="h-4 w-4" aria-hidden /> Answer
          </Button>
        </div>
      ))}
      {soon.map((r) => (
        <div key={r.meetingId} role="alertdialog" aria-label={`${r.title} starts soon`} className="flex items-center gap-3 rounded-card border border-line bg-surface p-4 shadow-xl">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand-fg">
            <CalendarClock className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-sm font-semibold">{r.title}</p>
            <p className="text-sm text-muted">Starts at {formatTime(new Date(r.start))}</p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => dismissReminder(r.meetingId)}>
            Later
          </Button>
          <Button size="sm" onClick={() => void joinMeeting(r.meetingId)} loading={pending === r.meetingId}>
            Join
          </Button>
        </div>
      ))}
    </div>
  );
}
