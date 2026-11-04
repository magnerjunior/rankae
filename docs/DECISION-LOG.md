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

## 2026-11-03 — Fase 3

### Projeção pública única e minimizada

O portal não recebe `select` em tabelas privadas. `get_public_ranka_snapshot` valida visibilidade ou concessão temporária e monta JSON com campos esportivos explícitos. Contribuições, contatos, logs administrativos, chaves, hashes e IDs de identidade ficam fora do contrato. Jogadores começam com `public_visible = false`; somente opt-in do organizador libera um nome esportivo.

### Link e PIN como barreiras leves

Links não listados usam 256 bits aleatórios e persistem apenas SHA-256. PINs usam bcrypt e só funcionam junto do link longo no modo protegido. Cinco falhas em 15 minutos bloqueiam temporariamente o mesmo fingerprint/recurso. A concessão é um bearer aleatório em cookie `httpOnly`, `SameSite=Lax`, com duas horas de duração e hash no banco. A interface informa que isso não prova identidade nem impede repasse.

### Cache e Realtime sem dados privados

O trigger público usa `realtime.send` em canal público e envia somente uma versão temporal para solicitar refetch; nenhuma linha de banco acompanha o Broadcast. O cliente também atualiza a cada 15 segundos, ao recuperar rede e ao voltar para a aba. Respostas `/r/*` são `private, no-store`. O service worker guarda somente assets estáticos e a página offline, nunca HTML do portal ou painel autenticado.

### Estatísticas derivadas

Rankings consideram apenas partidas concluídas, eventos ativos e jogadores com nome público autorizado. Gol sem autor continua no placar, mas não cria artilharia; gol contra não credita gol normal. Períodos usam a data da sessão e a zona do ranka: último concluído, mês-calendário, temporada e dia específico. Correções são refletidas no próximo snapshot.

### Migrações incrementais e validação

`20261103000200` criou o portal; `20261103000300` corrigiu uma ambiguidade detectada pelo teste de rate limit; `20261103000400` ajustou a volatilidade declarada do snapshot. A suíte remota aprovou 19/19 casos com rollback. O lint remoto terminou sem erros ou avisos de esquema.

## 2026-11-03 — Fase 4

### Minuta não gera aceite

Os textos em `/legal/*` são editoriais, versionados e exibem aviso de revisão. A tabela de documentos exige revisor, data de revisão e vigência para o estado `published`. Somente documentos publicados podem aparecer como aceite obrigatório; assim, uma minuta técnica não vira contrato por acidente.

### Superadmin separado e reforçado

O papel global não deriva de proprietário de organização e não pode ser concedido pelo frontend. O bootstrap é uma ação do administrador do banco. Mesmo ativo, o usuário precisa de sessão Supabase `aal2` por TOTP. O dashboard retorna contagens, métricas e incidentes agregados, e cada leitura privilegiada grava ator, motivo e resultado.

### Telemetria mínima sem dados pessoais

As amostras guardam somente chave de rota, duração, status e horário. O snapshot público é medido dentro do banco. Gol e relógio registram o resultado em uma segunda RPC autenticada para que falhas da transação original não apaguem a própria métrica. Nenhuma amostra inclui tenant, jogador, placar, contribuição, token ou payload da operação.

### Alertas internos antes de integração externa

p95 acima de 1 segundo exige pelo menos 50 amostras em duas janelas consecutivas de 5 minutos; acima de 2 segundos é crítico. 5xx acima de 1% abre incidente. O banco deduplica alertas recentes e o painel permite resolução auditada. E-mail/webhook não foi inventado sem canal autorizado.

### Carga recusada em produção

O único alvo Rankaê conhecido pela CLI está marcado como produção. Além disso, a role atual passou a receber 403 e o projeto não aparece entre os projetos acessíveis. Por isso não se usou outro projeto, não se executou 100/1000 VUs e não se alegou capacidade. Os scripts exigem `TARGET_ENV=staging`; 1000 VUs também exige `ACK_COSTS=approved`.

### Aplicação remota pelo SQL Editor e reconciliação

