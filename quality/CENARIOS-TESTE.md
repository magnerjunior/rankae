# Cenários BDD prioritários

1. **Reuso de nome:** dado Pedro Costa cadastrado, ao digitar `Ped` selecionar sem duplicar.
2. **Aliases:** `Magner`, `Junior` e `Magner Junior` podem ser aliases confirmados do mesmo perfil, mas o sistema não faz auto merge de homônimos.
3. **24 jogadores:** ordem 1–6 T1, 7–12 T2, 13–18 T3, 19–24 T4, sem goleiros na contagem.
4. **Shuffle:** os primeiros 12 são distribuídos apenas entre T1 e T2; próximos 12 só T3/T4.
5. **25º jogador:** fica elegível para T5/reserva conforme configuração sem renumerar anteriores.
6. **Vitória de T2:** T1 sai, T3 ocupa a vaga amarela; T2 mantém vermelha; placar de T1 não migra a T3.
7. **Empate cheio:** quando há >=2 squads completos na espera, aplicar `on_first_tie` ou `after_overtime` configurado.
8. **Empate incompleto:** com um squad de espera incompleto, não forçar saída dupla; aplicar fallback.
9. **Saiu:** jogador de T3 marcado `left` na próxima partida; sugerir primeiro elegível e deixar escolher outro com motivo.
10. **0 goleiros:** 2 emprestados sugeridos do próximo squad, 2 gandulas seguintes, sem dupla ocupação.
11. **1 goleiro:** 1 fixo + 1 emprestado, e gandulas seguintes.
12. **2 goleiros:** um por lado, dois primeiros da próxima equipe como gandulas.
13. **3 goleiros:** ao perder lado com goleiro configurado para rodar, reserva entra e perdedor vai ao fim da fila.
14. **4 goleiros:** um por squad quando modo fixo por squad.
15. **Gol sem autor:** +1 placar, sem +1 artilheiro; assistência não atribuída.
16. **Gol contra:** ponto para lado beneficiado e autoria registrada sem credited normal goal.
17. **Penalidade:** defesa contabiliza defesa+chute não convertido, sem duplo gol.
18. **Desfazer gol:** evento é void, placar recalculado, histórico preservado.
19. **Duplo toque:** mesma idempotency key cria exatamente um gol.
20. **Dois organizadores:** conflito na mesma partida resolve revision/409, não perde atualização.
21. **Cronômetro:** pausar em um celular pausa em outro; navegar rankings não reinicia.
22. **Contribuição:** marcar 5 jogadores pagos, outros pendentes, nenhum bloqueado por default.
23. **Todos pagos:** confirmar lote, auditar operador e preservar valor por jogador.
24. **Privacidade:** visitante com PIN correto vê só projeção; PIN errado limitado; não vê contribuição.
25. **Multi-tenant:** proprietário A não lê ranka B via URL/API ou Realtime.
26. **Reconexão:** perder Broadcast => recuperar snapshot atual e não repetir gol.
27. **Fila incompleta:** 11 jogadores exibe falta 1; não forja time pronto.
28. **Load 100:** medir throughput e p95, sem estados corrompidos em staging.
29. **Load 1000:** medir WebSocket fanout e custo, sem dizer aprovado se não rodou.
30. **UI:** tema claro, labels de amarelo/vermelho, toque >=44px, fonte legível, filtros de período.
