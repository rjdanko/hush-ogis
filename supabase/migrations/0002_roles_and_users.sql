create type public.user_role as enum ('user', 'operator', 'admin');

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  anon_handle text not null,
  role public.user_role not null default 'user',
  prefs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;

-- RLS restricts rows; these grants permit the operation at all (no table/column
-- access without RLS policies, no row access without RLS policy match).
grant select, insert, update on public.users to authenticated;

create policy "users_select_own" on public.users
  for select using (id = auth.uid());

create policy "users_update_own" on public.users
  for update using (id = auth.uid());

create policy "users_insert_own" on public.users
  for insert with check (id = auth.uid());

-- privilege-escalation guard: only service_role may change a user's role
create or replace function public.prevent_role_self_escalation()
returns trigger
language plpgsql
as $$
begin
  if new.role is distinct from old.role and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'role change blocked';
  end if;
  return new;
end;
$$;

create trigger users_prevent_role_escalation
  before update on public.users
  for each row execute function public.prevent_role_self_escalation();

-- auto-provision a public.users row whenever a new auth.users row is created
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, anon_handle)
  values (new.id, 'anon-' || substr(new.id::text, 1, 8));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
