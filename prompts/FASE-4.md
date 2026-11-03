# PROMPT — FASE 4: maturidade, segurança e observabilidade

Autorizado `OK FASE 4`. Leia `AGENTS.md`, `docs/10-PERFORMANCE-E-OBSERVABILIDADE.md`, `docs/14-LEGAL-E-OPERACAO.md`, `docs/11-QUALIDADE-E-ACEITE.md`, `docs/09-ACESSO-E-PRIVACIDADE.md`, `quality/CENARIOS-TESTE.md`.

Criar minutas de Termos de Uso/Privacidade e avisos LGPD em pt-BR, versionadas, sujeitas à revisão jurídica antes de publicar; mecanismos de correção/exclusão e aceites apropriados. Implementar superadmin SaaS mínimo com autenticação reforçada, mínimo privilégio e auditoria, não acesso indiscriminado a PIN/dados pessoais. Implementar logs de performance, health checks, alertas quando p95 de rotas críticas >1 segundo sob volume suficiente, 5xx/realtime, dashboards e runbooks. Otimizar queries, índices, Broadcast, cache sem vazamento entre rankas. Preparar e **executar apenas em staging autorizado, com custos e quotas aprovados**, testes de 100 e 1000 usuários virtuais concorrentes usando k6/Artillery e cenários realtime; se não puder executar, forneça scripts e relatório de impedimentos e NÃO alegue capacidade verificada. Corrigir problemas mensurados, apresentar p50/p95/p99, taxa de erro, custos e evidências.

Não implementar features futuras. Documentar todas as limitações e **PARE**.
