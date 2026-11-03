# Progresso — Fases 1, 1.5, 2, 3 e 4

Atualizado em 2026-11-03.

## Entregue

- [x] Next.js App Router com TypeScript estrito, Tailwind e tema claro Rankaê.
- [x] Fonte Barlow para interface e Barlow Condensed para títulos e placar, hospedadas no pacote local.
- [x] Shell responsivo: sidebar no desktop e navegação inferior com safe-area no celular.
- [x] Entrada do organizador explicitamente demonstrativa, sem alegar autenticação real.
- [x] Dashboard, jogadores/aliases, chegada, times, pré-jogo/placar, contribuições, estatísticas e regras.
- [x] Ações demo com efeito local, confirmação e feedback; nenhuma ação inerte apresentada como funcional.
- [x] Adaptador demo isolado e contratos de repositório preparados para troca na Fase 1.5.
- [x] Motor puro para chegada, formação sequencial/sorteio em blocos, rotação, goleiros, gandulas, reposição e empate.
- [x] Casos unitários para 18/23/24/25/30 jogadores, blocos, 0/1/2/3/4 goleiros, rotação e espera incompleta.
- [x] Estados vazio, aviso, confirmação e feedback local; dados demo rotulados.
- [x] Layout sem dependência exclusiva de cor para identificar amarelo/vermelho e áreas principais de toque >= 44 px.

## Limites intencionais da Fase 1

- [ ] Persistência, Supabase, autenticação real, RLS e isolamento multi-tenant: Fase 1.5.
- [ ] Operação completa de sessão, concorrência, eventos autoritativos e cronômetro sincronizado: Fase 2.
- [ ] Portal público/protegido, atualização ao vivo, estatísticas reais e PWA: Fase 3.
- [ ] Observabilidade, minutas legais, backoffice e testes de carga: Fase 4.

## Roteiro manual

1. Abrir `/entrar` e confirmar o aviso de demonstração local.
2. Entrar e navegar pelas seções no menu lateral ou navegação inferior.
3. Em **Jogadores**, buscar por nome/apelido e criar um perfil local.
4. Em **Chegada**, adicionar alguém disponível e alternar presente/temporariamente fora.
5. Em **Times**, conferir que T01/T02 estão no campo e T03 está na espera.
6. Em **Partida**, iniciar o relógio visual, registrar um gol com/sem autoria e corrigir o evento.
7. Em **Contribuições**, selecionar participantes, marcar lote e testar a confirmação de todos.
8. Em **Estatísticas**, alternar períodos; em **Regras**, mudar opções e aplicar localmente.
9. Recarregar a página e confirmar que alterações somem, conforme o contrato demo.

## Gates executados

Resultados reais de 2026-11-02:

- `npm run lint`: passou, zero erros e zero avisos.
- `npm run typecheck`: passou.
- `npm test`: 1 arquivo, 18 testes unitários aprovados.
- `npm run build`: build de produção aprovado; 5 páginas estáticas e rota dinâmica geradas.
- Smoke HTTP: 9 rotas principais retornaram status 200.
- Smoke visual: 360 px e 1280 px, sem scroll horizontal; busca/chegada e evento/correção de gol verificados no navegador.
- Console do navegador: zero erros durante o smoke.
- `npm audit --omit=dev`: zero vulnerabilidades em dependências de produção. O audit completo reporta avisos moderados transitivos em ferramentas de lint, sem correção segura indicada pelo npm no momento.

Comandos:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Fase 1.5 — infraestrutura real

### Implementado localmente

- [x] Git inicializado com remoto `magnerjunior/rankae`.
- [x] Supabase SSR com cookies, refresh no Proxy e verificação via `getClaims()`.
- [x] Login/cadastro de organizadores e callback PKCE.
- [x] Onboarding transacional de organização, proprietário, ranka e primeira sessão.
- [x] Persistência real de jogadores, apelidos, aliases e presença.
- [x] Chegada com lock, índice autoritativo, idempotency key e revisão otimista.
- [x] RLS deny-by-default e grants explícitos para oito tabelas privadas.
- [x] Limite de três coorganizadores, integridade multi-tenant e `org_id` imutável.
- [x] Teste pgTAP com duas organizações, outsider e usuário anônimo.
- [x] Demo restrito a flag explícita de desenvolvimento.

