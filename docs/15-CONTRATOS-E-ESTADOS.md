# Contratos do domínio e execução

## Comandos (interface de aplicação)
- `CreateSession(rankaId, scheduledDate, ruleOverrides?)`
- `UpsertPlayer(orgId, fullName, aliases?)`
- `CheckInPlayer(sessionId, playerId, expectedRevision, idempotencyKey)`
- `MarkAttendanceStatus(sessionId, playerId, status, reason)`
- `GenerateSquads(sessionId, method=sequential|shuffle_blocks|manual, seed?, expectedRevision)`
- `PreviewNextMatch(sessionId) -> {yellowSquad, redSquad, keepers, borrowedKeepers, ballBoys, deficits, warnings}`
- `ConfirmLineups(matchId, changes, reason?)`
- `StartMatch(matchId, expectedRevision)`
- `PauseMatch/ResumeMatch/ResetClock(matchId, expectedRevision)`
- `RecordGoal(matchId, benefitingSide, scorerId?, assistId?, kind, idempotencyKey)`
- `CorrectEvent(eventId, patchOrVoid, reason, expectedRevision)`
- `RecordPenaltyAttempt(matchId, shooterId?, keeperId?, outcome, side)`
- `AddMatchMarker(matchId, label, clockMs)`
- `FinishRegulation(matchId) -> nextActionFromRules`
- `ResolveTie(matchId, selectedMethod, winnerSquadId?)`
- `CompleteMatchAndRotate(matchId, expectedRevision)`
- `BatchMarkContributions(sessionId, playerIds, status, expectedRevision)`
- `GetPublicRankaSnapshot(rankaId, viewerGrant) -> sanitized JSON`

## Public snapshot shape (conceptual)
`{rankaName, sessionDate, match:{state,sideYellow:{squadNumber,playerPublicNames,score},sideRed:{...},clock:{phase,elapsedMs,durationMs,asOfServer}},next:{squads,playerPublicNames,keepers,ballBoys},stats:{period,leaders},snapshotVersion}`. Exclude financial status and administrative identifiers.

## Idempotência e versionamento
Cada comando mutável terá `idempotencyKey`, `actorId`, `expectedRevision`; resposta de conflito informa estado mais recente, sem replay de comando automaticamente. Duas confirmações de gol com a mesma key = um só evento; keys diferentes são gols diferentes. `RecordGoal` com autoria opcional pode ser editado depois sem adicionar outro gol.

## Máquina de estados de sessão
`planned -> check_in -> team_formation -> running -> paused (administrative) -> completed`; partida específica tem máquina independente em `05-PARTIDAS-E-ESTATISTICAS.md`. Sessão `running` permite checagem de chegada tardia, revisões da fila e stats ao mesmo tempo.
