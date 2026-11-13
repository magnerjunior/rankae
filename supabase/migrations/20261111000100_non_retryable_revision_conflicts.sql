begin;

-- PostgREST 14 retries SQLSTATE 40001 indefinitely. A stale application revision
-- is deterministic, not a database serialization failure: return HTTP 409.
-- Patch only our revision guards, preserving the deployed bodies, ownership,
-- grants, SECURITY DEFINER, search_path, locking and idempotency checks.
do $migration$
declare
  target record;
  definition text;
begin
  for target in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_language l on l.oid = p.prolang
    where n.nspname in ('public', 'private')
      and p.prokind = 'f' and l.lanname = 'plpgsql'
      and p.prosrc like '%Revision conflict%'
      and p.prosrc like '%errcode = ''40001''%'
  loop
    definition := pg_get_functiondef(target.oid);
    execute replace(definition, 'errcode = ''40001''', 'errcode = ''PT409''');
  end loop;
end;
$migration$;

notify pgrst, 'reload schema';
commit;
