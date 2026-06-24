-- ------------------------------------------------------------------ --
-- place_bet(market_id, participant_id, selection, stake)
--
-- All validation runs server-side in one locked transaction so no bet
-- can slip through after close (INV-no-late-bets) and no double-bet
-- can race past the unique constraint.
--
-- Stake is deducted from bankroll immediately on placement.
-- On resolution winners receive payout; on void the stake is refunded.
-- ------------------------------------------------------------------ --
create or replace function public.place_bet(
  p_market_id      uuid,
  p_participant_id uuid,
  p_selection      text,
  p_stake          integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market record;
  v_part   record;
  v_bet_id uuid;
begin
  -- Lock market row to close the closes_at race window
  select * into v_market
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    return jsonb_build_object('error', 'market not found');
  end if;

  -- INV-no-late-bets
  if v_market.status <> 'open' or v_market.closes_at <= now() then
    return jsonb_build_object('error', 'market is closed — no late bets');
  end if;

  -- Validate selection
  if p_selection not in ('over', 'under') then
    return jsonb_build_object('error', 'selection must be over or under');
  end if;

  if p_stake <= 0 then
    return jsonb_build_object('error', 'stake must be positive');
  end if;

  -- Lock participant row
  select * into v_part
  from public.participants
  where id = p_participant_id
  for update;

  if not found then
    return jsonb_build_object('error', 'participant not found');
  end if;

  -- INV-betting-knowledge-wall: players cannot bet
  if v_part.role <> 'observer' then
    return jsonb_build_object('error', 'players cannot place bets');
  end if;

  if p_stake > v_part.bankroll then
    return jsonb_build_object('error', 'insufficient bankroll');
  end if;

  -- Deduct stake immediately
  update public.participants
  set bankroll = bankroll - p_stake
  where id = p_participant_id;

  -- Insert bet; unique constraint catches double-bet attempts
  insert into public.bets (market_id, participant_id, selection, stake)
  values (p_market_id, p_participant_id, p_selection, p_stake)
  returning id into v_bet_id;

  return jsonb_build_object(
    'bet_id',   v_bet_id,
    'bankroll', v_part.bankroll - p_stake
  );

exception
  when unique_violation then
    return jsonb_build_object('error', 'you have already bet on this market');
end;
$$;

grant execute on function public.place_bet(uuid, uuid, text, integer)
  to anon, authenticated;

-- ------------------------------------------------------------------ --
-- close_expired_markets()  (replaces the step-1 version)
--
-- For each open market whose closes_at has passed:
--   void path  — sealed_value is null → refund all stakes (INV-void-refund)
--   resolve path — calculate parimutuel payouts, write Bet.payout and
--                  Participant.bankroll atomically (INV-conservation).
--
-- Uses floor division so sum(payouts) ≤ pot; rounding residual is kept
-- rather than minted (INV-conservation).
-- Goes directly open → resolved (or void); skips intermediate 'closed'.
-- ------------------------------------------------------------------ --
create or replace function public.close_expired_markets()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  m            record;
  b            record;
  winning_side text;
  pot          integer;
  win_total    integer;
  payout_amt   integer;
  closed_count integer := 0;
begin
  for m in
    select
      mk.id        as market_id,
      mk.line,
      mk.house_seed,
      e.sealed_value
    from public.markets mk
    join public.events  e on e.id = mk.event_id
    where mk.status = 'open'
      and mk.closes_at <= now()
  loop
    if m.sealed_value is null then
      -- INV-void-refund: no value entered → void, refund every stake
      for b in
        select id, participant_id, stake
        from public.bets
        where market_id = m.market_id
      loop
        update public.bets        set payout   = b.stake           where id = b.id;
        update public.participants set bankroll = bankroll + b.stake where id = b.participant_id;
      end loop;

      update public.markets set status = 'void' where id = m.market_id;

    else
      -- INV-noninteger-line guarantees no tie
      winning_side := case when m.sealed_value > m.line then 'over' else 'under' end;

      -- pot = all stakes + house seed (INV-conservation: payout ≤ pot)
      select coalesce(sum(stake), 0) + m.house_seed
      into pot
      from public.bets where market_id = m.market_id;

      select coalesce(sum(stake), 0)
      into win_total
      from public.bets
      where market_id = m.market_id and selection = winning_side;

      for b in
        select id, participant_id, stake, selection
        from public.bets
        where market_id = m.market_id
      loop
        if b.selection = winning_side and win_total > 0 then
          -- Floor keeps sum(payouts) ≤ pot — INV-conservation
          payout_amt := floor(b.stake::numeric * pot / win_total);
          update public.bets        set payout   = payout_amt           where id = b.id;
          update public.participants set bankroll = bankroll + payout_amt where id = b.participant_id;
        else
          -- Loser: stake already deducted; payout = 0
          update public.bets set payout = 0 where id = b.id;
        end if;
      end loop;

      update public.markets
      set status = 'resolved', resolved_outcome = winning_side
      where id = m.market_id;
    end if;

    closed_count := closed_count + 1;
  end loop;

  return closed_count;
end;
$$;

-- grant already exists from migration 001; re-stating is idempotent
grant execute on function public.close_expired_markets() to anon, authenticated;
