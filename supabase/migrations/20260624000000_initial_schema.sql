-- Step 1 schema: only what the measured_pool spine needs.
-- Tables for field_prop, participants bankroll, and bets are included
-- as FK anchors and seams per the spec data contract — they are not
-- exercised until later build steps.

-- Extensions
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------------ --
-- TENANTS
-- ------------------------------------------------------------------ --
create table public.tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------------ --
-- USERS
-- ------------------------------------------------------------------ --
create table public.users (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id),
  display_name text not null,
  role         text not null default 'observer'
                check (role in ('player', 'observer', 'operator')),
  created_at   timestamptz not null default now()
);

-- ------------------------------------------------------------------ --
-- ROUNDS  (INV-bankroll-scope: bankroll lives on participant, per round)
-- ------------------------------------------------------------------ --
create table public.rounds (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id),
  name        text not null,
  status      text not null default 'setup'
               check (status in ('setup', 'live', 'closed')),
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------------ --
-- PARTICIPANTS  (seam — bankroll enforced in step 2)
-- ------------------------------------------------------------------ --
create table public.participants (
  id          uuid primary key default gen_random_uuid(),
  round_id    uuid not null references public.rounds(id),
  user_id     uuid not null references public.users(id),
  role        text not null check (role in ('player', 'observer')),
  bankroll    integer not null default 1000 check (bankroll >= 0),
  created_at  timestamptz not null default now(),
  unique (round_id, user_id)
);

-- ------------------------------------------------------------------ --
-- EVENT TYPES  (data-driven: adding a type is a row, not code)
-- ------------------------------------------------------------------ --
create table public.event_types (
  id              uuid primary key default gen_random_uuid(),
  key             text not null unique,
  resolution_mode text not null check (resolution_mode in ('measured_pool', 'field_prop')),
  label           text not null,
  active          boolean not null default true
);

-- ------------------------------------------------------------------ --
-- EVENTS
-- INV-sealed-value: sealed_value is stored here but NEVER returned
-- directly to clients — access via the market_state view only.
-- ------------------------------------------------------------------ --
create table public.events (
  id               uuid primary key default gen_random_uuid(),
  round_id         uuid not null references public.rounds(id),
  type_id          uuid not null references public.event_types(id),
  author_id        uuid not null references public.users(id),
  subject_id       uuid references public.users(id),
  hole             integer,
  created_at       timestamptz not null default now(),
  sealed_value     numeric,          -- measured_pool only
  value_entered_at timestamptz
);

-- ------------------------------------------------------------------ --
-- MARKETS
-- ------------------------------------------------------------------ --
create table public.markets (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references public.events(id),
  type             text not null check (type in ('over_under', 'field_prop')),
  line             numeric not null,
  opens_at         timestamptz not null default now(),
  closes_at        timestamptz not null,
  status           text not null default 'open'
                    check (status in ('open', 'closed', 'resolved', 'void')),
  house_seed       integer not null default 100,
  resolved_outcome text,
  created_at       timestamptz not null default now(),

  -- INV-noninteger-line: line must never be a whole number (no exact-tie pushes)
  constraint noninteger_line check (line <> floor(line))
);

-- ------------------------------------------------------------------ --
-- BETS  (seam — enforced in step 2)
-- ------------------------------------------------------------------ --
create table public.bets (
  id             uuid primary key default gen_random_uuid(),
  market_id      uuid not null references public.markets(id),
  participant_id uuid not null references public.participants(id),
  selection      text not null,
  stake          integer not null check (stake > 0),
  created_at     timestamptz not null default now(),
  payout         integer
);

-- ------------------------------------------------------------------ --
-- market_state VIEW  — the only way clients read market + value data.
-- INV-sealed-value: sealed_value is NULL while status = 'open'.
-- ------------------------------------------------------------------ --
create view public.market_state as
select
  m.id,
  m.event_id,
  m.type,
  m.line,
  m.opens_at,
  m.closes_at,
  m.status,
  m.house_seed,
  m.resolved_outcome,
  m.created_at,
  case
    when m.status in ('closed', 'resolved', 'void') then e.sealed_value
    else null
  end as sealed_value
from public.markets m
join public.events   e on e.id = m.event_id;

-- ------------------------------------------------------------------ --
-- ROW-LEVEL SECURITY
-- ------------------------------------------------------------------ --
alter table public.tenants      enable row level security;
alter table public.users        enable row level security;
alter table public.rounds       enable row level security;
alter table public.participants enable row level security;
alter table public.event_types  enable row level security;
alter table public.events       enable row level security;
alter table public.markets      enable row level security;
alter table public.bets         enable row level security;

-- Step 1: open read for anon on everything EXCEPT events (sealed_value lives there).
-- Auth-scoped policies are added in step 3 when Google login lands.

create policy "anon_read_tenants"      on public.tenants      for select using (true);
create policy "anon_read_users"        on public.users        for select using (true);
create policy "anon_read_rounds"       on public.rounds       for select using (true);
create policy "anon_read_participants" on public.participants  for select using (true);
create policy "anon_read_event_types"  on public.event_types  for select using (true);
create policy "anon_read_markets"      on public.markets      for select using (true);
create policy "anon_read_bets"         on public.bets         for select using (true);

-- events: no direct select for anon — must use market_state view.
-- INV-sealed-value enforced here at the DB layer.
create policy "deny_direct_events_read" on public.events for select using (false);

-- Grant view access (view runs as its owner, bypassing the deny policy on events)
grant select on public.market_state to anon, authenticated;

-- ------------------------------------------------------------------ --
-- TABLE-LEVEL PRIVILEGES
-- Tables created via SQL migrations don't get auto-grants (unlike
-- dashboard-created tables). Must be explicit.
-- ------------------------------------------------------------------ --
grant usage on schema public to anon, authenticated, service_role;

-- service_role: full access; BYPASSRLS handles row-level security
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- authenticated: full access, governed by RLS policies
grant select, insert, update, delete on all tables    in schema public to authenticated;
grant usage, select, update           on all sequences in schema public to authenticated;

-- anon: read only; the deny_direct_events_read RLS policy still blocks events.sealed_value
grant select          on all tables    in schema public to anon;
grant usage, select   on all sequences in schema public to anon;