### Validado no projeto remoto

- [x] Dashboard Supabase acessado pela sessão autenticada do responsável, sem compartilhar credenciais.
- [x] Migração inicial aplicada ao projeto de desenvolvimento `cxxzdjbinmzqifspkklo` pelo SQL Editor.
- [x] Migração de hardening aplicada para impedir execução direta de `rls_auto_enable()` por `public`, `anon` e `authenticated`.
- [x] Publishable key configurada apenas em `.env.local`, arquivo ignorado pelo Git; nenhuma chave secreta foi usada.
- [x] Oito tabelas privadas verificadas com RLS habilitada.
- [x] Teste transacional remoto com duas organizações: leitura e escrita cruzadas bloqueadas, acesso anônimo bloqueado e dados de teste removidos por `rollback`.
- [x] Endpoint de saúde do Auth respondeu normalmente e consulta REST anônima a dados privados foi recusada.
- [x] Security Advisor: zero erros; três avisos intencionais para RPCs `security definer` destinadas a usuários autenticados e protegidas por autorização interna.

### Pendências operacionais

- [ ] Executar `supabase test db`; Docker não está instalado neste ambiente.
- [x] Primeira conta real de organizador criada e confirmada pelo responsável.
- [x] Histórico remoto reconciliado pela CLI para `20261102000100` e `20261102000200`.

### Gates finais da Fase 1.5

Resultados reais de 2026-11-03:

- `npm run lint`: passou, zero erros e zero avisos.
- `npm run typecheck`: passou.
- `npm test`: 1 arquivo, 18 testes unitários aprovados.
- `npm run build`: build de produção aprovado; 7 páginas geradas e Proxy compilado.
- `npm audit --omit=dev`: zero vulnerabilidades em dependências de produção.
- Smoke HTTP: `/entrar` respondeu 200 e `/app` redirecionou visitante sem sessão para `/entrar`.
- Smoke visual conectado: formulário de login/cadastro e selo `AMBIENTE CONECTADO` renderizados; console do navegador sem erros.
- Banco remoto: 8/8 tabelas privadas com RLS; isolamento transacional aprovado; Security Advisor com 0 erros e 3 avisos intencionais documentados.

## Fase 2 — operação presencial completa

### Implementado localmente

- [x] Autocomplete por nome/apelido/alias e alerta confirmado de possíveis duplicatas.
- [x] Status de presença sem apagar índice histórico; formação persistente sequencial ou sorteada por blocos.
- [x] Times T1–T5+, substituição auditada com motivo/override e identidade separada da cor em campo.
- [x] Sugestões puras para 0/1/2/3/4 goleiros e gandulas; confirmação sem dupla ocupação.
- [x] Pré-jogo, escalações, partida ativa e rotação transacional mantendo a vaga amarela/vermelha.
- [x] Cronômetro autoritativo iniciar/pausar/retomar/resetar, tempo normal e prorrogação.
- [x] Gol normal/pênalti/gol contra com autor e assistência opcionais; cobrança convertida/perdida/defendida e marcos.
- [x] Correção por soft void, projeção de placar derivada, idempotência e conflito de revisão entre mesários.
- [x] Desempate por pênaltis, ímpar ou par, manual ou ambos saem; saída dupla exige duas esperas completas.
- [x] Contribuições em lote com valor individual preservado, pago/pendente/isento e totais.
- [x] Broadcast privado autorizado por sessão e refetch de snapshot após mudança/reconexão.
- [x] RLS deny-by-default nas oito novas tabelas privadas e trilha de auditoria.

### Gates locais de 2026-11-03

