-- Capability token a checked-in device uses to post score pings without ever
-- knowing its own session_id (SR-9 minimal ingest: the wire payload is
-- {anon_session_token, zone_id, score, ts} only). Generated server-side at
-- check-in, unique, never updated.
alter table public.sessions
  add column anon_token uuid not null default gen_random_uuid();

alter table public.sessions
  add constraint sessions_anon_token_key unique (anon_token);

-- The ingest RPC is the only way to write score_pings from now on: revoke the
-- direct table grant from Phase 1 (0006_score_pings.sql) so a client can no
-- longer bypass the minimal-ingest contract by inserting {session_id, score}
-- directly. The RLS select policy is untouched -- a user can still read their
-- own score history.
revoke insert on public.score_pings from authenticated;

create or replace function public.ingest_score_ping(
  p_anon_token uuid,
  p_zone_id uuid,
  p_score int,
  p_ts timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
begin
  if p_score < 0 or p_score > 100 then
    raise exception 'score out of range' using errcode = 'P0001';
  end if;

  select s.id into v_session_id
  from public.sessions s
  where s.anon_token = p_anon_token
    and s.zone_id = p_zone_id
    and s.user_id = auth.uid()
    and s.end_ts is null;

  if v_session_id is null then
    raise exception 'invalid or inactive session' using errcode = 'P0002';
  end if;

  insert into public.score_pings (session_id, ts, score)
  values (v_session_id, p_ts, p_score);
end;
$$;

revoke all on function public.ingest_score_ping(uuid, uuid, int, timestamptz) from public;
grant execute on function public.ingest_score_ping(uuid, uuid, int, timestamptz) to authenticated;

-- Rate limit (SR-1): a real device pings at most every few seconds; 12/min
-- (avg one every 5s) is generous headroom without allowing a flood.
create or replace function public.enforce_score_pings_rate_limit()
returns trigger
language plpgsql
as $$
declare
  recent_count int;
begin
  select count(*) into recent_count
  from public.score_pings
  where session_id = new.session_id
    and ts > now() - interval '60 seconds';

  if recent_count >= 12 then
    raise exception 'rate limit exceeded: too many score pings, try again shortly'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger score_pings_rate_limit_trigger
before insert on public.score_pings
for each row execute function public.enforce_score_pings_rate_limit();
