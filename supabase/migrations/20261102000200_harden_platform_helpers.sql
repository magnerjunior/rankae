-- A função pode ser criada pela plataforma para habilitar RLS automaticamente
-- em novas tabelas públicas. O event trigger continua ativo, mas nenhum papel
-- da API precisa invocá-lo diretamente. A guarda mantém a migração portável
-- para ambientes Supabase que não instalem esse helper.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end;
$$;
