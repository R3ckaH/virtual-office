# Phase 1: Auth, roles, user management, login/logout logging

## What's in this phase

- Email + password sign-in, optional 2-step sign-in (authenticator app), optional Google / Microsoft SSO
- Forgot password and account-invite links (single use, emailed)
- 30-minute inactivity timeout (configurable) with a 2-minute warning
- Every sign-in, failure, lockout, sign-out, timeout and forced sign-out logged with time, IP and browser/OS
- Admin: add/edit people, roles, departments, managers, deactivate/reactivate, unlock, force sign-out, reset 2-step
- Audit log of admin changes (changed fields only)
- RBAC checked on every API endpoint and every page
- Light and dark mode, responsive down to phone width

## Database schema

Migration: `apps/api/drizzle/0000_phase1_auth_users.sql`. All timestamps are `timestamptz` (UTC).

| Table | Purpose | Key columns |
|---|---|---|
| `org_settings` | One row of company settings | company_name, primary_color, logo_url, default_timezone, session_timeout_minutes |
| `departments` | Teams | name (unique), head_user_id |
| `users` | People | email (unique, lower-case), password_hash (argon2id, null until invite accepted), full_name, title, role (ADMIN/MANAGER/EMPLOYEE), status (ACTIVE/DEACTIVATED), timezone, department_id, manager_id, mfa_secret_enc, mfa_enabled, failed_login_count, locked_until, last_login_at |
| `sessions` | One per signed-in browser | user_id, refresh_hash, previous_refresh_hash, refresh_rotated_at, ip, browser, os, device, auth_method, last_activity_at, expires_at, revoked_at, revoked_reason, revoked_by_id |
| `auth_events` | Login/logout history | user_id, email, session_id, type, ip, user_agent, browser, os, detail, created_at |
| `one_time_tokens` | Reset and invite links | user_id, purpose (PASSWORD_RESET/INVITE), token_hash, expires_at, used_at |
| `mfa_recovery_codes` | 10 single-use backup codes | user_id, code_hash, used_at |
| `sso_identities` | Linked Google/Microsoft accounts | user_id, provider, subject |
| `audit_logs` | Admin changes | actor_id, action, entity_type, entity_id, before, after, ip |

`auth_events.type` values: LOGIN_SUCCESS, LOGIN_FAILED, LOGIN_LOCKED, LOGOUT, SESSION_TIMEOUT, FORCED_LOGOUT, PASSWORD_RESET_REQUESTED, PASSWORD_RESET, PASSWORD_CHANGED, MFA_ENABLED, MFA_DISABLED, MFA_FAILED, REFRESH_TOKEN_REUSE.

## API endpoints

Base path `/api`. "Any" means any signed-in user. Everything not marked public requires `Authorization: Bearer <access token>`.

### Public

| Method | Path | Purpose |
|---|---|---|
| GET | `/config` | Company name, brand color, logo, timeout, enabled SSO providers |
| GET | `/health` | Liveness + DB check |
| POST | `/auth/login` | Email + password → session, or `{ mfaRequired, mfaToken }` |
| POST | `/auth/login/mfa` | 2-step code or recovery code → session |
| POST | `/auth/refresh` | Refresh cookie + CSRF header → new access token (rotates cookie) |
| POST | `/auth/logout` | Ends this session; `{ reason: "timeout" }` from the idle timer |
| POST | `/auth/forgot-password` | Emails a reset link (always 202, no account enumeration) |
| POST | `/auth/reset-password/validate` | Checks a reset/invite link, returns email + purpose |
| POST | `/auth/reset-password` | Sets the new password, signs out all sessions |
| GET | `/auth/sso/:provider/start` | Redirects to Google/Microsoft |
| GET | `/auth/sso/:provider/callback` | Completes SSO, sets cookies, redirects to the app |

