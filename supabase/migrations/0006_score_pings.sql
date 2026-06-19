create table public.score_pings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  ts timestamptz not null default now(),
  score int not null check (score between 0 and 100)
);

alter table public.score_pings enable row level security;

-- RLS restricts rows; this grant permits the operation at all (no table/column
-- access without RLS policies, no row access without RLS policy match). Only
-- select/insert are granted: this table has no update/delete policy, since
-- score pings are an immutable, append-only ingest stream (SR-9 minimal-ingest).
grant select, insert on public.score_pings to authenticated;

create policy "score_pings_select_own" on public.score_pings
  for select using (
    exists (
      select 1 from public.sessions s
      where s.id = score_pings.session_id and s.user_id = auth.uid()
    )
  );

create policy "score_pings_insert_own" on public.score_pings
  for insert with check (
    exists (
      select 1 from public.sessions s
      where s.id = score_pings.session_id and s.user_id = auth.uid()
    )
  );
