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

## 2026-11-03 — Fase 2

### Banco como fonte autoritativa da operação

Formação, substituições, escala de apoio, relógio, eventos, correções, desempate, rotação e contribuições são comandos transacionais `security definer` com `search_path` vazio, autorização interna, idempotency key e compare-and-swap por `revision`. As tabelas operacionais só concedem `select` ao papel autenticado; mutações passam pelas RPCs.

### Relógio sem ticks persistidos

O banco persiste `started_at_server` e `elapsed_ms_before_start`. A UI calcula apenas a apresentação usando a diferença entre relógio sincronizado e início autoritativo. Pausa, retomada, reset, encerramento do tempo normal e prorrogação são transições auditadas; navegar entre telas não altera o relógio.

### Eventos como fonte do placar

O placar é derivado de eventos ativos. Correção faz soft void com motivo e operador, sem apagar histórico. Pênalti defendido conta uma defesa e uma cobrança não convertida em uma única ocorrência; a mesma idempotency key não cria um segundo gol.

### Realtime privado como sinal de invalidação

Foi adotado Broadcast privado no tópico `session:<uuid>`, conforme a documentação vigente do Supabase. A política em `realtime.messages` autoriza somente membros que podem operar a sessão. O payload não vira fonte de verdade: ao receber INSERT/UPDATE/DELETE, o cliente refaz o snapshot autorizado, inclusive após reconexão.

### Deduplicação confirmada, sem auto-merge

Nome, apelido e aliases normalizados geram alerta de possível duplicata. O banco bloqueia a criação até o organizador confirmar que se trata de outra pessoa. Perfis nunca são mesclados automaticamente.

### Regra de encerramento revisável

Tempo, total de gols e diferença são configuráveis. Ao atingir meta de placar a interface pede revisão do último evento antes do encerramento manual, evitando rodar times durante uma correção. Saída dupla só é aceita quando existem dois times completos na espera.

### Aplicação remota e validação final

As versões `20261102000100` e `20261102000200`, aplicadas originalmente pelo SQL Editor, foram registradas no histórico remoto pelo fluxo oficial `supabase migration repair`. Em seguida, `20261103000100_phase2_live_operations.sql` foi aplicada com `supabase db push`. O histórico local e remoto ficou alinhado nas três versões.

O teste `phase2_operations_test.sql` passou a carregar pgTAP dentro da própria transação quando a extensão não estiver instalada. A execução remota aprovou 19/19 asserções e terminou com `rollback`; nenhuma identidade ou dado de teste persistiu. `supabase db lint --remote` não encontrou erros de esquema.

O ranka existente foi preservado e validado sem recriação: há um proprietário ativo da organização, o mesmo membro é proprietário do ranka e existe uma sessão inicial em `check_in`. O nome exibido no projeto Supabase é apenas metadado do projeto e não foi alterado.

O Security Advisor mantém avisos para RPCs `security definer` executáveis por `authenticated`; isso é intencional para os comandos transacionais expostos, que usam autorização interna, `search_path` controlado, idempotência e revisão otimista. A proteção de senhas vazadas permanece como ajuste operacional do Auth, fora do escopo da migração da Fase 2.
