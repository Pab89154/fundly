Private personal savings app — one editable goal at a time (Fundly).

**Live:** [https://pab89154.github.io/fundly/](https://pab89154.github.io/fundly/)  
API: `https://fundly.pmolinasamayoa.workers.dev` (Cloudflare Worker)

## Run locally

```bash
cd my-money-tracker
npm install
npm run dev
```

Open **http://localhost:7687**

You’ll see a **lock screen**: enter your password, then the 6-digit authenticator code.

Data saves to **Supabase** while unlocked. Use **Log out** (or Settings → Lock) when you leave. Sign-in is required once each day.

## `.env` (server only — never commit)

```bash
SUPABASE_URL=https://….supabase.co
SUPABASE_SERVICE_ROLE_KEY=…
FUNDLY_APP_PASSWORD=…
FUNDLY_SESSION_SECRET=…
FUNDLY_TOTP_SECRET=…
```

PrintX keys are optional until sync is wired.

## SQL

Run [`supabase/migrations/20261031000000_fundly_state.sql`](supabase/migrations/20261031000000_fundly_state.sql) in the Supabase SQL editor once (already applied on the Fundly project).

## Scripts

- `npm run dev` — port 7687
- `npm run build`
- `npm run test:money`
