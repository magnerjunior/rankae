begin;
select plan(2);
select is((
  select count(*)::integer from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prokind = 'f'
    and p.prosrc like '%Revision conflict%'
    and p.prosrc like '%errcode = ''40001''%'
), 0, 'Business revision conflicts cannot trigger PostgREST serialization retries');
select ok((
  select prosrc like '%errcode = ''PT409''%' and prosecdef
  from pg_proc where oid = 'public.transition_match_clock(uuid,text,bigint,uuid)'::regprocedure
), 'Clock retains SECURITY DEFINER and returns a non-retryable conflict');
select * from finish();
rollback;