Após o usuário habilitar explicitamente o controle do Chrome, a migração versionada foi carregada diretamente do commit publicado e aplicada no SQL Editor autenticado do projeto correto. Como a CLI permaneceu sem privilégio, o histórico `supabase_migrations.schema_migrations` foi reconciliado no mesmo projeto com a versão, o nome e o SQL integral aplicado. A consulta final confirmou `20261103000500`, health `ok` e os módulos legal/privacidade. O pgTAP remoto aprovou 20/20 dentro de transação com rollback.

## 2026-11-03 — Identidade visual oficial

Os arquivos fornecidos em `logomarca/` passaram a ser a fonte da marca no produto. O ícone transparente e a escrita oficial substituem a marca textual nos cabeçalhos autenticados e públicos; a composição completa aparece na apresentação pública. O ícone com fundo branco atende favicon e instalação PWA, enquanto a composição PNG é usada nas prévias sociais. Os nomes publicados em `public/` não têm espaços ou acentos para manter URLs estáveis.

## 2026-11-03 — Recuperação do workspace real e páginas de estado

O 404 ao abrir um ranka autorizado não era ausência de dados: o PostgREST retornava `PGRST201` porque `players` e `player_aliases` têm duas chaves estrangeiras válidas e o embed não indicava a relação. A consulta agora seleciona explicitamente `player_aliases_player_id_fkey`. Somente ausência real ou falta de autorização vira 404; falhas operacionais seguem para uma página recuperável, sem expor detalhes do banco. Uma página 404 própria, coerente com a marca, oferece retorno aos rankas e à página inicial.

## 2026-11-03 — Publicação e ciclo de acesso do organizador

O domínio canônico da primeira publicação é `https://rankae.vercel.app`. O GitHub permanece como fonte e a Vercel publica a branch principal; não existe aplicação Heroku configurada no repositório. Cadastro exige confirmação por e-mail quando o Auth assim estiver configurado. O callback aceita somente destinos internos conhecidos, reporta confirmação inválida e também conclui recuperação de senha. A solicitação de recuperação usa resposta não enumerável e a nova senha exige sessão verificada e mínimo de oito caracteres.

## 2026-11-03 — experiência de quadra após validação em produção
- A navegação operacional passa a usar menu lateral recolhido por padrão, aberto pelo botão hambúrguer; a barra inferior continua como atalho no celular.
- A chegada concentra cadastro e presença em uma única ação: somente nome e posição, com linha como padrão. O perfil continua pertencendo à organização, mas não exige tela separada durante a pelada.
- Cada proprietário pode manter no máximo três rankas. O limite é validado no servidor e reforçado por trigger desde a aplicação da migração `20261103000600` em produção.
- “Iniciar ranka” abre a chegada e cria/reutiliza a sessão da data. A compatibilidade com o banco anterior permanece para instalações desatualizadas.
- Limites de jogadores de linha e goleiros entram no snapshot da sessão, com defaults de 24 e 3. A contribuição aceita valor fixo em reais ou divisão do custo total pelos presentes.
- “Expo Glass Effect” permanece uma direção visual web: `backdrop-filter`, transparência seletiva e animações de mola com alternativas para redução de movimento/transparência; nenhuma dependência Expo foi adicionada.
- Textos de infraestrutura (Supabase, RLS, revisão, persistência e ambiente) foram removidos das telas comuns e continuam apenas na implementação e no painel técnico de superadmin.

## 2026-11-03 — chegada instantânea e importação em massa

### Resposta imediata sem transformar cache em fonte de verdade

A chegada passa a atualizar a interface de forma otimista. As mutações são enfileiradas no cliente e enviadas com a revisão mais recente, preservando a ordem dos toques e evitando recarregar toda a rota após cada nome. O `localStorage` guarda somente estado recente da tela e rascunho da importação, segmentados por ranka e sessão; autorização, limites, ordem definitiva e dados compartilhados continuam validados no servidor.

### Lista textual simples e previsível

O parser puro aceita uma pessoa por linha, remove apenas prefixos conhecidos e preserva a ordem: `GK-`, `GOL-` e `GOLEIRO-` indicam goleiro; números como `1-` indicam linha. Nomes repetidos na mesma colagem são ignorados e informados antes da confirmação. Não existe leitura de WhatsApp nem importação automática.

### Ordem e correções auditáveis

