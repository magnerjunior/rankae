# Arquitetura de software

## Stack proposta
Next.js App Router + TypeScript strict + Tailwind + shadcn/ui; Supabase Postgres/Auth/Storage/Realtime; validação Zod; Vitest, Testing Library e Playwright. Deploy Vercel e GitHub. Usar versão estável compatível e registrar lockfile; não presumir versões de dependências.

## Estrutura de código
`src/app` rotas / `src/components` UI / `src/features/{attendance,teams,matches,stats,contributions,privacy}` / `src/domain` regras puras e tipos / `src/server` autorização e casos de uso / `src/data` interfaces e adaptadores / `src/lib` config, observabilidade e cache / `supabase/migrations` SQL versionado / `tests/{unit,integration,e2e,load}`.

## Adaptação por fase
Fase 1: adaptador `demo` local ou fixtures versionadas, claramente identificado como não persistente, sem fingir autenticação/segurança reais. Aplicar padrões e testes de domínio. Fase 1.5: configurar Supabase dev/staging, migrar para persistência real e RLS, Auth, integrações GitHub. **Não implantar dados pessoais em demo aberta**. Fase 2: domínio live com gravações transacionais, Broadcast, sincronização de relógio. Fase 3: portal público com projeção segura, period filters e compartilhamento manual. Fase 4: monitoramento, legal e testes de carga.

## Estratégia live
Write path autoritativo no servidor; comandos versionados/idempotentes; depois publicar update via Supabase Realtime **Broadcast** por canal de ranka/sessão, com autorização; client refaz fetch de snapshot seguro após reconectar, miss de sequência ou alteração importante. Supabase indica Broadcast como melhor para escalabilidade do que Postgres Changes. Definir eventos pequenos sem dados privados.

## Cache
1. Cache local in-memory/SWR/TanStack Query por tela para navegação e stale-while-revalidate.
2. Projeção pública da sessão live com short TTL (p.ex. 1–3s no edge/cache quando compatível com privacidade), mais eventos Broadcast; não cachear conteúdo protegido em cache compartilhado.
3. Stats/histórico com TTL maior (30–120s) ou invalidação após evento.
4. Leituras por `orgId/rankaId/sessionId/visibilityScope/accessGrant`, jamais mesclar tenants ou disponibilizar PIN hash no client.
5. Não cachear escritas críticas, placares sem invalidação ou dados financeiros em CDN pública.
6. Evitar consultas DB por segundo para cronômetro: clientes derivam tempo local de snapshot e sincronização.

## Confiabilidade
Erro de conexão = banner + modo read-only seguro para operações arriscadas; retry bounded, tratamento de conflitos (409), auditoria, health/readiness endpoints, backups e restore rehearsal na fase 4. Desenhar experiência útil para rede celular instável.

## Referências
https://supabase.com/docs/guides/realtime/subscribing-to-database-changes
https://docs.expo.dev/versions/latest/sdk/glass-effect/ (referência estética nativa, **não** dependência web)
