# Phase 5: Chat and announcements

## What people can do

| Who | What |
| --- | --- |
| Everyone | Message anyone directly (from **Chat → New message** or **Message** on a person's card on the office floor), or up to 8 people in a group conversation. Talk in their department's channel (added and removed automatically as their department changes). Read **Announcements**. Browse and join public channels. Share files, @mention people, react with emoji, edit (24 h) and delete their own messages, search everything they can see. |
| Admins, HR, Managers | Create channels (public: anyone can find and join; private: invite only), rename them, add/remove people, archive. The creator (or any admin) manages a channel. |
| Admins, HR, leaders | Post in **Announcements** and pin posts. Pinned announcements show at the top of everyone's **Home**. "Leaders" are the people marked as not attendance-tracked (the Senior Pastor and agency CEOs). |
| Admins | Remove anyone's message in channels they belong to (recorded in the audit log). Admins can't open other people's direct or group conversations. |

### Messages

* Live delivery over the office connection; unread counts per conversation, a red count for direct
  messages and @mentions, and a total on the **Chat** item in the sidebar (direct messages + announcements + mentions).
* A "New" line marks where you left off; read markers move as you scroll to the bottom.
* Typing indicators. Drafts are kept per conversation for the browser session.
* A pop-up (with **Open**) for direct messages, mentions and announcements when you're elsewhere in the app.
* Formatting: links are clickable, `**bold**`, `_italic_`, `` `code` ``. Nothing is rendered as HTML.
* Retries are safe: each send carries a client id so a resend isn't posted twice.

### Files

* Up to 5 files per message, 10 MB each. PDFs, Office documents, images, text/CSV, zip, audio and video.
  SVG and HTML are refused (they can run scripts).
* Stored in Postgres (`chat_files.data`) for now. Image and PDF types are checked against their
  magic bytes; downloads are served with `nosniff`, a locked-down CSP and `Content-Disposition`
  (`attachment` for everything except images, PDF, audio and video).
* Uploads and downloads go straight to the Railway API domain, because Vercel's proxy caps request
  bodies at 4.5 MB. Uploads use the access token; downloads use signed links (HMAC with `JWT_SECRET`,
  valid ~12 h, so `<img>` tags work without the token). `/api/chat/files` is exempt from the Vercel
  origin check for that reason.
* Files uploaded but never sent are deleted after a day (hourly job).
* Watch the database size on Railway; when it grows, move files to a bucket (the same R2 bucket the
  meeting recordings would use).

## API (`/api/chat`)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/me` | `canCreateChannels`, `canAnnounce` |
| GET | `/channels` · `/channels/browse` · `/channels/:id` | your conversations with unread/mention counts; public channels; one |
| POST | `/channels` | create (Admin/HR/Manager) |
| PATCH | `/channels/:id` · POST `/channels/:id/archive` | creator or admin |
| GET/POST | `/channels/:id/members` · DELETE `/channels/:id/members/:userId` | |
| POST | `/channels/:id/join` · `/channels/:id/leave` · `/channels/:id/read` `{seq}` | |
| POST | `/dms` `{userIds}` | opens (or finds) a direct / group conversation |
| GET/POST | `/channels/:id/messages` | `?before=` `?after=` `?around=` `&limit=` |
| PUT/DELETE | `/messages/:id` | edit (24 h, author) / delete (author, or admin) |
| POST/DELETE | `/messages/:id/reactions[/:emoji]` | |
| POST/DELETE | `/messages/:id/pin` | Announcements only |
| GET | `/announcements` | pinned announcements for Home |
| GET | `/search?q=&channelId=` | prefix word search over your conversations |
| POST | `/files?name=` | raw file body |
| GET | `/files/:id?exp=&sig=` | signed link, public |

Socket events: `chat:message`, `chat:message-updated`, `chat:message-deleted`, `chat:channel`,
`chat:read`, `chat:typing`, `chat:pins`; client → server `chat:typing`.

## Data

Migration `0004_phase5_chat.sql`: `channels` (kinds DM, GROUP, DEPARTMENT, ANNOUNCEMENTS, CUSTOM;
one per department and one announcements channel enforced by unique indexes; DMs keyed by the sorted
member ids), `channel_members` (with `last_read_seq`), `messages` (global `seq`, mention ids with a
GIN index, full-text index on the body, soft delete, pins), `message_reactions`, `chat_files`.
Membership of department channels and Announcements is synced at start-up and whenever a person's
department or status changes.

## Tests

* API e2e (`test/chat.e2e-spec.ts`): system channels and who can post, live delivery, unread and
  mention counts, idempotent send, paging, edit/react/delete, DMs and groups (admins can't read them),
  custom channels (public/private, manage, archive), announcements and Home pins, files (type and magic-byte
  checks, signed links, orphan cleanup), search scope, department moves, typing.
* Unit: message segmentation, previews, permissions.
* Web: conversation list and badges, sending with an @mention, read-only announcements.
* Checked in a browser: leader posts and pins → shows on Home; mention → pop-up for the other person;
  reaction; image upload; DM from the office floor; phone layout.
