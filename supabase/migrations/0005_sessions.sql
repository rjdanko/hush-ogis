create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  zone_id uuid not null references public.zones(id) on delete cascade,
  start_ts timestamptz not null default now(),
  end_ts timestamptz,
  committed_minutes int not null check (committed_minutes > 0 and committed_minutes <= 480),
  achieved_minutes int check (achieved_minutes >= 0),
  final_score int check (final_score between 0 and 100),
  created_at timestamptz not null default now()
);

alter table public.sessions enable row level security;

-- RLS restricts rows; this grant permits the operation at all (no table/column
-- access without RLS policies, no row access without RLS policy match).
grant select, insert, update on public.sessions to authenticated;

create policy "sessions_select_own" on public.sessions
  for select using (user_id = auth.uid());

create policy "sessions_insert_own" on public.sessions
  for insert with check (user_id = auth.uid());

create policy "sessions_update_own" on public.sessions
  for update using (user_id = auth.uid());
