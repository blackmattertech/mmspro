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
| `FIREBASE_SERVICE_ACCOUNT_JSON` | `{"type":"service_account",...}` | Required on Vercel (file path won't work) |
| `MAILJET_API_KEY` | | Required for emails |
| `MAILJET_SECRET_KEY` | | Required for emails |
| `MAILJET_FROM_EMAIL` | | Verified sender in Mailjet |
| `MAILJET_FROM_NAME` | `MMS PRO` | Optional |

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
