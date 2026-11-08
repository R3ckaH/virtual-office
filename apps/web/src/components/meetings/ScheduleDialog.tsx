import type { MeetingDto, Recurrence } from '@vo/shared';
import { addDays, localDate, localTime, RECURRENCE_LABELS, RECURRENCES, zonedToUtc } from '@vo/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { Alert, Button, Dialog, Field, Input, Select } from '@/components/ui';
import { Avatar } from '@/components/ui/avatar';
import { useToast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { allTimeZones, cityOf, offsetLabel } from '@/lib/format';
import { usePresence } from '@/lib/presence';

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240];
const durationLabel = (m: number) => (m < 60 ? `${m} minutes` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} hour${m > 60 ? 's' : ''}`);

/** The next half hour from now, in a zone. */
function nextSlot(tz: string) {
  const at = new Date(Math.ceil((Date.now() + 5 * 60_000) / (30 * 60_000)) * 30 * 60_000);
  return { date: localDate(at, tz), time: localTime(at, tz) };
}

/** Schedule a new meeting, or edit one (pass `meeting`). */
export function ScheduleDialog({ open, onClose, meeting, onSaved, defaultDate }: { open: boolean; onClose: () => void; meeting?: MeetingDto; onSaved?: (m: MeetingDto) => void; defaultDate?: string }) {
  return open ? <ScheduleForm onClose={onClose} meeting={meeting} onSaved={onSaved} defaultDate={defaultDate} /> : null;
}

function ScheduleForm({ onClose, meeting, onSaved, defaultDate }: { onClose: () => void; meeting?: MeetingDto; onSaved?: (m: MeetingDto) => void; defaultDate?: string }) {
  const { user } = useAuth();
  const { people, rooms } = usePresence();
  const toast = useToast();
  const qc = useQueryClient();
  const tz0 = meeting?.timezone ?? user!.timezone;
  const slot = nextSlot(tz0);
  const [title, setTitle] = useState(meeting?.title ?? '');
  const [description, setDescription] = useState(meeting?.description ?? '');
  const [timezone, setTimezone] = useState(tz0);
  const [date, setDate] = useState(meeting ? localDate(new Date(meeting.startsAt), tz0) : defaultDate && defaultDate > slot.date ? defaultDate : slot.date);
  const [time, setTime] = useState(meeting ? localTime(new Date(meeting.startsAt), tz0) : defaultDate && defaultDate > slot.date ? '09:00' : slot.time);
  const [duration, setDuration] = useState(meeting?.durationMinutes ?? 30);
  const [recurrence, setRecurrence] = useState<Recurrence>(meeting?.recurrence ?? 'NONE');
  const [until, setUntil] = useState(meeting?.recurrenceUntil ?? '');
  const [invitees, setInvitees] = useState<string[]>(meeting?.invitees.map((i) => i.userId) ?? []);
  const [roomId, setRoomId] = useState(meeting?.officeRoomId ?? '');
  const [query, setQuery] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const directory = useMemo(() => Object.values(people).filter((p) => p.userId !== (meeting?.hostId ?? user!.id)).sort((a, b) => a.fullName.localeCompare(b.fullName)), [people, meeting, user]);
  const matches = query.trim()
    ? directory.filter((p) => !invitees.includes(p.userId) && `${p.fullName} ${p.departmentName ?? ''} ${p.title ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
    : [];
  const departments = useMemo(() => [...new Set(directory.map((p) => p.departmentName).filter(Boolean) as string[])].sort(), [directory]);
  const meetingRooms = rooms.filter((r) => r.kind === 'MEETING' || r.kind === 'LEADERS' || r.kind === 'PRIVATE');
  const zones = useMemo(() => [...new Set([timezone, user!.timezone, 'Asia/Manila', 'America/New_York', ...allTimeZones()])], [timezone, user]);

  const save = useMutation({
    mutationFn: () => {
      const startsAt = zonedToUtc(date, time, timezone).toISOString();
      const body = {
        title,
        description: description || null,
        startsAt,
        durationMinutes: duration,
        timezone,
        recurrence,
        recurrenceUntil: recurrence === 'NONE' ? null : until || null,
        inviteeIds: invitees,
        officeRoomId: roomId || null,
      };
      return meeting ? api<MeetingDto>(`/meetings/${meeting.id}`, { method: 'PUT', json: body }) : api<MeetingDto>('/meetings', { method: 'POST', json: body });
    },
    onSuccess: (m) => {
      void qc.invalidateQueries({ queryKey: ['meetings'] });
      toast(meeting ? 'Meeting updated. Invitees got the new details.' : invitees.length ? `Meeting scheduled. ${invitees.length} ${invitees.length === 1 ? 'person was' : 'people were'} invited.` : 'Meeting scheduled.');
      onSaved?.(m);
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError) {
        setErrors(Object.fromEntries(Object.entries(e.fieldErrors).map(([k, v]) => [k, v[0]])));
        setFormError(Object.keys(e.fieldErrors).length ? null : e.message);
      } else setFormError('Couldn’t save the meeting. Try again.');
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = 'Give the meeting a title';
    if (!date || !time) errs.startsAt = 'Pick a start date and time';
    if (recurrence !== 'NONE' && until && until < date) errs.recurrenceUntil = 'The last date must be on or after the first meeting';
    setErrors(errs);
    setFormError(null);
    if (!Object.keys(errs).length) save.mutate();
  }

  const add = (ids: string[]) => setInvitees((list) => [...new Set([...list, ...ids])]);

  return (
    <Dialog
      open
      onClose={onClose}
      title={meeting ? 'Edit meeting' : 'Schedule a meeting'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="schedule-form" loading={save.isPending} data-autofocus={meeting ? true : undefined}>
            {meeting ? 'Save changes' : invitees.length ? 'Schedule and invite' : 'Schedule'}
          </Button>
        </>
      }
    >
      <form id="schedule-form" onSubmit={submit} noValidate className="space-y-4">
        {formError && <Alert>{formError}</Alert>}
        <Field label="Title" error={errors.title}>
          {(f) => <Input id={f.id} aria-describedby={f.describedBy} aria-invalid={f.invalid} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Weekly team meeting" autoFocus={!meeting} />}
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Date" error={errors.startsAt}>
            {(f) => <Input id={f.id} type="date" aria-describedby={f.describedBy} aria-invalid={f.invalid} value={date} onChange={(e) => setDate(e.target.value)} />}
          </Field>
          <Field label="Start time">
            {(f) => <Input id={f.id} type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} />}
          </Field>
          <Field label="Length" error={errors.durationMinutes}>
            {(f) => (
              <Select id={f.id} value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                {[...new Set([...DURATIONS, duration])].sort((a, b) => a - b).map((d) => (
                  <option key={d} value={d}>
                    {durationLabel(d)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Time zone" hint={timezone !== user!.timezone && date && time ? `That’s ${new Intl.DateTimeFormat(undefined, { timeZone: user!.timezone, weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(zonedToUtc(date, time, timezone))} for you.` : undefined} error={errors.timezone}>
            {(f) => (
              <Select id={f.id} aria-describedby={f.describedBy} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                {zones.map((z) => (
                  <option key={z} value={z}>
                    {cityOf(z)} ({offsetLabel(z)})
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Repeat">
            {(f) => (
              <Select id={f.id} value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence)}>
                {RECURRENCES.map((r) => (
                  <option key={r} value={r}>
                    {RECURRENCE_LABELS[r]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        {recurrence !== 'NONE' && (
          <Field label="Last date (optional)" hint="Leave empty to repeat until you cancel it." error={errors.recurrenceUntil} className="sm:w-1/2">
            {(f) => <Input id={f.id} type="date" aria-describedby={f.describedBy} aria-invalid={f.invalid} min={date} value={until} onChange={(e) => setUntil(e.target.value)} />}
          </Field>
        )}

        <div className="space-y-1.5">
          <label htmlFor="invite-search" className="block text-sm font-medium">
            Invite people
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <Input id="invite-search" className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or department" autoComplete="off" role="combobox" aria-expanded={matches.length > 0} aria-controls="invite-results" />
          </div>
          {matches.length > 0 && (
            <ul id="invite-results" role="listbox" aria-label="Matching people" className="max-h-56 overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-sm">
              {matches.map((p) => (
                <li key={p.userId} role="option" aria-selected={false}>
                  <button type="button" onClick={() => (add([p.userId]), setQuery(''))} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-sunken">
                    <Avatar name={p.fullName} src={p.avatarUrl} size="sm" />
                    <span className="flex-1">{p.fullName}</span>
                    <span className="text-xs text-muted">{p.departmentName}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {departments.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
              <span className="text-muted">Add a whole department:</span>
              {departments.map((d) => (
                <button key={d} type="button" onClick={() => add(directory.filter((p) => p.departmentName === d).map((p) => p.userId))} className="rounded-full border border-line px-2 py-0.5 hover:bg-sunken">
                  {d}
                </button>
              ))}
            </div>
          )}
          {errors.inviteeIds && <p className="text-sm text-danger">{errors.inviteeIds}</p>}
          {invitees.length > 0 && (
            <ul className="flex flex-wrap gap-1.5 pt-1" aria-label="Invited">
              {invitees.map((id) => {
                const p = people[id];
                const name = p?.fullName ?? meeting?.invitees.find((i) => i.userId === id)?.fullName ?? 'Someone';
                return (
                  <li key={id} className="inline-flex items-center gap-1 rounded-full bg-sunken py-0.5 pl-2.5 pr-1 text-sm">
                    {name}
                    <button type="button" onClick={() => setInvitees((list) => list.filter((x) => x !== id))} className="rounded-full p-0.5 text-muted hover:bg-line hover:text-ink" aria-label={`Remove ${name}`}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-sm text-muted">Each person gets an email with a calendar file for Google Calendar or Outlook.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Office room (optional)" hint="Shown as the location on the invite.">
            {(f) => (
              <Select id={f.id} aria-describedby={f.describedBy} value={roomId} onChange={(e) => setRoomId(e.target.value)}>
                <option value="">None</option>
                {meetingRooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <Field label="Agenda (optional)" error={errors.description}>
          {(f) => (
            <textarea
              id={f.id}
              aria-describedby={f.describedBy}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={2000}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[15px] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          )}
        </Field>
        {meeting && date !== localDate(new Date(meeting.startsAt), meeting.timezone) && recurrence !== 'NONE' && (
          <p className="text-sm text-muted">Moving a repeating meeting moves every future occurrence.</p>
        )}
        {recurrence !== 'NONE' && until && until > addDays(date, 366) && <p className="text-sm text-muted">That’s more than a year of meetings.</p>}
      </form>
    </Dialog>
  );
}
