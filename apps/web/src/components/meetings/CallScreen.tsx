import '@livekit/components-styles';
import {
  CarouselLayout,
  Chat,
  ConnectionStateToast,
  FocusLayout,
  FocusLayoutContainer,
  GridLayout,
  LayoutContextProvider,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  StartAudio,
  TrackToggle,
  useLocalParticipant,
  useParticipantAttributes,
  useParticipants,
  useRoomContext,
  useTracks,
} from '@livekit/components-react';
import type { JoinDto } from '@vo/shared';
import { clsx } from 'clsx';
import { Circle, Hand, Maximize2, MessageSquare, Mic, MicOff, Minimize2, PhoneOff, Users, X } from 'lucide-react';
import { ConnectionState, Participant, RoomEvent, RoomOptions, Track } from 'livekit-client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';
import { useCalls } from '@/lib/calls';

/** The call you're in. Stays mounted while you browse the app (minimized to a bar), so audio keeps going. */
export function CallScreen() {
  const { active, left } = useCalls();
  const toast = useToast();
  const onError = useCallback((e: Error) => toast(e.message || 'The call ran into a problem.', 'danger'), [toast]);
  if (!active) return null;
  return (
    <LiveKitRoom
      key={`${active.meetingId}:${active.occurrenceStart}`}
      serverUrl={active.url}
      token={active.token}
      connect
      options={ROOM_OPTIONS}
      audio={false}
      video={false}
      onDisconnected={left}
      onError={onError}
      data-lk-theme="default"
      style={{ display: 'contents' }}
    >
      <CallBody join={active} />
    </LiveKitRoom>
  );
}

/**
 * Two peer connections (publish + subscribe): the long-standing mode every LiveKit server supports,
 * including self-hosted ones older than the single-connection signalling.
 */
const ROOM_OPTIONS: RoomOptions = { singlePeerConnection: false, adaptiveStream: true, dynacast: true };

type Panel = 'people' | 'chat' | null;

const isHost = (p: Participant) => {
  try {
    return !!JSON.parse(p.metadata || '{}').host;
  } catch {
    return false;
  }
};

function useElapsed() {
  const started = useRef(Date.now());
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const s = Math.floor((now - started.current) / 1000);
  const hh = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return hh ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
}

