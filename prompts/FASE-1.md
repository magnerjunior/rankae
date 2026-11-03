# PROMPT — FASE 1: fundação visual e motor de regras

Leia `AGENTS.md`, `docs/00-ESCOPO-E-DECISOES.md`, `docs/02-DESIGN-SYSTEM.md`, `docs/03-FLUXOS-E-TELAS.md`, `docs/04-REGRAS-RANKA.md`, `docs/11-QUALIDADE-E-ACEITE.md`, `docs/12-ROADMAP.md` e `quality/CENARIOS-TESTE.md`.

Implemente **somente a FASE 1**. Crie Next.js TypeScript e arquitetura em camadas, design system claro branco/verde premium, fontes Barlow Condensed + Barlow (ou alternativa justificada), glass leve em navegação e modais, telas mobile-first para entrada organizador (demo identificado), ranka, cadastro/aliases, chegada, squads, pré-jogo, placar de demonstração, contribuições, stats e regras. Crie um **motor de domínio puro** testado para arrival_order, squad grouping, rotation/jersey inheritance, keeper/ballboy suggestions e tie policy. Os dados são fictícios e explicitamente demonstrativos, sem falsas promessas de persistência ou segurança. Prepare interfaces de repositórios para Supabase da fase 1.5, `docs/PROGRESS.md`, `docs/DECISION-LOG.md`, `.env.example`, scripts e testes.

Priorize qualidade visual e comportamento claro sobre quantidade de componentes. Não conectar serviços externos nem implementar fotos/WhatsApp/geolocalização/campeonatos. Execute lint/typecheck/testes realmente disponíveis. Mostre como executar localmente, indique pendências e **PARE**. Só prossiga quando receber `OK FASE 1.5`.
