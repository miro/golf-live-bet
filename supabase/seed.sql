-- Dev seed: one tenant, one round, two users, one event type.
-- Run once after migrations. Safe to re-run (uses fixed UUIDs).

-- Fixed UUIDs so API routes can reference them without a lookup.
-- In a real setup these would be created via the app flow.

insert into public.tenants (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Golf Company')
on conflict (id) do nothing;

insert into public.users (id, tenant_id, display_name, role)
values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Dev Player',   'player'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'Dev Observer', 'observer')
on conflict (id) do nothing;

insert into public.rounds (id, tenant_id, name, status)
values ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000001', 'Dev Round', 'live')
on conflict (id) do nothing;

insert into public.event_types (id, key, resolution_mode, label, active)
values
  ('00000000-0000-0000-0000-000000000030', 'drive',   'measured_pool', 'Drive Distance', true),
  ('00000000-0000-0000-0000-000000000031', 'bunker',  'field_prop',    'Bunker',         true)
on conflict (id) do nothing;
