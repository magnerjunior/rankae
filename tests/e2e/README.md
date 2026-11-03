# Testes de navegador

`npm run test:e2e` inicia uma aplicação local na porta `3107`, ativa somente o adaptador demo de desenvolvimento e executa Chrome desktop + viewport móvel.

A suíte padrão não grava no Supabase. O cenário autenticado é somente leitura e fica ignorado enquanto não forem fornecidas credenciais **fictícias de staging**:

- `E2E_ORGANIZER_EMAIL`
- `E2E_ORGANIZER_PASSWORD`
- `E2E_RANKA_ID`

Não aponte essas variáveis para produção. Instale o navegador uma vez com `npx playwright install chromium`.
