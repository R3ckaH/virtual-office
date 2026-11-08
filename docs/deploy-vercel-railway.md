# Deploying: Vercel (web) + Railway (API and database)

```
browser ──► https://office.yourdomain.com  (Vercel)
              ├─ /            React app (static files from apps/web/dist)
              └─ /api/*  ──►  Railway API  (adds x-origin-secret)  ──►  Railway PostgreSQL
                                   ▲
biometric terminals, sync agent ───┘  (straight to the Railway domain)
```

The browser only ever talks to the Vercel domain. Vercel forwards `/api/*` to the API on Railway, so the session cookies stay on one site (`SameSite=Strict` keeps working and there is no CORS to configure). The API refuses any request that does not carry the secret header Vercel adds, so the Railway address cannot be used to go around Vercel.

Three kinds of traffic go straight to Railway instead, each with its own check: Railway's health check, biometric terminals pushing punches (`/iclock/*`, checked by registered serial number and optional IP allow-list), and the office sync agent (`/api/ingest/*`, checked by device token).

Why two hosts: Vercel serves the web app well, but its functions cannot keep the long-lived WebSocket connections the office floor, presence and chat need from Phase 3. Railway runs the API as an always-on container.

You need: the code in a GitHub repository, a Vercel account and a Railway account (both can sign in with GitHub). Pick the Singapore region on Railway; it is the closest to Manila.

## 1. Create the secrets

Run these once on your Mac and keep the output in your password manager:

```bash
openssl rand -base64 48   # JWT_SECRET
openssl rand -base64 32   # DATA_ENCRYPTION_KEY  (must be exactly this command: 32 bytes)
openssl rand -base64 48   # ORIGIN_SECRET        (goes into BOTH Railway and Vercel)
```

Never change `DATA_ENCRYPTION_KEY` after launch: it encrypts everyone's 2-step sign-in secrets.

## 2. Railway: database and API

1. **New Project → Deploy from GitHub repo**, choose the repository. Railway detects the monorepo and offers a service per app: keep `@vo/api` and delete `@vo/web` (the web app goes on Vercel). Leave the service's Root Directory empty (the build needs the whole repo).
   Railway no longer reads `railway.json` for new services, so set these in the API service's **Settings** (the file in the repo records the same values):
   - **Builder:** Dockerfile, **Dockerfile Path** `/apps/api/Dockerfile`
   - **Custom Build Command** and **Custom Start Command:** empty (Railway pre-fills pnpm commands; remove them, the Dockerfile does both)
   - **Watch Paths:** `/apps/api/**`, `/packages/shared/**`, `/pnpm-lock.yaml`
   - **Healthcheck Path:** `/api/health`
2. In the same project: **+ New → Database → PostgreSQL**.
3. Set the region to **Southeast Asia (Singapore)** on both the API and the Postgres service (Settings → Scale), and on the API under **Networking** click **Generate Domain** with target port `8080`. You get something like `voapi-production-xxxx.up.railway.app`. Write it down.
4. API service → **Variables**. Add:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (Railway fills it in) |
   | `NODE_ENV` | `production` |
   | `WEB_ORIGIN` | `https://<your Vercel domain>` (step 3 below; update it then) |
   | `API_ORIGIN` | the same Vercel domain (the API is reached through Vercel) |
   | `JWT_SECRET` | from step 1 |
   | `DATA_ENCRYPTION_KEY` | from step 1 |
   | `ORIGIN_SECRET` | from step 1 |
   | `TRUST_PROXY` | `0` (the secret check reads the real client IP itself) |
   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | your mail provider, for invites and password resets |
   | `BOOTSTRAP_COMPANY_NAME` | `Covenant Creators` |
   | `BOOTSTRAP_ADMIN_EMAIL` | your email |
   | `BOOTSTRAP_ADMIN_NAME` | your name |
   | `BOOTSTRAP_ADMIN_PASSWORD` | a strong password (12+ characters) |

   Also add `PORT` = `8080`, matching the domain's target port.

5. Deploy. On start the container applies database migrations, creates the first Admin from the `BOOTSTRAP_*` variables (only if no Admin exists yet), and starts the API. The deploy turns green once `/api/health` answers.
6. Check: `https://<railway domain>/api/health` shows `{"status":"ok"}`, and `https://<railway domain>/api/config` shows **403**. That 403 is correct: direct access is blocked.

## 3. Vercel: the web app

1. Edit `apps/web/vercel.json`: replace `REPLACE-WITH-YOUR-API.up.railway.app` with your Railway domain from step 2.3. Commit and push.
2. Vercel → **Add New → Project**, import the same repository.
   - **Root Directory:** `apps/web`
   - Framework, install, build and output settings come from `vercel.json`; leave the overrides off.
3. **Environment Variables:** add `ORIGIN_SECRET` with the same value as on Railway (Production, and Preview if you use preview deployments).
4. Deploy. Your domain is shown at the end, e.g. `covenant-office.vercel.app`. To use your own domain: **Settings → Domains**.
5. Back on Railway, set `WEB_ORIGIN` and `API_ORIGIN` to that exact domain (with `https://`, no trailing slash). Railway redeploys.

## 4. First sign-in and clean-up

1. Open the Vercel domain and sign in with the bootstrap email and password.
2. Turn on two-step sign-in for your account (Settings → Profile & security).
3. On Railway, **delete the four `BOOTSTRAP_*` variables**. The account stays; the variables are only read on first start.
4. Invite your team from **People**.
5. Open **Login history** and confirm your sign-in shows your real IP address, not a Vercel one. If every sign-in shows the same address, the forwarding headers are not arriving: tell Claude, because rate limits and lockouts depend on it.

## 5. Biometric devices

Devices connect to the **Railway** domain, not the Vercel one. The **Biometric devices** page shows the right address automatically (Railway tells the API its own domain). If you add a custom domain to the Railway service, set `DEVICE_HOST` to it on Railway.

- **Cloud push (ADMS):** on the terminal, set Cloud Server to the Railway domain, port 443, HTTPS on. Older terminals that only speak plain HTTP can't reach Railway's HTTPS-only domain; use the sync agent for those.
- **Sync agent:** in its `config.json`, set `apiUrl` to `https://<railway domain>/api`.
- **IP allow-list:** if you restrict a device to your office IP, open the device afterwards and check its last-seen status updates. If pushes start failing with the allow-list on, remove it and tell Claude.

## 6. Google / Microsoft sign-in (optional)

Register the apps with these redirect URIs, using the **Vercel** domain:

- `https://<vercel domain>/api/auth/sso/google/callback`
- `https://<vercel domain>/api/auth/sso/microsoft/callback`

Then set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` and/or `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` on Railway.

## Day to day

- Push to `main`: Vercel redeploys the web app, Railway redeploys the API (only when `apps/api`, `packages/shared` or the lockfile changed). GitHub Actions runs the tests on every push.
- Database backups: Railway → Postgres → **Backups**. Turn on scheduled backups before real data goes in.
- Changing `ORIGIN_SECRET`: update it on Railway and Vercel, then redeploy both. Until both have the new value, the site cannot reach the API.
- Logs: Railway → API service → **Deployments → View logs**.

## What changes in later phases

- **Phase 3 (presence, office floor) and Phase 5 (chat)** open a WebSocket. That connection goes straight to the Railway domain, because Vercel does not forward WebSockets. The Content-Security-Policy in `vercel.json` will be updated to allow that one host, and the socket will authenticate with the short-lived access token.
- **Phase 4 (meetings)** adds `LIVEKIT_*` variables on Railway and the LiveKit host to the CSP.
