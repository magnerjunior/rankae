# Partidas, placar, cronômetro e estatísticas

## Máquina de estados
`draft -> ready -> live <-> paused -> regulation_ended -> overtime_live <-> overtime_paused -> tie_break -> completed`; caminhos `cancelled`, `manual_review`. Não iniciar 2 partidas simultâneas para o mesmo ranka/sessão por padrão. Cada mudança auditada.

## Cronômetro
Persistir `clock_phase`, `started_at_server`, `elapsed_ms_before_start`, `paused_at`, `duration_limit_ms`, `revision`; tempo na UI = acumulado + (agora sincronizado - started_at_server) se live. Usar relógio servidor/sincronização, atualizações locais apenas para render. Reconectar e recuperar estado. Navegação nunca para o tempo. `reset` exige confirmação e gera auditoria. Cronometragem de prorrogação separada da normal. Pausa por mesário reflete em todos os espectadores.

## Placar e eventos
`+ gol` amarelo/vermelho > sheet: `scoring_side`, `scorer_player_id` opcional, `assist_player_id` opcional, `goal_kind=normal|penalty|own_goal`. No gol contra, confirmar **qual lado foi beneficiado** e o jogador que desviou; autoria não vira automaticamente gol do time próprio. Pênalti batido `penalty_converted|penalty_missed|penalty_saved` registrar cobrador e goleiro quando conhecido, sem duplicar gol de pênalti no placar. Um pênalti defendido implica chute não convertido; evitar contar dois resultados para mesma cobrança. `–` abre evento mais recente do lado para desfazer/corrigir (soft void, audit log) com recálculo. Eventos têm `idempotency_key`, `created_by`, `server_time`, `match_clock_ms`, `version`.

## Marcos
Botão opcional marcar marco com rótulo curto (`interrupção`, `ocorrência`, `nota livre`), sem alterar placar. Permitir correção com auditoria.

## Regras de finalização
Combinações AND/OR configuráveis de tempo, total de gols, diferença de gols e encerramento manual. Ao satisfazer condição, disparar regra registrada; não finalizar e rodar times se mesário ainda está corrigindo. Empate pode acionar prorrogação de 3min; se continuar, ímpar ou par (`decision_method`, vencedor sem inventar jogada) ou série de pênaltis com registro individual. Empate persistente com >=2 squads de espera pode retirar ambos, conforme política configurada.

## Ranking e períodos
- `último ranka` = última sessão concluída (ou data explicitada); `este mês` = mês calendário na zona do ranka; `temporada` = ano configurado (default ano civil); `data específica` seletor de datas com sessão existente.
- Gols, assistências, pênaltis cobrados/convertidos/errados/defendidos, jogos, vitória/derrota/empate, taxa de participação. Goleiro: jogos, gols sofridos (se atribuição confiável por escalação/tempo), clean sheet quando dados completos.
- Ranking por resultados auditáveis. Autoria opcional → gol conta para time, não cria artilharia artificial. Correções retroativas invalidam agregados materializados/cache.
- Empates de artilharia: mostrar compartilhado por default, regra de desempate futura configurável.
- Fotos e troféus gráficos avançados são futuras, por enquanto rankings textuais de boa qualidade.

## Consistência
Eventos são fonte de verdade, projeção de placar validada do lado servidor, stats calculadas via consulta ou materialização transacional. Recuperação após offline; usuário deve enxergar `reconectando`, não salvar evento silenciosamente se resposta incerta. Confirmação idempotente protege contra duplo toque.
