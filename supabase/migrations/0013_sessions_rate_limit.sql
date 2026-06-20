-- Mobile writes directly to Supabase (no API-route layer like the dashboard
-- has), so SR-1 rate limiting for check-ins has to be enforced in Postgres
-- itself -- a trigger applies no matter which client (app, curl, another
-- future client) calls insert.
create or replace function public.enforce_sessions_rate_limit()
returns trigger
language plpgsql
as $$
declare
  recent_count int;
begin
  select count(*) into recent_count
  from public.sessions
  where user_id = new.user_id
    and created_at > now() - interval '60 seconds';

  if recent_count >= 5 then
    raise exception 'rate limit exceeded: too many check-ins, try again shortly'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger sessions_rate_limit_trigger
before insert on public.sessions
for each row execute function public.enforce_sessions_rate_limit();
