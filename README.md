# RANKAÊ — Pacote de especificação para Codex

**Produto:** SaaS multi-peladas, mobile-first, gestão presencial de futebol amador.
**Estado:** Fase 1.5 implementada e validada no projeto Supabase de desenvolvimento. A aplicação possui Auth SSR, persistência real, migrações, RLS e isolamento multi-tenant; a criação da primeira conta de organizador permanece como passo manual do responsável pelo projeto.

## Executar a Fase 1

Requisitos: Node.js 20.9 ou superior e npm.

```bash
npm install
npm run dev
```

Abra `http://localhost:3000/entrar`. Para validar a entrega, execute `npm run lint`, `npm run typecheck`, `npm test` e `npm run build`.

## Configurar a Fase 1.5

1. Copie `.env.example` para `.env.local`.
2. Preencha somente `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` com os valores públicos do projeto.
3. Mantenha `NEXT_PUBLIC_ENABLE_DEMO=false` para usar rotas reais.
4. Aplique `supabase/migrations/` em ordem via Supabase CLI ou SQL Editor em ambiente de desenvolvimento/staging.
5. Execute `npx supabase test db` em uma máquina com Docker para validar o isolamento multi-tenant.

No projeto de desenvolvimento atual, as migrações foram aplicadas pelo SQL Editor. Antes de adotar o fluxo de migrações pela CLI nesse mesmo projeto, reconcilie o histórico remoto com `supabase migration repair` para as versões já aplicadas; não reaplique essas migrações.

Nunca use `service_role`, secret key ou senha do banco no frontend. O modo demo só existe em desenvolvimento e exige opt-in explícito.

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
