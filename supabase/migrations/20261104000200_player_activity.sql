-- Resumo de presença e contribuições calculado apenas para organizadores do ranka.
begin;

create index contribution_records_player_pending_idx on public.contribution_records (player_id, session_id)
  where status = 'pending' and amount_cents > 0;
create index attendance_player_session_idx on public.attendance (player_id, session_id)
  where status in ('present', 'left');

create function public.get_ranka_player_activity(p_ranka_id uuid)
returns table (
  player_id uuid,
  last_seen_on date,
  absence_since_on date,
  missed_sessions bigint,
  unpaid_sessions bigint,
  unpaid_cents bigint,
  alert_months integer
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  target public.rankas%rowtype;
begin
  select * into target from public.rankas where id = p_ranka_id;
  if target.id is null then raise exception 'Ranka not found' using errcode = 'P0002'; end if;
  if not private.can_manage_ranka(target.id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  return query
  with member_players as (
    select p.id, p.created_at from public.players p
    where p.org_id = target.org_id and p.status = 'active'
  ), last_seen as (
    select a.player_id, s.scheduled_on, s.session_number,
      row_number() over (partition by a.player_id order by s.scheduled_on desc, s.session_number desc) as rn
    from public.attendance a
    join public.sessions s on s.id = a.session_id
    where s.ranka_id = target.id and a.status in ('present', 'left')
  ), missed as (
    select p.id, count(s.id) as count
    from member_players p
    left join last_seen seen on seen.player_id = p.id and seen.rn = 1
    left join public.sessions s on s.ranka_id = target.id and s.state = 'completed'
      and s.created_at >= p.created_at
      and (seen.player_id is null or (s.scheduled_on, s.session_number) > (seen.scheduled_on, seen.session_number))
      and not exists (select 1 from public.attendance a where a.session_id = s.id and a.player_id = p.id and a.status in ('present', 'left'))
    group by p.id
  ), unpaid as (
    select c.player_id, count(*) as count, sum(c.amount_cents) as cents
    from public.contribution_records c
    join public.sessions s on s.id = c.session_id
    where s.ranka_id = target.id and c.status = 'pending' and c.amount_cents > 0
    group by c.player_id
  )
  select p.id, seen.scheduled_on, coalesce(seen.scheduled_on, p.created_at::date), coalesce(m.count, 0), coalesce(u.count, 0), coalesce(u.cents, 0),
    greatest(1, least(24, coalesce((target.settings_json ->> 'inactivityAlertMonths')::integer, 6)))
  from member_players p
  left join last_seen seen on seen.player_id = p.id and seen.rn = 1
  left join missed m on m.id = p.id
  left join unpaid u on u.player_id = p.id;
end;
$$;

revoke all on function public.get_ranka_player_activity(uuid) from public, anon;
grant execute on function public.get_ranka_player_activity(uuid) to authenticated;

commit;
