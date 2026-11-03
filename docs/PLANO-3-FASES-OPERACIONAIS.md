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

- Montar a atualização privada Realtime nas telas autenticadas.
- Evitar recarga integral em gol, cartão, contribuição, preparação e rotação.
- Aplicar atualização otimista com rollback e confirmação discreta.
- Medir navegação, formação, rotação e encerramento, além de relógio/eventos.
- Validar dois ou três organizadores operando simultaneamente.

## Fase 3 — validação de lançamento

- Teste automatizado de navegador do fluxo completo.
- Testes SQL de concorrência e isolamento após todas as novas migrações.
- Teste em celular real, teclado aberto, perda de conexão e retorno do aplicativo.
- Staging com seed fictícia; carga de 100/1.000 VUs após aprovação de quota/custo.
- Ensaio de backup/restauração e alertas externos.
- Revisão jurídica, canal LGPD e bootstrap do superadmin com MFA.
