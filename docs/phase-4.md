# Phase 4: Meetings, calls and the calendar

Video runs on **LiveKit** (LiveKit Cloud in production). The API hands out short-lived join tokens and
listens to LiveKit's webhooks; browsers talk to LiveKit directly for audio and video.

## What people can do

| Who | What |
| --- | --- |
| Everyone | Call someone from their card on the office floor (rings them for 45 s; Answer / Decline). Join the video call of the room they're standing in (any room except the lobby/open area and the break room). Join meetings they're invited to, from 15 min before the start until 60 min after the end. Reply Yes / Maybe / No. Download an `.ics`, or subscribe to a private calendar link. |
| Manager, HR, Admin | Schedule meetings: one-off, every day, every weekday, every week (optional last date), invite people or whole departments, optionally tie to an office room. Edit / cancel their own (admins: any). |
| Host, HR, Admin | See **who attended**: first join, last leave, total time (summed over rejoins). |
| Admin | **Admin → Meetings & video**: shows whether LiveKit and recording storage are connected; switch recording on/off for the company. |

In a call: mic, camera, screen share (with tab audio), chat, raise hand (sorted to the top of the
People list, announced to others), people list, record (host/admin, when enabled), and "Back to the office"
(Esc), which minimizes the call to a bar so you can keep browsing while you talk.

While someone is in any call their floor status shows **In a meeting** (unless they set Busy/DND or are on a break).

## Notifications

* **Invites / updates / cancellations** are emailed with a calendar file (`METHOD:REQUEST` / `CANCEL`,
  same UID and a rising `SEQUENCE`, so Google Calendar and Outlook update or remove the event).
  Changing the time resets everyone's reply to "No reply yet".
* **Reminders** 10 minutes before each occurrence, in-app (with a Join button) and by email; each sent once.
* Emails need SMTP. Until it's configured they're written to the API log.

## Calendar subscription

`Meetings → Sync to my calendar` creates a private link `…/api/calendar/feed/<token>.ics` (token stored
hashed for lookup and encrypted for display). Making a new link kills the old one. Declined meetings are
left out; cancelled ones stay marked `STATUS:CANCELLED` so calendar apps remove them.

## Recording

Built but off until both:

1. Admin turns it on in **Meetings & video**, and
2. the API has an S3-compatible bucket: `RECORDINGS_S3_ENDPOINT`, `RECORDINGS_S3_BUCKET`,
   `RECORDINGS_S3_REGION` (default `auto`), `RECORDINGS_S3_ACCESS_KEY`, `RECORDINGS_S3_SECRET_KEY`.

Recording uses LiveKit Egress (room composite, grid layout, MP4) written straight to the bucket. Downloads
are 15-minute presigned links. Tell people before you record them (RA 10173).

## Setup (production)

1. Create a LiveKit Cloud project. From *Settings → Keys* create an API key.
2. On Railway (API service → Variables) add `LIVEKIT_URL` (`wss://<project>.livekit.cloud`),
   `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.
3. In LiveKit Cloud *Settings → Webhooks* add
   `https://voapi-production-b809.up.railway.app/api/livekit/webhook` signed with that API key.
   (The webhook path goes straight to Railway; it is exempt from the Vercel origin check and verified
   by LiveKit's signature instead.)

The web CSP allows `wss:` and `https://*.livekit.cloud`.

## API

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/meetings?from&to` | your occurrences in a range (≤ 62 days) |
| GET | `/meetings/:id` | host, invitees, admins; room calls: people in that room |
| POST | `/meetings` | `meetings.schedule` |
| PUT | `/meetings/:id` | host or admin |
| POST | `/meetings/:id/cancel` · `/respond` · `/join` | |
| GET | `/meetings/:id/attendance` | host, HR, admin |
| GET | `/meetings/:id/ics` | |
| GET | `/meetings/:id/recordings` · POST `/meetings/:id/recording/start` · `/stop` · GET `/recordings/:id/download` | |
| POST | `/calls` `{userIds}` · `/calls/:id/decline` · `/calls/:id/cancel` | instant calls |
| POST | `/rooms/:id/call` | you must be standing in that room |
| GET/POST | `/me/calendar-feed` · GET `/calendar/feed/:token.ics` (public) | |
| GET/PATCH | `/admin/meeting-settings` | `settings.manage` |
| POST | `/livekit/webhook` | public, signature-checked |

Socket events: `call:incoming`, `call:ended`, `meeting:reminder`, `meetings:changed`.

LiveKit rooms are named `m_<meetingId>_<occurrence epoch seconds>`, so each occurrence of a repeating
meeting is its own room and webhooks map back to a meeting without a lookup table.

## Data

Migration `0003_phase4_meetings.sql`: `meetings`, `meeting_invitees`, `meeting_attendance`,
`meeting_notifications`, `meeting_recordings`, `calendar_feeds`, `org_settings.recording_enabled`.
Repeats keep the local wall-clock time in the meeting's time zone across DST; a repeating meeting
always starts on its first real occurrence (a weekday meeting set for a Sunday starts Monday).

## Tests

* API e2e (`test/meetings.e2e-spec.ts`): scheduling rules, invites with .ics, RSVP resets, cancel,
  repeats, join window and token grants, signed webhooks → attendance and "In a meeting",
  ringing/decline/answer/room-finished, room calls, reminders (once), calendar feed, recording switch.
* Unit (`src/meetings/meetings.spec.ts`): occurrence expansion (weekdays, last date, DST), join window, .ics output.
* Web: meetings page (list, reply, schedule in a time zone, validation), incoming call and reminder prompts.
* Checked in a real browser against a local LiveKit server: call, ring, answer, video, raise hand, people
  list, minimize, leave, webhook attendance.
