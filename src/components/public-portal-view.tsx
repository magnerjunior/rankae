import Link from "next/link";
import { RankaRanking, RankaResults } from "@/components/ranka-results";
import type { PortalPeriod, PublicRankaSnapshot } from "@/domain/public-portal/types";
import type { PublicSessionDate } from "@/domain/public-portal/types";

const periods: Array<{ key: PortalPeriod; label: string }> = [
  { key: "last", label: "Último ranka" }, { key: "month", label: "Este mês" }, { key: "season", label: "Temporada" }, { key: "day", label: "Dia específico" },
];

export function PublicPortalView({ snapshot, date, calendar = [], calendarMonth }: { snapshot: PublicRankaSnapshot; date?: string; calendar?: PublicSessionDate[]; calendarMonth?: string }) {
  const shownMonth = calendarMonth ?? (date ?? snapshot.sessionDate ?? new Date().toISOString().slice(0, 10)).slice(0, 7);
  const [calendarYear, calendarMonthNumber] = shownMonth.split("-").map(Number);
  const monthStart = new Date(Date.UTC(calendarYear, calendarMonthNumber - 1, 1));
  const previousMonth = new Date(Date.UTC(calendarYear, calendarMonthNumber - 2, 1)).toISOString().slice(0, 7);
  const nextMonth = new Date(Date.UTC(calendarYear, calendarMonthNumber, 1)).toISOString().slice(0, 7);
  const monthLength = new Date(Date.UTC(calendarYear, calendarMonthNumber, 0)).getUTCDate();
  const firstWeekday = (monthStart.getUTCDay() + 6) % 7;
  const sessionsByDate = new Map(calendar.map((entry) => [entry.date, entry.count]));
  return <main className="public-portal">
    <header className="portal-header"><Link className="brand" href="/"><span className="brand-mark">R</span><span className="brand-name">Rankaê</span></Link><span className="badge">HISTÓRICO</span></header>
    <section className="portal-hero"><div><span className="eyebrow">Portal do espectador</span><h1 className="display">{snapshot.rankaName}</h1><p>{snapshot.sessionDate ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeZone: "UTC" }).format(new Date(`${snapshot.sessionDate}T12:00:00Z`)) : "Aguardando a próxima sessão"}</p></div></section>
    <section className="portal-section" id="estatisticas"><div className="panel-head"><div><span className="eyebrow">Eventos confirmados</span><h2 className="panel-title display">Rankings e resultados</h2></div><span className="badge">{snapshot.periodLabel}</span></div><nav className="period-tabs" aria-label="Período das estatísticas">{periods.map((item) => <Link className={`period-tab ${snapshot.period === item.key ? "active" : ""}`} key={item.key} href={item.key === "day" ? `?period=day&date=${date ?? snapshot.sessionDate ?? ""}#estatisticas` : `?period=${item.key}#estatisticas`}>{item.label}</Link>)}</nav>{snapshot.period === "day" && <><form className="date-filter" method="get"><input type="hidden" name="period" value="day" /><label className="field">Data da sessão<input className="input" type="date" name="date" defaultValue={date ?? snapshot.sessionDate} /></label><button className="button button-secondary">Aplicar</button></form><section className="history-calendar public-calendar" aria-label="Calendário de rankas"><div className="history-calendar-head"><Link href={`?period=day&date=${date ?? snapshot.sessionDate ?? ""}&month=${previousMonth}#estatisticas`} aria-label="Mês anterior">‹</Link><strong>{new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(monthStart)}</strong><Link href={`?period=day&date=${date ?? snapshot.sessionDate ?? ""}&month=${nextMonth}#estatisticas`} aria-label="Próximo mês">›</Link></div><div className="history-calendar-grid">{["S", "T", "Q", "Q", "S", "S", "D"].map((letter, index) => <b key={`${letter}-${index}`}>{letter}</b>)}{Array.from({ length: firstWeekday }, (_, index) => <i key={`empty-${index}`} />)}{Array.from({ length: monthLength }, (_, index) => { const number = index + 1; const day = `${shownMonth}-${String(number).padStart(2, "0")}`; const count = sessionsByDate.get(day) ?? 0; return count > 0 ? <Link key={day} className={`${date === day ? "selected" : ""} marked`} href={`?period=day&date=${day}&month=${shownMonth}#estatisticas`} aria-label={`${number} de ${shownMonth}: ${count} ranka(s)`}>{number}{count > 1 && <small>{count}</small>}</Link> : <span key={day}>{number}</span>; })}</div><small className="calendar-help">Os dias destacados têm ranka registrado.</small></section></>}
      <div className="portal-stats-grid"><section className="panel"><h3 className="display">Ranking</h3><RankaRanking key={snapshot.period + (date ?? "")} players={snapshot.stats} /></section><section className="panel"><h3 className="display">Resultados</h3><RankaResults slug={snapshot.slug} results={snapshot.results} /></section></div>
    </section>
    <footer className="portal-footer">Dados esportivos mínimos · sem contribuições, e-mails, telefones ou controles administrativos.<br /><Link href="/legal/privacidade">Privacidade</Link> · <Link href="/legal/direitos">Correção e exclusão</Link></footer>
  </main>;
}

