# Virtual Office

A web-based virtual office for a remote team: clock in and out, see who's around on an office floor, meet over video, chat, and give managers a clear view of attendance.

This repository is being built in seven phases. **Phase 2 (this release): clock in/out, schedules, attendance and biometric device sync.**

| Phase | Scope | Status |
|---|---|---|
| 1 | Auth, roles, user management, login/logout logging | ✅ Done |
| 2 | Clock in/out, breaks, schedules, attendance, biometric sync | ✅ Done |
| 3 | Presence + virtual office floor | Next |
| 4 | Meetings (LiveKit) + calendar | |
| 5 | Chat + announcements | |
| 6 | Leave, tasks, daily reports | |
| 7 | Dashboards, reports, exports, admin settings | |

## Stack

| Layer | Choice |
|---|---|
| Web | React 18, TypeScript, Vite, Tailwind CSS, TanStack Query, React Hook Form |
| API | Node.js 22, NestJS 11 (REST; Socket.IO arrives in Phase 3) |
| Database | PostgreSQL 16 with **Drizzle ORM** and versioned SQL migrations |
| Shared | `packages/shared`: Zod validation schemas, DTO types and the role→permission map, used by both web and API |
| Auth | Built in: argon2id passwords, TOTP 2-step sign-in, Google/Microsoft OIDC |
| Tests | Jest + Supertest against a real PostgreSQL (API), Vitest + Testing Library (web) |
| CI | GitHub Actions |
| Hosting target | Azure App Service (API), Azure Static Web Apps (web), Azure Database for PostgreSQL |

> **Change from the approved plan:** the data layer uses Drizzle ORM instead of Prisma. Drizzle is pure TypeScript (no separate query-engine binary to download at build/run time), generates plain SQL migrations you can review, and keeps queries close to SQL, which suits the reporting work in Phase 7. The data model itself is unchanged.

## Repository layout

```
apps/
  api/            NestJS API
    drizzle/      SQL migrations (generated, committed)
    src/
      auth/       login, 2FA, sessions, SSO, password reset, guards
      attendance/ clock, rules engine, HR board, exceptions, corrections, schedules, minute job
      devices/    biometric devices: cloud push (ADMS), agent/JSON ingest, file import, badge links
      users/      people admin + "me" profile
      departments/
      audit/      audit log + login history endpoints
      settings/   public config, org info
      db/         schema, migrate, seed, seed-demo
    test/         end-to-end tests (real PostgreSQL)
  web/            React app
    src/
      components/ layout (shell, guards, idle timeout) and UI kit
      pages/      auth, home, attendance, settings, admin (incl. HR attendance, schedules, devices)
      lib/        API client, auth state, theme, formatting
packages/
  shared/         Zod schemas, types, permissions, time zone helpers
  sync-agent/     office PC program that reads devices on the LAN and uploads punches
docs/
  phase-1.md      schema, endpoints, screens and security notes for Phase 1
  phase-2.md      the same for Phase 2 (attendance and biometric sync)
```

## Run it locally

Requirements: Node 22+, pnpm 10 (`corepack enable`), Docker (or a local PostgreSQL 16).

```bash
docker compose up -d                      # PostgreSQL (+ Redis for later phases)
pnpm install
cp apps/api/.env.example apps/api/.env    # then set JWT_SECRET and DATA_ENCRYPTION_KEY (commands are in the file)
pnpm --filter @vo/shared build
pnpm db:migrate
pnpm db:seed
pnpm db:seed:demo                         # optional: a week of sample punches for the attendance board
pnpm dev                                  # API on :4000, web on :5173
```

Open http://localhost:5173. In development, emails (invites, password resets) are printed in the API console instead of being sent.

### Sample accounts

Password for all of them: `OfficePass2026!`

