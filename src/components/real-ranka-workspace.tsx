import { preferredTieMethod } from "@/domain/ranka/tie-preference";
import { InitialTeamFields } from "@/components/initial-team-fields";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { RankaRanking, RankaResults } from "@/components/ranka-results";
import { AppShell } from "@/components/app-shell";
import { ContributionManager } from "@/components/contribution-manager";
import { GameStatusBar, MatchStatusBar } from "@/components/game-status-bar";
import { MatchDeadline } from "@/components/match-deadline";
import { MatchPushSettings } from "@/components/match-push-settings";
import { kitColors, kitStyle, type KitColor } from "@/domain/ranka/kit-colors";
import { GoalDialog } from "@/components/goal-dialog";
import { ArrivalManager } from "@/components/arrival-manager";
import { CourtShareControl } from "@/components/court-share-control";
import { EmptyState } from "@/components/feedback";
import { FlashNotice } from "@/components/flash-notice";
import { FastMutationForm } from "@/components/fast-mutation-form";
import { FinishMatchControl } from "@/components/finish-match-control";
import { OptimisticMatchClock } from "@/components/optimistic-match-clock";
import { MatchScoreProvider, OptimisticScore } from "@/components/optimistic-score";
import { PlayerCreateForm } from "@/components/player-create-form";
import { RankaScheduleForm } from "@/components/ranka-schedule-form";
import { nextRankaDate, type RankaSchedule } from "@/domain/ranka/schedule";
import type { PendingContribution, PlayerActivityFilter } from "@/domain/player-activity";
import { PlayerDirectory } from "@/components/player-directory";
import { KeeperWaiverControl } from "@/components/keeper-waiver-control";
import { SupportAssignments } from "@/components/support-assignments";
import { PortalSettingsForm } from "@/components/portal-settings-form";
import { TeamRoster } from "@/components/ranka-workspace";
import { TeamEditor } from "@/components/team-editor";
import { MatchPlayerManager } from "@/components/match-player-manager";
import { RealtimeSessionRefresh } from "@/components/realtime-session-refresh";
import {
  projectScore,
  reachedMatchGoalRule,
  suggestOfficials,
  summarizeContributions,
} from "@/domain/ranka/rules";
import type { MatchEvent, Player } from "@/domain/ranka/types";
import type { PublicRankaSnapshot } from "@/domain/public-portal/types";
import { absenceDetails, type PlayerActivity } from "@/domain/player-activity";
import type { RankaSnapshot, SessionSummary, RankaDayOverview } from "@/data/ports/ranka-repository";
import type { RankaSection } from "@/lib/navigation";
import type { TrialAccess } from "@/server/account-trial";
import {
  batchContributionsAction,
  addFastArrivalAction,
  bulkAddArrivalsAction,
  clockAction,
  clockNavigationAction,
  completeMatchAction,
  finishMatchAction,
  adjustMatchClockAction,
  updateGoalAttributionAction,
  confirmOfficialsAction,
  createPlayerAction,
  generateSquadsAction,
  redrawTeamsAction,
  addToTeamAction,
  finishRankaSessionAction,
  prepareMatchAction,
  recordEventAction,
  cardForPlayerAction,
  recordGoalFastAction,
  resolveTieAction,
  substitutePlayerAction,
  updateRulesAction,
  updateMarkerAction,
  voidEventAction,
  configurePortalAction,
  startRankaAction,
  saveRankaScheduleAction,
  saveRankaKitsAction,
  reorderArrivalAction,
  renameArrivalAction,
  removeArrivalAction,
  startGameFromArrivalAction,
  swapSquadPlayersAction,
  manageMatchPlayerAction,
  updateInactivityAlertAction,
} from "@/app/app/rankas/[rankaId]/actions";

function Key() {
  return <input type="hidden" name="idempotencyKey" value={randomUUID()} />;
}
function Heading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
  sessionId?: string;
}) {
  return (
    <header className="page-heading">
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h1 className="display">{title}</h1>
      {description && <p>{description}</p>}
    </header>
  );
}
function Notice({ success, error }: { success?: string; error?: string }) {
  if (success) return <FlashNotice kind="success" message="Alteração salva." />;
  if (error === "teste-encerrado") return <FlashNotice kind="error" message="Seu teste não permite iniciar outro dia de futebol." />;
  if (error) return <FlashNotice kind="error" message="Não foi possível concluir. Tente novamente." />;
  return null;
}
function PlayerOptions({
  players,
  blank = "Não atribuído",
}: {
  players: Player[];
  blank?: string;
}) {
  return (
    <>
      <option value="">{blank}</option>
      {players.map((player) => (
        <option key={player.id} value={player.id}>
          {player.fullName}
          {player.aliases[0] ? ` · ${player.aliases[0]}` : ""}
        </option>
      ))}
    </>
  );
}
function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function Dashboard({ snapshot, playerActivity, schedule, trial, error, overview }: { overview?: RankaDayOverview; snapshot: RankaSnapshot; playerActivity?: PlayerActivity[]; schedule: RankaSchedule; trial?: TrialAccess; error?: string }) {
  const present = snapshot.attendance.filter(
    (entry) => entry.status === "present",
  ).length;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const nextDate = nextRankaDate(schedule, today);
  const inactiveCount = (playerActivity ?? []).filter((activity) => absenceDetails(activity, today).alert).length;
  const debtCount = (playerActivity ?? []).filter((activity) => activity.unpaid_sessions > 0).length;
  const canStart = !trial || trial.canStart;
  const sessionOpen = snapshot.sessionId && snapshot.sessionState !== "completed";
  const launch = sessionOpen ? (
    <Link
      className="start-ranka-button compact"
      href={`/app/rankas/${snapshot.id}/jogo`}
    >
      <span>
        {snapshot.activeMatch
          ? "Continuar jogo"
          : snapshot.hasPersistedSquads
            ? "Continuar pré-jogo"
            : "Continuar ranka"}
      </span>
      <b>→</b>
    </Link>
  ) : canStart ? (
    <form action={startRankaAction.bind(null, snapshot.id)}>
      <button className="start-ranka-button">
        <span>{trial ? "Iniciar dia de futebol" : snapshot.sessionId ? "Iniciar novo ranka" : "Iniciar ranka"}</span>
        <b>→</b>
      </button>
      {trial && <p className="muted">Ao iniciar, você usa um dia da sua cota de teste.</p>}
    </form>
  ) : null;
  return (
    <>
      <Heading
        eyebrow={!snapshot.sessionId ? "Seu ranka" : snapshot.sessionState === "completed" ? "Último encontro" : snapshot.sessionDate === today ? "Hoje" : "Encontro em andamento"}
        title={snapshot.name}
        description={snapshot.sessionLabel}
        sessionId={snapshot.sessionId}
      />
      <Notice error={error} />
      {launch}
      {!sessionOpen && trial && !trial.ended && !trial.canStart && <p className="muted">Já há um dia de futebol registrado nesta conta hoje.</p>}
      {nextDate && <p className="muted">Próximo encontro previsto: {nextDate.split("-").reverse().join("/")}</p>}
      <div className="metric-grid quick-metrics">
        <Link className="metric" href={`/app/rankas/${snapshot.id}/jogadores`}><strong>{snapshot.players.length}</strong><span>jogadores cadastrados</span></Link>
        <Link className="metric" href={`/app/rankas/${snapshot.id}/jogadores?filtro=pendentes`}><strong>{debtCount}</strong><span>com contribuição pendente</span></Link>
        <Link className="metric" href={`/app/rankas/${snapshot.id}/jogadores?filtro=ausentes`}><strong>{inactiveCount}</strong><span>inativos pelo limite configurado</span></Link>
      </div>
      {overview && <section className="dashboard-performance">
        <article className="panel"><h2 className="panel-title display">Totais do ranka</h2><p><strong>{overview.matches}</strong> jogos · <strong>{overview.goals}</strong> gols · <strong>{overview.assists}</strong> assistências</p></article>
        <article className="panel"><h2 className="panel-title display">Último ranka</h2>{overview.lastDay ? <><p>{overview.lastDay.matches} jogos · {overview.lastDay.goals} gols · {overview.lastDay.assists} assistências</p><Link className="text-link" href={`/app/rankas/${snapshot.id}/historico?dia=${overview.lastDay.id}`}>Ver estatísticas do dia</Link></> : <p className="muted">Nenhum ranka encerrado.</p>}</article>
        <article className="panel"><h2 className="panel-title display">Craque da semana</h2>{overview.star ? <><strong>{overview.star.name}</strong><p>{overview.star.goals} gols + {overview.star.assists} assistências</p></> : <p className="muted">Sem gols com autoria ou assistências nesta semana.</p>}</article>
      </section>}
      {!overview && (inactiveCount > 0 || debtCount > 0) && <Link className="activity-notice" href={`/app/rankas/${snapshot.id}/jogadores${debtCount ? "?filtro=pendentes" : ""}`}>{inactiveCount > 0 && <span>{inactiveCount} {inactiveCount === 1 ? "jogador afastado" : "jogadores afastados"}</span>}{debtCount > 0 && <span>{debtCount} {debtCount === 1 ? "jogador com contribuição pendente" : "jogadores com contribuições pendentes"}</span>}<strong>Ver jogadores →</strong></Link>}
      {!overview && snapshot.sessionState === "completed" && <Link className="text-link" href={`/app/rankas/${snapshot.id}/historico?dia=${snapshot.sessionId}`}>Ver último ranka encerrado</Link>}
      {snapshot.sessionState !== "completed" && snapshot.sessionId && <FinishDayControl snapshot={snapshot} />}
      <div className="metric-grid quick-metrics">
        <div className="metric">
          <strong>{present}</strong>
          <span>presentes</span>
        </div>
        <div className="metric">
          <strong>
            {snapshot.squads.filter((squad) => squad.complete).length}
          </strong>
          <span>times prontos</span>
        </div>
        <div className="metric">
          <strong>
            {snapshot.activeMatch ? `J${snapshot.activeMatch.ordinal}` : "—"}
          </strong>
          <span>jogo atual</span>
        </div>
      </div>
      {!overview && <section className="panel" style={{ marginTop: 16 }}>
        <div className="action-list">
          <Link className="action-row" href={`/app/rankas/${snapshot.id}/jogo`}>
            <span>
                <strong>{!snapshot.sessionId ? "Dia de futebol" : snapshot.sessionState === "completed" ? "Último encontro" : "Encontro em andamento"}</strong>
              <small>Chegada, times e partida no mesmo lugar</small>
            </span>
          </Link>
          <Link
            className="action-row"
            href={`/app/rankas/${snapshot.id}/contribuicoes`}
          >
            <span>
              <strong>Contribuições</strong>
              <small>Pagamentos dos presentes</small>
            </span>
          </Link>
          <Link
            className="action-row"
            href={`/app/rankas/${snapshot.id}/estatisticas`}
          >
            <span>
              <strong>Estatísticas</strong>
              <small>Resultados e ranking</small>
            </span>
          </Link>
          <Link className="action-row" href={`/app/rankas/${snapshot.id}/historico`}><span><strong>Histórico dos rankas</strong><small>Veja cada data, jogo e chegada</small></span></Link>
        </div>
      </section>}
    </>
  );
}

