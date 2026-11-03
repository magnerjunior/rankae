# Runbook de backup, restauração e rollback

## Antes de mudança

- Confirmar ambiente e versão de migração; nunca usar produção como staging.
- Verificar política de backups/PITR do plano Supabase e janela de retenção contratada.
- Exportar somente o necessário por ferramenta oficial, com armazenamento criptografado e acesso mínimo.
- Registrar responsável, horário, versão do app e ponto de retorno.

## Rollback de aplicação

Reimplantar o commit anterior sem reverter migrações destrutivamente. Funções novas devem preservar contratos ou ser desabilitadas por uma migração corretiva. Nunca executar `reset` ou apagar tabelas para voltar versão.

## Restauração

Restaurar primeiro em projeto isolado. Validar contagens, FKs, RLS, isolamento entre duas organizações, eventos/placar, legal acceptances e health check. Somente após validação e plano de janela considerar troca de tráfego.

## Ensaio

O ensaio real não foi executado nesta fase: o único projeto acessível está identificado como produção e não há staging autorizado. Antes do lançamento, criar staging, restaurar um backup sanitizado/fictício, medir RTO/RPO e registrar evidências.