Mover uma pessoa altera posições contíguas dentro da sessão por uma RPC transacional. Editar o nome altera o perfil da organização após checagem de duplicidade. As duas operações exigem permissão de organizador, revisão otimista e idempotency key, e registram auditoria. O botão de início forma times sequenciais quando necessário, prepara a partida e inicia o relógio autoritativo.

### Aplicação remota

A migração `20261103000700_arrival_speed_tools.sql` foi aplicada ao projeto de produção pela CLI autenticada. O histórico local/remoto ficou alinhado. O lint remoto não encontrou erro novo; permanece somente o aviso anterior de variável não lida em `accept_legal_document`, fora deste ajuste.

### Goleiros fora da fila de linha

Goleiros aparecem sempre em um bloco próprio no topo e recebem a identificação `GK`, sem consumir a numeração `01–24` da fila de jogadores de linha. A reordenação visual é restrita ao próprio grupo, pois a prioridade operacional de goleiros não é a mesma regra de formação sequencial dos times de linha. A operação transacional já publicada continua persistindo a posição absoluta e preserva a ordem relativa do outro grupo.

## 2026-11-03 — pré-jogo explícito e operação imediata

### Iniciar não significa disparar o relógio

O botão fixo da chegada forma os times e abre a revisão. Depois da conferência, o organizador prepara a partida em estado `ready`; somente **Iniciar cronômetro** faz a transição para `live`. Isso preserva a máquina de estados documentada e evita perder segundos enquanto goleiros e gandulas ainda são definidos.

### Relógio otimista com autoridade no servidor

Iniciar, pausar, retomar, reiniciar e encerrar atualizam a apresentação imediatamente. O comando continua sendo enviado com idempotency key e revisão otimista; a resposta autoritativa substitui o estado visual na navegação. Um snapshot local isolado por partida auxilia a continuidade visual, mas nunca concede permissão nem substitui o relógio persistido.

### Defaults validados em campo

Novos rankas e sessões usam 7 minutos de tempo normal, 3 de prorrogação e, persistindo o empate, ímpar ou par como primeira opção. Sessões antigas ainda no default técnico de 10 minutos são migradas somente quando não existe auditoria de alteração manual das regras. Configurações escolhidas pelo organizador são preservadas.

### Portal público histórico

O portal do espectador deixa de abrir Broadcast, polling e cronômetro. Ele apresenta resultados concluídos e estatísticas por período. A operação ao vivo permanece somente no painel autenticado do organizador, reduzindo consultas recorrentes sem enfraquecer a integridade dos eventos.

### Escala e eventos

Seletores de goleiro mostram apenas goleiros presentes; gandulas mostram somente jogadores de linha em espera. A partida mantém elencos compactos sempre visíveis, com contadores de gol e assistência derivados dos eventos ativos. Marcos podem ser criados em um toque, rotulados e editados com histórico; cartões são registrados como marcos estruturados com jogador, cor e minutos fora. Jogadores podem ser classificados como fixos ou visitantes por RPC auditada.

## 2026-11-03 — hub único e operação de quadra

Chegada, formação de times e partida passam a ser etapas do mesmo hub `Jogo`, mantendo rotas antigas apenas por compatibilidade. A escala de apoio sugere e salva automaticamente os goleiros e os dois primeiros jogadores do próximo time como gandulas; qualquer seletor pode ser trocado diretamente. A barra persistente da partida usa o horário autoritativo já carregado e não depende de novas consultas por segundo.

Por decisão explícita do proprietário, um portal habilitado exibe automaticamente o nome esportivo de todos os jogadores ativos, removendo a confirmação individual repetitiva. Pedidos de privacidade continuam capazes de ocultar ou anonimizar registros pelos fluxos administrativos existentes.

## 2026-11-03 — integridade do cronômetro e encerramento do dia

O relógio deixa de depender da revisão carregada ao abrir a página. Cada comando envia a revisão mais recente mantida no cliente, recebe de volta o snapshot autoritativo do PostgreSQL e reconcilia estado, horário inicial, tempo acumulado e revisão sem redirecionar a página. Em conflito de revisão, o servidor lê o estado atual e repete somente uma transição ainda necessária. Pausar congela o tempo calculado pelo relógio do banco; testes cobrem explicitamente a ausência de salto após 3min17s.

