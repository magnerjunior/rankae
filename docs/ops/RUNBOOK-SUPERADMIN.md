# Runbook do superadmin SaaS

O papel global é separado de proprietário/coorganizador. A aplicação não permite autopromoção. O bootstrap deve ser executado pelo administrador do banco, após confirmar identidade e que o usuário cadastrou TOTP:

```sql
insert into public.platform_admins (user_id, created_by)
values ('UUID-DA-CONTA-VERIFICADA', 'UUID-DO-RESPONSAVEL');
```

Substituir os dois valores após conferência fora do chat. Não versionar IDs reais. O painel `/app/admin` exige claim `aal2`; cada visualização registra ator, motivo, resultado e projeção agregada. Ele não apresenta PIN, token, contribuição, e-mail ou nome de jogador.

Para revogar, o administrador do banco define `active = false` e `deactivated_at = now()`, registrando a justificativa no controle operacional. Revisar a lista de administradores trimestralmente e após qualquer mudança de equipe.
