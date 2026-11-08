import type { MeetingSettingsDto } from '@vo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CircleDashed } from 'lucide-react';
import { ReactNode } from 'react';
import { Alert, PageHeader, Panel, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';

function Check({ ok, title, children }: { ok: boolean; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      {ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-ok" aria-label="Ready" /> : <CircleDashed className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-label="Not set up" />}
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted">{children}</p>
      </div>
    </li>
  );
}

/** Video calls and recording: what's connected on the server, and the company-wide recording switch. */
export function MeetingSettingsPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['meeting-settings'], queryFn: () => api<MeetingSettingsDto>('/admin/meeting-settings') });
  const save = useMutation({
    mutationFn: (recordingEnabled: boolean) => api<MeetingSettingsDto>('/admin/meeting-settings', { method: 'PATCH', json: { recordingEnabled } }),
    onSuccess: (d) => {
      qc.setQueryData(['meeting-settings'], d);
      toast(d.recordingEnabled ? 'Recording turned on. Hosts see a Record button in their calls.' : 'Recording turned off.');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Couldn’t save.', 'danger'),
  });
  const s = q.data;
  return (
    <>
      <PageHeader title="Meetings & video" description="Video calls run on LiveKit. Recordings are saved to your own storage bucket." />
      {q.isLoading ? (
        <Spinner />
      ) : q.isError || !s ? (
        <Alert>Couldn’t load the meeting settings.</Alert>
      ) : (
        <div className="space-y-6">
          <Panel title="Connections">
            <ul className="space-y-4">
              <Check ok={s.videoConfigured} title="Video calls">
                {s.videoConfigured ? 'Connected to LiveKit. Calls, meeting rooms and scheduled meetings work.' : 'Not connected yet. Add LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET to the API server’s settings.'}
              </Check>
              <Check ok={s.storageConfigured} title="Recording storage">
                {s.storageConfigured ? 'A storage bucket is connected for recordings.' : 'Not connected. Add the RECORDINGS_S3_* settings (any S3-compatible bucket, such as Cloudflare R2 or AWS S3) to the API server.'}
              </Check>
            </ul>
          </Panel>
          <Panel title="Recording" description="When on, a meeting’s host (or an admin) can record. Everyone in the call sees that it’s being recorded.">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-[rgb(var(--brand))]"
                checked={s.recordingEnabled}
                disabled={save.isPending}
                onChange={(e) => save.mutate(e.target.checked)}
              />
              <span>
                <span className="block font-medium">Allow meeting recordings</span>
                <span className="block text-sm text-muted">
                  Under the Data Privacy Act, tell people before you record them. Recordings are kept in your bucket until you delete them there.
                </span>
              </span>
            </label>
            {s.recordingEnabled && !s.storageConfigured && (
              <div className="mt-3">
                <Alert tone="warn">Recording is allowed, but the Record button stays hidden until a storage bucket is connected.</Alert>
              </div>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}
