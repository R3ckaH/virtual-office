# Setting up the office for a new company

Each company gets its own copy: its own database, API and web address. Nothing is shared between
copies, so one company can never see another's data. All copies run the same code from the same
GitHub repository; what differs is each copy's variables.

```
GitHub repo (main) ──┬─► Railway project "acme"   (API + PostgreSQL)  ◄── Vercel project "acme-office"
                     ├─► Railway project "bravo"  (API + PostgreSQL)  ◄── Vercel project "bravo-office"
                     └─► ...
```

Allow about 30 minutes per company. You need the Railway and Vercel accounts that own the other copies.

## 1. Collect from the customer

- Company name, and the name and email of their first administrator
- Their time zone (set later in Admin → Company settings)
- Which optional modules they bought (see step 3)
- The web address they want (a `…vercel.app` name, or their own domain)

## 2. Create this copy's secrets

```bash
openssl rand -base64 48   # JWT_SECRET
openssl rand -base64 32   # DATA_ENCRYPTION_KEY  (exactly this command: 32 bytes)
openssl rand -base64 48   # ORIGIN_SECRET        (goes into BOTH Railway and Vercel)
```

Use new values for every company. Never reuse another copy's secrets, and never change
`DATA_ENCRYPTION_KEY` after launch. Keep them in your password manager under the company's name.

## 3. Railway: database and API

Follow section 2 of [deploy-vercel-railway.md](deploy-vercel-railway.md) in a **new Railway project**
named after the company. The variables that differ per company:

| Variable | Value |
|---|---|
| `JWT_SECRET`, `DATA_ENCRYPTION_KEY`, `ORIGIN_SECRET` | this copy's secrets from step 2 |
| `WEB_ORIGIN`, `API_ORIGIN` | this copy's web address (step 4) |
| `BOOTSTRAP_COMPANY_NAME` | the company's name |
| `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_PASSWORD` | their first administrator; delete these after the first sign-in |
| `MODULES` | optional modules for this copy (below) |
| `SMTP_*`, `MAIL_FROM` | the mail account that sends this company's invites and notices |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | a LiveKit project for this company (video calls) |

### Optional modules

`MODULES` is a comma-separated list of the optional modules this copy has. A module that is off is
hidden in the web app and its API answers 404.

| Value | What it switches on | On when `MODULES` is not set |
|---|---|---|
| `devices` | Biometric terminals and the sync agent (Admin → Biometric devices) | yes |

- Not set: the defaults in the last column.
- `MODULES=devices`: exactly the listed modules.
- `MODULES=none`: no optional modules.

The API refuses to start if `MODULES` names a module that doesn't exist, so a typo can't silently
switch something off. To change what a company has, edit the variable; Railway redeploys.

## 4. Vercel: the web app

1. **Add New → Project**, import the same repository, Root Directory `apps/web`.
2. Environment Variables:
   - `API_UPSTREAM`: this copy's Railway address, e.g. `https://acme-api.up.railway.app` (no trailing slash)
   - `ORIGIN_SECRET`: the same value as on this copy's Railway API
3. Deploy, then set the domain (Settings → Domains).
4. Back on Railway, set `WEB_ORIGIN` and `API_ORIGIN` to that exact address.

## 5. Check the copy

1. `https://<railway address>/api/health` shows `{"status":"ok"}`; `https://<railway address>/api/config` shows **403**.
2. `https://<web address>/api/config` shows this company's name and the modules you set.
3. Sign in as the first administrator, then **delete the `BOOTSTRAP_*` variables** on Railway.
4. Admin → Login history shows the real IP address of that sign-in, not a Vercel one.
5. Office Floor opens and shows the rooms. A new copy starts with nine rooms with neutral names.

## 6. Hand over to the company's administrator

They set these themselves in the app:

- **Admin → Company settings:** logo, brand color, time zone, which emails go out
- **Admin → Office rooms:** room names, what each room is for, owners and members
- **Admin → Departments**, **People**, **Schedules & setup**
- **Admin → Leave & holidays:** leave types start empty

## Updating all copies

Every copy deploys from `main`. A push to `main` redeploys every Railway API (database changes are
applied on start) and every Vercel project. Before pushing a release:

- Run the tests and the type check.
- Database changes must work with the previous version of the code for a few minutes, because the
  copies don't all restart at the same moment.

To hold a company back on an older version, point its Railway service and Vercel project at a
release branch instead of `main`.

## Removing a company

Export what they are entitled to (Reports → export; a database dump on request), then delete the
Vercel project and the Railway project. Deleting the Railway project deletes the database.