function CallBody({ join }: { join: JoinDto }) {
  const { minimized, setMinimized, ringing, answered } = useCalls();
  const room = useRoomContext();
  const toast = useToast();
  const participants = useParticipants();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const [panel, setPanel] = useState<Panel>(null);
  const [recording, setRecording] = useState(join.recording);
  const [recBusy, setRecBusy] = useState(false);
  const elapsed = useElapsed();
  const myAttrs = useParticipantAttributes({ participant: localParticipant });
  const handUp = !!myAttrs.attributes?.hand;
  const others = participants.length - 1;

  useEffect(() => {
    if (others > 0 && ringing.length) answered();
  }, [others, ringing.length, answered]);

  // Turn the mic on once connected (camera stays off until you choose). Done here rather than through
  // LiveKitRoom's audio prop so a slow or retried connection can't skip it.
  const micStarted = useRef(false);
  useEffect(() => {
    const start = () => {
      if (micStarted.current || room.state !== ConnectionState.Connected) return;
      micStarted.current = true;
      void room.localParticipant
        .setMicrophoneEnabled(true)
        .catch(() => toast('Your microphone isn’t available. Check the browser’s permission for this site, then press Unmute.', 'danger'));
    };
    start();
    room.on(RoomEvent.Connected, start);
    return () => {
      room.off(RoomEvent.Connected, start);
    };
  }, [room, toast]);

  useEffect(() => {
    const onRec = (on: boolean) => setRecording(on);
    const onAttrs = (changed: Record<string, string>, p: Participant) => {
      if (p !== localParticipant && changed.hand) toast(`${p.name || 'Someone'} raised their hand`);
    };
    room.on(RoomEvent.RecordingStatusChanged, onRec);
    room.on(RoomEvent.ParticipantAttributesChanged, onAttrs);
    return () => {
      room.off(RoomEvent.RecordingStatusChanged, onRec);
      room.off(RoomEvent.ParticipantAttributesChanged, onAttrs);
    };
  }, [room, localParticipant, toast]);

  // the full-screen call is modal: the app behind it can't be tabbed into
  useEffect(() => {
    const shell = document.getElementById('app-shell');
    if (!shell || minimized) return;
    shell.setAttribute('inert', '');
    return () => shell.removeAttribute('inert');
  }, [minimized]);

  // Esc returns to the app without leaving the call
  useEffect(() => {
    if (minimized) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('dialog[open]')) setMinimized(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [minimized, setMinimized]);

  async function toggleHand() {
    await localParticipant.setAttributes({ hand: handUp ? '' : String(Date.now()) }).catch(() => toast('Couldn’t raise your hand. Try again.', 'danger'));
  }

  async function toggleRecording() {
    setRecBusy(true);
    try {
      await api(`/meetings/${join.meetingId}/recording/${recording ? 'stop' : 'start'}`, { method: 'POST' });
      setRecording(!recording);
      toast(recording ? 'Recording stopped. It will appear on the meeting once it’s processed.' : 'Recording started. Everyone in the call can see that.');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Couldn’t change the recording.', 'danger');
    } finally {
      setRecBusy(false);
    }
  }

  const leave = () => void room.disconnect();

  return (
    <LayoutContextProvider>
      <RoomAudioRenderer />
      {minimized ? (
        <MiniBar title={join.title} count={participants.length} elapsed={elapsed} recording={recording} />
      ) : (
        <section role="dialog" aria-modal="true" aria-label={`Call: ${join.title}`} className="fixed inset-0 z-40 flex flex-col bg-[#0f1115] text-white">
          <header className="flex items-center gap-3 border-b border-white/10 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold">{join.title}</h2>
              <p className="text-xs text-white/60">
                {elapsed} · {participants.length} {participants.length === 1 ? 'person' : 'people'}
              </p>
            </div>
            {recording && (
              <span className="flex items-center gap-1.5 rounded-full bg-red-600/20 px-2.5 py-1 text-xs font-medium text-red-300" role="status">
                <Circle className="h-2.5 w-2.5 fill-red-500 text-red-500" aria-hidden /> Recording
              </span>
            )}
            <button type="button" onClick={() => setMinimized(true)} className="rounded-lg p-2 text-white/80 hover:bg-white/10 hover:text-white" aria-label="Back to the office (keep the call going)" title="Back to the office (Esc)">
              <Minimize2 className="h-5 w-5" />
            </button>
          </header>

          <div className="flex min-h-0 flex-1">
            <div className="relative min-w-0 flex-1 p-2">
              {ringing.length > 0 && others === 0 && (
                <div className="absolute inset-x-0 top-6 z-10 mx-auto w-fit rounded-full bg-white/10 px-4 py-2 text-sm backdrop-blur" role="status">
                  Calling {ringing.join(', ')}…
                </div>
              )}
              <Stage />
              <StartAudio label="Click to hear the call" className="absolute bottom-4 left-1/2 -translate-x-1/2" />
              <ConnectionStateToast />
            </div>
            {panel && (
              <aside className="flex w-full max-w-sm flex-col border-l border-white/10 bg-[#15181e] max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:z-20" aria-label={panel === 'people' ? 'People in the call' : 'Chat'}>
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
                  <h3 className="text-sm font-semibold">{panel === 'people' ? `People (${participants.length})` : 'Chat'}</h3>
                  <button type="button" onClick={() => setPanel(null)} className="rounded p-1 text-white/70 hover:bg-white/10" aria-label="Close panel">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {panel === 'people' ? <People /> : <Chat className="min-h-0 flex-1" />}
              </aside>
            )}
          </div>

          <footer className="flex flex-wrap items-center justify-center gap-2 border-t border-white/10 px-3 py-3" aria-label="Call controls">
            <TrackToggle source={Track.Source.Microphone} className="vo-ctl" showIcon>
              <span className="max-sm:sr-only">{isMicrophoneEnabled ? 'Mute' : 'Unmute'}</span>
            </TrackToggle>
            <TrackToggle source={Track.Source.Camera} className="vo-ctl" showIcon>
              <span className="max-sm:sr-only">Camera</span>
            </TrackToggle>
            <TrackToggle source={Track.Source.ScreenShare} className="vo-ctl max-sm:hidden" showIcon captureOptions={{ audio: true, selfBrowserSurface: 'exclude' }}>
              <span>Share screen</span>
            </TrackToggle>
            <button type="button" className="vo-ctl" aria-pressed={handUp} onClick={() => void toggleHand()}>
              <Hand className="h-5 w-5" aria-hidden />
              <span className="max-sm:sr-only">{handUp ? 'Lower hand' : 'Raise hand'}</span>
            </button>
            <button type="button" className="vo-ctl" aria-pressed={panel === 'people'} onClick={() => setPanel(panel === 'people' ? null : 'people')}>
              <Users className="h-5 w-5" aria-hidden />
              <span className="max-sm:sr-only">People</span>
            </button>
            <button type="button" className="vo-ctl" aria-pressed={panel === 'chat'} onClick={() => setPanel(panel === 'chat' ? null : 'chat')}>
              <MessageSquare className="h-5 w-5" aria-hidden />
              <span className="max-sm:sr-only">Chat</span>
            </button>
            {join.canRecord && (
              <button type="button" className="vo-ctl" aria-pressed={recording} disabled={recBusy} onClick={() => void toggleRecording()}>
                <Circle className={clsx('h-5 w-5', recording && 'fill-red-500 text-red-500')} aria-hidden />
                <span className="max-sm:sr-only">{recording ? 'Stop recording' : 'Record'}</span>
              </button>
            )}
            <button type="button" className="vo-ctl vo-ctl-danger" onClick={leave}>
              <PhoneOff className="h-5 w-5" aria-hidden />
              <span>Leave</span>
            </button>
          </footer>
        </section>
      )}
    </LayoutContextProvider>
  );
}

/** Screen shares get the stage; otherwise everyone in a grid. */
function Stage() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { updateOnlyOn: [RoomEvent.ActiveSpeakersChanged], onlySubscribed: false },
  );
  const share = tracks.find((t) => t.source === Track.Source.ScreenShare && t.publication?.isSubscribed !== false);
  if (share) {
    const rest = tracks.filter((t) => t !== share);
    return (
      <FocusLayoutContainer className="h-full">
        <CarouselLayout tracks={rest}>
          <Tile />
        </CarouselLayout>
        <FocusLayout trackRef={share} />
      </FocusLayoutContainer>
    );
  }
  return (
    <GridLayout tracks={tracks} className="h-full">
      <Tile />
    </GridLayout>
  );
}

