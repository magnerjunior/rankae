# PROMPT — FASE 3: portal, estatísticas e compartilhamento

Autorizado `OK FASE 3`. Leia `AGENTS.md`, `docs/03-FLUXOS-E-TELAS.md`, `docs/05-PARTIDAS-E-ESTATISTICAS.md`, `docs/09-ACESSO-E-PRIVACIDADE.md`, `docs/07-ARQUITETURA.md` e `docs/11-QUALIDADE-E-ACEITE.md`.

Implemente portal `/r/[slug]` com público, não listado e opcional PIN de 4 dígitos com rate limits e sessão temporária segura; sempre avisar que link compartilhado/PIN curto não garantem sigilo forte. Não exibir contribuições, dados administrativos ou informações pessoais não autorizadas. Mostrar partida ao vivo (cronômetro, placar, colete amarelo/vermelho), jogadores atuais e próximos squads/gandulas, resultados, rankings individuais e por períodos: última pelada, mês, temporada/ano e dia específico. Realtime Broadcast e snapshot/cache com isolamento, reconexão e tratamento de erros. PWA, mobile polish, texto/link de resultado para compartilhamento manual no WhatsApp (sem chatbot/API automáticos).

Testar RLS/privacidade, period filters, carga leve e viewport mobile. Relatar pendências, **PARE** esperando `OK FASE 4`.
