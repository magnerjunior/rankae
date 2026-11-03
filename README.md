# RANKAÊ — Pacote de especificação para Codex

**Produto:** SaaS multi-peladas, mobile-first, gestão presencial de futebol amador.
**Estado:** Fase 4 concluída e aplicada ao projeto Supabase. O produto possui operação presencial, portal público/restrito, estatísticas, PWA, minutas legais revisáveis, protocolos de privacidade, superadmin com MFA e observabilidade. Os testes de carga aguardam staging e aprovação de quota/custo, conforme a trava operacional documentada.

## Executar a Fase 1

Requisitos: Node.js 20.9 ou superior e npm.

```bash
npm install
npm run dev
```

Abra `http://localhost:3000/entrar`. Para validar a entrega, execute `npm run lint`, `npm run typecheck`, `npm test` e `npm run build`.

Os testes de navegador usam Playwright. Instale o Chromium uma vez com `npx playwright install chromium` e execute `npm run test:e2e`. A suíte padrão usa somente a demonstração local; a leitura autenticada exige credenciais fictícias de staging conforme `tests/e2e/README.md`.

## Configurar a Fase 1.5

1. Copie `.env.example` para `.env.local`.
2. Preencha somente `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` com os valores públicos do projeto.
3. Mantenha `NEXT_PUBLIC_ENABLE_DEMO=false` para usar rotas reais.
4. Aplique `supabase/migrations/` em ordem via Supabase CLI ou SQL Editor em ambiente de desenvolvimento/staging.
5. Execute `npx supabase test db` em uma máquina com Docker para validar o isolamento multi-tenant.

No projeto de desenvolvimento atual, as duas migrações iniciais foram aplicadas pelo SQL Editor e posteriormente reconciliadas no histórico oficial da CLI. As migrações seguintes foram aplicadas com `supabase db push`; as dez versões locais e remotas estão alinhadas.

Nunca use `service_role`, secret key ou senha do banco no frontend. O modo demo só existe em desenvolvimento e exige opt-in explícito.

## Publicação atual

Produção: `https://rankae.vercel.app`. A branch `main` do GitHub é a fonte da publicação automática na Vercel; não há aplicativo Heroku configurado.

Na Vercel, configure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_ENABLE_DEMO=false` e `NEXT_PUBLIC_APP_URL=https://rankae.vercel.app`. No Supabase Auth, use `https://rankae.vercel.app` como Site URL e autorize `/auth/callback` no domínio de produção e nos endereços locais usados no desenvolvimento. O cadastro de organizadores exige confirmação de e-mail; recuperação de senha também retorna pelo callback autorizado.

O fluxo principal de campo fica no hub **Jogo**, com as etapas **Chegada → Times → Partida** na mesma área. Nome + posição cadastram ou reutilizam o jogador e confirmam a presença na mesma ação. A opção **Adicionar lista** aceita `GK- Nome` para goleiros e linhas numeradas como `1- Nome`. Goleiros aparecem em um bloco separado; somente os jogadores de linha recebem a numeração de chegada. Preparar a partida não dispara o relógio. A escala sugere os goleiros e usa os dois primeiros jogadores do próximo time como gandulas, salvando mudanças diretamente nos seletores. O padrão é 7 minutos, prorrogação de 3 minutos e ímpar ou par se o empate persistir. O cronômetro responde imediatamente, mas início, pausa e retomada são sempre reconciliados com o horário autoritativo do banco sem recarregar a tela. **Finalizar e próximo jogo** salva o resultado, aplica a rotação e prepara a partida seguinte; o ranka do dia só pode ser encerrado sem partida em andamento. O portal público exibe somente resultados e estatísticas, sem placar ao vivo ou conexão contínua.

## Operar a Fase 2

Após aplicar as migrações em ordem, um organizador autenticado pode executar o ciclo em **Chegada → Times → Partida → Contribuições**. O relógio é derivado do horário do servidor, eventos são idempotentes e revisões otimistas impedem que dois mesários sobrescrevam alterações concorrentes. O canal privado `session:<uuid>` usa autorização RLS e apenas sinaliza clientes autorizados para refazer o snapshot.

Para testar a instalação atual, execute `npm run dev` e abra `http://127.0.0.1:3000/entrar`. Depois do login, o ranka existente fica disponível em `/app/rankas/4cef25dc-6a62-4efa-892f-2769161aa951`.

## Publicar o portal da Fase 3

1. Entre no ranka e abra **Regras**.
2. Escolha **Público**, **Link não listado** ou **Link + PIN**. Modos protegidos geram um novo link longo e revogam links antigos.
3. Compartilhe manualmente o link. Quando habilitado, o portal `/r/[slug]` mostra automaticamente os nomes esportivos dos jogadores ativos, resultados e estatísticas.

