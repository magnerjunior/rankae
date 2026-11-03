# Performance, cache, alertas e carga

## SLOs propostos (objetivos, não garantias)
- p95 de leitura de snapshot live < 1,0 s na região de público-alvo em teste controlado; meta aspiracional p95 <500ms.
- p95 de comando de gol/pausa com confirmação servidor < 1,0 s sob carga-alvo; investigar também p99.
- Atualização percebida em espectadores p95 < 2s, inclusive degradando para fallback de polling quando websocket falhar.
- Disponibilidade alvo inicial 99,5% mês (precisa monitoramento e SLA compatível com hospedagem).
- Métricas Core Web Vitals (LCP, INP, CLS) e taxa de erros JS.

## Alertas
- Synthetic check `/api/health` e jornada autenticada de leitura para ambientes de teste/produção.
- Alerta quando p95 rolling 5min >1000ms com amostragem suficiente (e.g. >=50 requests) por rota crítica, em 2 janelas; severidade adicional >2000ms.
- Alertar erro 5xx >1% por 5min, falha de conexão DB, event lag, reconexões altas, saturação de conexões e indisponibilidade; cooldown e deduplicação.
- Alertas por e-mail/webhook em canal controlado; nunca compartilhar dados de jogadores em payload de incidentes.
- Monitoramento de desempenho não é só `console.log`: tracing, contagem, dashboards e relatório da fase 4.

## Cache e fan-out
- Snapshot server-side para placar/ordem em cache curto e isolado por escopo, invalidação nos eventos.
- Realtime Broadcast em vez de replicar queries DB por cada espectador; backfill de snapshot na reconexão.
- Client cache (SWR/Query) com stale-revalidate e atualizações otimistas apenas onde seguras.
- Stats anuais/mensais pré-agregadas ou query indexada; invalidação por evento corrigido.
- CDN cache apenas público; protected response `private, no-store` ou cache privado cuidadosamente chaveado. Evitar vazamento de conteúdo protegido pelo CDN.
- No painel de edição sempre buscar versão autoritativa antes de confirmar operação crítica.

## Testes de carga — fase 4
Usar `k6` ou `Artillery` e cenários reprodutíveis contra **staging autorizado**, com seed fictícia; executar testes só no próprio ambiente e observando quotas.
- Baseline 10 usuários, ramp 100 **usuários virtuais simultâneos**, carga sustentada 10 min; leitura portal 90%, atualizações 8%, escrita organizador 2% com <=3 editores por ranka.
- Depois 1000 usuários virtuais simultâneos com ramp suave, 10 min; simular múltiplos rankas e concentração em um ranka popular.
- Cenário WebSocket realista: conectar usuários, receber updates e reconectar; sem confundir testes só HTTP com teste de realtime.
- Indicadores: throughput, p50/p95/p99, erros, saturação DB/conexões, CPU/memória, Realtime event latency, cache hit, custo e limitação de tier.
- Critérios: 0 corrupção de placar, 0 duplicações de evento, <1% erros HTTP sob carga aprovada, p95 de rotas críticas <=1s; se não atingir, documentar gargalo, otimizar e repetir.
- Proibido afirmar "suporta 1000 usuários" sem teste registrado e ambiente especificado.

## Observações
Performance depende de rede, região, tier Supabase/Vercel e conexões realtime. 1000 conexões simultâneas podem exceder plano gratuito; avaliar cotas antes de executar teste. Requisitar aprovação de gastos/limites antes de teste de produção.
