# Estratégia de qualidade e gates

## Gates comuns
- Lint/format/typecheck executados, testes unitários e e2e críticos passando.
- Critérios de aceite marcados individualmente em `docs/PROGRESS.md` (Codex criará).
- Zero segredo comprometido, zero cross-tenant read, zero ação pública de mutação, rotas protegidas testadas.
- App usável num celular real ou viewport 360px, sem scroll horizontal de placar.
- Documentar testes não executados e por quê.

## Gate Fase 1
UI moderna tema claro, shell, telas principais, dados demo rotulados, motor de chegada e formação com funções puras e testes; roteiro de uso sem backend.

## Gate 1.5
Git versionado, env example, migrações e Auth RLS reais, dados demo não expostos como dados reais, pelo menos 2 organizations para testar isolamento, deploy staging opcional. **Não requer compartilhar secrets no chat**.

## Gate Fase 2
Sessão persistente, presença e deduplicação, motor de rodízio/goleiros/gandulas, score/eventos/correção, tempo e pausa cross-device, desempates, contribuições; teste simultaneidade de dois editores, navegabilidade com jogo rodando.

## Gate Fase 3
Portal público/restrito e seguro, live update, próximos times, rankings por período, compartilhamento manual, PWA; verificação de que portal não vaza valores pagos/nomes ocultos.

## Gate Fase 4
Minutas legais, painel admin mínimo seguro, monitoramento real e regras de alerta, cenários 100/1000 VUs **executados ou relatados como bloqueados**, relatório p95/p99, hardening, runbook de incidentes. Não publicar textos legais sem aprovação humana.
