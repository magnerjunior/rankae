# Log de decisões

## 2026-11-02 — Fase 1

### Adaptador demo somente em memória

O adaptador da Fase 1 entrega fixtures versionadas e alterações locais por tela. Recarregar restaura o estado. A interface exibe um aviso persistente e não chama esse comportamento de autenticação, segurança ou persistência. O contrato `RankaRepository` preserva `expectedRevision` e `idempotencyKey` para a futura implementação de infraestrutura.

### Componentes próprios sobre os tokens documentados

Foi usado Tailwind como fundação de build, com componentes locais e CSS semântico para reproduzir fielmente o design system. Não foi adicionada uma biblioteca de componentes pronta porque a Fase 1 exige poucos padrões, e a dependência extra não traria benefício proporcional. Os componentes mantêm contratos simples e podem receber primitivas shadcn/Radix quando diálogos e formulários exigirem comportamento mais complexo.

### Fontes locais via Fontsource

Barlow e Barlow Condensed são empacotadas localmente. Isso evita depender do Google Fonts em execução e respeita a direção visual já definida.

### Cronômetro apenas visual

O placar demonstra criação e cancelamento de eventos, mas o relógio é deliberadamente local e rotulado como demo. Não foi antecipado o cronômetro autoritativo da Fase 2.

### Ferramentas e dependências

Versões foram consultadas no registro no início da implementação. O npm 10.8.2 do ambiente falhou ao montar a árvore de dependências; a instalação reproduzível foi concluída executando npm 11.6.2 via `npx`, sem alterar ferramentas globais.

## 2026-11-02 — Fase 1.5

### Auth SSR e chave pública

Foi adotado `@supabase/ssr` com cookies, `proxy.ts` do Next.js 16 e validação de identidade por `getClaims()`. O cliente usa apenas URL e publishable key públicas. Nenhuma secret key ou `service_role` integra o código.

### Node.js 20 compatível

`@supabase/supabase-js` 2.118 exige Node.js 22. Como o ambiente e o README suportam Node.js 20, foram fixadas versões compatíveis: `@supabase/supabase-js` 2.90.1 e `@supabase/ssr` 0.8.0.

### Escritas críticas via RPC

Onboarding e chegada são funções transacionais `security definer` com `search_path` vazio, validação explícita de autorização e privilégios mínimos. A chegada bloqueia a sessão, confere `expectedRevision`, aplica idempotency key e atribui `arrival_index` no banco.

### Demo opt-in

O adaptador demonstrativo permanece somente para desenvolvimento com `NEXT_PUBLIC_ENABLE_DEMO=true`. Rotas conectadas não exibem estatísticas, placares ou contribuições fictícias; áreas futuras mostram estado explícito de indisponibilidade.

### Teste local do banco

O ambiente atual não possui Docker, portanto o pgTAP de isolamento foi escrito mas não executado localmente. A cobertura equivalente foi executada remotamente em uma transação com `rollback`, sem persistir os dados de teste.

### Aplicação remota e histórico de migrações

As migrações `20261102000100` e `20261102000200` da Fase 1.5 foram aplicadas pelo SQL Editor na sessão autenticada do responsável. O projeto ainda não possuía `supabase_migrations.schema_migrations`, portanto não foi criado nem alterado manualmente o histórico interno da CLI. Antes de usar `supabase db push` nesse projeto, ambas as versões devem ser marcadas como aplicadas pelo fluxo oficial de `supabase migration repair`.

### Hardening da função automática de RLS

O Security Advisor identificou que a função de plataforma `public.rls_auto_enable()` podia ser executada diretamente por `public`, `anon` e `authenticated`. Foi adicionada a migração `20261102000200_harden_platform_helpers.sql`, que revoga esses privilégios sem desativar o event trigger. Após a aplicação, somente `postgres` e `service_role` mantêm execução e os dois avisos correspondentes desapareceram.

Os três avisos restantes do Security Advisor são aceitos nesta fase: `create_ranka_workspace`, `create_player_with_aliases` e `check_in_player` são a API transacional intencional para organizadores autenticados. Todas usam `security definer` com `search_path` vazio, grants explícitos e validação de identidade/permissão dentro da função.

### Validação remota de isolamento

Como o Docker local está indisponível, foi executado no projeto remoto um teste equivalente dentro de uma transação: duas organizações e identidades distintas foram criadas, o proprietário enxergou apenas seu tenant, leitura/escrita cruzadas e acesso anônimo foram bloqueados, e o teste terminou com `rollback`. Nenhum dado demonstrativo persistiu no projeto.
