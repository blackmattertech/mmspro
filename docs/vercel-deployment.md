# Vercel Deployment Guide

Deploy MMSPro as **two separate Vercel projects**: one for the client (`client/`) and one for the server (`server/`).

## 1. Deploy the server first

**Vercel project settings**

| Setting | Value |
|---------|-------|
| Root Directory | `server` |
| Framework | Express (auto-detected) |
| Build Command | `npm run build` |
| Output Directory | *(leave empty)* |

Vercel auto-detects [`server/app.js`](server/app.js) as the Express entry point. Do **not** use a separate `api/index.js` handler.

**Environment variables** (set in Vercel dashboard — do not commit `.env`):

| Variable | Example | Notes |
|----------|---------|-------|
| `SUPABASE_URL` | `https://xxx.supabase.co` | Required |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | Required |
| `CLIENT_URL` | `https://mmspro-client.vercel.app` | CORS allowlist (comma-separated) |
| `APP_PUBLIC_URL` | `https://mmspro-client.vercel.app` | Password-reset / invite email links |
| `API_PUBLIC_URL` | `https://mmspro-server.vercel.app` | Optional — Swagger server URL |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | `{"type":"service_account",...}` | Required on Vercel — paste full JSON as one line |
| `MAILJET_API_KEY` | | Required for emails |
| `MAILJET_SECRET_KEY` | | Required for emails |
| `MAILJET_FROM_EMAIL` | | Verified sender in Mailjet |
| `MAILJET_FROM_NAME` | `MMS PRO` | Optional |

**Important:** Do **not** set `FIREBASE_SERVICE_ACCOUNT_PATH` on Vercel — the JSON key file is gitignored and not deployed. Use `FIREBASE_SERVICE_ACCOUNT_JSON` only. Remove `FIREBASE_SERVICE_ACCOUNT_PATH` from Vercel env vars if you copied your local `.env`.

After deploy, verify:

- `GET https://<server-url>/health` → `{"status":"ok"}`
- `GET https://<server-url>/api/docs` → Swagger UI
- `GET https://<server-url>/api/docs/openapi.json` → OpenAPI JSON

## 2. Deploy the client

**Vercel project settings**

| Setting | Value |
|---------|-------|
| Root Directory | `client` |
| Framework | Vite |
| Build Command | `npm run build` |
| Output Directory | `dist` |

**Environment variables** (all `VITE_*` vars are baked in at build time):

| Variable | Required | Notes |
|----------|----------|-------|
| `VITE_API_URL` | **Yes** | Server Vercel URL, no trailing slash |
| `VITE_SUPABASE_URL` | Yes | |
| `VITE_SUPABASE_ANON_KEY` | Yes | |
| `VITE_FIREBASE_API_KEY` | For push | |
| `VITE_FIREBASE_AUTH_DOMAIN` | For push | |
| `VITE_FIREBASE_PROJECT_ID` | For push | |
| `VITE_FIREBASE_STORAGE_BUCKET` | For push | |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | For push | |
| `VITE_FIREBASE_APP_ID` | For push | |
| `VITE_FIREBASE_VAPID_KEY` | For push | |
| `VITE_FIREBASE_MEASUREMENT_ID` | Optional | Analytics |

Redeploy the client whenever `VITE_API_URL` changes.

## 3. External configuration

### Supabase Dashboard

Authentication → URL Configuration:

- **Site URL**: `https://<client-vercel-url>`
- **Redirect URLs**: add:
  - `https://<client-vercel-url>/reset-password`
  - `https://<client-vercel-url>/**` (or specific routes)

### Firebase Console

Project Settings → General → Your apps → Authorized domains:

- Add `<client-vercel-url>` (without `https://`)

For FCM push notifications, ensure Web Push certificate (VAPID) is configured and matches `VITE_FIREBASE_VAPID_KEY`.

## 4. Verification checklist

**Server**

- [ ] `/health` returns ok
- [ ] `/api/docs` loads with all endpoint tags
- [ ] `POST /api/auth/password-reset` works without auth
- [ ] Authenticated `GET /api/me` works with Bearer token in Swagger

**Client ↔ Server**

- [ ] Login works
- [ ] Dashboard loads data (Network tab shows requests to server URL, not `:5050`)
- [ ] No CORS errors in browser console
- [ ] Deep links work: `/login`, `/admin/dashboard`, `/:orgSlug/dashboard`

## 5. Local development

Unchanged — run server and client separately:

```bash
cd server && npm run dev   # http://localhost:5050
cd client && npm run dev   # http://localhost:5173 (proxies /api to server)
```

Swagger UI locally: http://localhost:5050/api/docs

## 6. Performance Baseline Checklist

Run this after every production deployment and track before/after values.

- Frontend Web Vitals (production): LCP, INP, CLS, TBT
- API latency (server): p50/p95 for `/api/session`, `/api/work-orders/received`, `/api/tasks`, `/api/notifications`
- Serverless duration (Vercel): average + p95 function duration **and cold start rate**
- Bundle size budget:
  - main JS chunk gzip/brotli size
  - login background assets total transfer size

Suggested quick checks:

1. Lighthouse on `/login`, dashboard, work-orders page, admin users page.
2. Browser Network tab to confirm no duplicate org/profile fetches.
3. Vercel Function logs/metrics for slow routes and cold starts.
4. Compare values against previous deployment; only keep changes that improve metrics.

### Confirm production slowness in 10 minutes

1. Open the slow page in production → DevTools **Network**.
2. Note **TTFB** for `/api/session` and the main list endpoint (received WOs / tasks).
   - Multi-second TTFB with a small response body → cold start or API host latency.
   - Fast TTFB but large/slow downloads → payload / ID-prefetch issues (should be fixed by patch `72-list-visibility-rpcs.sql`).
3. In Vercel → **server** project → Observability / Functions: check cold start % and p95 duration.
4. Hit the same list endpoint against local API with the same org: if prod TTFB is ~10–50× local, latency amplification / serverless is the cause—not the React UI.

## 7. Always-on API (recommended when cold starts dominate)

Express + in-memory caches + `setInterval` schedulers are a poor fit for Vercel serverless:

- Cold starts reload `firebase-admin`, Supabase client, and wipe `signedUrlCache` / permission caches.
- Background jobs in [`server/index.js`](../server/index.js) only start when the process calls `listen()` — they do **not** run reliably from the serverless `app.js` export alone.

**Preferred production layout**

| Piece | Host |
|-------|------|
| Client (Vite static) | Vercel |
| API (`node index.js`) | Always-on: Railway, Render, Fly.io, or a small VM |
| Schedulers | Same always-on process, or external cron → `POST /api/internal/run-jobs` |

Set client `VITE_API_URL` to the always-on API URL and redeploy the client.

Optional keep-warm (only if you must stay on Vercel Functions): ping `GET /health` every 1–5 minutes from an external cron. Prefer moving the API off serverless instead.

### Scheduler controls

| Env var | Default | Meaning |
|---------|---------|---------|
| `ENABLE_TASK_SCHEDULER` | `true` when not on Vercel (`VERCEL` unset) | Start in-process recurrence / reminder / PM timers |
| `INTERNAL_JOBS_SECRET` | unset | If set, enables `POST /api/internal/run-jobs` with header `x-internal-jobs-secret` for external cron |

On Vercel, leave `ENABLE_TASK_SCHEDULER=false` (automatic when `VERCEL=1`) and call the internal jobs endpoint from cron, or run schedulers on an always-on worker.