- `npm run lint`: passou.
- `npm run typecheck`: passou.
- `npm test`: 1 arquivo, 23 testes unitários aprovados.
- `npm run build`: build de produção aprovado.
- `npm audit --omit=dev`: zero vulnerabilidades em produção.
- Teste SQL `phase2_operations_test.sql`: 19 asserções; execução local via runner bloqueada pela ausência de Docker, mas execução remota direta aprovada em transação com `rollback`.

### Validação remota e encerramento

- [x] Migrações locais e remotas alinhadas: `20261102000100`, `20261102000200` e `20261103000100`.
- [x] `20261103000100_phase2_live_operations.sql` aplicada ao projeto remoto.
- [x] Oito novas tabelas operacionais confirmadas no esquema remoto.
- [x] Teste transacional remoto de operação e concorrência aprovado: 19/19; dados removidos por `rollback`.
- [x] Ranka existente validado sem duplicação: proprietário da organização, proprietário do ranka e sessão inicial íntegros.
- [x] `supabase db lint --remote`: nenhum erro de esquema.
- [x] Security Advisor: zero erros; avisos de RPCs `security definer` são intencionais e protegidos por autorização interna. A proteção de senhas vazadas continua desativada como configuração operacional do Auth.
- [x] Smoke manual de Realtime com dois clientes autenticados em abas independentes: ambos chegaram ao estado `Ao vivo` após a autenticação do canal privado.

## Fase 3 — portal, estatísticas e compartilhamento

### Implementado

- [x] Portal `/r/[slug]` somente leitura, com metadata indexável apenas no modo público.
- [x] Modos `public`, `unlisted`, `pin_protected` e `private_off` configuráveis pelo organizador.
- [x] Link protegido por token aleatório longo, armazenado apenas como hash, com rotação e revogação das concessões anteriores.
- [x] PIN de quatro dígitos com bcrypt, limite de cinco falhas por visitante/recurso em 15 minutos, resposta genérica e sessão temporária `httpOnly` de duas horas.
- [x] Avisos claros de que link compartilhado e PIN curto não garantem sigilo forte.
- [x] Projeção pública por RPC `security definer` com `search_path` controlado; nenhuma leitura pública direta das tabelas privadas.
- [x] Nomes públicos em opt-in individual; padrão oculto e fallback “Participante” sem incluir o perfil em ranking nominal.
- [x] Placar, relógio autoritativo, times atuais, próximos squads, goleiros, gandulas e resultados sanitizados.
- [x] Rankings de gols, assistências, penalidades, jogos e resultados nos períodos último ranka, mês, temporada e dia específico.
- [x] Broadcast público com payload somente de invalidação e fallback de refetch a cada 15 segundos/reconexão.
- [x] Compartilhamento manual por cópia ou abertura do WhatsApp, sem chatbot, leitura ou envio automático.
- [x] Manifesto PWA, ícone instalável, service worker restrito a assets estáticos e página offline sem conteúdo protegido em cache.
- [x] Landing page responsiva com identidade visual Rankaê.

### Validação local e remota de 2026-11-03

- `npm run lint`: passou, zero erros e zero avisos.
- `npm run typecheck`: passou.
- `npm test`: 2 arquivos, 26 testes unitários aprovados.
- `npm run build`: build de produção aprovado; rotas públicas, manifesto e offline gerados.
- `npm audit --omit=dev`: zero vulnerabilidades em produção.
- Migrações `20261103000200`, `20261103000300` e `20261103000400` aplicadas; histórico local/remoto alinhado em seis versões.
- Teste remoto `phase3_public_portal_test.sql`: 19/19, com `rollback` e sem dados fictícios persistidos.
- Privacidade remota: contribuição e nome interno oculto ausentes do snapshot; grant, rotação, PIN e rate limit aprovados.
- Filtros remotos: mês e dia específico aprovados com eventos auditáveis.
- `supabase db lint --remote`: nenhum erro ou aviso de esquema.
- Smoke HTTP: `/`, `/offline`, `/manifest.webmanifest` e `/r/enganos` retornaram 200; portal privado gerou `noindex`; rota administrativa sem cookie redirecionou para `/entrar`.
- O ranka real permanece `private_off` e com zero nomes públicos até ação explícita do organizador.

