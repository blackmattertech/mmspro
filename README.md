# MMSPro — React + Node.js + Supabase + Firebase FCM

## Quick Start

### 1. Supabase Setup
- Create a project at supabase.com
- Run `supabase.sql` in the SQL Editor
- Create your org: `select create_org_for_user('<your-user-id>', 'My Company', 'my-company');`

### 2. Firebase Setup
- Create a project at console.firebase.google.com
- Enable Cloud Messaging
- Get VAPID key: Project Settings → Cloud Messaging → Web Push certificates
- Get service account: Project Settings → Service Accounts → Generate new private key

### 3. Client
```bash
cd client
cp .env.example .env   # Fill in Supabase + Firebase keys
npm install
npm run dev            # http://localhost:5173
```

### 4. Server
```bash
cd server
cp .env.example .env   # Fill in Supabase + Firebase service account JSON
npm install
npm run dev            # http://localhost:5000
```

## Architecture

### Multi-tenancy (Org Isolation)
Every table has an `org_id` column. Data is isolated at 3 levels:
1. **Supabase RLS** — DB rejects queries that cross org boundaries
2. **Express middleware** — `requireOrgAccess` attaches `req.userProfile.org_id` and all queries are scoped to it
3. **React hooks** — `useOrg()` gives you the current org in any component

### Push Notifications (FCM)
1. User grants permission → `useNotifications().registerToken()` saves FCM token to DB
2. `firebase-messaging-sw.js` (service worker) handles background notifications
3. Server calls `notifyUser(userId, payload)` or `notifyOrg(orgId, payload)` to send

## Route Map
| Path | Access |
|------|--------|
| `/login` | Public |
| `/:orgSlug/*` | Authenticated + org member (e.g. `/blackmatter/dashboard`) |
| `/admin/*` | Super Admin only |

## API Endpoints
| Endpoint | Access | Description |
|----------|--------|-------------|
| `GET /api/me` | Auth | Current user |
| `POST /api/notifications/token` | Auth | Register FCM token |
| `POST /api/notifications/send/user/:id` | Auth | Notify a user |
| `POST /api/notifications/send/org` | Auth | Notify entire org |
| `GET /admin-api/users` | Admin | All users |
| `PATCH /admin-api/users/:id/role` | Admin | Change user role |

## File Structure
```
saas-boilerplate/
├── client/
│   ├── public/
│   │   ├── firebase-messaging-sw.js  ← FCM service worker
│   │   └── manifest.json             ← PWA manifest
│   └── src/
│       ├── lib/
│       │   ├── supabase.js
│       │   └── firebase.js           ← FCM client init
│       ├── hooks/
│       │   ├── useAuth.js
│       │   ├── useOrg.js             ← org context
│       │   └── useNotifications.js   ← FCM token registration
│       ├── components/shared/
│       │   └── ProtectedRoute.jsx
│       ├── layouts/
│       │   ├── AppLayout.jsx
│       │   └── AdminLayout.jsx
│       └── pages/
│           ├── auth/Login.jsx
│           ├── app/Dashboard.jsx
│           └── admin/
├── server/
│   ├── middleware/
│   │   ├── auth.js                   ← JWT verification
│   │   ├── adminOnly.js              ← platform admin check
│   │   └── orgAccess.js             ← org scoping + ownership check
│   ├── services/
│   │   ├── supabase.js               ← admin client
│   │   ├── firebase.js               ← FCM admin SDK
│   │   └── notifications.js          ← notifyUser / notifyOrg helpers
│   └── routes/
│       ├── api/
│       │   ├── index.js
│       │   └── notifications.js
│       └── admin/index.js
└── supabase.sql                      ← Full schema with RLS
```
# mmspro
