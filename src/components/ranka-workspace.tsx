"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { AuditBadge, ConfirmDialog, EmptyState, Toast } from "@/components/feedback";
import { demoAttendance, demoPlayers, demoSnapshot } from "@/data/demo/demo-ranka";
import { groupSquads, suggestOfficials } from "@/domain/ranka/rules";
import type { Attendance, FieldSide, Player, Squad } from "@/domain/ranka/types";
import type { RankaSection } from "@/lib/navigation";

type ContributionStatus = "paid" | "pending" | "waived";
type GoalEvent = { id: number; side: FieldSide; scorer?: string; assist?: string; kind: "normal" | "penalty" | "own_goal"; voided?: boolean };

const initials = (name: string) => name.split(" ").slice(0, 2).map((part) => part[0]).join("");
const playerName = (players: Player[], id?: string) => players.find((player) => player.id === id)?.fullName ?? "A definir";

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <header className="page-heading"><div className="between"><span className="eyebrow">{eyebrow}</span>{action}</div><h1 className="display">{title}</h1><p>{description}</p></header>;
}

export function PlayerAutocomplete({ players, excludedIds = [], onSelect }: { players: Player[]; excludedIds?: string[]; onSelect: (player: Player) => void }) {
  const [query, setQuery] = useState("");
  const matches = query.trim().length > 0 ? players.filter((player) => !excludedIds.includes(player.id) && `${player.fullName} ${player.aliases.join(" ")}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR"))).slice(0, 5) : [];
  return (
    <div className="search-wrap">
      <label className="sr-only" htmlFor="player-search">Buscar jogador</label>
      <input id="player-search" className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Busque por nome ou apelido…" autoComplete="off" />
      {matches.length > 0 && <div className="search-results" role="listbox">{matches.map((player) => <button className="search-option" type="button" key={player.id} onClick={() => { onSelect(player); setQuery(""); }}><span><strong>{player.fullName}</strong><small className="muted" style={{display: "block"}}>{player.aliases.join(" · ")} · {player.role === "keeper" ? "Goleiro" : "Linha"}</small></span><span className="arrow">Adicionar</span></button>)}</div>}
      {query.trim() && matches.length === 0 && <div className="search-results"><div className="notice notice-warning">Nenhum perfil disponível com essa busca.</div></div>}
    </div>
  );
}

export function ArrivalQueue({ attendance, players, onStatus }: { attendance: Attendance[]; players: Player[]; onStatus: (id: string) => void }) {
  const ordered = attendance.toSorted((a, b) => a.arrivalIndex - b.arrivalIndex);
  if (!ordered.length) return <EmptyState title="Fila vazia" description="Adicione a primeira chegada presencial." />;
  return <div>{ordered.map((entry) => { const player = players.find((item) => item.id === entry.playerId); if (!player) return null; return <div className="person-row" key={entry.id}><span className="arrival-index">{String(entry.arrivalIndex).padStart(2, "0")}</span><span className="avatar">{initials(player.fullName)}</span><span className="person-info"><strong>{player.fullName}</strong><small>{player.aliases[0] ?? "Sem apelido"} · {entry.status === "present" ? "Presente" : "Temporariamente fora"}</small></span><button type="button" className="button button-secondary button-small" onClick={() => onStatus(entry.id)}>{entry.status === "present" ? "Pausar" : "Retornar"}</button></div>; })}</div>;
}

export function TeamRoster({ squad, players, side }: { squad: Squad; players: Player[]; side?: FieldSide }) {
  return <article className="squad"><header className="squad-head"><strong>T{String(squad.number).padStart(2, "0")}</strong>{side ? <span className={`side-label side-${side}`}>{side === "yellow" ? "Amarelo" : "Vermelho"}</span> : <span className={`badge ${squad.complete ? "badge-green" : "badge-red"}`}>{squad.complete ? "Completo" : `Faltam ${squad.deficit}`}</span>}</header><ol className="roster">{squad.playerIds.map((id, index) => <li key={id}><span>{index + 1}. {playerName(players, id)}</span><small className="muted">Linha</small></li>)}</ol></article>;
}

export function KeeperAssignment({ players, keeperIds }: { players: Player[]; keeperIds: string[] }) {
  return <div className="official-strip"><div className="official"><small>Goleiro · Amarelo</small><strong>{playerName(players, keeperIds[0])}</strong></div><div className="official"><small>Goleiro · Vermelho</small><strong>{playerName(players, keeperIds[1])}</strong></div></div>;
}

export function BallBoyStrip({ players, ids }: { players: Player[]; ids: string[] }) {
  return <div className="notice"><strong>Gandulas sugeridos:</strong> {ids.length ? ids.map((id) => playerName(players, id)).join(" e ") : "nenhum disponível"}. A função só é confirmada pelo organizador.</div>;
}

export function UpcomingTeamPreview({ squad, players }: { squad?: Squad; players: Player[] }) {
  if (!squad) return <EmptyState title="Sem próximo time completo" description="O organizador pode aguardar mais chegadas ou revisar a formação." />;
  return <div><div className="between"><div><span className="eyebrow">Próximo da fila</span><h3 className="display" style={{fontSize: "2rem", margin: 0}}>T{String(squad.number).padStart(2, "0")}</h3></div><span className="badge badge-green">{squad.playerIds.length} jogadores</span></div><p className="muted">{squad.playerIds.map((id) => playerName(players, id).split(" ")[0]).join(" · ")}</p></div>;
}

function DashboardView({ attendance, squads }: { attendance: Attendance[]; squads: Squad[] }) {
  const present = attendance.filter((entry) => entry.status === "present");
  return <><PageHeading eyebrow="Sessão de hoje" title="Tudo pronto para a bola rolar." description={demoSnapshot.sessionLabel} action={<AuditBadge>Demo ativa</AuditBadge>} /><div className="metric-grid"><div className="metric"><strong>{present.length}</strong><span>presentes confirmados</span></div><div className="metric"><strong>{squads.filter((squad) => squad.complete).length}</strong><span>times completos</span></div><div className="metric"><strong>3</strong><span>goleiros disponíveis</span></div><div className="metric"><strong>R$ 85</strong><span>recebidos em demo</span></div></div><div className="dashboard-grid" style={{marginTop: 16}}><section className="panel"><div className="panel-head"><div><span className="eyebrow">Operação rápida</span><h2 className="panel-title display">Continue de onde parou</h2></div></div><div className="action-list"><ActionLink href="/app/rankas/demo/chegada" title="Registrar chegada" detail="Busca rápida por nome ou apelido" /><ActionLink href="/app/rankas/demo/times" title="Revisar times" detail={`${squads.length} grupos formados pela ordem presencial`} /><ActionLink href="/app/rankas/demo/partida" title="Abrir mesa da partida" detail="Placar demonstrativo e eventos locais" /><ActionLink href="/app/rankas/demo/contribuicoes" title="Conferir contribuições" detail="5 pendências no conjunto demonstrativo" /></div></section><section className="panel"><div className="panel-head"><div><span className="eyebrow">Em campo</span><h2 className="panel-title display">T01 × T02</h2></div><span className="badge">PRÉ-JOGO</span></div><div className="official-strip"><div><span className="side-label side-yellow">Amarelo</span><p><strong>T01</strong><br /><small className="muted">6 de linha</small></p></div><div><span className="side-label side-red">Vermelho</span><p><strong>T02</strong><br /><small className="muted">6 de linha</small></p></div></div><Link className="button button-primary" style={{width: "100%", marginTop: 16}} href="/app/rankas/demo/partida">Revisar pré-jogo</Link></section></div></>;
}

function ActionLink({ href, title, detail }: { href: string; title: string; detail: string }) { return <Link className="action-row" href={href}><span><strong>{title}</strong><small>{detail}</small></span><span className="arrow" aria-hidden="true">→</span></Link>; }

function PlayersView({ players, setPlayers, notify }: { players: Player[]; setPlayers: React.Dispatch<React.SetStateAction<Player[]>>; notify: (message: string) => void }) {
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [fullName, setFullName] = useState("");
  const [alias, setAlias] = useState("");
  const filtered = players.filter((player) => `${player.fullName} ${player.aliases.join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  const createPlayer = () => {
    if (fullName.trim().split(" ").length < 2) { notify("Informe nome e sobrenome para reduzir duplicidades."); return; }
    setPlayers((current) => [...current, { id: `local-${Date.now()}`, fullName: fullName.trim(), aliases: alias.trim() ? [alias.trim()] : [], role: "line" }]);
    setShowForm(false); setFullName(""); setAlias(""); notify("Perfil criado apenas nesta demonstração.");
  };
  return <><PageHeading eyebrow="Catálogo" title="Jogadores e apelidos" description="Perfis canônicos da organização, sem login e sem fotos nesta fase." action={<button className="button button-primary button-small" onClick={() => setShowForm(true)}>Novo jogador</button>} /><section className="panel"><div className="field"><label htmlFor="catalog-search">Buscar no catálogo</label><input id="catalog-search" className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome completo ou apelido" /></div><div style={{marginTop: 14}}>{filtered.length ? filtered.map((player) => <div className="person-row" key={player.id}><span className="avatar">{initials(player.fullName)}</span><span className="person-info"><strong>{player.fullName}</strong><small>{player.aliases.length ? `Também encontrado por ${player.aliases.join(", ")}` : "Sem aliases"}</small></span><span className="badge">{player.role === "keeper" ? "Goleiro" : "Linha"}</span></div>) : <EmptyState title="Nenhum jogador encontrado" description="Revise a busca ou cadastre um novo perfil." />}</div></section>{showForm && <div className="modal-backdrop" onMouseDown={() => setShowForm(false)}><section className="modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><span className="eyebrow">Novo perfil demo</span><h2 className="display">Cadastrar jogador</h2><div className="stack"><div className="field"><label htmlFor="full-name">Nome e sobrenome</label><input id="full-name" className="input" value={fullName} onChange={(event) => setFullName(event.target.value)} /></div><div className="field"><label htmlFor="alias">Apelido opcional</label><input id="alias" className="input" value={alias} onChange={(event) => setAlias(event.target.value)} /></div><div className="notice notice-warning">Antes de salvar, confirme que não é uma variação de um perfil existente.</div></div><div className="modal-actions"><button className="button button-secondary" onClick={() => setShowForm(false)}>Cancelar</button><button className="button button-primary" onClick={createPlayer}>Criar perfil local</button></div></section></div>}</>;
}

function ArrivalView({ players, attendance, setAttendance, notify }: { players: Player[]; attendance: Attendance[]; setAttendance: React.Dispatch<React.SetStateAction<Attendance[]>>; notify: (message: string) => void }) {
  const presentIds = attendance.map((entry) => entry.playerId);
  const add = (player: Player) => { setAttendance((current) => [...current, { id: `local-att-${Date.now()}`, playerId: player.id, arrivalIndex: Math.max(0, ...current.map((item) => item.arrivalIndex)) + 1, status: "present" }]); notify(`${player.fullName} entrou no fim da fila.`); };
  const toggle = (id: string) => { setAttendance((current) => current.map((entry) => entry.id === id ? { ...entry, status: entry.status === "present" ? "temporarily_out" : "present" } : entry)); notify("Status de presença atualizado localmente."); };
  return <><PageHeading eyebrow="Ordem presencial" title="Chegada" description="A posição não é reaproveitada. Somente presentes ficam elegíveis para os times." action={<span className="badge badge-green">{attendance.filter((entry) => entry.status === "present").length} presentes</span>} /><div className="two-column"><section className="panel"><div className="panel-head"><div><span className="eyebrow">Adicionar à fila</span><h2 className="panel-title display">Quem chegou?</h2></div></div><PlayerAutocomplete players={players} excludedIds={presentIds} onSelect={add} /><div style={{marginTop: 18}}><ArrivalQueue attendance={attendance} players={players} onStatus={toggle} /></div></section><aside className="stack"><section className="panel"><span className="eyebrow">Critério ativo</span><h2 className="panel-title display" style={{marginTop: 5}}>Ordem de chegada</h2><p className="muted">Agrupamento sequencial em times de 6 jogadores de linha. Goleiros ficam em uma fila separada.</p></section><div className="notice notice-warning">Alterações desta tela vivem apenas na memória do navegador e somem ao recarregar.</div></aside></div></>;
}

function TeamsView({ players, squads }: { players: Player[]; squads: Squad[] }) {
  const keepers = players.filter((player) => player.role === "keeper").map((player) => player.id);
  const waiting = squads[2]?.playerIds ?? [];
  const officials = suggestOfficials(keepers, waiting);
  return <><PageHeading eyebrow="Formação automática" title="Times e funções" description="A ordem presencial forma os grupos; cor do colete pertence à vaga do campo, não ao time." action={<span className="badge">SEQUENCIAL</span>} /><div className="squad-grid">{squads.map((squad, index) => <TeamRoster key={squad.id} squad={squad} players={players} side={index === 0 ? "yellow" : index === 1 ? "red" : undefined} />)}</div><div className="two-column" style={{marginTop: 16}}><section className="panel"><div className="panel-head"><div><span className="eyebrow">Funções sugeridas</span><h2 className="panel-title display">Goleiros e gandulas</h2></div></div><KeeperAssignment players={players} keeperIds={[officials.yellowKeeperId!, officials.redKeeperId!]} /><div style={{marginTop: 12}}><BallBoyStrip players={players} ids={officials.ballBoyIds} /></div></section><section className="panel"><UpcomingTeamPreview squad={squads.find((squad) => squad.number === 3 && squad.complete)} players={players} /><Link className="button button-primary" href="/app/rankas/demo/partida" style={{width: "100%", marginTop: 12}}>Ir para o pré-jogo</Link></section></div></>;
}

export function TimerDisplay({ elapsed, running }: { elapsed: number; running: boolean }) {
  const minutes = Math.floor(elapsed / 60).toString().padStart(2, "0"); const seconds = (elapsed % 60).toString().padStart(2, "0");
  return <div className="timer-bar"><small>{running ? "PARTIDA DEMO EM ANDAMENTO" : "RELÓGIO DEMONSTRATIVO PAUSADO"}</small><div className="timer">{minutes}:{seconds}</div></div>;
}

export function TeamScorePanel({ side, score, onGoal }: { side: FieldSide; score: number; onGoal: () => void }) {
  return <div className="score-side"><span className={`side-label side-${side}`}>{side === "yellow" ? "Amarelo · T01" : "Vermelho · T02"}</span><div className="score-number">{score}</div><button className={`goal-button goal-${side}`} onClick={onGoal}>+ GOL</button></div>;
}

export function GoalQuickSheet({ side, players, onClose, onSave }: { side: FieldSide; players: Player[]; onClose: () => void; onSave: (event: Omit<GoalEvent, "id">) => void }) {
  const [scorer, setScorer] = useState(""); const [assist, setAssist] = useState(""); const [kind, setKind] = useState<GoalEvent["kind"]>("normal");
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="goal-title" onMouseDown={(event) => event.stopPropagation()}><span className={`side-label side-${side}`}>{side === "yellow" ? "Gol amarelo" : "Gol vermelho"}</span><h2 id="goal-title" className="display">Registrar gol</h2><p className="muted">A autoria é opcional. O placar conta mesmo sem selecionar jogador.</p><div className="stack"><div className="field"><label htmlFor="scorer">Quem marcou? (opcional)</label><select id="scorer" className="select" value={scorer} onChange={(event) => setScorer(event.target.value)}><option value="">Sem autoria</option>{players.map((player) => <option key={player.id} value={player.id}>{player.fullName}</option>)}</select></div><div className="field"><label htmlFor="assist">Assistência (opcional)</label><select id="assist" className="select" value={assist} onChange={(event) => setAssist(event.target.value)}><option value="">Sem assistência</option>{players.filter((player) => player.id !== scorer).map((player) => <option key={player.id} value={player.id}>{player.fullName}</option>)}</select></div><div className="field"><label htmlFor="kind">Tipo</label><select id="kind" className="select" value={kind} onChange={(event) => setKind(event.target.value as GoalEvent["kind"])}><option value="normal">Normal</option><option value="penalty">Pênalti convertido</option><option value="own_goal">Gol contra · lado beneficiado</option></select></div></div><div className="modal-actions"><button className="button button-secondary" onClick={onClose}>Cancelar</button><button className="button button-primary" onClick={() => onSave({side, scorer: scorer || undefined, assist: assist || undefined, kind})}>Salvar evento demo</button></div></section></div>;
}

export function LiveMatchCard({ players, lineups, notify }: { players: Player[]; lineups: Player[]; notify: (message: string) => void }) {
  const [events, setEvents] = useState<GoalEvent[]>([]); const [goalSide, setGoalSide] = useState<FieldSide>(); const [running, setRunning] = useState(false); const [elapsed, setElapsed] = useState(0);
  const score = (side: FieldSide) => events.filter((event) => event.side === side && !event.voided).length;
  const saveGoal = (event: Omit<GoalEvent, "id">) => { setEvents((current) => [...current, {...event, id: Date.now()}]); setGoalSide(undefined); notify("Gol incluído como evento demonstrativo."); };
  const undoLatest = () => { const latest = events.findLast((event) => !event.voided); if (!latest) { notify("Ainda não há gol ativo para corrigir."); return; } setEvents((current) => current.map((event) => event.id === latest.id ? {...event, voided: true} : event)); notify("Evento cancelado; o placar foi recalculado."); };
  const tick = () => { setElapsed((current) => running ? current + 15 : current); setRunning((current) => !current); notify(running ? "Relógio demo pausado." : "Relógio demo iniciado. Use +15s ao alternar para visualizar."); };
  return <><div className="scoreboard"><TimerDisplay elapsed={elapsed} running={running} /><div className="score-sides"><TeamScorePanel side="yellow" score={score("yellow")} onGoal={() => setGoalSide("yellow")} /><TeamScorePanel side="red" score={score("red")} onGoal={() => setGoalSide("red")} /></div><div className="score-actions"><button className="button button-secondary button-small" onClick={tick}>{running ? "Pausar demo" : "Iniciar demo"}</button><button className="button button-quiet button-small" onClick={undoLatest}>Corrigir último gol</button></div></div><section className="panel" style={{marginTop: 16}}><div className="panel-head"><div><span className="eyebrow">Fonte do placar</span><h2 className="panel-title display">Eventos</h2></div><span className="badge">{events.filter((event) => !event.voided).length} ativos</span></div>{events.length ? <div className="event-list">{events.toReversed().map((event) => <div className="event" key={event.id}><span><strong>{event.kind === "own_goal" ? "Gol contra" : event.kind === "penalty" ? "Gol de pênalti" : "Gol"} · {event.side === "yellow" ? "Amarelo" : "Vermelho"}</strong><small className="muted" style={{display: "block"}}>{event.scorer ? playerName(players, event.scorer) : "Sem autoria"}</small></span><span className={`badge ${event.voided ? "badge-red" : "badge-green"}`}>{event.voided ? "Cancelado" : "Válido"}</span></div>)}</div> : <EmptyState title="Nenhum gol registrado" description="Use + GOL para criar um evento e atualizar o placar." />}</section>{goalSide && <GoalQuickSheet side={goalSide} players={lineups} onClose={() => setGoalSide(undefined)} onSave={saveGoal} />}</>;
}

function MatchView({ players, squads, notify }: { players: Player[]; squads: Squad[]; notify: (message: string) => void }) {
  const firstTwo = squads.slice(0,2); const lineupIds = firstTwo.flatMap((squad) => squad.playerIds); const lineups = players.filter((player) => lineupIds.includes(player.id));
  return <><PageHeading eyebrow="Mesa da partida" title="T01 × T02" description="Placar visual local. O cronômetro autoritativo, conflitos e sincronização entram nas fases de backend." action={<span className="badge badge-demo">DEMO VISUAL</span>} /><div className="two-column"><div><LiveMatchCard players={players} lineups={lineups} notify={notify} /></div><aside className="stack"><section className="panel"><div className="panel-head"><div><span className="eyebrow">Pré-jogo</span><h2 className="panel-title display">Escalação revisada</h2></div><AuditBadge>Local</AuditBadge></div>{firstTwo.map((squad, index) => <div className="action-row" key={squad.id}><span><strong>T{String(squad.number).padStart(2,"0")}</strong><small>{squad.playerIds.map((id) => playerName(players,id).split(" ")[0]).slice(0,3).join(", ")} +3</small></span><span className={`side-label side-${index === 0 ? "yellow" : "red"}`}>{index === 0 ? "Amarelo" : "Vermelho"}</span></div>)}</section><section className="panel"><UpcomingTeamPreview squad={squads[2]} players={players} /></section></aside></div></>;
}

export function ContributionBulkBar({ count, onMark }: { count: number; onMark: () => void }) { if (!count) return null; return <div className="bulk-bar"><strong>{count} selecionado{count > 1 ? "s" : ""}</strong><button className="button button-primary button-small" onClick={onMark}>Marcar como pagos</button></div>; }

function ContributionsView({ players, attendance, notify }: { players: Player[]; attendance: Attendance[]; notify: (message: string) => void }) {
  const attending = attendance.map((entry) => players.find((player) => player.id === entry.playerId)).filter(Boolean) as Player[];
  const [statuses, setStatuses] = useState<Record<string, ContributionStatus>>(() => Object.fromEntries(attending.map((player, index) => [player.id, index < 17 ? "paid" : "pending"])));
  const [selected, setSelected] = useState<string[]>([]); const [confirmAll, setConfirmAll] = useState(false);
  const paid = Object.values(statuses).filter((status) => status === "paid").length;
  const markSelected = () => { setStatuses((current) => ({...current, ...Object.fromEntries(selected.map((id) => [id, "paid"]))})); setSelected([]); notify("Contribuições marcadas no modo demo."); };
  return <><PageHeading eyebrow="Controle presencial" title="Contribuições" description="R$ 5,00 por participante nesta sessão demo. Não é cobrança online e não bloqueia o jogo." action={<button className="button button-secondary button-small" onClick={() => setConfirmAll(true)}>Marcar todos</button>} /><div className="metric-grid"><div className="metric"><strong>{paid}</strong><span>pagos</span></div><div className="metric"><strong>{attending.length - paid}</strong><span>pendentes</span></div><div className="metric"><strong>R$ {paid * 5}</strong><span>recebido</span></div><div className="metric"><strong>R$ {attending.length * 5}</strong><span>esperado</span></div></div><section className="panel" style={{marginTop: 16}}>{attending.map((player) => <label className="person-row" key={player.id}><input type="checkbox" checked={selected.includes(player.id)} onChange={() => setSelected((current) => current.includes(player.id) ? current.filter((id) => id !== player.id) : [...current, player.id])} style={{width: 20, height: 20}} /><span className="person-info"><strong>{player.fullName}</strong><small>Valor preservado: R$ 5,00</small></span><span className={`badge ${statuses[player.id] === "paid" ? "badge-green" : "badge-red"}`}>{statuses[player.id] === "paid" ? "Pago" : "Pendente"}</span></label>)}<ContributionBulkBar count={selected.length} onMark={markSelected} /></section><ConfirmDialog open={confirmAll} title="Marcar todos como pagos?" description={`Serão atualizados ${attending.length} participantes, totalizando R$ ${attending.length * 5},00 no modo demonstração.`} confirmLabel="Confirmar lote" onCancel={() => setConfirmAll(false)} onConfirm={() => { setStatuses(Object.fromEntries(attending.map((player) => [player.id, "paid"]))); setConfirmAll(false); notify("Todos foram marcados como pagos na demonstração."); }} /></>;
}

export function StatsPeriodSelector({ value, onChange }: { value: string; onChange: (value: string) => void }) { const periods = ["Último ranka", "Este mês", "Temporada", "Dia específico"]; return <div className="period-tabs" role="tablist" aria-label="Período das estatísticas">{periods.map((period) => <button role="tab" aria-selected={value === period} className={`period-tab ${value === period ? "active" : ""}`} key={period} onClick={() => onChange(period)}>{period}</button>)}</div>; }

function StatsView() {
  const [period, setPeriod] = useState("Último ranka"); const leaders = [["Rafael Almeida", 4, 2, 3],["Gabriel Nunes",3,3,3],["João Vitor",3,1,4],["Matheus Ribeiro",2,2,3],["Vinícius Lopes",2,0,4]];
  return <><PageHeading eyebrow="Desempenho" title="Estatísticas" description="Números fictícios para validar hierarquia visual. Estatísticas reais virão de eventos íntegros." action={<span className="badge badge-demo">DADOS DEMO</span>} /><section className="panel"><StatsPeriodSelector value={period} onChange={setPeriod} /><div className="table-scroll" style={{marginTop: 16}}><table className="data-table"><thead><tr><th>Jogador</th><th>Gols</th><th>Assist.</th><th>Jogos</th></tr></thead><tbody>{leaders.map(([name, goals, assists, games], index) => <tr key={name}><td><strong>{index + 1}. {name}</strong></td><td>{goals}</td><td>{assists}</td><td>{games}</td></tr>)}</tbody></table></div></section><div className="three-column" style={{marginTop: 16}}><div className="panel"><span className="eyebrow">Artilharia</span><h2 className="display" style={{fontSize: "2.2rem", margin: "6px 0"}}>4 gols</h2><span className="muted">Rafael Almeida</span></div><div className="panel"><span className="eyebrow">Mais assistências</span><h2 className="display" style={{fontSize: "2.2rem", margin: "6px 0"}}>3 passes</h2><span className="muted">Gabriel Nunes</span></div><div className="panel"><span className="eyebrow">Goleiro</span><h2 className="display" style={{fontSize: "2.2rem", margin: "6px 0"}}>2 jogos</h2><span className="muted">sem sofrer gol</span></div></div></>;
}

export function RulesEditor({ notify }: { notify: (message: string) => void }) {
  const [overtime, setOvertime] = useState(true); const [blockUnpaid, setBlockUnpaid] = useState(false); const [size, setSize] = useState("6");
  return <section className="panel"><div className="panel-head"><div><span className="eyebrow">Defaults parametrizados</span><h2 className="panel-title display">Regras do ranka</h2></div><AuditBadge>Versão demo</AuditBadge></div><div className="stack"><div className="field"><label htmlFor="squad-size">Jogadores de linha por time</label><select id="squad-size" className="select" value={size} onChange={(event) => setSize(event.target.value)}><option>5</option><option>6</option><option>7</option></select></div><div className="toggle-row"><span><strong>Prorrogação em empate</strong><small className="muted" style={{display: "block"}}>3 minutos antes do critério seguinte</small></span><button className={`toggle ${overtime ? "on" : ""}`} aria-label="Alternar prorrogação" aria-pressed={overtime} onClick={() => setOvertime((current) => !current)} /></div><div className="toggle-row"><span><strong>Bloquear inadimplentes</strong><small className="muted" style={{display: "block"}}>Desligado por padrão; não confunde ausência</small></span><button className={`toggle ${blockUnpaid ? "on" : ""}`} aria-label="Alternar bloqueio" aria-pressed={blockUnpaid} onClick={() => setBlockUnpaid((current) => !current)} /></div><div className="field"><label htmlFor="keeper-mode">Modo dos goleiros</label><select id="keeper-mode" className="select" defaultValue="rotate_on_loss"><option value="fixed_side">Fixos por lado</option><option value="rotate_on_loss">Rodízio no lado perdedor</option><option value="fixed_squad">Fixos por time</option><option value="manual">Manual</option></select></div><button className="button button-primary" onClick={() => notify("Regras salvas apenas no estado local da demonstração.")}>Aplicar na demonstração</button></div></section>;
}

function SettingsView({ notify }: { notify: (message: string) => void }) { return <><PageHeading eyebrow="Configuração" title="Regras" description="Ajustes locais para demonstrar a interface. Persistência, autorização e histórico entram na Fase 1.5+."></PageHeading><div className="two-column"><RulesEditor notify={notify} /><aside className="stack"><section className="panel"><span className="eyebrow">Empate ativo</span><h2 className="panel-title display" style={{marginTop: 5}}>Prorrogação → pênaltis</h2><p className="muted">Com dois times completos esperando, a saída dupla pode ser aplicada após o tempo extra.</p></section><section className="panel"><span className="eyebrow">Privacidade futura</span><h2 className="panel-title display" style={{marginTop: 5}}>Portal não configurado</h2><p className="muted">A projeção pública, token não listado e PIN validado no servidor pertencem às próximas fases.</p></section></aside></div></>;
}

export function RankaWorkspace({ initialSection }: { initialSection: RankaSection }) {
  const [players, setPlayers] = useState<Player[]>(demoPlayers); const [attendance, setAttendance] = useState<Attendance[]>(demoAttendance); const [toast, setToast] = useState<string>();
  const squads = useMemo(() => groupSquads(attendance, players), [attendance, players]);
  const notify = (message: string) => setToast(message);
  let content: React.ReactNode;
  switch (initialSection) {
    case "jogadores": content = <PlayersView players={players} setPlayers={setPlayers} notify={notify} />; break;
    case "chegada": content = <ArrivalView players={players} attendance={attendance} setAttendance={setAttendance} notify={notify} />; break;
    case "times": content = <TeamsView players={players} squads={squads} />; break;
    case "partida": content = <MatchView players={players} squads={squads} notify={notify} />; break;
    case "contribuicoes": content = <ContributionsView players={players} attendance={attendance} notify={notify} />; break;
    case "estatisticas": content = <StatsView />; break;
    case "configuracoes": content = <SettingsView notify={notify} />; break;
    default: content = <DashboardView attendance={attendance} squads={squads} />;
  }
  return <AppShell active={initialSection} demo>{content}<Toast message={toast} onClose={() => setToast(undefined)} /></AppShell>;
}
