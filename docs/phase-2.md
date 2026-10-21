# Phase 2: Clock in/out, schedules, attendance, biometric sync

## What's in this phase

- **Web time clock** on Home and Attendance: clock in, start/end break, clock out. Today's hours count up live.
- **Biometric devices**, connected in any of three ways, whatever the brand:
  - **Cloud push**: the ADMS / "iclock" protocol used by ZKTeco and most rebrands, plus a JSON push for others.
  - **Office sync agent** (`packages/sync-agent`): reads ZKTeco-protocol devices on the LAN, or a folder of exported logs.
  - **File import**: `.dat`, `.txt`, `.csv` or `.xlsx` exports. Duplicates are skipped.
- **One record per person per day**, combining web and biometric punches using the rules below.
- **HR attendance board** (from the approved mockup):
  - KPIs and live punches
  - today's board, with On-site / Remote / Needs attention filters
  - a person drawer with punches and the last 5 days' hours
  - Adjust times and Add a note
  - CSV export
- **Exceptions**: late, no punch, missing clock-out (with auto clock-out at 14 hours), web vs biometric mismatch, unlinked badge, duplicate punches. Each has one-click resolutions.
- **Time corrections**: the employee asks, the manager approves, then HR approves. The timesheet changes only after HR approves, and the employee gets an email.
- **Schedules & setup**:
  - named schedules per weekday, overnight shifts included
  - who follows which schedule, from a date onward
  - On-site / Remote / Hybrid per person (Hybrid people follow the schedule's on-site days)
  - an "attendance tracked" switch, off for leaders
- **Leave, days off and one-off shifts**, marked by HR for now. The Leave module (Phase 6) will plug into the same table.
- **Managers** get "My team" (their direct reports' day) and "Approvals" (the first step of corrections).
- **New HR role** (Grace Lim in the seed): reads all people; manages attendance and devices. HR can't manage people or see login history.

## Rules

All of these can be changed by HR in Biometric devices → Attendance rules (`attendance_settings`).

| Rule | Default |
|---|---|
| Grace period | 5 minutes after the scheduled start. Lateness is counted from the start time (8:14 for 8:00 = 14 minutes late) |
| Duplicate punches | Device punches within 2 minutes of the previous one are merged (the first is kept). Web punches are never merged |
| First and last punch | Punches alternate in/out. First = clock in, last = clock out, the ones between are breaks. Web clock buttons set the kind explicitly |
| Device punch mid-shift | Counts as a break until the shift ends, then as the clock-out |
| Hybrid rule | When there's both a web and a biometric clock-in: on an on-site day the biometric one counts; otherwise the web one does. More than 15 minutes apart on an on-site day raises a mismatch, and HR can pick either |
| No punch | 2 hours after the start, with no punch and no leave |
| Missing clock-out | Still clocked in 60 minutes after the shift ends |
| Auto clock-out | 14 hours after clock-in. The clock-out is placed at the shift end (or clock-in + 14 h) and flagged for HR |
| Overnight shifts | A shift ending at or before its start time ends the next morning. Its punches belong to the day it started |
| Leaders | Not tracked (per-person switch) |

The rules live in `apps/api/src/attendance/engine.ts` as pure functions with unit tests (`engine.spec.ts`).

## Database schema

Migration: `apps/api/drizzle/0001_phase2_attendance.sql`. Also adds `HR` to the `role` enum.

| Table | Purpose | Key columns |
|---|---|---|
| `users` (new columns) | | attendance_tracked, work_setup (ONSITE/REMOTE/HYBRID) |
| `attendance_settings` | One row of rules | grace_minutes, duplicate_window_minutes, mismatch_minutes, no_punch_after_minutes, missing_out_after_minutes, auto_clock_out_hours, device_wins_onsite |
| `work_schedules` | Named schedules | name (unique), timezone |
| `schedule_days` | Per weekday | weekday (1=Mon), start_time, end_time ('HH:MM'), onsite |
| `schedule_assignments` | Person → schedule from a date | user_id, schedule_id, effective_from |
| `day_overrides` | Leave, day off, one-off shift | user_id, work_date, kind, start_time, end_time, note |
| `devices` | Terminals | name, model, serial_number (unique; ADMS "SN"), connection (PUSH/AGENT/FILE), timezone, allowed_ips, token_hash, last_seen_at, last_punch_at, sync_requested_at |
| `device_user_links` | Badge → person | device_user_id (PK), user_id, enrolled_with |
| `import_batches` | File imports | filename, total, added, duplicates, unknown_user_ids, errors |
| `punches` | Every raw punch, never deleted | user_id (null until the badge is linked), work_date, source (WEB/DEVICE/HR/SYSTEM), kind, punched_at, device_id, device_user_id, verify, via, location, ip, merged, removed_at. A unique index on (device_id, device_user_id, punched_at) makes re-sends harmless |
| `attendance_days` | Computed result per person and date | status, schedule_start/end, first_in, last_out, open_since, worked/break/late minutes, merged_count, plus HR decisions that survive recomputation: excused, prefer_source, note |
| `attendance_exceptions` | One per type/person/date (`key` is unique) | type, status (OPEN/RESOLVED/DISMISSED), data, resolution, resolved_by_id |
| `correction_requests` | Two-step approval | action (ADD/CHANGE/REMOVE), punch_id, kind, original_at, requested_at, reason, status, manager_id + decision, hr_id + decision |

How a day is built: punches → `DayService.recompute(user, date)`, which:

1. runs the engine
2. stores the day
3. adds a SYSTEM clock-out when 14 hours pass
4. raises new exceptions
5. reopens dismissed ones that apply again
6. dismisses open ones that stopped applying (for example, "no punch" once the person punches)

It runs on every punch and HR action. A minute job does the same for everyone's today and yesterday. A Postgres advisory lock means only one API instance runs the job. The board also refreshes any of today's rows older than a minute.

## API endpoints

Base path `/api` unless noted.

### Device endpoints (no user session)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/iclock/cdata?SN=` | Registered serial, PUSH, active, optional IP allowlist | ADMS handshake (options) |
| POST | `/iclock/cdata?SN=&table=ATTLOG` | same | ADMS attendance upload (plain text) → `OK: n` |
| GET | `/iclock/getrequest?SN=` | same | Heartbeat; returns `C:<id>:CHECK` after "Sync now" |
| POST | `/iclock/devicecmd?SN=` | same | Command results |
| POST | `/ingest/punches` | `Authorization: Bearer vod_…` (device token) | Sync agent / JSON push, up to 5,000 punches |
| GET | `/ingest/status` | device token | Agent heartbeat; hands over a pending "Sync now" |

The `/iclock/*` paths have no `/api` prefix because device firmware fixes the path. Times from devices have no zone; they're read in the device's configured time zone. Punches more than 10 minutes in the future are rejected (wrong device clock). Ingest is rate-limited to 120 requests per minute.

### Signed in

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/me/clock` | Any | Clock state: day, punches, allowed actions |
| POST | `/me/clock` | Any tracked | `{ action: IN \| BREAK_START \| BREAK_END \| OUT }`; 409 `CLOCK_STATE` if not allowed now |
| GET | `/me/attendance?from&to` | Any | My days with punches (max 62 days) |
| GET/POST | `/me/corrections` | Any | My requests / ask for one |
| POST | `/me/corrections/:id/cancel` | Owner | Cancel while pending |
| GET | `/team/board?date` | Manager (team.read) | Direct reports' board |
| GET | `/team/live`, `/team/exceptions` | Manager | Same, for direct reports |
| GET | `/team/people/:id/day?date` | Manager (own reports, else 404) | Person drawer |
| GET | `/team/corrections?status` | Manager | Requests waiting for them |
| POST | `/team/corrections/:id/decision` | The request's manager (or an admin) | First approval `{ approve, note? }` |
| GET | `/attendance/board?date` | HR, Admin | Board + KPIs + who isn't tracked |
| GET | `/attendance/live` | HR, Admin | Latest punches |
| GET | `/attendance/people` | HR, Admin | Setup list (setup, tracked, schedule) |
| PATCH | `/attendance/people/:id` | HR, Admin | Setup, tracked, schedule from a date |
| GET | `/attendance/people/:id/day?date` | HR, Admin | Person drawer |
| PUT | `/attendance/days/:id/:date/times` | HR, Admin | Adjust times `{ in, out?, reason }` (old punches kept as removed) |
| PATCH | `/attendance/days/:id/:date/note` | HR, Admin | Day note |
| GET | `/attendance/exceptions?status&date` | HR, Admin | Exceptions (last 14 days by default) |
| POST | `/attendance/exceptions/:id/resolve` | HR, Admin | EXCUSE, KEEP, ACK, SET_CLOCK_OUT, USE_DEVICE, USE_WEB, LINK_BADGE |
| GET | `/attendance/corrections?status` | HR, Admin | All requests |
| POST | `/attendance/corrections/:id/decision` | HR, Admin (not their own) | Final approval; applies the change |
| GET/PUT | `/attendance/settings` | HR, Admin | Rules |
| GET/PUT/DELETE | `/attendance/overrides[/:id]` | HR, Admin | Leave / day off / one-off shift |
| GET | `/attendance/export?from&to` | HR, Admin | CSV timesheet |
| GET/POST/PUT/DELETE | `/schedules[/:id]` | HR, Admin | Schedules (delete refused while assigned) |
| GET/POST/PUT/DELETE | `/devices[/:id]` | HR, Admin (devices.manage) | Devices (delete refused once it has punches) |
| POST | `/devices/:id/token` | HR, Admin | New device token, shown once |
| POST | `/devices/:id/sync` | HR, Admin | "Sync now" |
| GET | `/devices/:id/punches?date` | HR, Admin | A device's punches |
| POST | `/devices/:id/import` | HR, Admin | Multipart `file`, 10 MB max |
| GET/PUT/DELETE | `/device-users[/:badge]` | HR, Admin | Badge links (linking moves that badge's unlinked punches to the person) |

## Screens

| Route | Who | Screen |
|---|---|---|
| `/` | Any | Time clock card (replaces the Phase 1 placeholder) |
| `/attendance` | Any | Clock, my week, fix a punch, my requests. Managers also get **My team** and **Approvals** |
| `/admin/attendance` | HR, Admin | Attendance board, Exceptions, Correction requests, person drawer, export |
| `/admin/schedules` | HR, Admin | Schedules, people setup, leave and days off |
| `/admin/devices` | HR, Admin | Connection options, devices, import, rules, badge links |

Times show in the viewer's own time zone, as in Phase 1. Emily in New York sees her 9 AM shift; HR in Manila sees 9 PM.

## Security controls

| Concern | How it's handled |
|---|---|
| Role checks | New permissions `attendance.manage` and `devices.manage` checked on every endpoint. Managers only reach their direct reports (404 otherwise). Employees only touch their own clock and requests |
| No self-approval | Nobody can approve their own correction, at either step. HR can't skip the manager step |
| Device tokens | `vod_<deviceId>_<random>`. Only a SHA-256 is stored, compared in constant time, shown once, and can be rotated (the old one stops working at once). The agent refuses plain `http://` except for localhost |
| ADMS push | The protocol has no secret, so a device must be registered by serial, set to Cloud push, active, and optionally restricted to listed IPs. Unknown devices get 401 and are logged |
| Replays / re-sends | A unique (device, badge, time) index skips duplicates; future-dated punches are rejected |
| Uploads | 10 MB limit, extension allowlist, parsed in memory, never stored. Up to 20 bad lines are reported, not executed |
| CSV export | Cells starting with `= + - @` are prefixed with `'` (no spreadsheet formula injection) |
| Audit | Exception resolutions, adjust times, notes, setup changes, schedules, leave, rules, devices, tokens, imports, badge links and correction decisions all go to `audit_logs` |
| No data loss | Punches are never deleted. Corrections and adjustments mark the old punch as removed and add an HR punch, so the drawer shows both |
| Privacy | Fingerprint and face templates stay on the devices; only the device user ID, time and verify method arrive |

## Tests

- **Unit**: `engine.spec.ts` (27) covers grace edges, merging, breaks, clock-out during a break, missing and auto clock-out, overnight shifts, the hybrid rule and work-date assignment. `parsers.spec.ts` (7) covers ZKTeco `.dat`, the ZK software TXT export, CSV with AM/PM, Excel, bad files.
- **API end to end** (`test/attendance.e2e-spec.ts`, 21, frozen clock on Thu Oct 1 2026):
  - RBAC on every new endpoint, and device auth
  - leaders untracked
  - web clock flow
  - ADMS push with duplicates, late, unlinked badge and re-send
  - linking a badge, excuse / keep as late
  - hybrid mismatch → keep web
  - manager scope
  - agent token, rotation and Sync now
  - file import and re-import
  - the two-step correction, plus self-approval refusal and auto clock-out replacement
  - the minute job: Emily's missing clock-out → auto clock-out → HR sets the time
  - no punch, leave, schedules, adjust times, CSV formula guard, rules
- **Web**: time clock card (clock in, untracked, server refusal), HR board (filters, excusing from Exceptions), HR navigation.
- **Sync agent** (`packages/sync-agent`, 6): time parsing, upload and overlap, one failing device, rejected token, folder mode, https-only.

## Decisions to revisit later

- **Biometric brand unknown.** ADMS covers ZKTeco and most rebrands. The agent's network reader (`zkteco-js`) hasn't been tried against a real terminal, and the Windows `.exe` build couldn't be produced on the build machine (it downloads a Node base binary). Confirm with the real device.
- **Leave** is an HR mark for now; Phase 6 replaces it with requests and approvals feeding the same `day_overrides` table.
- **"Ask Emily"** in the mockup (messaging the person about a missing clock-out) waits for Chat in Phase 5.
- **Live updates** poll every 15 seconds. Socket.IO arrives with presence in Phase 3.
- **Recompute cost.** The board and the minute job recompute each tracked person's day, which is fine for tens of people. With hundreds, batch the recompute or move it to a queue.
- **Unlinking or relinking a badge** doesn't move punches already credited to someone; only unlinked ones move. That's deliberate, so history doesn't silently change.
- **Slash dates in imports** are read month first (MM/DD/YYYY), as Philippine exports usually are.
- **Weekend/holiday calendar**: schedules cover weekdays; public holidays are marked as days off for now.