function Players({
  snapshot,
  success,
  error,
  playerActivity,
  inactivitySettings,
  pending,
  pendingUnavailable,
  playerFilter,
}: {
  snapshot: RankaSnapshot;
  success?: string;
  error?: string;
  playerActivity?: PlayerActivity[];
  inactivitySettings?: { months: number; revision: number };
  pending: PendingContribution[];
  pendingUnavailable: boolean;
  playerFilter: PlayerActivityFilter;
}) {
  const action = createPlayerAction.bind(null, snapshot.id, snapshot.orgId!);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return (
    <>
      <Heading
        eyebrow="Catálogo da organização"
        title="Jogadores"
        description="Organize jogadores fixos e visitantes sem exigir login deles."
        sessionId={snapshot.sessionId}
      />
      <Notice success={success} error={error} />
      {inactivitySettings && <form className="activity-setting" action={updateInactivityAlertAction.bind(null, snapshot.id, inactivitySettings.revision)}><label>Alertar após <input className="input" type="number" name="months" min="1" max="24" defaultValue={inactivitySettings.months} /> meses sem comparecer</label><button className="button button-secondary button-small">Salvar</button></form>}
      <div className="players-stack">
        <details className="panel player-create-panel">
          <summary className="panel-title display">+ Novo jogador</summary>
          <PlayerCreateForm players={snapshot.players} action={action} requestId={randomUUID()} />
        </details>
        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title display">Jogadores cadastrados</h2>
            <span className="badge badge-green">{snapshot.players.length}</span>
          </div>
          {pendingUnavailable && <p role="status">As pendências por encontro estão indisponíveis no momento.</p>}
          {snapshot.players.length ? (
            <PlayerDirectory
              key={playerFilter}
              pending={pending}
              initialFilter={playerFilter}
              rows={snapshot.players.map((player) => ({ player, activity: playerActivity?.find((entry) => entry.player_id === player.id) }))}
              today={today}
              rankaId={snapshot.id}
              sessionId={snapshot.sessionId}
              revision={snapshot.revision}
              presentIds={snapshot.attendance.filter((entry) => entry.status === "present").map((entry) => entry.playerId)}
              waivedIds={snapshot.contributions.filter((entry) => entry.status === "waived").map((entry) => entry.playerId)}
            />
          ) : (
            <EmptyState
              title="Nenhum jogador"
              description="Cadastre o primeiro perfil desta organização."
            />
          )}
        </section>
      </div>
    </>
  );
}

function Arrival({
  snapshot,
  success,
  error,
}: {
  snapshot: RankaSnapshot;
  success?: string;
  error?: string;
}) {
  const sessionId = snapshot.sessionId!;
  const initialEntries = snapshot.attendance
    .filter((entry) => entry.status === "present")
    .toSorted((a, b) => a.arrivalIndex - b.arrivalIndex)
    .map((entry) => {
      const player = snapshot.players.find(
        (item) => item.id === entry.playerId,
      );
      return {
        id: entry.id,
        playerId: entry.playerId,
        fullName: player?.fullName ?? "Jogador",
        role:
          entry.rolePreference === "keeper" || player?.role === "keeper"
            ? ("keeper" as const)
            : ("line" as const),
        arrivalIndex: entry.arrivalIndex,
      };
    });
  return (
    <>
      <Heading
        eyebrow=""
        title="Chegada"
        description=""
      />
      <Notice success={success} error={error} />
      <ArrivalManager
        rankaId={snapshot.id}
        sessionId={sessionId}
        initialRevision={snapshot.revision}
        initialEntries={initialEntries}
        knownNames={snapshot.players.map((player) => player.fullName)}
        maxLinePlayers={snapshot.rules.maxLinePlayers}
        maxKeepers={snapshot.rules.maxKeepers}
        squadSize={snapshot.rules.squadSize}
        canStartExisting={snapshot.hasPersistedSquads && !snapshot.activeMatch}
        activeGameHref={
          snapshot.activeMatch
            ? `/app/rankas/${snapshot.id}/jogo?etapa=partida`
            : undefined
        }
        addAction={addFastArrivalAction.bind(null, sessionId)}
        bulkAction={bulkAddArrivalsAction.bind(null, sessionId)}
        reorderAction={reorderArrivalAction.bind(null, sessionId)}
        renameAction={renameArrivalAction.bind(null, sessionId)}
        removeAction={removeArrivalAction.bind(null, sessionId)}
        startGameAction={startGameFromArrivalAction.bind(
          null,
          snapshot.id,
          sessionId,
          snapshot.rules.squadSize,
          snapshot.hasPersistedSquads,
        )}
      />
    </>
  );
}