### Riscos e pendências não bloqueantes

- O Security Advisor lista as RPCs públicas/autenticadas `security definer` por desenho; cada função tem escopo, autorização interna e retorno sanitizado. O teste de privacidade cobre os três endpoints anônimos.
- A proteção de senhas vazadas do Supabase Auth permanece desativada como ajuste operacional anterior, fora do escopo do portal.
- O Broadcast público depende da opção de canais públicos do projeto; o polling de 15 segundos mantém atualização eventual se WebSocket estiver indisponível.
- Teste de carga 100/1000 VUs, observabilidade e minutas legais pertencem exclusivamente à Fase 4.

## Fase 4 — confiança, segurança e operação

### Implementado localmente

- [x] Minutas versionadas de Termos, Privacidade, Cookies e Direitos em pt-BR, sempre identificadas como pendentes de revisão jurídica.
- [x] Documentos legais no banco com estados `draft`, `legal_review`, `published` e `retired`; publicação exige revisor, revisão e vigência.
- [x] Aceites idempotentes por usuário/documento/versão e bloqueio automático quando existir documento obrigatório publicado e pendente.
- [x] Central autenticada para acesso, correção, retirada pública e exclusão/anonimização, vinculada ao tenant e opcionalmente ao perfil.
- [x] Superadmin SaaS separado de papéis da organização, sem autopromoção, com AAL2/TOTP obrigatório e trilha de acesso privilegiado.
- [x] Dashboard global somente agregado; não exibe PIN, token, contribuição, e-mail ou nome de participante.
- [x] `/api/health`, métricas das RPCs críticas, p50/p95/p99, taxa 5xx e incidentes internos com volume mínimo, duas janelas e deduplicação.
- [x] Índices adicionais para auditoria, eventos ativos e visibilidade pública; headers de hardening e `no-store` no painel.
- [x] Runbooks de incidente, backup/restauração, superadmin e relatório técnico.
- [x] Scripts k6 para HTTP, Realtime e até três editores com travas obrigatórias de staging e custo.

### Validação local

- `npm run lint`: passou, zero erros e zero avisos.
- `npm run typecheck`: passou.
- `npm test -- --run`: 3 arquivos, 32 testes unitários aprovados.
- `npm run build`: build de produção aprovado; 16 rotas/páginas geradas.
- `git diff --check`: aprovado; apenas avisos esperados de conversão LF/CRLF no Windows.
- Teste pgTAP `phase4_trust_observability_test.sql`: 20 asserções escrito; execução local bloqueada porque Docker/Postgres local não está disponível.

### Bloqueios e evidências

- [x] Migração `20261103000500_phase4_trust_observability.sql` aplicada ao projeto remoto pelo SQL Editor autenticado; histórico reconciliado com SQL integral preservado.
- [x] Teste remoto `phase4_trust_observability_test.sql`: 20/20, dentro de transação com `rollback`.
- [x] Verificação remota: versão `20261103000500`, health `ok`, tabelas legal e privacidade presentes.
- [ ] Testes 100/1000 VUs não executados: não existe staging autorizado com seed fictícia nem aprovação de quotas/custos. Não há capacidade, p95/p99 ou custo verificados a declarar.
- [ ] Alerta externo por e-mail/webhook aguarda canal autorizado; o incidente interno no banco e dashboard está implementado.
- [ ] Ensaio real de restauração aguarda staging isolado e política de backup/PITR confirmada.
- [ ] Primeiro superadmin aguarda conta identificada, MFA configurado e bootstrap pelo administrador do banco.
- [ ] Minutas aguardam revisão jurídica e designação do controlador/canal de privacidade antes de publicação.

## Correção operacional — 2026-11-03