Ao finalizar uma partida, a rotação transacional já cria a próxima em estado de pré-jogo. A ação fica em uma barra destacada logo após o placar. Quando a última partida estiver apenas preparada e nenhuma estiver em andamento, o organizador pode encerrar o ranka do dia; a partida vazia é cancelada, a sessão é concluída e os resultados preservados abrem em Estatísticas.

## 2026-11-03 — navegação compacta e ajuste manual dos times

O aviso global da partida aparece somente fora da tela do jogo e identifica os dois times pelas etiquetas coloridas T1/T2, placar e relógio. O hub de etapas permanece no topo do conteúdo, mas deixa de acompanhar a rolagem. A ação de finalizar e abrir o próximo jogo antecede o placar e passa a acompanhar apenas o trecho operacional necessário.

A formação permite trocar dois jogadores de times diferentes por toque ou arraste, com resposta otimista no aparelho. A confirmação usa RPC transacional, permissão de organizador, idempotência, revisão otimista e auditoria; em conflito a interface desfaz a alteração. Para preservar escala e eventos, a troca é aceita somente antes de uma partida ser preparada.

## 2026-11-03 — fila justa e números de time imutáveis

T1, T2, T3... passam a identificar uma única passagem do grupo pela fila. Ao sair de campo, o time original é arquivado para preservar resultados e o mesmo conjunto de jogadores volta ao fim com um novo número, podendo ser ajustado antes de jogar novamente. A fila nunca antecipa um time recomposto: T4 joga antes de T5.

A formação padrão sorteia apenas os 12 primeiros jogadores entre T1 e T2. T3 em diante são blocos estritos da chegada, evitando que o 24º colocado ultrapasse o 13º. O sorteio completo permanece substituível por formação sequencial explícita na tela.

## 2026-11-03 — ciclo explícito do ranka do dia

A sessão passa a expor data e estado na aplicação. Uma sessão concluída não oferece mais continuação de jogo; preserva partidas e abre o resumo daquele dia. O próximo encontro é criado com a data local de São Paulo.

Antes do cronômetro, times podem ser reorganizados inclusive depois de preparar o pré-jogo. Durante a partida, tocar em um jogador permite trocá-lo por alguém da espera ou marcá-lo como ausente pelo restante do dia. A operação atualiza presença, squads, escala temporal da partida, substituição e auditoria de forma transacional.

Quando uma saída definitiva usa alguém de um time da espera, a recomposição avança em cascata pela fila: o primeiro jogador do time seguinte completa o déficit anterior, sucessivamente, deixando eventual vaga apenas no último time. A regra pura é testada separadamente antes da integração SQL.

## 2026-11-03 — resposta imediata e sincronização entre organizadores

O canal privado `session:<uuid>` passa a acompanhar a área autenticada durante toda a sessão aberta. Broadcasts confirmados invalidam a projeção do servidor com debounce, sem exibir um estado permanente de conexão e sem tornar o Realtime fonte de verdade.

O placar recebe a projeção do gol no mesmo toque. A mesma idempotency key acompanha a primeira tentativa e uma única reconciliação de revisão concorrente; uma rejeição desfaz o ponto local. Contribuições usam a mesma estratégia de projeção e rollback. Cartões, marcos, pênaltis, preparação e rotação deixam de usar redirecionamentos completos, mantendo validação, auditoria e versionamento no servidor.

A observabilidade passa a medir também formação, preparação, rotação, contribuições e encerramento. Nenhum payload pessoal é incluído nas amostras. As migrations `015` e `016` permanecem apenas preparadas por decisão do proprietário e devem ser aplicadas em ordem antes de publicar este lote.

## 2026-11-03 — validação local sem usar produção como staging

Playwright passa a validar a aplicação local em Chromium desktop e viewport móvel. O adaptador demo é ativado somente no servidor de desenvolvimento iniciado pela suíte. O cenário autenticado é somente leitura e permanece ignorado sem credenciais fictícias de staging; credenciais pessoais e dados de produção não são aceitos como substitutos para um ambiente de teste.

As suítes pgTAP foram ampliadas para as migrations `015/016`. Depois de concedido acesso à conta já persistida na CLI, as duas migrations foram aplicadas em ordem no projeto Rankaê. A validação SQL remota aprovou operação/concorrência em 24/24 e confiança/observabilidade em 22/22, sempre dentro de transações com rollback. Teste físico, carga, restauração, alertas externos, revisão jurídica e bootstrap MFA continuam gates humanos/externos explícitos, não simulações de sucesso.