O portal protegido usa sessão temporária `httpOnly`, rate limit por recurso/visitante e respostas genéricas. PIN de quatro dígitos e link compartilhado são barreiras leves, não garantia de sigilo. Respostas protegidas usam `private, no-store`; o service worker não armazena documentos do portal.

## Operar a Fase 4

- Minutas públicas ficam em `/legal/termos`, `/legal/privacidade`, `/legal/cookies` e `/legal/direitos`, sempre marcadas como pendentes de revisão jurídica.
- Documentos só exigem aceite depois de inseridos no banco como `published`, com revisor, data de revisão e vigência.
- Organizadores registram pedidos em `/app/privacidade`. O painel `/app/admin` exige papel global criado fora da aplicação e sessão MFA `aal2`.
- `/api/health` valida a conexão com o banco após a migração `20261103000500`.
- Os scripts em `tests/load/` recusam produção. Cem e mil VUs não foram executados porque não existe staging autorizado nem aprovação de quota/custo.

Antes do lançamento comercial: revisão jurídica, designação de canal LGPD, aplicação/validação da migração, bootstrap controlado do primeiro superadmin, destino externo de alertas, ensaio de restauração e carga em staging.

## Como começar
1. Extraia esta pasta em um diretório novo e abra **a pasta-raiz** no Codex.
2. Envie o texto de `prompts/FASE-1.md` (também existe `prompts/PROMPT-INICIAL-COPIAR.md`).
3. Peça ao Codex que execute apenas a fase solicitada, valide os critérios, faça commit quando Git estiver configurado e pare.
4. Responda **OK FASE 1.5**, fornecendo, quando disponíveis, URL do repositório GitHub e **URL pública** do Supabase + chave pública publishable/anon; **NUNCA cole service_role, senha ou tokens no chat**. Configure segredos via gerenciador de ambiente.
5. Aprove individualmente as fases 2, 3 e 4, conforme `prompts/`.
6. Após cada fase, revise alterações, teste no celular e só então continue.

## Mapa dos documentos
- `AGENTS.md` regras permanentes para Codex.
- `docs/00-ESCOPO-E-DECISOES.md` decisões, premissas e dúvidas não bloqueantes.
- `docs/01-PRODUTO-E-PERFIS.md` proposta de valor, papéis e limites.
- `docs/02-DESIGN-SYSTEM.md` design claro premium, glass seletivo.
- `docs/03-FLUXOS-E-TELAS.md` jornadas e navegação.
- `docs/04-REGRAS-RANKA.md` motor de times, filas, goleiros, gandulas e rodízio.
- `docs/05-PARTIDAS-E-ESTATISTICAS.md` placar, eventos, cronômetro, rankings.
- `docs/06-CONTRIBUICOES.md` contribuição opcional e pendências.
- `docs/07-ARQUITETURA.md` frontend, backend, sincronização, cache e deploy.
- `docs/08-DADOS-E-RLS.md` entidades, integridade e proteção.
- `docs/09-ACESSO-E-PRIVACIDADE.md` páginas públicas, link não listado, senha curta.
- `docs/10-PERFORMANCE-E-OBSERVABILIDADE.md` metas, cache, testes 100/1000 usuários.
- `docs/11-QUALIDADE-E-ACEITE.md` testes, critérios de saída.
- `docs/12-ROADMAP.md` fases e dependências.
- `docs/13-FUTURO.md` WhatsApp, geolocalização, fotos, torneios e automações.
- `docs/14-LEGAL-E-OPERACAO.md` termos, privacidade, direitos e checklist operacional.
- `docs/15-CONTRATOS-E-ESTADOS.md` contratos do domínio, eventos e máquina de estados.
- `quality/CENARIOS-TESTE.md` bateria de casos verificáveis.

## Regras essenciais
- Marca **Rankaê**; ocorrência/partida popular denominada **ranka**.
- Tema padrão **claro**, branco + verde premium; nada de dashboard escuro padrão.
- **Até 3 coorganizadores, além do proprietário**; administrador SaaS é diferente de organizador.
- Jogadores não precisam de login; **apenas organizadores** manipulam presença, pagamento e placar.
- A confirmação da **chegada presencial é fonte da verdade**, não lista do WhatsApp.
- Cada pelada possui configurações próprias; regras variáveis não são hardcoded.
- Painel público ao vivo com placar, times e próximos; proteção opcional por token não listado e/ou PIN de 4 dígitos com medidas de defesa.
- Fases futuras **não** são implementadas antecipadamente.

## Mudanças durante a execução
Toda decisão não coberta pela especificação deve ser registrada em `docs/DECISION-LOG.md` pelo Codex. Preferir defaults parametrizados a inventar regras fixas. Nunca marcar fase pronta com testes incompletos ou rotas simuladas.
