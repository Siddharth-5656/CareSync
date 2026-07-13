# CareSync

An elderly-parent health tracker and family-connection tool. A child pairs a
tablet to their parent's account with a 6-digit code; the parent's tablet is
a huge-button, textless UI; the child's dashboard stays locked every day until
they actually call their parent and hit "Verify."

This repo has been built, installed, and tested end-to-end (Postgres schema,
every API route, and the React build) before being handed to you. It is ready
to run as-is.

```
caresync/
├── server/          Node + Express + PostgreSQL API
│   ├── db/schema.sql
│   ├── server.js
│   ├── package.json
│   └── .env.example
└── client/          React + Vite + Tailwind frontend
    ├── src/
    ├── package.json
    └── .env.example
```

---

## 1. Prerequisites

- Node.js 18+ and npm
- PostgreSQL 14+ running locally (or reachable over the network)

Check you have them:
```bash
node -v
npm -v
psql --version
```

---

## 2. Database setup

Create the database:
```bash
createdb caresync
# or, if that command isn't available:
psql -U postgres -c "CREATE DATABASE caresync;"
```

Load the schema:
```bash
cd server
psql -U postgres -d caresync -f db/schema.sql
```

You should see a sequence of `CREATE EXTENSION`, `CREATE TABLE`, and
`CREATE INDEX` confirmations with no errors.

---

## 3. Backend setup

```bash
cd server
cp .env.example .env
```

Open `.env` and fill in your actual Postgres credentials and a real
`JWT_SECRET` (any long random string — e.g. run `openssl rand -hex 32`).

Install dependencies and start the server:
```bash
npm install
npm run dev        # auto-restarts on file changes (nodemon)
# or
npm start           # plain node, no auto-restart
```

You should see:
```
CareSync server running on port 4000
```

Verify it's alive:
```bash
curl http://localhost:4000/api/health
# {"status":"ok"}
```

---

## 4. Frontend setup

In a **second terminal**:
```bash
cd client
cp .env.example .env
npm install
npm run dev
```

Vite will print a local URL, typically:
```
http://localhost:5173
```

---

## 5. Using the app

### As the child / family member
1. Go to `http://localhost:5173/register` and create an account.
2. You'll land on **Generate Code** — click "Generate Code" to get a 6-digit
   code (valid 15 minutes).
3. Keep this tab open.

### As the parent tablet (open in a second browser tab, or an incognito window,
so it doesn't share localStorage with the child tab)
1. Go to `http://localhost:5173/pair`.
2. Enter the parent's name and the 6-digit code from step above.
3. Click "Connect" — this permanently binds the tablet to the child's account
   and drops you into the big-button tablet view at `/tablet`.

### Back on the child's dashboard
1. Go to `http://localhost:5173/dashboard`.
2. You'll see the **call gate lock screen** — this is intentional. Click
   "I called — Verify" to unlock today's checklist view (in the real product
   this only appears after an actual phone call).
3. Once unlocked, you'll see the connection dot (green = tablet heartbeat
   received in the last 20 minutes, gray = offline) and the "Manage Tasks"
   panel to add daily / weekly / one-time tasks.
4. Tasks you add only appear on the parent tablet on the day(s) they're
   scheduled for — refresh the tablet tab (it also auto-refreshes every 5
   minutes) to see new tasks appear.

### On the parent tablet
- Single tap on a task card marks it done (turns green).
- Press and hold (~0.7s) to reset a completed task — this is deliberately
  slower than a tap so it's forgiving of hand tremors and accidental double
  taps.
- A heartbeat ping fires silently every 15 minutes in the background; there
  is no visible indicator on the tablet itself by design — only the child's
  dashboard shows the online/offline dot.

---

## 6. Testing the API directly (optional)

If you want to exercise the backend without the UI, here's a full curl-based
flow (also how this project was validated before delivery):

```bash
# 1. Register a child account
curl -s -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Jane","email":"jane@example.com","password":"password123"}'
# → copy the returned "token"

# 2. Generate a join code
curl -s -X POST http://localhost:4000/api/pairing/generate-code \
  -H "Authorization: Bearer <TOKEN>"
# → copy the returned "joinCode"

# 3. Redeem the code as the parent tablet
curl -s -X POST http://localhost:4000/api/pairing/redeem \
  -H "Content-Type: application/json" \
  -d '{"joinCode":"<CODE>","parentName":"Mom"}'
# → copy "parentId" and "deviceToken"

# 4. Create a daily task (as the child)
curl -s -X POST http://localhost:4000/api/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"parentId":"<PARENT_ID>","title":"Take morning medicine","category":"medicine","recurrenceType":"daily"}'

# 5. Fetch today's tasks (as the parent tablet)
curl -s http://localhost:4000/api/tasks/today -H "x-device-token: <DEVICE_TOKEN>"

# 6. Mark a task complete
curl -s -X POST http://localhost:4000/api/tasks/<TASK_ID>/toggle \
  -H "Content-Type: application/json" -H "x-device-token: <DEVICE_TOKEN>" \
  -d '{"action":"complete"}'

# 7. Send a heartbeat
curl -s -X POST http://localhost:4000/api/heartbeat -H "x-device-token: <DEVICE_TOKEN>"

# 8. Check status (as the child)
curl -s http://localhost:4000/api/status/<PARENT_ID> -H "Authorization: Bearer <TOKEN>"

# 9. Unlock today's checklist (the "Verify Call" action)
curl -s -X POST http://localhost:4000/api/unlock/<PARENT_ID> -H "Authorization: Bearer <TOKEN>"
```

---

## 7. Production notes

- Set a strong, random `JWT_SECRET` — never use the placeholder in `.env.example`.
- Put the API behind HTTPS; the parent device token and child JWT are both
  bearer credentials and must not travel over plain HTTP in production.
- The `daily_tasks.last_completed_date` and `system_state.last_unlock_date`
  columns are compared against `CURRENT_DATE` on every read, so the daily
  reset requires no cron job — just make sure your DB server's timezone
  matches your users' expectations, or convert dates to each family's local
  timezone if you expand beyond one time zone.
- Consider adding rate limiting to `/api/auth/login` and
  `/api/pairing/redeem` before shipping.
