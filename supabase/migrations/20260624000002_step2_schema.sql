-- Step 2: one bet per participant per market + realtime publications for
-- participants and bets.

-- One bet per participant per market (codified by spec discussion)
alter table public.bets
  add constraint one_bet_per_participant unique (market_id, participant_id);

-- Expose participant bankroll and bet changes to all subscribers.
-- INV-simultaneous-close via WAL applies to these tables as well.
alter publication supabase_realtime add table public.participants;
alter publication supabase_realtime add table public.bets;
