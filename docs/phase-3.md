# Phase 3: Presence and the virtual office floor

## What's in this phase

- **Office floor** (`/floor`), built from the approved mockup:
  - the same nine rooms and furniture
  - people drawn as little characters who walk along the hallways, with doors that slide open as they pass
  - a 2D / 3D toggle, rotation in 3D, and a **Follow** camera that rides behind you while you walk and turns corners slowly
- **Live presence** over Socket.IO: moves, statuses and arrivals show up for everyone at once.
- **Statuses**: Available, In a meeting, Busy, On break, Away and Offline. They change on their own, and you can also pick one with a short message (header → status menu).
- **Private rooms and knocking**: some rooms need a knock. Someone inside gets a "Let them in / Not now" prompt wherever they are in the app.
- **Summons**: a room's owner (the Senior Pastor for the CEO Strategy Room) calls members to the room.
  - Each person gets a "Join now / Not now" prompt.
  - **End meeting** walks everyone back to where they were.
- **Click a person** to see their status, message, local time and room. **Message** and **Call** are shown but stay disabled until Chat (Phase 5) and Meetings (Phase 4).
- **Office rooms** admin page (`/admin/rooms`): name, type, department, owner and members for each room.
- **Home**: an "In the office now" card.

## Rules

### Status

The first rule that applies wins:

| # | Situation | Shows as |
|---|---|---|
| 1 | No tab connected | Offline |
| 2 | On a break on today's timesheet (web clock or biometric) | On break |
| 3 | A status you picked (Busy, In a meeting, Away) | That status |
| 4 | In a Meeting room or the leaders' room | In a meeting |
| 5 | In the Break room | On break |
| 6 | Every open tab idle for 15 minutes (`IDLE_AWAY_MINUTES`) | Away |
| 7 | Otherwise | Available |

These rules live in `deriveStatus()` in `packages/shared/src/presence.ts`, and the server and the tests use the same code.

### Rooms

Each of the nine spots on the plan is one room. Admins choose its type:

| Type | Who walks in | Notes |
|---|---|---|
| Open area | Anyone | Where people start if there's nowhere else |
| Department room | Anyone | Home room for its department |
| Meeting room | Anyone | Inside shows as In a meeting |
| Break room | Anyone | Inside shows as On break |
| Private office | Owner and members; others knock | With no owner or members, anyone may use it while it's empty (the Focus booth) |
| Leaders' room | Owner and members; others knock | Inside shows as In a meeting; the owner can summon people |

- **Capacity:** each room holds as many people as the plan has seats. The owner keeps seat 0, and everyone else sits in order of arrival.
- **Where you appear when you open the office:**
  1. The break room, if you're on a timesheet break.
  2. Otherwise your own private office.
  3. Otherwise your department's room.
  4. Otherwise the open area.
- **Breaks:**
  - **Start Break** on the clock (or a biometric break punch) walks you to the Break room.
  - **End Break** walks you back to where you were.
- **Knocks** last 60 seconds. Only someone inside can answer, and the first answer wins.
- **Summons:**
  - Invitations last 10 minutes.
  - Only people who are online get one; the host is told who was offline.
  - The host walks to the room automatically.
  - Only the host (or an admin) can end the meeting.

## Data model

Migration `0002_phase3_presence.sql`. It also inserts the nine default rooms, so production needs no seed.

| Table | Purpose |
|---|---|
| `rooms` | `spot` (fixed position on the plan, unique), `name`, `kind` (room type), `department_id`, `owner_id` |
| `room_members` | (room, user) pairs: who walks into a private or leaders' room without knocking |
| `presence` | One row per person: last `room_id` and `entered_at`, chosen `manual_status` and `message`, `last_seen_at` |

The following live in memory on the single API instance: who is connected, idle state, knocks, summons and active meetings.

## API

### REST

| Method | Path | Who | What |
|---|---|---|---|
| GET | `/api/floor` | Signed in | Rooms, everyone's presence, meetings (the same snapshot the socket sends) |
| GET | `/api/rooms` | Signed in | Rooms |
| PATCH | `/api/rooms/:id` | `rooms.manage` (Admin) | Name, kind, department, owner, members; audited as `room.update` |

