import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppShell } from "@/components/app-shell";

type Day = { id: string; scheduled_on: string; session_number: number; state: string; created_at: string };
type Person = { id: string; full_name: string };
type Entry = { player_id: string; arrival_index: number; status: string; role_preference: string };
type SquadRow = { id: string; squad_number: number; squad_members: { player_id: string; assignment_order: number; removed_at: string | null }[] };
type Game = { id: string; ordinal: number; yellow_squad_id: string; red_squad_id: string; state: string };
type Event = { match_id: string; event_type: string; side: string | null; scorer_player_id: string | null; assist_player_id: string | null; occurrence_ms: number; status: string; label: string | null; penalty_outcome: string | null };
type Payment = { player_id: string; amount_cents: number; status: string };
type Assignment = { match_id: string; player_id: string; field_side: string | null; role: string; status: string };
type Substitution = { id: string; match_id: string | null; outgoing_player_id: string; incoming_player_id: string };

function dayLabel(date: string) {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}
function encounterLabel(day: Day) {
  return `${dayLabel(day.scheduled_on)}${day.session_number > 1 ? ` · Encontro ${day.session_number}` : ""}`;
}

export async function RankaHistory({ client, rankaId, rankaName, orgId, selectedId, page, month }: { client: SupabaseClient; rankaId: string; rankaName: string; orgId: string; selectedId?: string; page?: string; month?: string }) {
  const pageNumber = /^\d+$/.test(page ?? "") ? Math.min(Number(page), 1000) : 0;
  const offset = pageNumber * 20;
  const { data: rows, error } = await client.from("sessions").select("id,scheduled_on,session_number,state,created_at").eq("ranka_id", rankaId).order("scheduled_on", { ascending: false }).order("session_number", { ascending: false }).range(offset, offset + 20);
  if (error) throw new Error("Não foi possível carregar o histórico.");
  const hasNextPage = (rows ?? []).length > 20;
  const days = ((rows ?? []) as Day[]).slice(0, 20);
  let selected = selectedId ? days.find((day) => day.id === selectedId) : days[0];
  if (selectedId && !selected) {
    const { data: requested, error: requestedError } = await client.from("sessions").select("id,scheduled_on,session_number,state,created_at").eq("ranka_id", rankaId).eq("id", selectedId).maybeSingle();
    if (requestedError) throw new Error("Não foi possível abrir este encontro.");
    selected = requested as Day | undefined;
  }
  const base = `/app/rankas/${rankaId}/historico`;
  if (!selected) return <AppShell active="historico" rankaId={rankaId} title={rankaName}><h1 className="display">Histórico</h1><p>{pageNumber ? "Não há mais encontros nesta página." : "Este ranka ainda não tem encontros registrados."}</p>{pageNumber > 0 && <Link href={`${base}?pagina=${pageNumber - 1}`}>Voltar</Link>}</AppShell>;

  const validMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(month ?? "") ? month! : selected.scheduled_on.slice(0, 7);
  const [year, monthNumber] = validMonth.split("-").map(Number);
  const nextMonthDate = new Date(Date.UTC(year, monthNumber, 1));
  const previousMonthDate = new Date(Date.UTC(year, monthNumber - 2, 1));
  const nextMonth = nextMonthDate.toISOString().slice(0, 7);
  const previousMonth = previousMonthDate.toISOString().slice(0, 7);
  const monthEnd = nextMonthDate.toISOString().slice(0, 10);
  const { data: monthRows, error: monthError } = await client.from("sessions").select("id,scheduled_on,session_number,state,created_at").eq("ranka_id", rankaId).gte("scheduled_on", `${validMonth}-01`).lt("scheduled_on", monthEnd).order("session_number", { ascending: false });
  if (monthError) throw new Error("Não foi possível carregar o calendário.");
  const monthDays = (monthRows ?? []) as Day[];
  if (month && !selectedId && monthDays[0]) selected = monthDays[0];
  const daysByDate = new Map<string, Day[]>();
  for (const day of monthDays) daysByDate.set(day.scheduled_on, [...(daysByDate.get(day.scheduled_on) ?? []), day]);
  const monthLength = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const firstWeekday = (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7;

  const [peopleResult, attendanceResult, squadsResult, matchesResult, paymentsResult, substitutionsResult] = await Promise.all([
    client.from("players").select("id,full_name").eq("org_id", orgId),
    client.from("attendance").select("player_id,arrival_index,status,role_preference").eq("session_id", selected.id).order("arrival_index"),
    client.from("squads").select("id,squad_number,squad_members(player_id,assignment_order,removed_at)").eq("session_id", selected.id).order("squad_number"),
    client.from("matches").select("id,ordinal,yellow_squad_id,red_squad_id,state").eq("session_id", selected.id).order("ordinal"),
    client.from("contribution_records").select("player_id,amount_cents,status").eq("session_id", selected.id),
    client.from("substitutions").select("id,match_id,outgoing_player_id,incoming_player_id").eq("session_id", selected.id),
  ]);
  if (peopleResult.error || attendanceResult.error || squadsResult.error || matchesResult.error || paymentsResult.error || substitutionsResult.error) throw new Error("Não foi possível carregar os detalhes deste dia.");
  const people = new Map(((peopleResult.data ?? []) as Person[]).map((person) => [person.id, person.full_name]));
  const attendance = (attendanceResult.data ?? []) as Entry[];
  const squads = (squadsResult.data ?? []) as SquadRow[];
  const matches = (matchesResult.data ?? []) as Game[];
  const payments = (paymentsResult.data ?? []) as Payment[];
  const substitutions = (substitutionsResult.data ?? []) as Substitution[];
  const [eventResult, assignmentResult] = matches.length ? await Promise.all([
    client.from("match_events").select("match_id,event_type,side,scorer_player_id,assist_player_id,occurrence_ms,status,label,penalty_outcome").in("match_id", matches.map((match) => match.id)).order("occurrence_ms"),
    client.from("match_assignments").select("match_id,player_id,field_side,role,status").in("match_id", matches.map((match) => match.id)),
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  if (eventResult.error || assignmentResult.error) throw new Error("Não foi possível carregar os eventos deste dia.");
  const events = (eventResult.data ?? []) as Event[];
  const assignments = (assignmentResult.data ?? []) as Assignment[];
  const squadName = (id: string) => `T${squads.find((squad) => squad.id === id)?.squad_number ?? "?"}`;
  const name = (id: string) => people.get(id) ?? "Jogador removido";
  const total = payments.reduce((sum, payment) => sum + payment.amount_cents, 0);
  const paid = payments.filter((payment) => payment.status === "paid").reduce((sum, payment) => sum + payment.amount_cents, 0);

  return <AppShell active="historico" rankaId={rankaId} title={rankaName}>
    <header className="page-heading"><span className="eyebrow">Cada encontro registrado</span><h1 className="display">Histórico do ranka</h1></header>
    <section className="history-calendar" aria-label="Calendário de encontros"><div className="history-calendar-head"><Link href={`${base}?mes=${previousMonth}`} aria-label="Mês anterior">‹</Link><strong>{new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, monthNumber - 1, 1)))}</strong><Link href={`${base}?mes=${nextMonth}`} aria-label="Próximo mês">›</Link></div><div className="history-calendar-grid">{["S", "T", "Q", "Q", "S", "S", "D"].map((letter, index) => <b key={`${letter}-${index}`}>{letter}</b>)}{Array.from({ length: firstWeekday }, (_, index) => <i key={`empty-${index}`} />)}{Array.from({ length: monthLength }, (_, index) => { const number = index + 1; const date = `${validMonth}-${String(number).padStart(2, "0")}`; const encounters = daysByDate.get(date) ?? []; return encounters.length ? <Link key={date} className={`${selected.scheduled_on === date ? "selected" : ""} marked`} href={`${base}?mes=${validMonth}&dia=${encounters[0].id}`} aria-label={`${number} de ${validMonth}: ${encounters.length} encontro(s)`}>{number}{encounters.length > 1 && <small>{encounters.length}</small>}</Link> : <span key={date}>{number}</span>; })}</div></section>
    {monthDays.length === 0 && <p className="muted">Nenhum ranka neste mês. Abaixo está o último encontro registrado.</p>}
    <details className="history-date-list"><summary>Ver todos os encontros</summary><nav className="history-days" aria-label="Encontros anteriores">{days.map((day) => <Link key={day.id} className={day.id === selected.id ? "active" : ""} href={`${base}?pagina=${pageNumber}&dia=${day.id}`}>{encounterLabel(day)}{day.state === "completed" ? " · encerrado" : " · em andamento"}</Link>)}<div className="history-pagination">{pageNumber > 0 && <Link href={`${base}?pagina=${pageNumber - 1}`}>Mais recentes</Link>}{hasNextPage && <Link href={`${base}?pagina=${pageNumber + 1}`}>Mais antigos</Link>}</div></nav></details>
    <div className="session-day-strip"><span>Ranka de {encounterLabel(selected)}</span><em>{selected.state === "completed" ? "Encerrado" : "Em andamento"}</em></div>
    <div className="history-metrics"><span><strong>{attendance.filter((entry) => entry.status === "present" || entry.status === "left").length}</strong> chegaram</span><span><strong>{matches.filter((match) => match.state === "completed").length}</strong> jogos concluídos</span><span><strong>{(paid / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong> de {(total / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} registrados</span></div>
    <section className="panel history-panel"><h2 className="panel-title display">Times do encontro</h2><div className="history-squads">{squads.map((squad) => <div key={squad.id}><strong>T{squad.squad_number}</strong><span>{squad.squad_members.toSorted((a, b) => a.assignment_order - b.assignment_order).map((member) => name(member.player_id)).filter((value, index, all) => all.indexOf(value) === index).join(" · ") || "Sem jogadores"}</span></div>)}</div><details className="history-arrivals"><summary>Ver ordem de chegada ({attendance.length})</summary><ol>{attendance.map((entry) => <li key={entry.player_id}>{entry.role_preference === "keeper" ? "GK · " : `${entry.arrival_index} · `}{name(entry.player_id)}</li>)}</ol></details></section>
    <section className="panel history-panel"><h2 className="panel-title display">Partidas e acontecimentos</h2>{matches.length ? matches.map((match) => {
      const actions = events.filter((event) => event.match_id === match.id);
      const score = (side: string) => actions.filter((event) => event.status === "active" && event.side === side && (event.event_type === "goal" || (event.event_type === "penalty_attempt" && event.penalty_outcome === "converted"))).length;
      const roster = (side: string) => assignments.filter((item) => item.match_id === match.id && item.field_side === side && item.status !== "cancelled" && item.role !== "ball_boy").map((item) => `${item.role === "keeper" || item.role === "borrowed_keeper" ? "GK " : ""}${name(item.player_id)}`);
      const changes = substitutions.filter((item) => item.match_id === match.id);
      return <details key={match.id} className="history-match"><summary><strong>Jogo {match.ordinal}</strong><span>{squadName(match.yellow_squad_id)} <b>{score("yellow")} × {score("red")}</b> {squadName(match.red_squad_id)}</span><small>{match.state === "completed" ? "Concluído" : "Não concluído"}</small></summary>
        <div className="history-rosters"><span><strong>Amarelo</strong>{roster("yellow").join(" · ") || "Sem escalação"}</span><span><strong>Vermelho</strong>{roster("red").join(" · ") || "Sem escalação"}</span></div>
        {changes.length > 0 && <p>{changes.map((change) => `${name(change.outgoing_player_id)} → ${name(change.incoming_player_id)}`).join(" · ")}</p>}
        <ul>{actions.map((event, index) => <li key={`${event.match_id}-${index}`}>{Math.floor(event.occurrence_ms / 60000)}:{String(Math.floor(event.occurrence_ms / 1000) % 60).padStart(2, "0")} · {event.event_type === "goal" ? `Gol de ${event.scorer_player_id ? name(event.scorer_player_id) : "autor não informado"}${event.assist_player_id ? `, assistência de ${name(event.assist_player_id)}` : ""}` : event.event_type === "penalty_attempt" ? `Pênalti ${event.penalty_outcome === "converted" ? "convertido" : "não convertido"}` : event.label || "Ocorrência"}{event.status !== "active" ? " · anulado" : ""}</li>)}</ul>
      </details>;
    }) : <p>Nenhuma partida registrada neste dia.</p>}</section>
    <section className="panel history-panel"><h2 className="panel-title display">Contribuições</h2>{payments.length ? <ul className="history-payments">{payments.map((payment) => <li key={payment.player_id}><span>{name(payment.player_id)}</span><span>{(payment.amount_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} · {payment.status === "paid" ? "pago" : payment.status === "waived" ? "dispensado" : "pendente"}</span></li>)}</ul> : <p>Nenhuma contribuição registrada neste encontro.</p>}</section>
    <Link className="button button-secondary" href={`/app/rankas/${rankaId}`}>Voltar ao ranka</Link>
  </AppShell>;
}
