# Progresso — Fases 1, 1.5 e 2

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
- [ ] Criar manualmente a primeira conta real de organizador e confirmar o e-mail conforme a política de Auth do projeto.
- [ ] Reconciliar o histórico de migrações antes do primeiro uso da Supabase CLI no projeto remoto, pois a aplicação inicial ocorreu pelo SQL Editor.

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
- Teste SQL `phase2_operations_test.sql`: escrito com 19 asserções; execução local bloqueada pela ausência de Docker.

### Pendente para encerrar a fase

- [ ] Aplicar `20261103000100_phase2_live_operations.sql` no projeto remoto.
- [ ] Executar o teste transacional remoto de operação e concorrência.
- [ ] Validar o ciclo real com a conta do organizador e criar a organização solicitada.
- [ ] Smoke responsivo e Realtime com dois clientes autenticados.
