begin;

create table if not exists public.flightdeck_journals (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  version integer not null default 1 check (version > 0),
  journal jsonb not null check (
    jsonb_typeof(journal) = 'object'
    and coalesce(jsonb_typeof(journal->'flights'), '') = 'array'
    and coalesce(jsonb_typeof(journal->'airports'), '') = 'array'
  )
);

alter table public.flightdeck_journals enable row level security;
revoke all on public.flightdeck_journals from public, anon, authenticated;
grant select, insert, update on public.flightdeck_journals to authenticated;

drop policy if exists flightdeck_read_own on public.flightdeck_journals;
drop policy if exists flightdeck_insert_own on public.flightdeck_journals;
drop policy if exists flightdeck_update_own on public.flightdeck_journals;
create policy flightdeck_read_own on public.flightdeck_journals
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy flightdeck_insert_own on public.flightdeck_journals
  for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy flightdeck_update_own on public.flightdeck_journals
  for update to authenticated using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

commit;