function Tile() {
  return <ParticipantTile className="vo-tile" />;
}

function People() {
  const participants = useParticipants();
  const sorted = useMemo(
    () =>
      [...participants].sort((a, b) => {
        const ha = Number(a.attributes?.hand || 0);
        const hb = Number(b.attributes?.hand || 0);
        if (!!ha !== !!hb) return ha ? -1 : 1;
        if (ha && hb) return ha - hb;
        return (a.name || '').localeCompare(b.name || '');
      }),
    [participants],
  );
  return (
    <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
      {sorted.map((p) => (
        <li key={p.identity} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold" aria-hidden>
            {(p.name || '?')
              .split(' ')
              .map((w) => w[0])
              .slice(0, 2)
              .join('')}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm">
              {p.name || 'Guest'}
              {p.isLocal && <span className="text-white/50"> (you)</span>}
            </span>
            {isHost(p) && <span className="text-xs text-white/50">Host</span>}
          </span>
          {p.attributes?.hand && <Hand className="h-4 w-4 text-amber-300" aria-label="Hand raised" />}
          {p.isMicrophoneEnabled ? <Mic className="h-4 w-4 text-white/70" aria-label="Mic on" /> : <MicOff className="h-4 w-4 text-white/40" aria-label="Muted" />}
        </li>
      ))}
    </ul>
  );
}

function MiniBar({ title, count, elapsed, recording }: { title: string; count: number; elapsed: string; recording: boolean }) {
  const { setMinimized } = useCalls();
  const room = useRoomContext();
  const { isMicrophoneEnabled, localParticipant } = useLocalParticipant();
  return (
    <div role="region" aria-label="Call in progress" className="fixed bottom-4 left-4 z-40 flex max-w-[calc(100%-2rem)] items-center gap-2 rounded-full bg-[#0f1115] py-1.5 pl-4 pr-1.5 text-white shadow-2xl">
      {recording && <Circle className="h-2.5 w-2.5 shrink-0 fill-red-500 text-red-500" aria-label="Recording" />}
      <button type="button" onClick={() => setMinimized(false)} className="min-w-0 text-left" title="Back to the call">
        <span className="block max-w-[14rem] truncate text-sm font-medium">{title}</span>
        <span className="block text-xs text-white/60">
          {elapsed} · {count} in call
        </span>
      </button>
      <button
        type="button"
        onClick={() => void localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}
        className="rounded-full p-2 hover:bg-white/10"
        aria-label={isMicrophoneEnabled ? 'Mute' : 'Unmute'}
        aria-pressed={!isMicrophoneEnabled}
      >
        {isMicrophoneEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4 text-red-300" />}
      </button>
      <button type="button" onClick={() => setMinimized(false)} className="rounded-full p-2 hover:bg-white/10" aria-label="Open the call">
        <Maximize2 className="h-4 w-4" />
      </button>
      <button type="button" onClick={() => void room.disconnect()} className="rounded-full bg-red-600 p-2 hover:bg-red-500" aria-label="Leave the call">
        <PhoneOff className="h-4 w-4" />
      </button>
    </div>
  );
}
