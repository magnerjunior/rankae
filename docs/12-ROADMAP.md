# Roadmap obrigatório: aprovação entre fases

## FASE 1 — base visual e motor de regras em demo local
- Inicializar Next.js TS, UI system com light theme branco + verde, fontes, navegação, preview mobile e dados fictícios identificados.
- Telas: dashboard, jogadores com autocomplete/aliases, chegada, squads, pré-jogo, placar visual demo, configurações, contribuições UI, rankings UI.
- Implementar funções puras de chegada, formação, keeper/ballboy suggestions, próximo squad, rodízio e regras de empate + testes.
- Adapters demo; sem fingir login, segurança, cronômetro confiável, dados persistidos e real-time.
- Entregar fluxo demonstrável e documentação de lacunas. Parar e pedir **OK FASE 1.5**.

## FASE 1.5 — conectar infraestrutura
- Receber URLs/projeto se fornecidos, sem coletar segredos em mensagem.
- Criar repo GitHub (pelo usuário ou integração autorizada), env example, Supabase dev/staging, SQL migrations, RLS + testes isolamento, Auth, perfis e persistência real.
- Trocar dados demo nas rotas centrais por banco; manter preview demo somente sob flag explícita dev.
- Configurar Vercel staging quando credenciais/perm necessários, só deploy autorizado.
- Parar e pedir **OK FASE 2**.

## FASE 2 — pelada operacional real
- Presença presencial e pesquisa de perfis; squads, substituições confirmadas e rodízio; 0/1/2/3/4 goleiros, gandulas; contribuição em lote.
- Pré-jogo, cronômetro persistente, placar/events, autor/assistência opcionais, penaltis, corrigir gol, pausa, marco, timeout/empate/extra/ímpar/penaltis; updates para múltiplos organizadores.
- Entrega: executar uma sessão inteira **sem papel**. Parar e pedir **OK FASE 3**.

## FASE 3 — acesso público + estatísticas + PWA
- Portal `/r/[slug]` público/não listado/PIN; placar e times atuais/próximos ao vivo; projeção segura; stats último dia/mês/ano/data específica.
- Histórico de jogadores sem fotos, rankings, compartilhar resumo texto pelo WhatsApp (manual). Mobile/PWA, estados de conexão e cache seguro.
- Entrega: MVP compartilhável com espectadores. Parar e pedir **OK FASE 4**.

## FASE 4 — profissionalização e confiabilidade
- Minutas políticas/termos/consentimento revisáveis e gestão de aceites, pedido de remoção, backoffice admin SaaS seguro, auditoria, observabilidade, monitoramento p95 >1s, alertas, cache/fanout, recuperação, segurança.
- Testar cenários de 100 e 1000 VUs em staging autorizado (ou declarar limitações, custos e não executar sem aprovação).
- Relatório técnico + correções. **Não prometer proteção jurídica absoluta ou capacidade medida sem evidências.** Parar.

## Futuro (fora destas fases)
Veja `docs/13-FUTURO.md`.
