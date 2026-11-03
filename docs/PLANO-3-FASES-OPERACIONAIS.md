# Plano de melhorias operacionais — três fases

## Fase 1 — fechar o ciclo do ranka do dia

Prioridade imediata. O organizador deve conseguir operar uma sessão inteira e encerrá-la sem ajustes no banco.

- Identificar permanentemente a sessão pela data local do ranka.
- Editar os times por toque/arraste enquanto a partida estiver em pré-jogo.
- Clicar em um jogador durante a partida para trocar por alguém da espera.
- Marcar que um jogador foi embora e não retorna naquele dia.
- Atualizar presença, squads, escala, substituição, auditoria e estatísticas na mesma transação.
- Encerrar claramente o ranka somente sem cronômetro em andamento.
- Bloquear novas partidas na sessão concluída e iniciar a próxima em outra data.
- Mostrar resumo: vitórias, derrotas, artilheiro, assistências e goleiros menos/mais vazados.
- Validar empate, saída dupla, fila T1–T6, recomposição e abandono de jogador.

## Fase 2 — resposta imediata e múltiplos organizadores

- [x] Montar a atualização privada Realtime nas telas autenticadas.
- [x] Evitar recarga integral em gol, cartão, contribuição, preparação e rotação.
- [x] Aplicar atualização otimista com rollback e confirmação discreta.
- [x] Medir navegação, formação, rotação e encerramento, além de relógio/eventos.
- [x] Preservar idempotência e conflito de revisão para dois ou três organizadores operando simultaneamente.
- [ ] Executar a validação remota com dois ou três organizadores após aplicar as migrations `015` e `016`.

## Fase 3 — validação de lançamento

- [x] Teste automatizado de navegador para superfícies públicas, rota protegida, demo operacional, PWA e viewport móvel.
- [x] Suíte autenticada somente leitura preparada para staging fictício.
- [x] Testes SQL de concorrência, idempotência, troca/saída e isolamento ampliados após as novas migrations.
- [ ] Executar pgTAP após aplicar as migrations; Docker/Postgres local indisponível.
- [x] Simular viewport móvel e perda/retorno da rede no navegador.
- [ ] Testar celular real, teclado virtual, instalação PWA e retorno após bloqueio da tela.
- [ ] Criar staging com seed fictícia; executar carga de 100/1.000 VUs somente após aprovação de quota/custo.
- [ ] Ensaiar backup/restauração e configurar/testar alertas externos.
- [ ] Obter revisão jurídica, definir canal LGPD e fazer bootstrap controlado do superadmin com MFA.