`/api/config` now also returns `realtimeUrl`: where the browser opens the live connection.

### Live connection (Socket.IO, path `/socket.io`)

The browser connects with `auth: { token: <access token> }`. The server checks it with the same rules as every HTTP request (`AccessService`):
- A bad or expired token is refused with `TOKEN_INVALID`. The browser renews the token and reconnects.
- A force-logout, deactivation or idle timeout ends the connection with `session:ended`. A sweep re-checks every session once a minute.

Every client message gets an `Ack`: `{ ok: true, data? }` or `{ ok: false, message, code }`.

| Client → server | Payload | Notes |
|---|---|---|
| `room:enter` | `{ roomId }` | `KNOCK_REQUIRED`, `ROOM_FULL`, `ROOM_NOT_FOUND` |
| `status:set` | `{ status: BUSY \| IN_MEETING \| AWAY \| null, message }` | `null` = automatic; message ≤ 80 characters |
| `activity:idle` | `{ idle }` | Sent by the browser after 15 minutes without input, and again on activity |
| `knock:send` | `{ roomId }` | `NO_ONE_IN`, `NO_KNOCK_NEEDED`, `ALREADY_HERE` |
| `knock:answer` | `{ id, accept }` | Only someone inside; `KNOCK_GONE` after the first answer |
| `summon:send` | `{ roomId, userIds }` | Owner or admin only; returns `{ sent, offline[] }` |
| `summon:answer` | `{ id, accept }` | |
| `meeting:end` | `{ roomId }` | Host or admin only |

| Server → client | |
|---|---|
| `floor:snapshot` | On connect: rooms, people, meetings, `me` |
| `presence:update` | One person changed (room, status, message, online/offline) |
| `rooms:update` | An admin changed the rooms |
| `meetings:update` | Summoned meetings and who hasn't answered yet |
| `knock:incoming` / `knock:closed` / `knock:answered` | Knocks |
| `summon:incoming` / `summon:closed` | Summons |
| `session:ended` | Signed out elsewhere; the browser goes to the sign-in page |

Each connection may send at most 40 messages per 10 seconds.

## Hosting

- **Where the socket connects:** the web app is on Vercel, which can't carry WebSockets, so the socket connects straight to the Railway domain.
- **Edge guard:** it doesn't apply to `/socket.io`; the access token is the check there.
- **Scaling out:** presence state is in memory, so it needs a single API instance. Running more than one needs the Socket.IO Redis adapter and moving knocks/summons to Redis.

## Screens

- **Office floor** (`/floor`):
  - the plan, with a legend of status colors
  - a side panel: who's where, or the selected person's card
  - a host panel for room owners (call selected / call everyone online / end meeting)
  - a knock dialog
- **Header**: the status menu (Automatic, Busy, In a meeting, Away, and a message).
- **Anywhere**: knock and summons prompts.
- **Office rooms** (`/admin/rooms`, Admin).
- **Home**: the "In the office now" card.

## Seed data

`pnpm db:seed` sets up the floor:
- Ptr. Joel Santiago owns the Senior Pastor's office and the CEO Strategy Room.
- The four agency CEOs are Strategy Room members.
- Engineering, Sales and Operations each have their department room.

## Tests

- **Unit** (`apps/api/src/presence/rules.spec.ts`): status order, room access, seats, routes along the hallways.
- **End to end** (`apps/api/test/presence.e2e-spec.ts`, plus one check in `edge.e2e-spec.ts`), over real sockets:
  - sign-in on connect
  - home rooms
  - offline on close
  - room rules and capacity
  - knocks accepted and declined
  - the leaders' room
  - summons and ending a meeting
  - chosen status beating room and idle
  - idle across tabs
  - timesheet breaks walking people to the break room and back
  - force-logout ending the live connection
  - room admin (RBAC, validation, audit, live update)
  - the socket working behind the Vercel edge guard
- **Web** (`apps/web/src/pages/floor/FloorPage.test.tsx`): the floor, walking in, the knock dialog, the person card, the host panel, the status menu, and the knock and summons prompts.