### Signed in

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/me` | Any | My profile + permissions |
| PATCH | `/me` | Any | Update name, title, time zone |
| POST | `/me/password` | Any | Change password (signs out other sessions) |
| GET | `/auth/session` | Any | Timeout status (does not count as activity) |
| POST | `/auth/activity` | Any | Records real user activity |
| GET | `/auth/sessions` | Any | My signed-in devices |
| DELETE | `/auth/sessions/:id` | Any (own) | Sign out one of my devices |
| POST | `/auth/mfa/setup` | Any | New TOTP secret + QR code |
| POST | `/auth/mfa/enable` | Any | Confirm code, returns 10 recovery codes |
| POST | `/auth/mfa/disable` | Any | Password + code required |
| GET | `/org/timezones` | Any | Team time zones for the top-bar clocks |
| GET | `/departments` | Any | Department list with head and headcount |
| GET | `/users` | Admin (all), Manager (direct reports) | Search/filter/paginate people |
| GET | `/users/:id` | Admin, Manager (own reports), self | One person (404 if out of scope) |
| GET | `/users/manager-options` | Admin | Active managers/admins for pickers |
| POST | `/users` | Admin | Add a person (+ invite email) |
| PATCH | `/users/:id` | Admin | Edit details, role, department, manager |
| POST | `/users/:id/deactivate` | Admin | Deactivate + end all sessions |
| POST | `/users/:id/activate` | Admin | Reactivate or clear a lockout |
| POST | `/users/:id/force-logout` | Admin | End all sessions now |
| POST | `/users/:id/reset-mfa` | Admin | Turn off 2-step for a lost phone |
| POST | `/users/:id/send-password-link` | Admin | Invite (no password yet) or reset link |
| GET | `/users/:id/sessions` | Admin | Someone's active sessions |
| POST/PATCH/DELETE | `/departments[/:id]` | Admin | Manage departments |
| GET | `/auth-events` | Admin | Login history (filters: person, event, date range) |
| GET | `/audit-logs` | Admin | Audit log (filters: area, actor, date range) |

Errors always look like `{ statusCode, message, code?, errors? }` where `errors` maps field names to messages.

## Screens

| Route | Who | Screen |
|---|---|---|
| `/login` | Public | Sign-in, 2-step step, SSO buttons, sign-out reason notices |
| `/forgot-password` | Public | Request a reset link |
| `/reset-password?token=` | Public | Set a new password, or finish an invite |
| `/` | Any | Greeting in your time zone, Time clock placeholder (Phase 2), your details, where you're signed in |
| `/settings/profile` | Any | Profile, password, 2-step setup with QR + recovery codes, signed-in devices |
| `/floor`, `/meetings`, `/chat`, `/tasks`, `/attendance`, `/leave` | Any | "Arrives in phase N" pages that hold their place in the nav |
| `/reports` | Admin, Manager | Placeholder (Phase 7) |
| `/admin/users` | Admin | People table, add/edit, person panel with account actions |
| `/admin/departments` | Admin | Department cards, add/edit/remove |
| `/admin/login-history` | Admin | Sign-in events with IP and browser |
| `/admin/audit-log` | Admin | Admin changes with before/after |

The top bar shows live clocks for the team's time zones (your own first), for planning across Manila and US hours.

## Security controls

| Requirement | How it's handled |
|---|---|
| Hashed passwords | argon2id (OWASP baseline parameters); 12+ characters with a letter and a number |
| Rate-limited login | 10 requests/min per IP on login, 2-step, forgot and reset; account lockout after 5 failures for 15 minutes (both configurable) |
| Session theft | Access token lives in memory only (never localStorage). Refresh token is an httpOnly, SameSite=Strict cookie scoped to `/api/auth`, rotated on every use with reuse detection |
| CSRF | Cookie-authenticated endpoints (refresh, logout) require a double-submit `X-CSRF-Token` header; everything else uses the Bearer header |
| XSS | React escaping, strict CSP on the web host (inline theme script allowed by hash, guarded by a test), Helmet headers on the API |
| SQL injection | Parameterized queries through Drizzle; `LIKE` wildcards escaped in search |
| Force logout / deactivation | Session row is checked on every request, so it takes effect immediately |
| Inactivity timeout | Server-enforced from `last_activity_at`; the browser only records real input, warns at 2 minutes, and checks the server before warning so another active tab keeps the session alive |
| Account enumeration | Same message and timing for unknown email vs wrong password; forgot-password always returns 202 |
| Secrets at rest | TOTP secrets AES-256-GCM encrypted; reset tokens, refresh tokens and recovery codes stored as SHA-256 hashes |
| Least privilege | Role is read from the database on every request, never trusted from the token; managers only see their direct reports; admins can't deactivate themselves or remove the last admin |
| HTTPS only | `secure` cookies and HSTS in production; App Service "HTTPS Only" |

## Tests

- **API unit** (`apps/api/src/**/*.spec.ts`): session timeout rules, refresh token parsing, encryption, recovery codes, audit diffs, the RBAC guard, password rules.
- **API end-to-end** (`apps/api/test/*.e2e-spec.ts`, real PostgreSQL): login and cookie flags, identical errors for unknown email, field validation, lockout + unlock, deactivated and invited users, logout, inactivity timeout, activity vs status, device sign-out, refresh rotation, reuse detection, six concurrent refreshes, password reset, change password, 2-step setup/login/recovery codes/admin reset, 403 for managers and employees on every admin endpoint, manager scope, role change taking effect immediately, create/invite/accept, duplicate and validation errors, audit diffs, reporting loops, last-admin protection, force logout, deactivate/reactivate, departments CRUD, login history and audit log filters.
- **Web** (`apps/web/src/**/*.test.tsx`): login validation, server errors, 2-step flow, SSO error message, redirect when signed out, session restore with CSRF header, role-based navigation and page blocking, team clocks, time zone conversions (including US daylight saving), brand text contrast, CSP hash.

## Decisions to revisit later

- 2-step codes can be reused within their 30-second window; per-user "last used step" tracking can be added if required.
- The rate limiter keeps counts in memory; switch it to Redis when the API runs on more than one instance (Redis arrives with presence in Phase 3).
- SSO signs in existing accounts only (matched by verified email); it doesn't create accounts.
