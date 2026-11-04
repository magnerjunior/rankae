-- Um ranka recorrente pode ter mais de um encontro na mesma data.
begin;

alter table public.sessions add column session_number integer not null default 1 check (session_number > 0);
alter table public.sessions drop constraint sessions_ranka_id_scheduled_on_key;
alter table public.sessions add constraint sessions_ranka_day_number_key unique (ranka_id, scheduled_on, session_number);
drop index public.sessions_ranka_date_idx;
create index sessions_ranka_date_idx on public.sessions (ranka_id, scheduled_on desc, session_number desc);

create or replace function public.start_ranka_session(
  p_ranka_id uuid,
  p_scheduled_on date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.rankas%rowtype;
  previous public.sessions%rowtype;
  current_session public.sessions%rowtype;
  next_number integer;
begin
  select * into target from public.rankas where id = p_ranka_id;
  if target.id is null then raise exception 'Ranka not found' using errcode = 'P0002'; end if;
  if not private.can_manage_ranka(target.id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext(target.id::text));
  select * into previous from public.sessions where ranka_id = target.id
    order by scheduled_on desc, session_number desc limit 1;
  if previous.id is not null and previous.state <> 'completed' then
    if previous.scheduled_on = p_scheduled_on then return to_jsonb(previous); end if;
    raise exception 'Finish the previous ranka first' using errcode = '55000';
  end if;
  select coalesce(max(session_number), 0) + 1 into next_number from public.sessions
    where ranka_id = target.id and scheduled_on = p_scheduled_on;
  insert into public.sessions (ranka_id, org_id, scheduled_on, session_number, state, season_year, contribution_amount_cents, rules_snapshot)
  values (target.id, target.org_id, p_scheduled_on, next_number, 'check_in', extract(year from p_scheduled_on)::integer,
    coalesce(previous.contribution_amount_cents, 0),
    coalesce(previous.rules_snapshot, jsonb_build_object(
      'squadSize', 6, 'regulationDurationMs', 420000, 'overtimeDurationMs', 180000,
      'targetGoals', 0, 'targetGoalDifference', 0, 'tiePolicy', 'overtime',
      'maxLinePlayers', 24, 'maxKeepers', 3, 'contributionMode', 'fixed', 'totalCostCents', 0)))
  returning * into current_session;
  return to_jsonb(current_session);
end;
$$;

commit;
