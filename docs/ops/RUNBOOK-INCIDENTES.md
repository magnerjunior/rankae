# Runbook de incidentes

## Acionamento

Incidentes são abertos internamente quando, com pelo menos 50 amostras, p95 excede 1 segundo em duas janelas de 5 minutos; acima de 2 segundos a severidade é crítica. Taxa de 5xx superior a 1% em 5 minutos também abre incidente. Falhas de banco, realtime, segurança ou relatos manuais entram pelo mesmo registro.

O dashboard é `/app/admin` e exige superadmin ativo, sessão AAL2 e motivo auditado. Nenhum alerta carrega nomes, placares, contribuições, tokens ou conteúdo de jogadores.

## Resposta

1. Reconhecer o alerta e registrar horário/responsável.
2. Verificar `/api/health`, status dos fornecedores e a rota agregada afetada.
3. Conter: desabilitar mudança recente, reduzir fan-out, manter operações críticas em modo seguro ou orientar pausa operacional.
4. Preservar apenas evidências técnicas mínimas, correlação e versões; nunca copiar segredos para tickets.
5. Recuperar e validar snapshot autoritativo, idempotência e ausência de corrupção.
6. Resolver no painel com motivo e evidência. Registrar causa, impacto, duração e ação preventiva.
7. Se houver indício de incidente com dados pessoais, acionar o responsável LGPD e avaliar comunicações legais com assessoria.

## Limites atuais

O alerta interno funciona no banco e no dashboard. E-mail/webhook externo não foi configurado porque não existe canal autorizado. Antes de produção comercial, definir plantão, destino, cooldown e teste periódico de entrega.
