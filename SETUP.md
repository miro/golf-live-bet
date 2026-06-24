# Step 1 Setup & Verification

How to run the two-tab simultaneous-close demo.

## 1. Create a Supabase project

1. Go to supabase.com → New project (Free tier is fine).
2. Note your **Project URL** and **anon key** (Settings → API).
3. Also note your **service_role key** (same page — keep this secret).

## 2. Configure environment

```bash
cp .env.local.example .env.local
# Edit .env.local with your three values:
# NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
# SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

## 3. Enable extensions in the Supabase dashboard

Dashboard → Database → Extensions, search and enable:
- **pg_cron** (for the server-clock close scheduler)

## 4. Run migrations

In the Supabase dashboard, open **SQL Editor** and run each file in order:

1. `supabase/migrations/20260624000000_initial_schema.sql`
2. `supabase/migrations/20260624000001_close_function.sql`
3. `supabase/seed.sql`

Or, if you have the Supabase CLI installed and linked:
```bash
supabase link --project-ref <ref>
supabase db push
supabase db seed
```

## 5. Verify the pg_cron job was created

In SQL Editor:
```sql
select jobname, schedule, command from cron.job;
-- should show: close-expired-markets | * * * * * | select public.close_expired_markets()
```

## 6. Start the dev server

```bash
npm run dev
# → http://localhost:3000
```

## 7. Run the two-tab test

This is the step-1 acceptance test for INV-simultaneous-close.

1. **Open two browser tabs** both pointing to `http://localhost:3000`.
2. In both tabs, watch the event log — you should see `Realtime channel: SUBSCRIBED`.
3. In **Tab 1**, click **"Open Market"**.
   - Tab 1 log: `Market opened id=… line=250.5 closes=<time>`
   - Tab 2 log: nothing yet (it hasn't polled/subscribed to the market state — that's fine for now).
4. In **Tab 1**, click **"Force Close"** (this calls `close_expired_markets()` via RPC).
   - **Both tabs** should log `BROADCAST market_closed → status=closed sealed_value=275.3 line=250.5` at the same instant.
   - **Both tabs** show the market panel update to `CLOSED` with `sealed_value: 275.3 yards ← REVEALED`.
5. Verify that before Force Close, the market panel shows `sealed_value: (sealed until close)`.

The key assertion: the sealed value `275.3` appears in **both tabs at the same time**, sourced from the Postgres broadcast — not from a client timer.

### What "Force Close" actually does

`POST /api/dev/close-markets` calls `supabase.rpc("close_expired_markets")`. The Postgres function:
- Checks `closes_at <= now()` (so it only closes markets whose window has already passed — it is NOT a bypass of the time check; the dev market window is 90s and Force Close is typically clicked after that)
- Updates `markets.status = 'closed'`
- Calls `realtime.send(...)` — the broadcast that both tabs receive

If you click Force Close before 90s have elapsed, the market won't be found (its `closes_at` is still in the future) and the log will show the call succeeded but no broadcast fires. Just wait for the window.

### Testing pg_cron (optional)

Instead of Force Close: open a market and wait ~2 minutes. The pg_cron job fires every minute and will close the market automatically. Both tabs should still receive the broadcast simultaneously.

## 8. Regenerate types after schema changes

```bash
npx supabase gen types typescript --project-id <ref> > src/types/database.types.ts
```

Run this after every migration and commit the result.
