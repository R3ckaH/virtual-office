import type { AttendanceRowDto, MeetingDto, RecordingDto, Rsvp } from '@vo/shared';
import { currentOccurrence, JOIN_EARLY_MINUTES, JOIN_LATE_MINUTES, RECURRENCE_LABELS, RSVP_LABELS } from '@vo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { CalendarPlus, Download, Pencil, Repeat, Video } from 'lucide-react';
import { useState } from 'react';
import { Alert, Badge, Button, Dialog, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, ApiError, tokenStore } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCalls } from '@/lib/calls';
import { cityOf, formatDateTime } from '@/lib/format';
import { usePresence } from '@/lib/presence';
import { ScheduleDialog } from './ScheduleDialog';

const RSVP_TONE: Record<Rsvp, 'neutral' | 'ok' | 'warn' | 'danger'> = { PENDING: 'neutral', ACCEPTED: 'ok', TENTATIVE: 'warn', DECLINED: 'danger' };

export function whenLabel(startIso: string, minutes: number, tz: string) {
  const start = new Date(startIso);
  const end = new Date(start.getTime() + minutes * 60_000);
  const day = new Intl.DateTimeFormat(undefined, { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric' }).format(start);
  const t = new Intl.DateTimeFormat(undefined, { timeZone: tz, hour: 'numeric', minute: '2-digit' });
  return `${day}, ${t.format(start)} – ${t.format(end)}`;
}

const duration = (s: number) => (s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`);

async function downloadIcs(id: string, title: string) {
  const res = await fetch(`/api/meetings/${id}/ics`, { headers: { authorization: `Bearer ${tokenStore.get()}` }, credentials: 'same-origin' });
  if (!res.ok) throw new Error('Couldn’t get the calendar file.');
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title.replace(/[^\w\- ]+/g, '').trim() || 'meeting'}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

/** A meeting's details: when, who, your reply, join, and for the host: edit, cancel, attendance and recordings. */
export function MeetingDetails({ meetingId, occurrence, onClose }: { meetingId: string | null; occurrence?: string | null; onClose: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { joinMeeting, pending, active } = useCalls();
  const { rooms } = usePresence();
  const [tab, setTab] = useState<'details' | 'attendance' | 'recordings'>('details');
  const [editing, setEditing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const q = useQuery({ queryKey: ['meetings', 'one', meetingId], queryFn: () => api<MeetingDto>(`/meetings/${meetingId}`), enabled: !!meetingId });
  const m = q.data;
  const canSeeAttendance = !!m && (m.hostId === user!.id || user!.role === 'ADMIN' || user!.role === 'HR');
  const attendance = useQuery({ queryKey: ['meetings', 'attendance', meetingId], queryFn: () => api<AttendanceRowDto[]>(`/meetings/${meetingId}/attendance`), enabled: !!meetingId && tab === 'attendance' && canSeeAttendance });
  const recordings = useQuery({ queryKey: ['meetings', 'recordings', meetingId], queryFn: () => api<RecordingDto[]>(`/meetings/${meetingId}/recordings`), enabled: !!meetingId && tab === 'recordings' });

  const respond = useMutation({
    mutationFn: (response: Rsvp) => api<MeetingDto>(`/meetings/${meetingId}/respond`, { method: 'POST', json: { response } }),
    onSuccess: (d) => {
      qc.setQueryData(['meetings', 'one', meetingId], d);
      void qc.invalidateQueries({ queryKey: ['meetings', 'range'] });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Couldn’t save your reply.', 'danger'),
  });
  const cancel = useMutation({
    mutationFn: () => api(`/meetings/${meetingId}/cancel`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['meetings'] });
      toast('Meeting cancelled. Invitees were told.');
      setConfirmCancel(false);
      onClose();
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Couldn’t cancel the meeting.', 'danger'),
  });

  const close = () => {
    setTab('details');
    onClose();
  };

  if (!meetingId) return null;
  const tz = user!.timezone;
  const now = new Date();
  const live = m && m.status === 'ACTIVE' ? currentOccurrence(m, now, JOIN_EARLY_MINUTES * 60_000, JOIN_LATE_MINUTES * 60_000) : null;
  const shownStart = occurrence ?? live?.toISOString() ?? m?.startsAt;
  const room = m?.officeRoomId ? rooms.find((r) => r.id === m.officeRoomId) : undefined;
  const isInvitee = m?.myResponse !== null && m?.myResponse !== undefined;
  const replies = m ? (['ACCEPTED', 'TENTATIVE', 'PENDING', 'DECLINED'] as Rsvp[]).map((r) => [r, m.invitees.filter((i) => i.response === r).length] as const).filter(([, n]) => n) : [];

  return (
    <>
      <Dialog
        open={!!meetingId && !editing}
        onClose={close}
        title={m?.title ?? 'Meeting'}
        description={m?.status === 'CANCELLED' ? 'This meeting was cancelled.' : m && shownStart ? whenLabel(shownStart, m.durationMinutes, tz) : undefined}
        size="lg"
        footer={
          m && m.status === 'ACTIVE' ? (
            <>
              {m.canEdit && (
                <Button variant="ghost" className="mr-auto text-danger" onClick={() => setConfirmCancel(true)}>
                  Cancel meeting
                </Button>
              )}
              <Button variant="secondary" onClick={() => void downloadIcs(m.id, m.title).catch((e: Error) => toast(e.message, 'danger'))}>
                <CalendarPlus className="h-4 w-4" aria-hidden /> <span className="max-sm:sr-only">Add to calendar</span>
              </Button>
              {m.canEdit && (
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  <Pencil className="h-4 w-4" aria-hidden /> Edit
                </Button>
              )}
              <Button onClick={() => void joinMeeting(m.id).then(close)} disabled={!live || !!active} loading={pending === m.id} title={!live ? `You can join from ${JOIN_EARLY_MINUTES} minutes before it starts.` : undefined} data-autofocus>
                <Video className="h-4 w-4" aria-hidden /> {m.liveCount ? `Join (${m.liveCount} in the call)` : 'Join'}
              </Button>
            </>
          ) : undefined
        }
      >
        {q.isLoading ? (
          <Spinner />
        ) : q.isError || !m ? (
          <Alert>{q.error instanceof ApiError ? q.error.message : 'Couldn’t load this meeting.'}</Alert>
        ) : (
          <div className="space-y-4">
            {(canSeeAttendance || m.kind === 'SCHEDULED') && (
              <div role="tablist" aria-label="Meeting" className="flex gap-1 border-b border-line">
                {(['details', ...(canSeeAttendance ? ['attendance'] : []), 'recordings'] as const).map((t) => (
                  <button
                    key={t}
                    role="tab"
                    type="button"
                    aria-selected={tab === t}
                    onClick={() => setTab(t as typeof tab)}
                    className={clsx('-mb-px border-b-2 px-3 py-2 text-sm font-medium capitalize', tab === t ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink')}
                  >
                    {t === 'attendance' ? 'Who attended' : t}
                  </button>
                ))}
              </div>
            )}

            {tab === 'details' && (
              <div className="space-y-4 text-sm">
                <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2">
                  <dt className="text-muted">Host</dt>
                  <dd>{m.hostName}</dd>
                  {m.recurrence !== 'NONE' && (
                    <>
                      <dt className="text-muted">Repeats</dt>
                      <dd className="inline-flex items-center gap-1.5">
                        <Repeat className="h-3.5 w-3.5 text-muted" aria-hidden />
                        {RECURRENCE_LABELS[m.recurrence]}
                        {m.recurrenceUntil ? ` until ${new Date(`${m.recurrenceUntil}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
                      </dd>
                    </>
                  )}
                  {m.timezone !== tz && (
                    <>
                      <dt className="text-muted">Host’s time</dt>
                      <dd>{shownStart && whenLabel(shownStart, m.durationMinutes, m.timezone)} in {cityOf(m.timezone)}</dd>
                    </>
                  )}
                  {room && (
                    <>
                      <dt className="text-muted">Room</dt>
                      <dd>{room.name}</dd>
                    </>
                  )}
                </dl>
                {m.description && <p className="whitespace-pre-wrap rounded-lg bg-sunken px-3 py-2">{m.description}</p>}

                {isInvitee && m.status === 'ACTIVE' && (
                  <fieldset>
                    <legend className="mb-2 font-medium">Going?</legend>
                    <div className="flex flex-wrap gap-2">
                      {(['ACCEPTED', 'TENTATIVE', 'DECLINED'] as const).map((r) => (
                        <Button key={r} size="sm" variant={m.myResponse === r ? 'primary' : 'secondary'} aria-pressed={m.myResponse === r} onClick={() => respond.mutate(r)} disabled={respond.isPending}>
                          {r === 'ACCEPTED' ? 'Yes' : r === 'TENTATIVE' ? 'Maybe' : 'No'}
                        </Button>
                      ))}
                    </div>
                  </fieldset>
                )}

                <div>
                  <p className="mb-2 font-medium">
                    {m.invitees.length} invited{replies.length ? ` · ${replies.map(([r, n]) => `${n} ${RSVP_LABELS[r].toLowerCase()}`).join(', ')}` : ''}
                  </p>
                  {m.invitees.length > 0 && (
                    <ul className="divide-y divide-line rounded-lg border border-line">
                      {m.invitees.map((i) => (
                        <li key={i.userId} className="flex items-center justify-between gap-3 px-3 py-2">
                          <span>{i.fullName}</span>
                          <Badge tone={RSVP_TONE[i.response]}>{RSVP_LABELS[i.response]}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {tab === 'attendance' &&
              (attendance.isLoading ? (
                <Spinner />
              ) : !attendance.data?.length ? (
                <p className="text-sm text-muted">No one has joined this meeting yet. Attendance appears here as people join the call.</p>
              ) : (
                <AttendanceTable rows={attendance.data} tz={tz} />
              ))}

            {tab === 'recordings' &&
              (recordings.isLoading ? (
                <Spinner />
              ) : !recordings.data?.length ? (
                <p className="text-sm text-muted">No recordings. When recording is turned on for the company, the host can record from the call.</p>
              ) : (
                <ul className="divide-y divide-line rounded-lg border border-line text-sm">
                  {recordings.data.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 px-3 py-2">
                      <span className="flex-1">
                        {formatDateTime(r.startedAt, tz)} <span className="text-muted">· by {r.startedByName}</span>
                        {r.durationSeconds ? <span className="text-muted"> · {duration(r.durationSeconds)}</span> : null}
                      </span>
                      {r.status === 'READY' ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            void api<{ url: string }>(`/recordings/${r.id}/download`)
                              .then(({ url }) => window.open(url, '_blank', 'noopener'))
                              .catch((e) => toast(e instanceof ApiError ? e.message : 'Couldn’t get the recording.', 'danger'))
                          }
                        >
                          <Download className="h-4 w-4" aria-hidden /> Download
                        </Button>
                      ) : (
                        <Badge tone={r.status === 'FAILED' ? 'danger' : 'neutral'}>{r.status === 'FAILED' ? 'Failed' : r.status === 'RECORDING' || r.status === 'STARTING' ? 'Recording' : 'Processing'}</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              ))}
          </div>
        )}
      </Dialog>

      {m && <ScheduleDialog open={editing} onClose={() => setEditing(false)} meeting={m} onSaved={(d) => qc.setQueryData(['meetings', 'one', meetingId], d)} />}

      <Dialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Cancel this meeting?"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmCancel(false)}>
              Keep it
            </Button>
            <Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate()}>
              Cancel meeting
            </Button>
          </>
        }
      >
        <p className="text-sm">{m?.recurrence !== 'NONE' ? 'This cancels every occurrence. ' : ''}Everyone invited gets an email that removes it from their calendar.</p>
      </Dialog>
    </>
  );
}

function AttendanceTable({ rows, tz }: { rows: AttendanceRowDto[]; tz: string }) {
  const byOcc = new Map<string, AttendanceRowDto[]>();
  for (const r of rows) byOcc.set(r.occurrenceStart, [...(byOcc.get(r.occurrenceStart) ?? []), r]);
  const t = new Intl.DateTimeFormat(undefined, { timeZone: tz, hour: 'numeric', minute: '2-digit' });
  return (
    <div className="space-y-4">
      {[...byOcc].map(([occ, list]) => (
        <div key={occ}>
          {byOcc.size > 1 && <p className="mb-1 text-xs font-medium text-muted">{new Date(occ).getTime() > 0 ? formatDateTime(occ, tz) : 'Room call'}</p>}
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1 font-medium">Person</th>
                <th className="py-1 font-medium">Joined</th>
                <th className="py-1 font-medium">Left</th>
                <th className="py-1 text-right font-medium">Time in call</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.map((r) => (
                <tr key={r.userId}>
                  <td className="py-1.5">{r.fullName}</td>
                  <td className="py-1.5 tabular">{t.format(new Date(r.firstJoinedAt))}</td>
                  <td className="py-1.5 tabular">{r.lastLeftAt ? t.format(new Date(r.lastLeftAt)) : <Badge tone="ok">In the call</Badge>}</td>
                  <td className="py-1.5 text-right tabular">
                    {duration(r.seconds)}
                    {r.joins > 1 && <span className="text-muted"> · {r.joins} joins</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
