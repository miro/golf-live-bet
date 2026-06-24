-- Step 3: Google login integration.
--
-- When a user signs in via Google, Supabase Auth creates an auth.users row.
-- This trigger immediately mirrors the essential fields into public.users so
-- the application can reference them via FK without any extra round-trip.
--
-- The trigger runs SECURITY DEFINER so it bypasses the authenticated RLS
-- on public.users (the row doesn't exist yet when it fires).
--
-- participants(round_id, user_id) unique constraint already exists from
-- migration 000; get-or-create is handled at the application layer with
-- INSERT … ON CONFLICT DO NOTHING.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, tenant_id, display_name, role)
  values (
    new.id,
    '00000000-0000-0000-0000-000000000001',  -- dev tenant; extend when multi-tenant lands
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    'observer'  -- per-user default; per-round role lives in participants.role
  )
  on conflict (id) do update
    set display_name = excluded.display_name;

  return new;
end;
$$;

-- Drop first so reruns are idempotent (CREATE OR REPLACE does not work for triggers)
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_auth_user();
