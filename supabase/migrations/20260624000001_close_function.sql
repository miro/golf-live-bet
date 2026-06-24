-- Server-authoritative market close.
-- INV-simultaneous-close: this function is the ONLY thing that closes markets.
-- Client countdowns are display-only and never call this directly.

create extension if not exists pg_cron;

-- ------------------------------------------------------------------ --
-- close_expired_markets()
--
-- Called by pg_cron every minute (and available as an RPC for dev/testing).
-- For each open market whose closes_at has passed:
--   1. Sets status = 'closed' (or 'void' if no value was entered).
--   2. Broadcasts via Supabase Realtime so all subscribers see it simultaneously.
--
-- INV-void-refund: if sealed_value is null at close, status becomes 'void'.
-- Refund logic (writing Bet.payout + Participant.bankroll) is step 2.
-- ------------------------------------------------------------------ --
create or replace function public.close_expired_markets()
returns integer   -- number of markets closed/voided this call
language plpgsql
security definer
set search_path = public
as $$
declare
  rec           record;
  new_status    text;
  closed_count  integer := 0;
begin
  for rec in
    select
      m.id          as market_id,
      m.line,
      e.sealed_value
    from public.markets m
    join public.events  e on e.id = m.event_id
    where m.status = 'open'
      and m.closes_at <= now()
  loop
    -- INV-void-refund: no value entered → void
    new_status := case when rec.sealed_value is null then 'void' else 'closed' end;

    update public.markets
    set status = new_status
    where id = rec.market_id;

    closed_count := closed_count + 1;
  end loop;

  return closed_count;
end;
$$;

-- Allow the anon role to call this function (needed for the dev Force Close button).
-- In a production config this would be restricted to service_role only.
grant execute on function public.close_expired_markets() to anon, authenticated;

-- ------------------------------------------------------------------ --
-- pg_cron schedule: run every minute.
-- Markets with closes_at in the past will be swept up within ~60s.
-- For the step-1 demo, market windows are set to 90s so close always
-- falls within one cron tick. Use the dev Force Close button for
-- instant testing.
-- ------------------------------------------------------------------ --
select cron.schedule(
  'close-expired-markets',   -- job name (idempotent)
  '* * * * *',               -- every minute
  'select public.close_expired_markets()'
);
