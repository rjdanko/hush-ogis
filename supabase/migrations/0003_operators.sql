create table public.operators (
  id uuid primary key references auth.users(id) on delete cascade,
  venue_name text not null,
  badge_token text,
  created_at timestamptz not null default now()
);

alter table public.operators enable row level security;

-- RLS restricts rows; this grant permits the operation at all (no table/column
-- access without RLS policies, no row access without RLS policy match).
grant select, insert, update on public.operators to authenticated;

create policy "operators_select_own" on public.operators
  for select using (id = auth.uid());

create policy "operators_update_own" on public.operators
  for update using (id = auth.uid());

create policy "operators_insert_own" on public.operators
  for insert with check (id = auth.uid());
