# Runbook do superadmin SaaS

O papel global é separado de proprietário/coorganizador. O administrador do banco concede esse papel após confirmar a identidade da conta:

```sql
insert into public.platform_admins (user_id, created_by)
values ('UUID-DA-CONTA-VERIFICADA', 'UUID-DO-RESPONSAVEL');
```

Substitua os dois valores pela conta verificada e pelo responsável pela concessão. Quando existe exatamente uma conta de Auth e ela já foi conferida, também é possível usar `supabase/bootstrap/sole-admin.sql`, antes de emitir convites. O painel `/admin` usa e-mail e senha, verifica o papel ativo no banco e registra acessos privilegiados em auditoria.

Para cadastrar um organizador, configure `SUPABASE_SECRET_KEY` como variável exclusivamente do servidor e defina `NEXT_PUBLIC_APP_URL` com o domínio público do Rankaê. Desative o cadastro aberto em Supabase Auth. Em **Contas e testes**, gere o link para o e-mail do organizador e compartilhe-o diretamente com ele.

Para revogar, o administrador do banco define `active = false` e `deactivated_at = now()`, registrando a justificativa no controle operacional. Revisar a lista de administradores trimestralmente e após qualquer mudança de equipe.