- [x] Abertura do ranka real corrigida: embed de aliases desambiguado pela FK explícita, eliminando o falso 404 `PGRST201`.
- [x] Falhas de consulta não são mais convertidas em “não encontrado”; somente ausência real ou falta de autorização usa 404.
- [x] Página 404 própria e página de recuperação de falha temporária implementadas.
- [x] Ranka `Ranka Enganos` aberto com a sessão do dia, RLS ativa e fluxo Jogadores → Chegada → Times → Partida navegável.
- [x] Estado vazio orienta o primeiro uso e não oferece geração de times antes de existir presença confirmada.
- [x] Produção Vercel recebeu as quatro variáveis públicas necessárias; domínio canônico e callbacks de produção/local foram autorizados no Supabase Auth.
- [x] Cadastro público de organizadores e confirmação por e-mail verificados como ativos no Supabase; recuperação e redefinição de senha implementadas.

## Ajuste de campo — 2026-11-03
- [x] Até três rankas por proprietário, com criação pela tela inicial.
- [x] Botão “Iniciar ranka” levando diretamente à chegada.
- [x] Chegada inline com nome, posição, confirmação rápida e remoção por `×`.
- [x] Limites configuráveis de linha e goleiro.
- [x] Contribuição exibida em reais, fixa ou dividida pelo total da quadra.
- [x] Menu operacional recolhido e glass/spring seletivos.
- [x] Comunicação técnica removida das telas comuns.
- [x] Compatibilidade com as RPCs anteriores preservada para instalações desatualizadas.
- [x] Migração `20261103000600_fast_court_experience.sql` aplicada em produção em 2026-11-03; histórico local/remoto alinhado.

## Agilidade da chegada — 2026-11-03

- [x] Inclusão individual com resposta otimista, foco mantido no campo e gravações enfileiradas sem recarregar a página.
- [x] Importação em massa por texto com `GK- Nome`, numeração e prévia de reconhecidos/ignorados.
- [x] Ordem de chegada visível e persistente, com ações para mover para cima ou para baixo.
- [x] Edição inline do nome e remoção na mesma tela.
- [x] Botão para formar dois times pela ordem, preparar a partida e iniciar o relógio em um único fluxo.
- [x] Cache local isolado por ranka/sessão para rascunho e recuperação visual; banco permanece fonte de verdade.
- [x] Migração `20261103000700_arrival_speed_tools.sql` aplicada em produção.
- [x] Goleiros separados no topo, identificados por `GK`, sem ocupar a numeração dos jogadores de linha.
- [x] Reordenação limitada ao próprio grupo e setas com maior contraste, sem borda marcada.
- [x] Nove versões locais/remotas permanecem alinhadas; o ajuste utiliza a RPC transacional já publicada.
- [x] `npm run lint`, `npm run typecheck`, 36 testes unitários e `npm run build` aprovados.
- [x] `supabase db lint --remote`: sem erro novo; um aviso preexistente em `accept_legal_document`.

## Fluxo de pré-jogo e partida — 2026-11-03

- [x] Botão de iniciar fixo no topo da chegada e direcionado à revisão dos times.
- [x] Times conferidos antes da preparação; cronômetro não inicia automaticamente.
- [x] Controles de relógio com resposta visual imediata e persistência autoritativa em segundo plano.
- [x] Padrão 7 minutos + 3 de prorrogação + ímpar ou par após novo empate, mantendo configuração editável.
- [x] Portal público sem placar ao vivo, Broadcast ou polling; somente histórico e estatísticas.
- [x] Goleiros restritos aos perfis de goleiro e gandulas restritos à linha em espera.
- [x] Elencos compactos na partida com indicadores derivados de gols e assistências.
- [x] Marco rápido, rótulo opcional, edição auditável e cartão com cor/tempo fora.
- [x] Classificação interna de jogadores fixos e visitantes.
- [x] Migração `20261103000800_match_flow_defaults.sql` preparada para produção.
- [x] `npm run lint`, `npm run typecheck`, 36 testes e `npm run build` aprovados.