function Teams({
  snapshot,
  success,
  error,
}: {
  snapshot: RankaSnapshot;
  success?: string;
  error?: string;
}) {
  const generate = generateSquadsAction.bind(
    null,
    snapshot.id,
    snapshot.sessionId!,
    snapshot.revision,
  );
  const present = snapshot.attendance
    .filter((entry) => entry.status === "present")
    .map((entry) => entry.playerId);
  const waiting = snapshot.squads.filter((squad) => squad.state === "waiting");
  const assigned = new Set(snapshot.squads.flatMap((squad) => squad.playerIds));
  const replacements = snapshot.players.filter(
    (player) =>
      present.includes(player.id) &&
      !assigned.has(player.id) &&
      player.role === "line",
  );
  return (
    <>
      <Heading
        eyebrow=""
        title="Times"
        description=""
        sessionId={snapshot.sessionId}
      />
      <Notice success={success} error={error} />
      {!snapshot.activeMatch && <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head">
          <div>
            <h2 className="panel-title display">Formar times</h2>
          </div>
          <span className="badge">
            {snapshot.hasPersistedSquads ? "PRONTO" : "PRÉVIA"}
          </span>
        </div>
        {present.length ? (
          <form action={generate} className="cluster">
            <Key />
            <InitialTeamFields players={snapshot.players.filter(player => present.includes(player.id) && player.role === "line")} size={snapshot.rules.squadSize} />
            <button className="button button-primary">
              {snapshot.hasPersistedSquads
                ? "Refazer times"
                : "Confirmar times"}
            </button>
          </form>
        ) : (
          <EmptyState
            title="Ainda não há jogadores"
            description="Adicione quem chegou antes de formar os times."
            action={
              <Link
                className="button button-primary button-small"
                href={`/app/rankas/${snapshot.id}/chegada`}
              >
                Ir para chegada
              </Link>
            }
          />
        )}
      </section>}
      {snapshot.squads.length ? (
        !snapshot.activeMatch || snapshot.activeMatch.state === "ready" ? (
          <TeamEditor
            key={snapshot.revision}
            initialSquads={snapshot.squads}
            players={snapshot.players}
            initialRevision={snapshot.revision}
            action={swapSquadPlayersAction.bind(null, snapshot.id, snapshot.sessionId!)}
          />
        ) : (
          <div className="squad-grid">
            {snapshot.squads.map((squad, index) => (
              <TeamRoster
                key={squad.id}
                squad={squad}
                players={snapshot.players}
                side={index === 0 ? "yellow" : index === 1 ? "red" : undefined}
              />
            ))}
          </div>
        )
      ) : (
        <section className="panel">
          <EmptyState
            title="Ainda sem times"
            description="Adicione as chegadas para começar."
          />
        </section>
      )}
      {snapshot.sessionId && snapshot.sessionState !== "completed" && waiting.length > 0 && <details className="panel waiting-team-tools">
        <summary>Ajustar times da espera</summary>
        {waiting.length > 1 && <FastMutationForm className="stack" action={redrawTeamsAction.bind(null, snapshot.sessionId, snapshot.revision)}>
          <Key /><p>Marque os times que vão ao sorteio. Os demais serão mantidos.</p>
          <div className="cluster">{waiting.map((squad) => <label key={squad.id} className="check-row"><input name="squads" type="checkbox" value={squad.id} /> T{squad.number}</label>)}</div>
          <button className="button button-secondary">Sortear selecionados</button>
        </FastMutationForm>}
        {waiting.filter((squad) => !squad.complete).map((squad) => <FastMutationForm key={squad.id} className="waiting-add-form" action={addToTeamAction.bind(null, snapshot.sessionId!, squad.id, snapshot.revision)}>
          <Key /><label className="field">Adicionar ao T{squad.number}<input className="input" name="name" minLength={2} maxLength={120} required placeholder="Nome do jogador" /></label>
          <button className="button button-secondary">Adicionar</button>
        </FastMutationForm>)}
      </details>}
      {snapshot.hasPersistedSquads && !snapshot.activeMatch && (
        <FastMutationForm
          className="teams-confirm-bar"
          action={prepareMatchAction.bind(
            null,
            snapshot.id,
            snapshot.sessionId!,
            snapshot.revision,
          )}
        >
          <Key />
          <span>
            <strong>Times conferidos?</strong>
            <small>O cronômetro ainda não começa.</small>
          </span>
          <button className="button button-primary">
            Confirmar e ir para o pré-jogo
          </button>
        </FastMutationForm>
      )}
      {snapshot.hasPersistedSquads && replacements.length > 0 && (
        <section className="panel" style={{ marginTop: 16 }}>
          <div className="panel-head">
            <h2 className="panel-title display">Trocar jogador</h2>
          </div>
          <form
            className="stack"
            action={substitutePlayerAction.bind(
              null,
              snapshot.id,
              snapshot.sessionId!,
              snapshot.revision,
            )}
          >
            <Key />
            <div className="three-column">
              <label className="field">
                Time
                <select className="select" name="targetSquadId" required>
                  <option value="">Selecione</option>
                  {snapshot.squads.map((squad) => (
                    <option key={squad.id} value={squad.id}>
                      T{String(squad.number).padStart(2, "0")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Sai
                <select className="select" name="outgoingPlayerId" required>
                  <option value="">Selecione</option>
                  {snapshot.squads
                    .flatMap((squad) => squad.playerIds)
                    .map((id) => (
                      <option key={id} value={id}>
                        {
                          snapshot.players.find((player) => player.id === id)
                            ?.fullName
                        }
                      </option>
                    ))}
                </select>
              </label>
              <label className="field">
                Entra
                <select className="select" name="incomingPlayerId" required>
                  <option value="">Selecione</option>
                  {replacements.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.fullName}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field">
              Motivo
              <input
                className="input"
                name="reason"
                required
                minLength={3}
                placeholder="Ex.: saiu mais cedo"
              />
            </label>
            <input type="hidden" name="override" value="false" />
            <button className="button button-primary">Confirmar troca</button>
          </form>
        </section>
      )}
    </>
  );
}

function FinishDayControl({ snapshot }: { snapshot: RankaSnapshot }) {
  const matchInProgress = snapshot.activeMatch && !["ready", "completed"].includes(snapshot.activeMatch.state);
  return <section className="finish-day-banner">
    <span><small>Ranka de {snapshot.sessionLabel}</small><strong>Terminou o futebol deste dia?</strong></span>
    {matchInProgress ? <Link className="button button-secondary button-small" href={`/app/rankas/${snapshot.id}/jogo?etapa=partida`}>Finalizar a partida primeiro</Link> : <details><summary>Encerrar ranka</summary><form action={finishRankaSessionAction.bind(null, snapshot.id, snapshot.sessionId!, snapshot.revision)}><Key /><p>Encerra definitivamente este encontro e abre o resumo do dia.</p><button className="button button-danger">Confirmar encerramento</button></form></details>}
  </section>;
}

function MatchConsole({
  snapshot,
  success,
  error,
}: {
  snapshot: RankaSnapshot;
  success?: string;
  error?: string;
}) {
  const match = snapshot.activeMatch;
  if (!match)
    return (
      <>
        <Heading
          eyebrow="Próximo jogo"
          title="Pré-jogo"
          description=""
          sessionId={snapshot.sessionId}
        />
        <Notice success={success} error={error} />
        <section className="panel">
          <EmptyState
            title="Nenhum jogo preparado"
            description={
              snapshot.hasPersistedSquads
                ? "Os times estão prontos."
                : "Forme os times primeiro."
            }
          />
          {snapshot.hasPersistedSquads && (
            <FastMutationForm
              action={prepareMatchAction.bind(
                null,
                snapshot.id,
                snapshot.sessionId!,
                snapshot.revision,
              )}
            >
              <Key />
              <button
                className="button button-primary"
                style={{ width: "100%" }}
              >
                Preparar jogo
              </button>
            </FastMutationForm>
          )}
        </section>
      </>
    );

  const yellow = snapshot.squads.find(
    (squad) => squad.id === match.yellowSquadId,
  )!;
  const red = snapshot.squads.find((squad) => squad.id === match.redSquadId)!;
  const score = projectScore(match.events);
  const presentIds = snapshot.attendance
    .filter((entry) => entry.status === "present")
    .map((entry) => entry.playerId);
  const keepers = snapshot.players.filter(
    (player) => player.role === "keeper" && presentIds.includes(player.id),
  );
  const fieldIds = new Set([
    ...(yellow?.playerIds ?? []),
    ...(red?.playerIds ?? []),
  ]);
  const waitingSquads = snapshot.squads
    .filter((squad) => squad.id !== yellow?.id && squad.id !== red?.id)
    .toSorted((a, b) => a.number - b.number);
  const waitingLines = waitingSquads
    .flatMap((squad) => squad.playerIds)
    .filter((id) => presentIds.includes(id) && !fieldIds.has(id));
  const suggestion = suggestOfficials(
    keepers.map((player) => player.id),
    waitingLines,
  );
  const nextSquadIds = waitingSquads[0]?.playerIds ?? [];
  const ballBoyCandidates = nextSquadIds
    .map((id) => snapshot.players.find((player) => player.id === id))
    .filter((player): player is Player =>
      Boolean(player && player.role === "line"),
    );
  const assignedYellowKeeper = match.assignments.find(
    (assignment) =>
      assignment.role === "keeper" && assignment.side === "yellow",
  )?.playerId;
  const assignedRedKeeper = match.assignments.find(
    (assignment) => assignment.role === "keeper" && assignment.side === "red",
  )?.playerId;
  const assignedBallBoys = match.assignments
    .filter((assignment) => assignment.role === "ball_boy")
    .map((assignment) => assignment.playerId);
  const ejectedIds = new Set(match.events.flatMap((event) => event.status === "active" && event.card?.ejected ? [event.card.playerId] : []));
  const yellowPlayers = snapshot.players.filter((player) => !ejectedIds.has(player.id) &&
    yellow?.playerIds.includes(player.id),
  );
  const redPlayers = snapshot.players.filter((player) => !ejectedIds.has(player.id) &&
    red?.playerIds.includes(player.id),
  );
  const fieldPlayers = [...yellowPlayers, ...redPlayers];
  const activeEvents = match.events
    .filter((event) => event.status === "active")
    .toReversed();
  const nameOf = (id: string) => snapshot.players.find((player) => player.id === id)?.fullName ?? "Jogador";
  const changes = (match.substitutions ?? []).map((change) => ({ ...change, outgoing: nameOf(change.outgoingId), incoming: nameOf(change.incomingId) }));
  const timeline = [
    ...activeEvents.map((event) => ({ event, at: event.occurrenceMs })),
    ...changes.map((change) => ({ change, at: change.occurrenceMs ?? -1 })),
  ].sort((a, b) => b.at - a.at);
  const canCard = ["live", "paused", "overtime_live", "overtime_paused"].includes(match.state);
  const editableMarkers = activeEvents.filter(
    (event) => event.type === "marker" && !event.card?.ejected,
  );
  const clock = (command: string) =>
    clockAction.bind(null, snapshot.id, match.id, command);
  const clockForm = (command: string) =>
    clockNavigationAction.bind(null, snapshot.id, match.id, command);
  const canRecord = [
    "live",
    "paused",
    "overtime_live",
    "overtime_paused",
    "regulation_ended",
    "tie_break",
  ].includes(match.state);
  const scoreRuleReached = (match.state === "paused" || match.state === "overtime_paused") &&
    reachedMatchGoalRule(score, snapshot.rules.targetGoals, snapshot.rules.targetGoalDifference);
  return (
    <>
      <Heading
        eyebrow={`Jogo ${match.ordinal}`}
        title="Jogo ao vivo"
        description=""
        sessionId={snapshot.sessionId}
      />
      <Notice success={success} error={error} />
      {match.state === "regulation_ended" && score.yellow === score.red && snapshot.rules.overtimeDurationMs > 0 && (
        <section className="next-match-bar overtime-choice">
          <span><strong>O jogo terminou empatado</strong><small>Jogue a prorrogação ou defina manualmente quem continua.</small></span>
          <form action={clockForm("start_overtime")}><Key /><input type="hidden" name="expectedRevision" value={match.revision} /><button className="button button-secondary">Prorrogação de {snapshot.rules.overtimeDurationMs / 60000} min</button></form>
        </section>
      )}
      {(match.state === "tie_break" || (match.state === "regulation_ended" && snapshot.rules.overtimeDurationMs === 0)) && score.yellow === score.red && (
        <section className="next-match-bar overtime-choice">
          <span><strong>Defina o desempate</strong><small>Confirme a saída dos dois times ou registre quem venceu o desempate.</small></span>
          <TieForm snapshot={snapshot} />
        </section>
      )}
      {match.state === "completed" && waitingSquads.length > 0 && (
        <section className="next-match-bar next-match-primary next-match-sticky">
          <span><strong>Partida encerrada</strong><small>Confira os gols ou encerre o ranka de hoje.</small></span>
          <FastMutationForm className="next-match-form" action={completeMatchAction.bind(null, snapshot.id, match.id, match.revision)}>
            <Key />
            {score.yellow === score.red ? <><select className="select" name="resultOverride" defaultValue=""><option value="">Usar desempate registrado</option><option value="yellow">T{yellow.number} continua</option><option value="red">T{red.number} continua</option>{waitingSquads.filter((squad) => squad.complete).length >= 2 && <option value="both_out">Os dois saem</option>}</select><input type="hidden" name="reason" value="Decisão manual após empate" /></> : <><input type="hidden" name="resultOverride" value="" /><input type="hidden" name="reason" value="" /></>}
            <button className="button button-primary">Próximo jogo</button>
          </FastMutationForm>
        </section>
      )}
      {!["ready", "completed", "cancelled"].includes(match.state) && <section className="next-match-bar next-match-primary"><span><strong>{scoreRuleReached ? "Fim de partida" : "Partida em andamento"}</strong><small>{scoreRuleReached && score.yellow !== score.red ? `T${score.yellow > score.red ? yellow.number : red.number} chegou ao limite de gols.` : ""}</small></span><FinishMatchControl action={finishMatchAction.bind(null, snapshot.id, match.id, match.revision)} ruleReached={scoreRuleReached} revision={match.revision} resume={scoreRuleReached && (match.state === "paused" || match.state === "overtime_paused") ? clock("resume") : undefined} promptKey={`${match.id}:${score.yellow}:${score.red}`} winnerLabel={score.yellow !== score.red ? `T${score.yellow > score.red ? yellow.number : red.number}` : undefined} /></section>}
      <section className="scoreboard">
        <OptimisticMatchClock
          key={`${match.id}:${match.revision}`}
          matchId={match.id}
          revision={match.revision}
          state={match.state}
          startedAtServer={match.startedAtServer}
          elapsedMsBeforeStart={match.elapsedMsBeforeStart}
          durationLimitMs={match.durationLimitMs}
          serverNow={match.serverNow}
          startAction={clock("start")}
          pauseAction={clock("pause")}
          resumeAction={clock("resume")}
          resetAction={clock("reset")}
          finishRegulationAction={clock("finish_regulation")}
          finishOvertimeAction={clock("finish_overtime")}
          adjustAction={adjustMatchClockAction.bind(null, snapshot.id, match.id)}
          showOvertimeOption={score.yellow === score.red && snapshot.rules.overtimeDurationMs > 0}
        />

        <div className="score-sides">
          <div className="score-side">
            <span className="side-label" style={kitStyle(snapshot.kits?.yellow ?? "yellow")}>
              {kitColors[snapshot.kits?.yellow ?? "yellow"].label} · T{yellow?.number}
            </span>
            <OptimisticScore side="yellow" />
            {canRecord && (
              <GoalForm
                side="yellow"
                kit={snapshot.kits?.yellow}
                players={yellowPlayers}
              />
            )}
          </div>
          <div className="score-side">
            <span className="side-label" style={kitStyle(snapshot.kits?.red ?? "red")}>
              {kitColors[snapshot.kits?.red ?? "red"].label} · T{red?.number}
            </span>
            <OptimisticScore side="red" />
            {canRecord && (
              <GoalForm
                side="red"
                kit={snapshot.kits?.red}
                players={redPlayers}
              />
            )}
          </div>
        </div>

        <div className="match-rosters">
          <CompactMatchRoster
            side="yellow"
            title={`T${yellow?.number ?? "-"}`}
            players={yellowPlayers}
            events={match.events}
            changes={changes.filter((change) => change.squadId === yellow.id)}
            sentOff={snapshot.players.filter((player) => ejectedIds.has(player.id) && yellow.playerIds.includes(player.id))}
            cardFor={canCard ? (playerId) => cardForPlayerAction.bind(null, match.id, match.revision, playerId) : undefined}
            replacements={waitingSquads.flatMap((squad) => squad.playerIds.map((id) => ({ id, team: squad.number }))).map((entry) => ({ ...entry, name: snapshot.players.find((player) => player.id === entry.id)?.fullName ?? "Jogador" }))}
            actionFor={(playerId) => manageMatchPlayerAction.bind(null, snapshot.id, snapshot.sessionId!, match.id, yellow.id, playerId, snapshot.revision, match.revision)}
          />
          <CompactMatchRoster
            side="red"
            title={`T${red?.number ?? "-"}`}
            players={redPlayers}
            events={match.events}
            changes={changes.filter((change) => change.squadId === red.id)}
            sentOff={snapshot.players.filter((player) => ejectedIds.has(player.id) && red.playerIds.includes(player.id))}
            cardFor={canCard ? (playerId) => cardForPlayerAction.bind(null, match.id, match.revision, playerId) : undefined}
            replacements={waitingSquads.flatMap((squad) => squad.playerIds.map((id) => ({ id, team: squad.number }))).map((entry) => ({ ...entry, name: snapshot.players.find((player) => player.id === entry.id)?.fullName ?? "Jogador" }))}
            actionFor={(playerId) => manageMatchPlayerAction.bind(null, snapshot.id, snapshot.sessionId!, match.id, red.id, playerId, snapshot.revision, match.revision)}
          />
        </div>
      </section>

      {match.state === "ready" && (
        <section className="panel support-panel" style={{ marginTop: 16 }}>
          <div className="panel-head">
            <div>
              <span className="eyebrow">Escala automática</span>
              <h2 className="panel-title display">Goleiros e gandulas</h2>
            </div>
            <span className="badge">Pronto</span>
          </div>
          {suggestion.warnings.map((warning) => (
            <div className="notice notice-warning" key={warning}>
              {warning}
            </div>
          ))}
          <SupportAssignments
            kitLabels={{ yellow: kitColors[snapshot.kits?.yellow ?? "yellow"].label, red: kitColors[snapshot.kits?.red ?? "red"].label }}
            action={confirmOfficialsAction.bind(
              null,
              snapshot.id,
              match.id,
              match.revision,
            )}
            keepers={keepers.map((player) => ({
              id: player.id,
              name: player.fullName,
            }))}
            ballBoys={ballBoyCandidates.map((player) => ({
              id: player.id,
              name: player.fullName,
            }))}
            defaults={{
              yellow: assignedYellowKeeper ?? suggestion.yellowKeeperId,
              red: assignedRedKeeper ?? suggestion.redKeeperId,
              first: assignedBallBoys[0] ?? ballBoyCandidates[0]?.id,
              second: assignedBallBoys[1] ?? ballBoyCandidates[1]?.id,
            }}
            autoSave={
              match.assignments.filter(
                (assignment) =>
                  assignment.role === "keeper" ||
                  assignment.role === "ball_boy",
              ).length === 0
            }
          />
        </section>
      )}

      <section className="panel all-teams-panel">
        <div className="panel-head">
          <h2 className="panel-title display">Todos os times</h2>
          <span className="badge">{snapshot.squads.length}</span>
        </div>
        <div className="team-table">
          {snapshot.squads
            .toSorted((a, b) => a.number - b.number)
            .map((squad) => {
              const playing = squad.id === yellow.id || squad.id === red.id;
              const next = waitingSquads[0]?.id === squad.id;
              return (
                <div className="team-table-row" key={squad.id}>
                  <div>
                    <b>T{String(squad.number).padStart(2, "0")}</b>
                    <span
                      className={`team-state ${playing ? "playing" : next ? "next" : "waiting"}`}
                    >
                      {playing ? "Jogando" : next ? "Próximo" : "Na espera"}
                    </span>
                  </div>
                  <p>
                    {squad.playerIds
                      .map(
                        (id) =>
                          snapshot.players.find((player) => player.id === id)
                            ?.fullName,
                      )
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {next && (
                    <small>
                      Gandulas:{" "}
                      {ballBoyCandidates
                        .slice(0, 2)
                        .map((player) => player.fullName)
                        .join(" e ") || "a definir"}
                    </small>
                  )}
                </div>
              );
            })}
        </div>
      </section>

      <div className="two-column" style={{ marginTop: 16 }}>
        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title display">Eventos</h2>
            <span className="badge">{timeline.length} registros</span>
          </div>
          {timeline.length ? (
            <div className="event-list">
              {timeline.map((item) => {
                if ("change" in item) return <div className="event" key={item.change.id}><span><strong>⇄ Substituição</strong><small className="event-change"><s>{item.change.outgoing}</s> → {item.change.incoming}{item.at >= 0 ? ` · ${Math.floor(item.at / 60000)}:${String(Math.floor(item.at / 1000) % 60).padStart(2, '0')}` : ""}</small></span></div>;
                const { event } = item;
                return (
                <div key={event.id}>
                <div className="event">
                  <span>
                    <strong>
                      {event.type === "goal"
                        ? `Gol${event.side ? ` · ${kitColors[snapshot.kits?.[event.side] ?? event.side].label}` : ""}`
                        : event.type === "penalty_attempt"
                          ? `Pênalti ${event.penaltyOutcome}`
                          : (event.label ?? "Desempate")}
                    </strong>
                    <small className="muted" style={{ display: "block" }}>
                      {Math.floor(event.occurrenceMs / 60000)}:
                      {String(
                        Math.floor(event.occurrenceMs / 1000) % 60,
                      ).padStart(2, "0")}{" "}
                      · histórico preservado
                    </small>
                  </span>
                  {event.type !== "tie_resolution" && (
                    <form
                      className="cluster"
                      action={voidEventAction.bind(
                        null,
                        snapshot.id,
                        event.id,
                        match.revision,
                      )}
                    >
                      <Key />
                      <input
                        type="hidden"
                        name="reason"
                        value="Correção do mesário"
                      />
                      <button className="button button-danger button-small">
                        Corrigir
                      </button>
                    </form>
                  )}
                </div>
                {event.type === "goal" && <details className="goal-attribution"><summary>Autor e assistência</summary><FastMutationForm action={updateGoalAttributionAction.bind(null, snapshot.id, event.id, match.revision)}><Key /><label>Gol de<select className="select" name="scorer" defaultValue={event.scorerPlayerId ?? ""}><option value="">Não informado</option>{(event.side === "yellow" ? event.goalKind === "own_goal" ? redPlayers : yellowPlayers : event.goalKind === "own_goal" ? yellowPlayers : redPlayers).map((player) => <option key={player.id} value={player.id}>{player.fullName}</option>)}</select></label><label>Assistência<select className="select" name="assist" defaultValue={event.assistPlayerId ?? ""}><option value="">Sem assistência</option>{(event.side === "yellow" ? yellowPlayers : redPlayers).map((player) => <option key={player.id} value={player.id}>{player.fullName}</option>)}</select></label><button className="button button-secondary button-small">Salvar autoria</button></FastMutationForm></details>}
                </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="Sem eventos"
              description="Gols podem ser registrados sem autor."
            />
          )}
        </section>
        <section className="panel">
          <h2 className="panel-title display">Marcos, cartões e pênaltis</h2>
          <FastMutationForm
            className="quick-marker-form"
            action={recordEventAction.bind(
              null,
              match.id,
              match.revision,
            )}
          >
            <Key />
            <input type="hidden" name="eventType" value="marker" />
            <input type="hidden" name="markerKind" value="note" />
            <button className="button button-primary">Marcar agora</button>
            <input
              className="input"
              name="label"
              placeholder="Rótulo opcional"
              maxLength={80}
            />
          </FastMutationForm>
          <details className="event-details">
            <summary>Registrar cartão</summary>
            <FastMutationForm
              className="stack compact-form"
              action={recordEventAction.bind(
                null,
                match.id,
                match.revision,
              )}
            >
              <Key />
              <input type="hidden" name="eventType" value="marker" />
              <input type="hidden" name="markerKind" value="card" />
              <label className="field">
                Jogador
                <select className="select" name="cardPlayerId" required>
                  <PlayerOptions players={fieldPlayers} blank="Selecione" />
                </select>
              </label>
              <div className="two-column-even">
                <label className="field">
                  Cartão
                  <select className="select" name="cardColor">
                    <option value="yellow">Amarelo</option>
                    <option value="red">Vermelho</option>
                    <option value="blue">Azul</option>
                  </select>
                </label>
                <label className="field">
                  Tempo fora (min)
                  <input
                    className="input"
                    type="number"
                    name="cardMinutes"
                    min="0"
                    max="30"
                    defaultValue="2"
                  />
                </label>
              </div>
              <button className="button button-secondary">
                Registrar cartão
              </button>
            </FastMutationForm>
          </details>
          <details className="event-details">
            <summary>Registrar pênalti</summary>
            <FastMutationForm
              className="stack compact-form"
              action={recordEventAction.bind(
                null,
                match.id,
                match.revision,
              )}
            >
              <Key />
              <input type="hidden" name="eventType" value="penalty_attempt" />
              <label className="field">
                Lado
                <select className="select" name="side">
                  <option value="yellow">{kitColors[snapshot.kits?.yellow ?? "yellow"].label}</option>
                  <option value="red">{kitColors[snapshot.kits?.red ?? "red"].label}</option>
                </select>
              </label>
              <label className="field">
                Resultado
                <select className="select" name="penaltyOutcome">
                  <option value="converted">Convertido</option>
                  <option value="missed">Perdido</option>
                  <option value="saved">Defendido</option>
                </select>
              </label>
              <label className="field">
                Cobrador
                <select className="select" name="scorerPlayerId">
                  <PlayerOptions players={fieldPlayers} />
                </select>
              </label>
              <label className="field">
                Goleiro
                <select className="select" name="keeperPlayerId">
                  <PlayerOptions players={keepers} />
                </select>
              </label>
              <button className="button button-secondary">
                Registrar cobrança
              </button>
            </FastMutationForm>
          </details>
        </section>
      </div>

      {editableMarkers.length > 0 && (
        <section className="panel marker-edit-panel">
          <details className="event-details">
            <summary>Editar um marco já registrado</summary>
            <form
              className="stack compact-form"
              action={updateMarkerAction.bind(
                null,
                snapshot.id,
                match.revision,
              )}
            >
              <Key />
              <label className="field">
                Marco
                <select className="select" name="eventId">
                  {editableMarkers.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.label} · {Math.floor(event.occurrenceMs / 60000)}:
                      {String(
                        Math.floor(event.occurrenceMs / 1000) % 60,
                      ).padStart(2, "0")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Novo rótulo
                <input className="input" name="label" required maxLength={80} />
              </label>
              <button className="button button-secondary">Salvar rótulo</button>
            </form>
          </details>
        </section>
      )}
    </>
  );
}

function GoalForm({ side, kit, players }: { side: "yellow" | "red"; kit?: KitColor; players: Player[] }) {
  return <GoalDialog side={side} kit={kit} players={players.map((player) => ({ id: player.id, name: player.fullName }))} />;
}

function CompactMatchRoster({
  side,
  title,
  players,
  events,
  changes,
  sentOff,
  cardFor,
  replacements,
  actionFor,
}: {
  side: "yellow" | "red";
  title: string;
  players: Player[];
  events: MatchEvent[];
  changes: { incomingId: string; outgoingId: string; outgoing: string }[];
  sentOff: Player[];
  cardFor?: (playerId: string) => (formData: FormData) => Promise<import("@/app/app/rankas/[rankaId]/actions").FastMutationResult>;
  replacements: { id: string; name: string; team: number }[];
  actionFor: (playerId: string) => (formData: FormData) => void | Promise<void>;
}) {
  const active = events.filter(
    (event) =>
      event.status === "active" && event.type === "goal" && event.side === side,
  );
  return (
    <section className={`compact-match-roster compact-${side}`}>
      <div className="compact-roster-head">
        <span className={`side-label side-${side}`}>{title}</span>
        <small>{players.length} jogadores</small>
      </div>
      <ul>
        {players.map((player) => {
          const goals = active.filter(
            (event) =>
              event.scorerPlayerId === player.id &&
              event.goalKind !== "own_goal",
          ).length;
          const assists = active.filter(
            (event) => event.assistPlayerId === player.id,
          ).length;
          const changed = changes.findLast((item) => item.incomingId === player.id);
          const cards = events.filter((event) => event.status === "active" && event.card?.playerId === player.id);
          return (
            <li key={player.id}>
              <div className="roster-player-entry"><MatchPlayerManager name={player.fullName} cardAction={cardFor?.(player.id)} returning={changed && replacements.find((candidate) => candidate.id === changed.outgoingId)} replacements={replacements.filter((candidate) => candidate.id !== player.id)} action={actionFor(player.id)} />{changed && <small className="roster-replacement"><span aria-label="Entrou no lugar de">⇄</span> <s>{changed.outgoing}</s></small>}</div>
              <span className="player-event-counts">
                {cards.map((event) => <i key={event.id} className={`match-card ${event.card?.color}`} title={event.label} aria-label={event.label} />)}
                {goals > 0 && (
                  <small title={`${goals} gol(s)`}>⚽ {goals}x</small>
                )}
                {assists > 0 && (
                  <small title={`${assists} assistência(s)`}>
                    👟 {assists}x
                  </small>
                )}
              </span>
            </li>
          );
        })}
        {sentOff.map((player) => <li key={player.id}><s className="muted">{player.fullName}</s><i className="match-card red" title="Expulso" aria-label="Expulso" /></li>)}
      </ul>
    </section>
  );
}

function TieForm({ snapshot }: { snapshot: RankaSnapshot }) {
  const match = snapshot.activeMatch!;
  const fullWaiting = snapshot.squads.filter(
    (squad) =>
      squad.complete &&
      squad.id !== match.yellowSquadId &&
      squad.id !== match.redSquadId,
  ).length;
  return (
    <form
      className="cluster"
      action={resolveTieAction.bind(
        null,
        snapshot.id,
        match.id,
        match.revision,
      )}
    >
      <Key />
      <select
        className="select compact-select"
        name="method"
        defaultValue={preferredTieMethod(fullWaiting, snapshot.rules.tieBothOutWithFour ?? false, snapshot.rules.tieFallback ?? "odd_even")}
      >
        <option value="odd_even">Ímpar ou par</option>
        <option value="penalties">Pênaltis</option>
        {fullWaiting >= 2 && <option value="both_out">Ambos saem</option>}
        <option value="manual">Decisão manual</option>
      </select>
      <select className="select compact-select" name="winnerSquadId">
        <option value="">Sem vencedor</option>
        <option value={match.yellowSquadId}>{kitColors[snapshot.kits?.yellow ?? "yellow"].label}</option>
        <option value={match.redSquadId}>{kitColors[snapshot.kits?.red ?? "red"].label}</option>
      </select>
      <button className="button button-secondary">Registrar desempate</button>
      {fullWaiting < 2 && (
        <small className="muted">
          Saída dupla indisponível: faltam dois times completos na espera.
        </small>
      )}
    </form>
  );
}

function Contributions({
  snapshot,
  success,
  error,
}: {
  snapshot: RankaSnapshot;
  success?: string;
  error?: string;
}) {
  const byPlayer = new Map(
    snapshot.contributions.map((record) => [record.playerId, record]),
  );
  const records = snapshot.attendance.map(
    (entry) =>
      byPlayer.get(entry.playerId) ?? {
        playerId: entry.playerId,
        amountCents: snapshot.contributionAmountCents,
        status: "pending" as const,
      },
  );
  const totals = summarizeContributions(records);
  return (
    <>
      <Heading
        eyebrow=""
        title="Contribuições"
        description="Marque rapidamente quem já contribuiu."
        sessionId={snapshot.sessionId}
      />
      <Notice success={success} error={error} />
      <div className="metric-grid">
        <div className="metric">
          <strong>{totals.paid}</strong>
          <span>pagos</span>
        </div>
        <div className="metric">
          <strong>{totals.pending}</strong>
          <span>pendentes</span>
        </div>
        <div className="metric">
          <strong>{money(totals.receivedCents)}</strong>
          <span>recebidos</span>
        </div>
        <div className="metric">
          <strong>{money(totals.expectedCents)}</strong>
          <span>esperados</span>
        </div>
      </div>
      <section className="panel" style={{ marginTop: 16 }}>
        {snapshot.rankaRevision !== undefined && <KeeperWaiverControl rankaId={snapshot.id} revision={snapshot.rankaRevision} enabled={snapshot.keeperWaiver ?? false} />}
        {snapshot.sessionId ? <ContributionManager key={`${snapshot.sessionId}:${snapshot.revision}:${snapshot.rankaRevision}`}
          rows={snapshot.attendance.map((entry) => {
            const player = snapshot.players.find((item) => item.id === entry.playerId);
            const record = byPlayer.get(entry.playerId);
            const status = record?.status ?? "pending";
            return { id: entry.playerId, name: player?.fullName ?? "Jogador", status, automaticWaiver: snapshot.rules.waiveKeeperContributions && entry.rolePreference === "keeper", detail: status === "paid" ? `Pago · ${money(record?.amountCents ?? snapshot.contributionAmountCents)}` : status === "waived" ? "Isento" : `Pendente · ${money(snapshot.contributionAmountCents)}` };
          })}
          action={batchContributionsAction.bind(null, snapshot.sessionId, snapshot.revision)}
        /> : <p className="muted">As contribuições aparecem após iniciar um dia de futebol.</p>}
      </section>
    </>
  );
}

function Rules({
  snapshot,
  success,
  error,
  canManageTeam,
}: {
  snapshot: RankaSnapshot;
  success?: string;
  error?: string;
  canManageTeam?: boolean;
}) {
  const presentCount = snapshot.attendance.filter(
    (entry) => entry.status === "present",
  ).length;
  const reais = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
  return (
    <>
      <Heading
        eyebrow="Do seu jeito"
        title="Configurações"
        description="Ajuste os limites, o jogo e a contribuição."
        sessionId={snapshot.sessionId}
      />
      <Notice success={success} error={error} />
      {snapshot.rankaRevision !== undefined && <section className="panel kit-settings" id="coletes">
        <h2 className="panel-title display">Coletes em campo</h2>
        <form className="kit-settings-form" action={saveRankaKitsAction.bind(null, snapshot.id, snapshot.rankaRevision)}>
          <Key />
          {(["yellow", "red"] as const).map((side, index) => <label key={side} className="field">Time {index + 1}<select name={side === "yellow" ? "kitYellow" : "kitRed"} className="select" defaultValue={snapshot.kits?.[side] ?? side}>
            {Object.entries(kitColors).map(([value, kit]) => <option key={value} value={value}>{kit.label}</option>)}
          </select></label>)}
          <button className="button button-primary">Salvar coletes</button>
        </form>
      </section>}
      <MatchPushSettings rankaId={snapshot.id} />
      {canManageTeam && <a className="button button-secondary" href="#equipe">Equipe e colaboradores</a>}
      <div className="two-column">
        <section className="panel">
          <div className="between"><h2 className="panel-title display">Regras</h2><a className="button button-secondary button-small" href="#agenda">Agenda</a></div>
          {snapshot.sessionId ? <form
            className="stack compact-form"
            action={updateRulesAction.bind(
              null,
              snapshot.id,
              snapshot.sessionId,
              snapshot.revision,
            )}
          >
            <Key />
            <input type="hidden" name="presentCount" value={presentCount} />
            <div className="three-column">
              <label className="field">
                Jogadores de linha por time (sem goleiro)
                <input className="input" type="number" name="squadSize" min="2" max="12" step="1" defaultValue={snapshot.rules.squadSize} required />
              </label>
              <label className="field">
                Máximo de jogadores de linha
                <input
                  className="input"
                  type="number"
                  name="maxLinePlayers"
                  min="2"
                  max="120"
                  defaultValue={snapshot.rules.maxLinePlayers}
                />
              </label>
              <label className="field">
                Máximo de goleiros
                <input
                  className="input"
                  type="number"
                  name="maxKeepers"
                  min="0"
                  max="20"
                  defaultValue={snapshot.rules.maxKeepers}
                />
              </label>
            </div>
            <div className="three-column">
              <label className="field">
                Duração do jogo (min)
                <input
                  className="input"
                  type="number"
                  name="regulationMinutes"
                  min="1"
                  max="120"
                  defaultValue={snapshot.rules.regulationDurationMs / 60000}
                />
              </label>
              <label className="field">
                Prorrogação (min)
                <input
                  className="input"
                  type="number"
                  name="overtimeMinutes"
                  min="0"
                  max="30"
                  defaultValue={snapshot.rules.overtimeDurationMs / 60000}
                />
              </label>
              <input type="hidden" name="tiePolicy" value="overtime" />
            </div>
            <fieldset className="rule-options">
              <legend>Se o empate continuar após a prorrogação</legend>
              <label className="check-row"><input type="checkbox" name="tieBothOutWithFour" defaultChecked={snapshot.rules.tieBothOutWithFour ?? false} />Com dois times completos na espera, sugerir que os dois times em campo saiam</label>
              <fieldset className="ranking-filter">
                <legend>Nos outros casos</legend>
                <div className="ranking-filter-options">{([["odd_even", "Ímpar ou par"], ["manual", "Decidir na hora"], ["penalties", "Pênaltis"]] as const).map(([value, label]) => <label key={value}><input className="sr-only" type="radio" name="tieFallback" value={value} defaultChecked={(snapshot.rules.tieFallback ?? "odd_even") === value} /><span>{label}</span></label>)}</div>
              </fieldset>
            </fieldset>
            <fieldset className="rule-options">
              <legend>O jogo também pode terminar por</legend>
              <label className="check-row">
                <input
                  type="checkbox"
                  name="enableTargetGoals"
                  defaultChecked={snapshot.rules.targetGoals > 0}
                />
                Gols de um time
                <input
                  className="input mini-number"
                  type="number"
                  name="targetGoals"
                  min="1"
                  max="99"
                  defaultValue={snapshot.rules.targetGoals || 2}
                  aria-label="Gols de um time"
                />
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  name="enableGoalDifference"
                  defaultChecked={snapshot.rules.targetGoalDifference > 0}
                />
                Diferença de gols
                <input
                  className="input mini-number"
                  type="number"
                  name="targetGoalDifference"
                  min="1"
                  max="99"
                  defaultValue={snapshot.rules.targetGoalDifference || 2}
                  aria-label="Diferença de gols"
                />
              </label>
            </fieldset>
            <div className="cost-box">
              <h3>Contribuição</h3>
              <label className="field">
                Como calcular
                <select
                  className="select"
                  name="contributionMode"
                  defaultValue={snapshot.rules.contributionMode}
                >
                  <option value="fixed">Valor por jogador</option>
                  <option value="divide_total">
                    Dividir o valor total entre os presentes
                  </option>
                </select>
              </label>
              <div className="two-column-even">
                <label className="field">
                  Valor por jogador (R$)
                  <input
                    className="input"
                    name="contributionAmount"
                    inputMode="decimal"
                    defaultValue={reais(snapshot.contributionAmountCents)}
                  />
                </label>
                <label className="field">
                  Valor total (R$)
                  <input
                    className="input"
                    name="totalCost"
                    inputMode="decimal"
                    defaultValue={reais(snapshot.rules.totalCostCents)}
                  />
                </label>
              </div>
            </div>
            <button className="button button-primary">Salvar regras</button>
          </form> : <p className="muted">Inicie um dia de futebol para salvar as regras do encontro.</p>}
        </section>
        {snapshot.portal && (
          <section className="panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Compartilhar</span>
                <h2 className="panel-title display">Portal do ranka</h2>
              </div>
            </div>
            <p className="muted">
              Escolha quem pode acompanhar o placar e os times.
            </p>
            <PortalSettingsForm
              action={configurePortalAction.bind(
                null,
                snapshot.id,
                snapshot.portal.slug,
              )}
              currentVisibility={snapshot.portal.visibility}
              publicPath={`/r/${snapshot.portal.slug}`}
            />
          </section>
        )}
      </div>
      <section className="portal-history-note panel" style={{ marginTop: 16 }}>
        <strong>Jogadores no portal</strong>
        <span>Quando o portal estiver ativo, os jogadores do ranka aparecem automaticamente pelo nome esportivo.</span>
      </section>
    </>
  );
}

function Stats({
  snapshot,
  publicSnapshot,
  sessionSummary,
  shareText,
  date,
  finished,
}: {
  finished?: boolean;
  snapshot: RankaSnapshot;
  publicSnapshot?: PublicRankaSnapshot;
  sessionSummary?: SessionSummary;
  shareText?: string;
  date?: string;
}) {
  return (
    <>
      <Heading
        eyebrow=""
        title="Estatísticas"
        description=""
        sessionId={snapshot.sessionId}
      />
      {snapshot.sessionState === "completed" && (finished || !publicSnapshot || publicSnapshot.period === "last") && <section className="panel day-finished-actions">
        <div><h2 className="panel-title display">{finished ? "Ranka encerrado" : "Último encontro"}</h2><p>Compartilhe o resumo e acerte as contribuições do dia.</p></div>
        <div className="cluster">{shareText ? <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer" className="button button-primary">Compartilhar no WhatsApp</a> : <span role="status" className="muted">O resumo para compartilhar está indisponível. Atualize a página para tentar novamente.</span>}<Link className="button button-secondary" href={`/app/rankas/${snapshot.id}/contribuicoes`}>Conferir contribuições</Link></div>
      </section>}
      {sessionSummary && sessionSummary.matches > 0 && <section className="session-summary"><div className="session-summary-head"><span className="eyebrow">Ranka de {snapshot.sessionLabel}</span><h2 className="panel-title display">Resumo do dia</h2><small>{sessionSummary.matches} partida(s)</small></div><div className="session-awards"><article><span>Mais vitórias</span><strong>{sessionSummary.topTeam ? `${sessionSummary.topTeam.label ?? `T${sessionSummary.topTeam.number}`} · ${sessionSummary.topTeam.wins}` : "—"}</strong><small>{sessionSummary.topTeam?.players.join(" · ") ?? "Sem vencedor"}</small></article><article><span>Mais derrotas</span><strong>{sessionSummary.bottomTeam ? `${sessionSummary.bottomTeam.label ?? `T${sessionSummary.bottomTeam.number}`} · ${sessionSummary.bottomTeam.losses}` : "—"}</strong><small>{sessionSummary.bottomTeam?.players.join(" · ") ?? "Sem derrotas"}</small></article><article><span>Artilheiro</span><strong>{sessionSummary.topScorer?.name ?? "—"}</strong><small>{sessionSummary.topScorer ? `${sessionSummary.topScorer.total} gol(s)` : "Sem gols com autoria"}</small></article><article><span>Assistências</span><strong>{sessionSummary.topAssist?.name ?? "—"}</strong><small>{sessionSummary.topAssist ? `${sessionSummary.topAssist.total} assistência(s)` : "Sem assistências"}</small></article><article><span>Goleiro menos vazado</span><strong>{sessionSummary.bestKeeper?.name ?? "—"}</strong><small>{sessionSummary.bestKeeper ? `${sessionSummary.bestKeeper.conceded} gol(s) em ${sessionSummary.bestKeeper.matches} jogo(s)` : "Sem goleiro registrado"}</small></article><article><span>Goleiro mais vazado</span><strong>{sessionSummary.worstKeeper?.name ?? "—"}</strong><small>{sessionSummary.worstKeeper ? `${sessionSummary.worstKeeper.conceded} gol(s) em ${sessionSummary.worstKeeper.matches} jogo(s)` : "Sem goleiro registrado"}</small></article></div></section>}
      {publicSnapshot ? (
        <>
          <nav className="period-tabs">
            <Link
              className={`period-tab ${publicSnapshot.period === "last" ? "active" : ""}`}
              href="?period=last"
            >
              Último ranka
            </Link>
            <Link
              className={`period-tab ${publicSnapshot.period === "month" ? "active" : ""}`}
              href="?period=month"
            >
              Este mês
            </Link>
            <Link
              className={`period-tab ${publicSnapshot.period === "season" ? "active" : ""}`}
              href="?period=season"
            >
              Temporada
            </Link>
            <Link
              className={`period-tab ${publicSnapshot.period === "day" ? "active" : ""}`}
              href={`?period=day&date=${date ?? publicSnapshot.sessionDate ?? ""}`}
            >
              Dia específico
            </Link>
          </nav>
          {publicSnapshot.period === "day" && (
            <form className="date-filter" method="get">
              <input type="hidden" name="period" value="day" />
              <input
                className="input"
                type="date"
                name="date"
                defaultValue={date ?? publicSnapshot.sessionDate}
              />
              <button className="button button-secondary">Aplicar</button>
            </form>
          )}
          <div className="two-column" style={{ marginTop: 16 }}>
            <section className="panel">
              <h2 className="panel-title display">
                Ranking · {publicSnapshot.periodLabel}
              </h2>
              <RankaRanking key={publicSnapshot.period + (date ?? "")} players={publicSnapshot.stats} />
            </section>
            <section className="panel">
              <h2 className="panel-title display">Resultados</h2>
              <RankaResults slug={publicSnapshot.slug} results={publicSnapshot.results} internal />
            </section>
          </div>
        </>
      ) : (
        <section className="panel">
          <EmptyState
            title="Não foi possível derivar os dados"
            description="Atualize a página ou revise a configuração do banco."
          />
        </section>
      )}
    </>
  );
}

function GameHub({ snapshot, success, error, stage, trial }: { snapshot: RankaSnapshot; success?: string; error?: string; stage?: string; trial?: TrialAccess }) {
  if (!snapshot.sessionId) return <section className="session-finished-panel">
    <h1 className="display">Dia de futebol</h1>
    <p>{trial?.ended ? "Seu ranka continua disponível para consulta." : trial && !trial.canStart ? "Já há um dia de futebol registrado nesta conta hoje." : "Inicie o encontro quando estiver pronto para usar o placar e registrar a chegada da turma."}</p>
    {(!trial || trial.canStart) && <form action={startRankaAction.bind(null, snapshot.id)}>{trial && <p className="muted">Ao iniciar, você usa um dia da sua cota de teste.</p>}<button className="button button-primary">Iniciar dia de futebol</button></form>}
  </section>;
  if (snapshot.sessionState === "completed") return <>
    <div className="session-day-strip"><span>Ranka do dia</span><strong>{snapshot.sessionLabel}</strong><em>Encerrado</em></div>
    <section className="session-finished-panel">
      <span className="eyebrow">Dia finalizado</span>
      <h1 className="display">Ranka encerrado</h1>
      <p>As partidas e os eventos deste encontro estão preservados.</p>
      {trial && !trial.ended && !trial.canStart && <p className="muted">O próximo dia de futebol pode ser iniciado em outra data.</p>}
      {(!trial || trial.canStart) && <form action={startRankaAction.bind(null, snapshot.id)}><button className="button button-primary">Iniciar novo ranka</button></form>}
      <Link className="button button-secondary" href={`/app/rankas/${snapshot.id}/historico?dia=${snapshot.sessionId}`}>Ver este encontro</Link>
    </section>
  </>;
  if (trial && !trial.canPlayToday && !snapshot.activeMatch) return <>
    <section className="session-finished-panel"><h1 className="display">Encontro anterior</h1><p>Encerre este encontro para atualizar o histórico.</p></section>
    <FinishDayControl snapshot={snapshot} />
  </>;
  const current = stage === "chegada" || stage === "times" || stage === "partida"
    ? stage
    : snapshot.activeMatch ? "partida" : snapshot.hasPersistedSquads ? "times" : "chegada";
  const base = `/app/rankas/${snapshot.id}/jogo`;
  return <>
    <div className="session-day-strip"><span>Ranka do dia</span><strong>{snapshot.sessionLabel}</strong><em>Em andamento</em></div>
    {snapshot.sessionId && <FinishDayControl snapshot={snapshot} />}
    <CourtShareControl sessionId={snapshot.sessionId} />
    <nav className="game-flow-nav" aria-label="Etapas do jogo">
      <Link className={current === "chegada" ? "active" : ""} href={`${base}?etapa=chegada`}>1. Chegada</Link>
      <Link className={current === "times" ? "active" : ""} href={`${base}?etapa=times`}>2. Times</Link>
      <Link className={current === "partida" ? "active" : ""} href={`${base}?etapa=partida`}>3. Partida</Link>
    </nav>
    {current === "chegada" ? <Arrival snapshot={snapshot} success={success} error={error} /> : current === "times" ? <Teams snapshot={snapshot} success={success} error={error} /> : <MatchConsole snapshot={snapshot} success={success} error={error} />}
  </>;
}

export function RealRankaWorkspace({
  active,
  schedule,
  snapshot,
  success,
  error,
  publicSnapshot,
  sessionSummary,
  shareText,
  statsDate,
  gameStage,
  playerActivity,
  inactivitySettings,
  pending,
  pendingUnavailable,
  playerFilter,
  trial,
  teamTools,
  overview,
  userId,
}: {
  userId: string;
  active: RankaSection;
  schedule: RankaSchedule;
  snapshot: RankaSnapshot;
  success?: string;
  error?: string;
  publicSnapshot?: PublicRankaSnapshot;
  sessionSummary?: SessionSummary;
  shareText?: string;
  statsDate?: string;
  gameStage?: string;
  playerActivity?: PlayerActivity[];
  inactivitySettings?: { months: number; revision: number };
  pending: PendingContribution[];
  pendingUnavailable: boolean;
  playerFilter: PlayerActivityFilter;
  trial?: TrialAccess;
  teamTools?: React.ReactNode;
  overview?: RankaDayOverview;
}) {
  let content: React.ReactNode;
  if (active === "jogadores")
    content = <Players snapshot={snapshot} success={success} error={error} playerActivity={playerActivity} inactivitySettings={inactivitySettings} pending={pending} pendingUnavailable={pendingUnavailable} playerFilter={playerFilter} />;
  else if (active === "jogo" || (["chegada", "times", "partida"].includes(active) && (!snapshot.sessionId || (trial && (snapshot.sessionState === "completed" || (!trial.canPlayToday && !snapshot.activeMatch))))))
    content = <GameHub snapshot={snapshot} success={success} error={error} stage={gameStage} trial={trial} />;
  else if (active === "chegada")
    content = <Arrival snapshot={snapshot} success={success} error={error} />;
  else if (active === "times")
    content = <Teams snapshot={snapshot} success={success} error={error} />;
  else if (active === "partida")
    content = (
      <>{snapshot.sessionState !== "completed" && snapshot.sessionId && <FinishDayControl snapshot={snapshot} />}<MatchConsole snapshot={snapshot} success={success} error={error} /></>
    );
  else if (active === "contribuicoes")
    content = (
      <Contributions snapshot={snapshot} success={success} error={error} />
    );
  else if (active === "configuracoes")
    content = <><Rules snapshot={snapshot} success={success} error={error} canManageTeam={Boolean(teamTools)} />{teamTools}{inactivitySettings && <div className="settings-schedule" id="agenda"><RankaScheduleForm key={inactivitySettings.revision} schedule={schedule} action={saveRankaScheduleAction.bind(null, snapshot.id, inactivitySettings.revision)} requestId={randomUUID()} /></div>}</>;
  else if (active === "inicio") content = <Dashboard snapshot={snapshot} playerActivity={playerActivity} schedule={schedule} trial={trial} error={error} overview={overview} />;
  else
    content = (
      <Stats
        snapshot={snapshot}
        publicSnapshot={publicSnapshot}
        sessionSummary={sessionSummary}
        shareText={shareText}
        date={statsDate}
        finished={success === "ranka_encerrado"}
      />
    );
  const isMatchScreen = active === "partida" || (active === "jogo" && (gameStage === "partida" || (!gameStage && Boolean(snapshot.activeMatch))));
  const yellowTeam = snapshot.activeMatch ? snapshot.squads.find((squad) => squad.id === snapshot.activeMatch?.yellowSquadId)?.number : undefined;
  const redTeam = snapshot.activeMatch ? snapshot.squads.find((squad) => squad.id === snapshot.activeMatch?.redSquadId)?.number : undefined;
  const status = snapshot.sessionState === "completed" || snapshot.activeMatch?.state === "completed" ? undefined : snapshot.activeMatch
    ? <MatchStatusBar href={`/app/rankas/${snapshot.id}/jogo?etapa=partida`} match={snapshot.activeMatch} yellowTeam={yellowTeam} redTeam={redTeam} collapse={isMatchScreen} kits={snapshot.kits} />
    : !isMatchScreen && snapshot.hasPersistedSquads ? <GameStatusBar href={`/app/rankas/${snapshot.id}/jogo?etapa=times`} elapsedMs={0} label="Pré-jogo pronto" /> : undefined;
  const workspace = (
    <AppShell active={active} rankaId={snapshot.id} title={snapshot.name} gameStatus={status} gameNeedsFreshData={Boolean(snapshot.activeMatch)} trial={trial}>
      {snapshot.activeMatch && snapshot.sessionId && snapshot.sessionState !== "completed" && <><RealtimeSessionRefresh sessionId={snapshot.sessionId} /><MatchDeadline match={snapshot.activeMatch} /></>}
      {content}
    </AppShell>
  );
  const match = snapshot.activeMatch;
  return match ? <MatchScoreProvider key={match.id} storagePrefix={`rankae:goals:${userId}:${match.id}:`} record={recordGoalFastAction.bind(null, match.id, match.revision)} clock={match} targetGoals={snapshot.rules.targetGoals} targetDifference={snapshot.rules.targetGoalDifference} initial={projectScore(match.events)} recordedKeys={match.events.flatMap((event) => event.idempotencyKey ? [event.idempotencyKey] : [])}>{workspace}</MatchScoreProvider> : workspace;
}