## 2026-11-03 — oferta comercial manual e limites por conta

A landing page passa a apresentar o produto, o plano de lançamento e um teste acompanhado. A contratação continua manual pelo WhatsApp; não há cobrança, renovação ou ativação automática nesta entrega. O vídeo de fundo é decorativo, leve, carregado como mídia e removido quando o visitante prefere menos movimento.

O plano público é uma projeção segura editável apenas pelo superadministrador com sessão MFA AAL2. Novos proprietários recebem um ranka; rankas adicionais exigem ampliação manual do direito da conta. Para preservar o combinado anterior, o único proprietário já existente recebe limite três. Como o ambiente possuía um único proprietário e nenhum administrador global, a migration promove esse proprietário como primeiro superadministrador, mantendo a exigência de MFA e a auditoria de alterações.

A migration `20261103001700` foi aplicada no SQL Editor do projeto de produção e registrada no histórico `supabase_migrations.schema_migrations`. A consulta de verificação retornou versão `017`, plano 2990/1500 centavos, teste de 30 dias, um superadministrador ativo e limite três para o proprietário existente. O health check publicado também retornou `ok` com a versão `017`. A CLI da conta conectada respondeu 403 para escrita; a aplicação foi feita pela sessão autorizada do painel.

## 2026-11-04 — ajustes da apresentação pública

A oferta pública deixa de fixar a duração do teste na comunicação visual e na mensagem de contato; a duração continua configurável internamente no plano. A seleção de texto usa verde da identidade. Dois takes licenciados do Pexels se alternam com dissolvência; o segundo só começa a carregar após o primeiro ficar pronto. Preferência por movimento reduzido e economia de dados impedem a reprodução automática.

Os takes da abertura mostram partidas de rua com vários jogadores. O segundo vídeo começa a carregar assim que o primeiro toca, e a dissolvência só ocorre com pelo menos 2,5 segundos do próximo take em buffer. Se ainda não estiver pronto, o take atual continua em loop; nenhum frame parado é apresentado como transição.

O take original do chute de longe também integra a sequência como terceiro vídeo. Ele começa aos 3,2 segundos para mostrar logo a cobrança, mantendo os dois takes coletivos. Cada próximo vídeo é carregado durante o take atual; a sequência volta ao início após o gol.

## 2026-11-04 — vídeos enviados e nova abertura

A capa usa o chute de longe e três takes enviados pelo proprietário (dois de society e um aéreo), sem as cenas anteriores na terra. O vídeo aéreo foi reduzido de 4K para 720p, sem áudio, para 1,24 MB. A cena gerada dos cinco amigos olhando o celular fica como fundo da seção de funcionamento. O placar saiu da capa e entrou na simulação do celular da seção de recursos. Os títulos adotam Teko em caixa alta, opção prevista no design system; o texto corrido permanece em Barlow.

## 2026-11-04 — comunicação pública e prévia da partida

A comunicação da landing, login, manifesto e metadados de compartilhamento usa “futebol” e “jogo” no lugar de “pelada”; “ranka” permanece como nome do encontro no produto. A prévia ilustrativa do celular mostra goleiro e seis jogadores de linha por lado, com autoria dos três gols. A barra pública e os dois botões da capa recebem vidro translúcido com destaque nas bordas, preservando contraste e fallback sem transparência. Controles dentro do celular permanecem sólidos.

O ajuste móvel dá 16 px de margem lateral à barra mesmo em 320 px de largura, com tom cinza translúcido. Os botões de teste usam vidro verde mais escuro e texto branco para manter leitura; o card do plano recebe vidro claro mais opaco. No mockup, a posição do goleiro aparece como GK e o rótulo visível de exemplo foi removido, preservando a descrição acessível de prévia ilustrativa.

O verde claro original dos botões foi restaurado, mantendo o texto branco solicitado e uma sombra curta para leitura. A barra superior ganhou um vidro mais claro e borda menos aparente. Uma regra de estilo compartilhada havia sobrescrito seu posicionamento fixo; a barra voltou a permanecer no topo durante a rolagem, com verificação automatizada em desktop e mobile.