| Role | Email | Notes |
|---|---|---|
| Admin | admin@acme.test | Maria Santos, Operations, Manila |
| Admin | pastor@acme.test | Ptr. Joel Santiago (placeholder), Senior Pastor. Attendance not tracked |
| HR | hr@acme.test | Grace Lim, HR Specialist: attendance board, schedules, devices |
| Manager | manager@acme.test | Jose Reyes, Engineering lead, Hybrid (on-site Mon/Wed/Thu). Direct reports: Ana, Emily, Paolo, Nico, Tess, Bea |
| Manager | sales.manager@acme.test | Daniel Brooks, Sales, New York hours |
| Manager | andrew.tan@acme.test, rachel.uy@acme.test, ben.ocampo@acme.test, faith.castillo@acme.test | Agency CEOs (placeholders). Not tracked |
| Employee | employee@acme.test | Ana Cruz, Engineering, Remote |
| Employee | emily.carter@acme.test | Emily Carter, Engineering, New York hours (9 PM – 6 AM Manila) |
| Employee | carlo.mendoza@acme.test | Carlo Mendoza, Sales, On-site |
| Employee | kevin.lim@acme.test | Kevin Lim, new hire with no badge linked yet |
| Employee | invited@acme.test | Liza Garcia. Invite pending (no password yet, can't sign in) |
| Employee | former@acme.test | Deactivated |

The rest of the attendance mockup's team (Paolo, Kim, Ryan, Joy, Nico, Tess, Bea, Sam) are also seeded with `@acme.test` emails.

## Tests

```bash
pnpm test                 # API unit + e2e, web component tests
pnpm typecheck
```

Docker Compose creates the `vo_test` database for you (or point `TEST_DATABASE_URL` elsewhere). The API end-to-end suite rebuilds it from the migrations on every run, then exercises real HTTP requests: login, lockout, refresh-token rotation and reuse detection, inactivity timeout, force logout, 2-step sign-in, password reset, and the role check on every admin endpoint. Phase 2 adds the attendance rules engine (unit), and end-to-end runs of the web clock, ADMS cloud push, sync-agent upload, file import, exceptions, the two-step correction approval and the minute job, on a frozen clock.

## Useful scripts

| Command | What it does |
|---|---|
| `pnpm dev` | API (watch mode) and web dev server together |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:seed` | Load the sample company (idempotent; refuses to run in production) |
| `pnpm db:seed:demo` | A week of sample punches, exceptions and corrections, modelled on the HR mockup (development only) |
| `pnpm db:reset` | Drop everything, migrate, seed (development only) |
| `pnpm --filter @vo/api db:generate` | Create a migration after editing `src/db/schema.ts` |

## Deploying to Azure (outline)

1. **Database:** Azure Database for PostgreSQL Flexible Server (require SSL; add `?sslmode=require` to `DATABASE_URL`).
2. **API:** build `apps/api/Dockerfile` and run it on App Service for Containers. The container applies migrations on start. Set every variable from `.env.example` as App Settings (secrets from Key Vault), `NODE_ENV=production`, `TRUST_PROXY=1`, and turn on **HTTPS Only**. Health probe: `/api/health`.
3. **Web:** deploy `apps/web/dist` to Azure Static Web Apps and link the API as its backend so `/api/*` is served from the same origin. That keeps the session cookies `SameSite=Strict` and avoids CORS. `public/staticwebapp.config.json` sets HSTS, CSP and SPA routing.
4. **Biometric cloud push:** devices call `https://<api-host>/iclock/...` on the **API's own host** (not the Static Web App), because the path is fixed in the device firmware. Set each device's "Cloud server" to the API host on port 443, register its serial number in Biometric devices, and preferably restrict it to the office's public IP.
5. **Email:** point `SMTP_*` at Azure Communication Services Email (or SendGrid).
6. **SSO (optional):** register apps in Google Cloud and Microsoft Entra with redirect URIs `https://<api-host>/api/auth/sso/google/callback` and `.../microsoft/callback`, then set the client ids/secrets.

## Privacy (RA 10173)

The platform stores only what it needs to run the office: work identity, role, time zone, sign-in records (time, IP address, browser/OS), and attendance punches (time, source, device and the device's user ID, IP for web clock-ins). Biometric templates (fingerprints, faces) stay on the devices; the Virtual Office never receives them. Passwords are hashed with argon2id; 2-step secrets are encrypted at rest (AES-256-GCM). No screenshots or keystroke logging exist. Retention settings and a data export/erase flow for data subject requests are scheduled for Phase 7.
