# Motor de regras — chegada, times, goleiros, gandulas e rotação

## Conceitos que NÃO podem ser misturados
- `player`: identidade canônica do atleta dentro da organização, independente de apelido.
- `attendance`: presença em sessão e posição de chegada presencial.
- `squad`: grupo de 6 jogadores de linha (configurável), identidade T1/T2/T3/T4/T5... por sessão.
- `field_side`: posição **AMARELO** ou **VERMELHO** na partida atual; não é time persistente.
- `keeper`: goleiro fixo/rodízio/emprestado, tratado separadamente dos jogadores de linha.
- `ball_boy`: função temporária de gandula para a partida, nunca um jogador escalado efetivo naquele squad.
- `queue_priority`: critério determinístico para sugerir substitutos e próximo squad.
- `session`: encontro de um dia com vários jogos e eventual formação de novos squads.

## Ordem de chegada
`attendance.arrival_index` incremental único **por sessão**, atribuído no servidor em transação e não reaproveitado. Ordenar por índice, desempatar por ID; evitar relógio local como ordenação. Status: `present`, `temporarily_out`, `left`, `no_show`, `inactive`. Apenas `present` é elegível. `no_show` só para inscrito previamente, não contar como chegada. Remanejamentos não alteram índices históricos; overrides guardam motivo.

## Formação default
1. Excluir goleiros dedicados do pool de linha quando configurado.
2. Selecionar até 6 primeiros elegíveis para T1, próximos 6 T2, T3, T4 e assim adiante.
3. Método opcional: sorteio **dentro do bloco dos primeiros 12** (T1/T2), depois bloco 13–24 (T3/T4), preservando grupos de prioridade; guardar seed/sorteio para auditoria.
4. Times podem ficar incompletos; apresentar número faltante, não alocar o mesmo jogador duas vezes na mesma partida.
5. Quando chegam mais jogadores ao longo da sessão, criar T5/T6 conforme capacidade e regra do organizador, sem renumerar T1–T4.

## Rotação de campo (default)
- Primeira partida: T1 (amarelo) × T2 (vermelho); espera T3, T4...
- Perdedor sai da vaga; vencedor fica em sua vaga de cor; próximo time elegível ocupa a vaga desocupada **herdando cor do colete**, mas preserva ID (ex.: T3 veste amarelo).
- Partida seguinte não é necessariamente T1×T2. Registrar `yellow_squad_id`, `red_squad_id` em cada match.
- Com empate, executar `tie_policy` (ver estados); algumas políticas tiram ambos, outras decidem vencedor.
- Quando os dois saem, entrar os dois próximos completos; se não existirem, sugerir reorganização/continuar com autorização explícita.
- Se não há times inteiros na espera, o responsável pode fazer mescla para viabilizar jogo, com trilha de alterações; não ignorar ordem silenciosamente.
- Jogos finalizados e gols jamais são reatribuídos quando o squad muda de colete.

## Substituição e mescla
Sugestão automática = primeiro jogador elegível por ordem de prioridade dentre não escalados, respeitando limitações (goleiro/linha, descanso, indisponível). Se estava em squad de espera, marcar saída do squad de origem e recomputar déficit deste; deixar visible o efeito cascata. Em confirmação registrar `substitution`: match, jogador que sai, entra, source squad, target squad, timestamp, motivo, override e usuário. Não permitir jogador em dois lados simultaneamente. Ao cancelar operação, reverter toda cadeia transacionalmente.

## Goleiros — regras parametrizadas
- **2 goleiros presentes**: um em cada lado do campo; modo `fixed_field_side` padrão (mantém lado) ou `fixed_squad`, configurável.
- **3 goleiros**: dois jogam e o terceiro espera; por default quando lado perdedor roda, o terceiro entra no lado que ficou livre e goleiro que saiu vai para fim da fila; opção de outras regras. Garantir que um goleiro não esteja em dois lados.
- **4 goleiros e 4 squads**: opção `one_keeper_per_squad` (cada squad tem seu goleiro), respeitando permanência na equipe mesmo com troca de cor.
- **1 goleiro**: designar 1 lado ao fixo; para o outro lado, sugerir linha emprestada da próxima equipe **sem afetar a numeração da fila**. Se faltarem candidatos, campo fica sem definido e mesário escolhe.
- **0 goleiros**: sugerir 2 jogadores emprestados do próximo squad elegível, um para cada lado. Pode haver regra local diferente; sempre exigir confirmação.
- Registros de goleiro emprestado são temporários da partida e não subtraem permanentemente suas posições nos squads futuros.
- `keeper_mode` admite `fixed_side`, `rotate_on_loss`, `fixed_squad`, `borrow_from_waiting`, `manual` com validações.

## Gandulas
- Com 2 goleiros próprios para o jogo, sugerir **2 primeiros jogadores do próximo squad de espera** como gandulas.
- Com 0 goleiros e 2 emprestados, sugerir os **2 seguintes** como gandulas, se disponíveis.
- Com 1 goleiro e 1 emprestado, sugerir **2 seguintes** após o emprestado.
- Todo gandula deve aparecer como `suggested` até confirmação; status não o torna membro da equipe jogando; não pode simultaneamente ser goleiro emprestado e gandula.
- Se a próxima equipe tiver poucos jogadores ou jogadores não disponíveis, reduzir sugestão sem bloquear o jogo.

## Política de empate — configuração expressiva
`tie_rule` por sessão: `overtime_minutes` default 3, `on_first_tie`=`overtime|both_out|penalties|odd_even|draw|manual`, `after_overtime` idem sem overtime, `if_waiting_full_squads_at_least` (default 2 para saída dupla), `when_waiting_below_threshold` (default `penalties_or_odd_even_choice`).
- Avaliar quantidade **real** de squads completos na espera no instante do término, não somente total de inscritos.
- Ex.: com >=2 squads completos em espera, empate pode levar à saída dos dois **imediatamente** ou após 3 min, dependendo de config.
- Com espera insuficiente, política fallback para desempate em pênaltis/ímpar ou par/manual, com confirmação.
- Alteração de regra durante sessão é versionada; partidas em curso guardam snapshot da regra vigente.

## Casos-limite essenciais
12, 18, 23, 24, 25, 30 jogadores; 0/1/2/3/4 goleiros; T5, saída de jogador, ausência, empate com/sem espera, 2 mesários mexendo juntos, interrupção de conexão. Cobrir em testes puros com invariantes.
