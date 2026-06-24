-- Dev seed. Safe to re-run (fixed UUIDs, ON CONFLICT DO NOTHING).

insert into public.tenants (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Golf Company')
on conflict (id) do nothing;

insert into public.users (id, tenant_id, display_name, role)
values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Dev Player',    'player'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'Observer A',    'observer'),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'Observer B',    'observer')
on conflict (id) do nothing;

insert into public.rounds (id, tenant_id, name, status)
values ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000001', 'Dev Round', 'live')
on conflict (id) do nothing;

-- Participants: player + two observers, each with 1000-coin bankroll (INV-bankroll-scope)
insert into public.participants (id, round_id, user_id, role, bankroll)
values
  ('00000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000010', 'player',   1000),
  ('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000011', 'observer', 1000),
  ('00000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000012', 'observer', 1000)
on conflict (id) do nothing;

insert into public.event_types (id, key, resolution_mode, label, active)
values
  ('00000000-0000-0000-0000-000000000030', 'drive',  'measured_pool', 'Drive Distance', true),
  ('00000000-0000-0000-0000-000000000031', 'bunker', 'field_prop',    'Bunker',         true)
on conflict (id) do nothing;
