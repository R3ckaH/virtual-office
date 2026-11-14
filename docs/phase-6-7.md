# Phases 6 and 7: Leave, tasks, daily reports, dashboards, reports and settings

## Phase 6

### Leave

| Who | What |
| --- | --- |
| Everyone | File leave (type, first and last day, reason) with a live count of working days: rest days and company holidays are skipped. See balances per type for any year, cancel a request while it's waiting or before approved leave starts, and see the team calendar. |
| Managers | Approve or decline their direct reports' leave, with an optional note (Leave → To approve, or the link in the email / pop-up). |
| HR, Admins (`leave.manage`) | Approve anyone's leave (including leaders', whose leave goes to HR), cancel approved leave at any time, manage leave types, adjust balances, and see everyone on the calendar. |

* **Leave types** start empty: HR adds them in **Admin → Leave & holidays** (name, color, paid or unpaid,
  days per year or "no balance"). A type that has been used can be turned off but not deleted.
* **Balances**: everyone gets each type's yearly days from January 1 (no proration). Adjustments
  (+/− days, with a reason) cover carry-over and special grants. A request counts against the year it
  starts in. Requests that would overdraw the balance (counting ones still waiting) are refused.
* **Approval**: the person's manager approves. With no manager, or for leaders (people not
  attendance-tracked), HR approves. HR and Admins can approve anyone.
* **Effect on attendance**: approved leave turns those working days into "On leave" on the timesheet,
  so nobody is flagged absent or late; past days are recomputed when leave is approved or cancelled.
* **Holidays** (HR, in the same admin page) are company-wide: those days are "Day off" for everyone,
  aren't counted as leave, and changing one recomputes past timesheets and leave day counts.
  An HR schedule override (a specific shift on that date) still wins.
* **Team calendar**: colleagues in the same department see approved leave without the type; managers
  see their reports' requests with the type (pending ones dashed); HR and admins see everyone, filterable
  by department.
* **Notifications**: a pop-up and (if switched on) an email to the approver for each new request, and
  to the employee when it's decided.

### Tasks

* Three columns: To do, In progress, Done. Drag cards between columns or use the arrow buttons on a card.
* **Personal tasks** (no team) are seen by the assignee, whoever created them and the assignee's manager.
* **Team tasks** sit on a department's board: everyone in the department sees them and can pick one up.
* Managers, HR and Admins can assign tasks to people they manage or anyone in a department they choose;
  others can assign within their own department. Assignees get a pop-up.
* Whoever created a task, the assignee's manager or an admin can delete it.
* Done tasks drop off the board after 14 days.

### End-of-day reports

* What I did, blockers, plan for tomorrow. It starts pre-filled with the tasks you marked done today.
* **Admin → Departments → Require an end-of-day report**: people in that department must file one before
  clocking out on the web. The clock-out button opens the report, then clocks out. Biometric punches are
  never blocked.
* Managers (Tasks → Team reports) see who filed, who didn't, and who didn't work that day; HR and admins
  for everyone or a department.
* Optional reminder at the end of the shift for people who must file and haven't (Company settings → Emails).

## Phase 7

### Home dashboards

* **Everyone**: this week's hours against scheduled hours, today's time, the next meetings (with Join
  when it's about to start), open tasks with due dates, leave left, and the report status.
* **Managers** (their direct reports), **HR and Admins** (everyone or one department): online now,
  late today, not in yet, absent, on leave, hours this week per person, and what's waiting for them
  (leave to approve, time corrections, missing reports from yesterday).

### Reports (`reports.read`: Admins, HR, Managers)

Attendance summary, Tardiness, Overtime and early outs, Meeting attendance, Leave, and Login history
(admins only). Any period up to a year, filtered by department and person. Managers only see their
direct reports (and meetings they host). Export to **CSV** (opens in Excel, UTF-8), **Excel** (.xlsx with a
header, frozen titles and filters) and **PDF** (printable table with page numbers). Hours columns export
as decimal hours. Every export is in the audit log.

* Overtime = clocked out 30+ minutes after the end of the shift; early out = finished 15+ minutes before it.
* Times are in the company time zone.

### Company settings (Admin → Company settings)

Company name, brand color (with a contrast check), logo (PNG/JPG/WebP up to 200 KB, served from
`/api/branding/logo`), company time zone, inactivity sign-out, and which emails go out (meeting invites,
reminders, leave requests, leave decisions, time corrections, report reminders). The full audit log was
already in Admin → Audit log; every change here is recorded there.

## API

| Method | Path | |
| --- | --- | --- |
| GET/POST/PUT/DELETE | `/leave/types[/:id]` | list: everyone; changes: `leave.manage` |
| GET | `/leave/balances?userId&year` · `/leave/adjustments` · POST `/leave/adjustments` | |
| GET | `/leave/preview?typeId&startDate&endDate` | working days, balance after, overlaps |
| GET/POST | `/leave/requests` (`scope=mine|approvals|all`) · GET `/leave/requests/:id` | |
| POST | `/leave/requests/:id/decision` · `/leave/requests/:id/cancel` | |
| GET | `/leave/calendar?from&to&departmentId` | |
| GET/POST/PUT/DELETE | `/holidays[/:id]` | changes: `attendance.manage` |
| GET/POST/PATCH/DELETE | `/tasks[/:id]` (`scope=mine|team|person`) | |
| GET/PUT | `/daily-reports/me` · GET `/daily-reports/team?date&departmentId` | |
| GET | `/dashboard/me` · `/dashboard/team?departmentId` | |
| GET | `/reports/:kind?from&to&departmentId&userId[&format=csv|xlsx|pdf]` | |
| GET/PATCH | `/admin/company` · PUT/DELETE `/admin/company/logo` | `settings.manage` |

Socket events: `notice` (pop-up with a link), `leave:changed`, `tasks:changed`.
Clock-out returns 409 `DAILY_REPORT_REQUIRED` when a report is needed first.

## Data

Migration `0005_phase6_7_leave_tasks_reports.sql`: `leave_types`, `leave_requests`, `leave_adjustments`,
`holidays`, `tasks`, `daily_reports`, `departments.require_daily_report`, `org_settings.notifications`.
New permission `leave.manage` (HR and Admin).

## Tests

* API e2e (`test/work.e2e-spec.ts`): leave types, balances and adjustments, day counting around weekends and
  holidays, filing with overlap and balance checks, manager approval and emails, leaders' leave to HR,
  approved leave turning a day into LEAVE (and back when cancelled), the calendar's privacy, tasks
  visibility and assignment rules, the report gate on clock-out, team reports, dashboards and their
  scope, every report and the three export formats, company settings and the logo.
* Web: filing leave with the live count, approving from the queue, the task board, and the report table.
* Checked in a browser: HR set up types and a holiday, an employee filed leave over Christmas (holiday
  and weekend skipped), tasks moved on the board, the manager's Home dashboard and approval, reports,
  company settings and the team calendar.
