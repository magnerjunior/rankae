# Validação de lançamento — fase operacional 3

Data local: 2026-11-03  
Escopo: commits locais posteriores às migrations `20261103001500` e `20261103001600`.

## Automatizado localmente

- Playwright em Chromium desktop e viewport Pixel 5.
- Resultado local: 9 aprovados e 3 variações intencionalmente ignoradas.
- Página pública, login, proteção de rota autenticada e ausência de overflow horizontal.
- Manifesto PWA e página offline sem dados privados.
- Menu e atalhos móveis.
- Registro e correção de gol no adaptador demo durante perda e retorno da rede.
- Suíte autenticada somente leitura preparada e condicionada a credenciais fictícias de staging.
- pgTAP de operação ampliado para troca durante a partida, saída definitiva, idempotência e conflito de revisão.
- pgTAP de observabilidade ampliado para a rota de rotação.

## Como executar

```powershell
npm run test:e2e
```

Para a leitura autenticada em staging:

```powershell
$env:E2E_ORGANIZER_EMAIL="organizador-ficticio@staging.test"
$env:E2E_ORGANIZER_PASSWORD="senha-do-staging"
$env:E2E_RANKA_ID="uuid-do-ranka-ficticio"
npm run test:e2e
```

Para o banco, depois de aplicar todas as migrations em um projeto local/staging:

```powershell
npx supabase test db
```

## Bloqueios que impedem declarar lançamento aprovado

- As migrations `015` e `016` ainda não foram aplicadas no Supabase.
- Docker/Postgres local não está instalado; pgTAP novo foi escrito, mas não executado.
- Não existe staging autorizado com seed fictícia e credenciais de teste.
- O teste autenticado real foi ignorado, e nenhum dado de produção foi usado.
- Celular físico, teclado virtual, instalação PWA real e retomada após bloquear a tela exigem aparelho humano.
- Carga de 100/1.000 VUs continua proibida sem staging e aprovação de quota/custo.
- Ensaio de restauração exige projeto isolado e backup sanitizado.
- Alerta externo exige destino autorizado.
- Minutas legais continuam aguardando revisão jurídica; superadmin exige conta indicada e MFA.

## Segurança de dependências

`npm audit --omit=dev` não encontrou vulnerabilidades de produção. A árvore de desenvolvimento possui avisos moderados em `minimatch` trazidos pelo ESLint; a correção automática sugerida exige downgrade incompatível do ESLint e não foi aplicada.
