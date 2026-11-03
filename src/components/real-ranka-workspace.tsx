import { randomUUID } from "node:crypto";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ContributionManager } from "@/components/contribution-manager";
import { GameStatusBar } from "@/components/game-status-bar";
import { GoalDialog } from "@/components/goal-dialog";
import { ArrivalManager } from "@/components/arrival-manager";
import { EmptyState } from "@/components/feedback";
import { FlashNotice } from "@/components/flash-notice";
import { OptimisticMatchClock } from "@/components/optimistic-match-clock";
import { PlayerCreateForm } from "@/components/player-create-form";
import { SupportAssignments } from "@/components/support-assignments";
import { PortalSettingsForm } from "@/components/portal-settings-form";
import { TeamRoster } from "@/components/ranka-workspace";
import {
  projectScore,
  suggestOfficials,
  summarizeContributions,
} from "@/domain/ranka/rules";
import type { MatchEvent, Player } from "@/domain/ranka/types";
import type { PublicRankaSnapshot } from "@/domain/public-portal/types";
import type { RankaSnapshot, SessionSummary } from "@/data/ports/ranka-repository";
import type { RankaSection } from "@/lib/navigation";
import {
  batchContributionsAction,
  addFastArrivalAction,
  bulkAddArrivalsAction,
  clockAction,
  clockNavigationAction,
  completeMatchAction,
  confirmOfficialsAction,
  createPlayerAction,
  generateSquadsAction,
  finishRankaSessionAction,
  prepareMatchAction,
  recordEventAction,
  resolveTieAction,
  substitutePlayerAction,
  updateRulesAction,
  updateMarkerAction,
  voidEventAction,
  configurePortalAction,
  setPlayerMembershipAction,
  startRankaAction,
  reorderArrivalAction,
  renameArrivalAction,
  removeArrivalAction,
  startGameFromArrivalAction,
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

function Dashboard({ snapshot }: { snapshot: RankaSnapshot }) {
  const present = snapshot.attendance.filter(
    (entry) => entry.status === "present",
  ).length;
  const launch = snapshot.sessionId ? (
    <Link
      className="start-ranka-button"
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
  ) : (
    <form action={startRankaAction.bind(null, snapshot.id)}>
      <button className="start-ranka-button">
        <span>Iniciar ranka</span>
        <b>→</b>
      </button>
    </form>
  );
  return (
    <>
      <Heading
        eyebrow="Hoje"
        title={snapshot.name}
        description={snapshot.sessionLabel}
        sessionId={snapshot.sessionId}
      />
      {launch}
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
      <section className="panel" style={{ marginTop: 16 }}>
        <div className="action-list">
          <Link className="action-row" href={`/app/rankas/${snapshot.id}/jogo`}>
            <span>
              <strong>Jogo de hoje</strong>
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
        </div>
      </section>
    </>
  );
}

function Players({
  snapshot,
  success,
  error,
}: {
  snapshot: RankaSnapshot;
  success?: string;
  error?: string;
}) {
  const action = createPlayerAction.bind(null, snapshot.id, snapshot.orgId!);
  return (
    <>
      <Heading
        eyebrow="Catálogo da organização"
        title="Jogadores"
        description="Organize jogadores fixos e visitantes sem exigir login deles."
        sessionId={snapshot.sessionId}
      />
      <Notice success={success} error={error} />
      <div className="two-column" style={{ marginTop: 16 }}>
        <section className="panel">
          <h2 className="panel-title display">Novo jogador</h2>
          <PlayerCreateForm players={snapshot.players} action={action} />
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title display">Jogadores cadastrados</h2>
            <span className="badge badge-green">{snapshot.players.length}</span>
          </div>
          {snapshot.players.length ? (
            snapshot.players.map((player) => (
              <div className="person-row player-catalog-row" key={player.id}>
                <span className="avatar">
                  {player.fullName
                    .split(" ")
                    .slice(0, 2)
                    .map((part) => part[0])
                    .join("")}
                </span>
                <span className="person-info">
                  <strong>{player.fullName}</strong>
                  <small>
                    {player.role === "keeper" ? "Goleiro" : "Linha"}
                  </small>
                </span>
                <form
                  className="player-membership-form"
                  action={setPlayerMembershipAction.bind(
                    null,
                    snapshot.id,
                    player.id,
                  )}
                >
                  <Key />
                  <select
                    className="select"
                    name="membership"
                    defaultValue={player.membership ?? "regular"}
                    aria-label={`Vínculo de ${player.fullName}`}
                  >
                    <option value="regular">Fixo</option>
                    <option value="guest">Visitante</option>
                  </select>
                  <button className="button button-secondary button-small">
                    Salvar
                  </button>
                </form>
              </div>
            ))
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
      <section className="panel" style={{ marginBottom: 16 }}>
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
            <input type="hidden" name="seed" value="1" />
            <label className="field compact-field">
              Jogadores por time
              <select
                className="select"
                name="squadSize"
                defaultValue={snapshot.rules.squadSize}
              >
                <option value="5">5</option>
                <option value="6">6</option>
                <option value="7">7</option>
              </select>
            </label>
            <label className="field compact-field">
              Como dividir
              <select
                className="select"
                name="method"
                defaultValue="sequential"
              >
                <option value="sequential">Por ordem de chegada</option>
                <option value="shuffle_blocks">Sortear</option>
              </select>
            </label>
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
      </section>
      {snapshot.squads.length ? (
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
      ) : (
        <section className="panel">
          <EmptyState
            title="Ainda sem times"
            description="Adicione as chegadas para começar."
          />
        </section>
      )}
      {snapshot.hasPersistedSquads && (
        <form
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
        </form>
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
            <form
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
            </form>
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
  const yellowPlayers = snapshot.players.filter((player) =>
    yellow?.playerIds.includes(player.id),
  );
  const redPlayers = snapshot.players.filter((player) =>
    red?.playerIds.includes(player.id),
  );
  const fieldPlayers = [...yellowPlayers, ...redPlayers];
  const activeEvents = match.events
    .filter((event) => event.status === "active")
    .toReversed();
  const editableMarkers = activeEvents.filter(
    (event) => event.type === "marker",
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
  const scoreRuleReached =
    (snapshot.rules.targetGoals > 0 &&
      score.yellow + score.red >= snapshot.rules.targetGoals) ||
    (snapshot.rules.targetGoalDifference > 0 &&
      Math.abs(score.yellow - score.red) >=
        snapshot.rules.targetGoalDifference);
  return (
    <>
      <Heading
        eyebrow={`Jogo ${match.ordinal}`}
        title="Jogo ao vivo"
        description=""
        sessionId={snapshot.sessionId}
      />
      <Notice success={success} error={error} />
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
        />
        <div className="score-sides">
          <div className="score-side">
            <span className="side-label side-yellow">
              Amarelo · T{yellow?.number}
            </span>
            <div className="score-number">{score.yellow}</div>
            {canRecord && (
              <GoalForm
                side="yellow"
                players={yellowPlayers}
                action={recordEventAction.bind(
                  null,
                  snapshot.id,
                  match.id,
                  match.revision,
                )}
              />
            )}
          </div>
          <div className="score-side">
            <span className="side-label side-red">
              Vermelho · T{red?.number}
            </span>
            <div className="score-number">{score.red}</div>
            {canRecord && (
              <GoalForm
                side="red"
                players={redPlayers}
                action={recordEventAction.bind(
                  null,
                  snapshot.id,
                  match.id,
                  match.revision,
                )}
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
          />
          <CompactMatchRoster
            side="red"
            title={`T${red?.number ?? "-"}`}
            players={redPlayers}
            events={match.events}
          />
        </div>
      </section>
      {scoreRuleReached && ["live", "paused"].includes(match.state) && (
        <div className="notice" style={{ marginTop: 12 }}>
          A condição configurada de gols/diferença foi alcançada. Revise o
          último evento e confirme o encerramento do tempo normal.
        </div>
      )}

      {match.state === "regulation_ended" && score.yellow === score.red && snapshot.rules.overtimeDurationMs > 0 && (
        <section className="next-match-bar overtime-choice">
          <span><strong>O jogo terminou empatado</strong><small>Jogue a prorrogação ou defina manualmente quem continua.</small></span>
          <form action={clockForm("start_overtime")}><Key /><input type="hidden" name="expectedRevision" value={match.revision} /><button className="button button-secondary">Prorrogação de {snapshot.rules.overtimeDurationMs / 60000} min</button></form>
        </section>
      )}
      {match.state === "tie_break" && score.yellow === score.red && (
        <section className="next-match-bar overtime-choice">
          <span><strong>Defina o desempate</strong><small>Registre o ímpar ou par, pênaltis ou uma decisão manual.</small></span>
          <TieForm snapshot={snapshot} />
        </section>
      )}
      {["regulation_ended", "tie_break"].includes(match.state) && (
        <section className="next-match-bar next-match-primary">
          <span><strong>Partida encerrada</strong><small>Salva o resultado, aplica a rotação e abre o próximo jogo.</small></span>
          <form className="next-match-form" action={completeMatchAction.bind(null, snapshot.id, match.id, match.revision)}>
            <Key />
            {score.yellow === score.red ? <><select className="select" name="resultOverride" defaultValue=""><option value="">{match.state === "tie_break" ? "Usar desempate registrado" : "Quem continua?"}</option><option value="yellow">T{yellow.number} continua</option><option value="red">T{red.number} continua</option>{waitingSquads.length >= 2 && <option value="both_out">Os dois saem</option>}</select><input type="hidden" name="reason" value="Decisão manual após empate" /></> : <><input type="hidden" name="resultOverride" value="" /><input type="hidden" name="reason" value="" /></>}
            <button className="button button-primary">Finalizar e próximo jogo</button>
          </form>
        </section>
      )}

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
            <span className="badge">{activeEvents.length} ativos</span>
          </div>
          {activeEvents.length ? (
            <div className="event-list">
              {activeEvents.map((event) => (
                <div className="event" key={event.id}>
                  <span>
                    <strong>
                      {event.type === "goal"
                        ? `Gol ${event.side === "yellow" ? "amarelo" : "vermelho"}`
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
              ))}
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
          <form
            className="quick-marker-form"
            action={recordEventAction.bind(
              null,
              snapshot.id,
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
          </form>
          <details className="event-details">
            <summary>Registrar cartão</summary>
            <form
              className="stack compact-form"
              action={recordEventAction.bind(
                null,
                snapshot.id,
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
            </form>
          </details>
          <details className="event-details">
            <summary>Registrar pênalti</summary>
            <form
              className="stack compact-form"
              action={recordEventAction.bind(
                null,
                snapshot.id,
                match.id,
                match.revision,
              )}
            >
              <Key />
              <input type="hidden" name="eventType" value="penalty_attempt" />
              <label className="field">
                Lado
                <select className="select" name="side">
                  <option value="yellow">Amarelo</option>
                  <option value="red">Vermelho</option>
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
            </form>
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
      {match.state === "ready" && (
        <section className="end-ranka-zone">
          <details>
            <summary>Encerrar o ranka de hoje</summary>
            <div><p>Use somente quando não haverá outra partida. Os resultados e eventos já registrados serão preservados.</p><form action={finishRankaSessionAction.bind(null, snapshot.id, snapshot.sessionId!, snapshot.revision)}><Key /><button className="button button-danger">Confirmar encerramento do ranka</button></form></div>
          </details>
        </section>
      )}
    </>
  );
}

function GoalForm({
  side,
  players,
  action,
}: {
  side: "yellow" | "red";
  players: Player[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  return <GoalDialog side={side} players={players.map((player) => ({ id: player.id, name: player.fullName }))} action={action} />;
}

function CompactMatchRoster({
  side,
  title,
  players,
  events,
}: {
  side: "yellow" | "red";
  title: string;
  players: Player[];
  events: MatchEvent[];
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
          return (
            <li key={player.id}>
              <span>{player.fullName}</span>
              <span className="player-event-counts">
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
        defaultValue={
          snapshot.rules.tiePolicy === "overtime"
            ? "odd_even"
            : snapshot.rules.tiePolicy
        }
      >
        <option value="odd_even">Ímpar ou par</option>
        <option value="penalties">Pênaltis</option>
        {fullWaiting >= 2 && <option value="both_out">Ambos saem</option>}
        <option value="manual">Decisão manual</option>
      </select>
      <select className="select compact-select" name="winnerSquadId">
        <option value="">Sem vencedor</option>
        <option value={match.yellowSquadId}>Amarelo</option>
        <option value={match.redSquadId}>Vermelho</option>
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
        <ContributionManager
          rows={snapshot.attendance.map((entry) => {
            const player = snapshot.players.find((item) => item.id === entry.playerId);
            const record = byPlayer.get(entry.playerId);
            const status = record?.status ?? "pending";
            return { id: entry.playerId, name: player?.fullName ?? "Jogador", status, detail: status === "paid" ? `Pago · ${money(record?.amountCents ?? snapshot.contributionAmountCents)}` : status === "waived" ? "Isento" : `Pendente · ${money(snapshot.contributionAmountCents)}` };
          })}
          action={batchContributionsAction.bind(null, snapshot.id, snapshot.sessionId!, snapshot.revision)}
        />
      </section>
    </>
  );
}

function Rules({
  snapshot,
  success,
  error,
}: {
  snapshot: RankaSnapshot;
  success?: string;
  error?: string;
}) {
  const presentCount = snapshot.attendance.filter(
    (entry) => entry.status === "present",
  ).length;
  const reais = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
  return (
    <>
      <Heading
        eyebrow="Do seu jeito"
        title="Configurar ranka"
        description="Ajuste os limites, o jogo e a contribuição."
        sessionId={snapshot.sessionId}
      />
      <Notice success={success} error={error} />
      <div className="two-column">
        <section className="panel">
          <h2 className="panel-title display">Regras</h2>
          <form
            className="stack compact-form"
            action={updateRulesAction.bind(
              null,
              snapshot.id,
              snapshot.sessionId!,
              snapshot.revision,
            )}
          >
            <Key />
            <input type="hidden" name="presentCount" value={presentCount} />
            <div className="three-column">
              <label className="field">
                Jogadores por time
                <select
                  className="select"
                  name="squadSize"
                  defaultValue={snapshot.rules.squadSize}
                >
                  <option value="5">5</option>
                  <option value="6">6</option>
                  <option value="7">7</option>
                </select>
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
              <label className="field">
                Se empatar
                <select
                  className="select"
                  name="tiePolicy"
                  defaultValue={snapshot.rules.tiePolicy}
                >
                  <option value="overtime">Prorrogação</option>
                  <option value="both_out">Ambos saem</option>
                  <option value="penalties">Pênaltis</option>
                  <option value="odd_even">Ímpar ou par</option>
                  <option value="manual">Decidir na hora</option>
                </select>
              </label>
            </div>
            <fieldset className="rule-options">
              <legend>O jogo também pode terminar por</legend>
              <label className="check-row">
                <input
                  type="checkbox"
                  name="enableTargetGoals"
                  defaultChecked={snapshot.rules.targetGoals > 0}
                />
                Total de gols
                <input
                  className="input mini-number"
                  type="number"
                  name="targetGoals"
                  min="1"
                  max="99"
                  defaultValue={snapshot.rules.targetGoals || 10}
                  aria-label="Total de gols"
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
          </form>
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
  date,
}: {
  snapshot: RankaSnapshot;
  publicSnapshot?: PublicRankaSnapshot;
  sessionSummary?: SessionSummary;
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
      {sessionSummary && sessionSummary.matches > 0 && <section className="session-summary"><div className="session-summary-head"><span className="eyebrow">Ranka de hoje</span><h2 className="panel-title display">Resumo do dia</h2><small>{sessionSummary.matches} partida(s)</small></div><div className="session-awards"><article><span>Time com mais vitórias</span><strong>{sessionSummary.topTeam ? `T${sessionSummary.topTeam.number} · ${sessionSummary.topTeam.wins}` : "—"}</strong><small>{sessionSummary.topTeam?.players.join(" · ") ?? "Sem vencedor"}</small></article><article><span>Artilheiro</span><strong>{sessionSummary.topScorer?.name ?? "—"}</strong><small>{sessionSummary.topScorer ? `${sessionSummary.topScorer.total} gol(s)` : "Sem gols com autoria"}</small></article><article><span>Assistências</span><strong>{sessionSummary.topAssist?.name ?? "—"}</strong><small>{sessionSummary.topAssist ? `${sessionSummary.topAssist.total} assistência(s)` : "Sem assistências"}</small></article><article><span>Goleiro menos vazado</span><strong>{sessionSummary.bestKeeper?.name ?? "—"}</strong><small>{sessionSummary.bestKeeper ? `${sessionSummary.bestKeeper.conceded} gol(s) sofrido(s) em ${sessionSummary.bestKeeper.matches} jogo(s)` : "Sem goleiro registrado"}</small></article></div></section>}
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
              {publicSnapshot.stats.length ? (
                publicSnapshot.stats.map((player, index) => (
                  <div className="ranking-row" key={player.name}>
                    <span className="ranking-position">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span>
                      <strong>{player.name}</strong>
                      <small>
                        {player.matches} jogos · {player.wins} vitórias ·{" "}
                        {player.assists} assistências
                      </small>
                    </span>
                    <strong>{player.goals} gols</strong>
                  </div>
                ))
              ) : (
                <EmptyState
                  title="Ainda sem estatísticas"
                  description="Elas aparecem após a primeira partida concluída."
                />
              )}
            </section>
            <section className="panel">
              <h2 className="panel-title display">Resultados</h2>
              {publicSnapshot.results.length ? (
                publicSnapshot.results.map((result) => (
                  <div
                    className="result-row"
                    key={`${result.date}-${result.ordinal}`}
                  >
                    <span>
                      <small>
                        {result.date} · J{result.ordinal}
                      </small>
                      <strong>T{result.yellowSquadNumber}</strong>
                    </span>
                    <strong>
                      {result.yellowScore} × {result.redScore}
                    </strong>
                    <span className="right">
                      <small>final</small>
                      <strong>T{result.redSquadNumber}</strong>
                    </span>
                  </div>
                ))
              ) : (
                <EmptyState
                  title="Sem partidas concluídas"
                  description="As partidas concluídas aparecem aqui."
                />
              )}
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

function GameHub({ snapshot, success, error, stage }: { snapshot: RankaSnapshot; success?: string; error?: string; stage?: string }) {
  const current = stage === "chegada" || stage === "times" || stage === "partida"
    ? stage
    : snapshot.activeMatch ? "partida" : snapshot.hasPersistedSquads ? "times" : "chegada";
  const base = `/app/rankas/${snapshot.id}/jogo`;
  return <>
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
  snapshot,
  success,
  error,
  publicSnapshot,
  sessionSummary,
  statsDate,
  gameStage,
}: {
  active: RankaSection;
  snapshot: RankaSnapshot;
  success?: string;
  error?: string;
  publicSnapshot?: PublicRankaSnapshot;
  sessionSummary?: SessionSummary;
  statsDate?: string;
  gameStage?: string;
}) {
  let content: React.ReactNode;
  if (active === "jogadores")
    content = <Players snapshot={snapshot} success={success} error={error} />;
  else if (active === "jogo")
    content = <GameHub snapshot={snapshot} success={success} error={error} stage={gameStage} />;
  else if (active === "chegada")
    content = <Arrival snapshot={snapshot} success={success} error={error} />;
  else if (active === "times")
    content = <Teams snapshot={snapshot} success={success} error={error} />;
  else if (active === "partida")
    content = (
      <MatchConsole snapshot={snapshot} success={success} error={error} />
    );
  else if (active === "contribuicoes")
    content = (
      <Contributions snapshot={snapshot} success={success} error={error} />
    );
  else if (active === "configuracoes")
    content = <Rules snapshot={snapshot} success={success} error={error} />;
  else if (active === "inicio") content = <Dashboard snapshot={snapshot} />;
  else
    content = (
      <Stats
        snapshot={snapshot}
        publicSnapshot={publicSnapshot}
        sessionSummary={sessionSummary}
        date={statsDate}
      />
    );
  const score = snapshot.activeMatch ? projectScore(snapshot.activeMatch.events) : undefined;
  const status = snapshot.activeMatch
    ? <GameStatusBar href={`/app/rankas/${snapshot.id}/jogo?etapa=partida`} state={snapshot.activeMatch.state} score={`${score?.yellow ?? 0} × ${score?.red ?? 0}`} startedAt={snapshot.activeMatch.startedAtServer} elapsedMs={snapshot.activeMatch.elapsedMsBeforeStart} label={`Jogo ${snapshot.activeMatch.ordinal}`} />
    : snapshot.hasPersistedSquads ? <GameStatusBar href={`/app/rankas/${snapshot.id}/jogo?etapa=times`} elapsedMs={0} label="Pré-jogo pronto" /> : undefined;
  return (
    <AppShell active={active} rankaId={snapshot.id} title={snapshot.name} gameStatus={status}>
      {content}
    </AppShell>
  );
}
