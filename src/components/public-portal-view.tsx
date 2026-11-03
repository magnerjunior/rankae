import Link from "next/link";
import { LiveTimer } from "@/components/live-timer";
import { PublicPortalLive } from "@/components/public-portal-live";
import { ShareResult } from "@/components/share-result";
import { buildShareSummary } from "@/domain/public-portal/rules";
import type { PortalPeriod, PublicMatchSide, PublicRankaSnapshot } from "@/domain/public-portal/types";

const periods: Array<{ key: PortalPeriod; label: string }> = [
  { key: "last", label: "Último ranka" }, { key: "month", label: "Este mês" }, { key: "season", label: "Temporada" }, { key: "day", label: "Dia específico" },
];

function sideRoster(title: string, side: PublicMatchSide, color: "yellow" | "red") {
  if (!side) return null;
  return <section className={`portal-side portal-side-${color}`}><span className={`side-label side-${color}`}>{title} · T{side.number}</span><strong className="portal-score">{side.score}</strong><ul>{side.players.map((name, index) => <li key={`${name}-${index}`}>{name}</li>)}</ul></section>;
}

export function PublicPortalView({ snapshot, date }: { snapshot: PublicRankaSnapshot; date?: string }) {
  const match = snapshot.liveMatch;
  return <main className="public-portal">
    <header className="portal-header"><Link className="brand" href="/"><span className="brand-mark">R</span><span className="brand-name">Rankaê</span></Link><PublicPortalLive slug={snapshot.slug} /></header>
    <section className="portal-hero"><div><span className="eyebrow">Portal do espectador</span><h1 className="display">{snapshot.rankaName}</h1><p>{snapshot.sessionDate ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeZone: "UTC" }).format(new Date(`${snapshot.sessionDate}T12:00:00Z`)) : "Aguardando a próxima sessão"}</p></div><span className="badge badge-green">SOMENTE LEITURA</span></section>
    {match ? <section className="portal-scoreboard"><div className="portal-timer"><LiveTimer state={match.state} startedAtServer={match.startedAtServer} elapsedMsBeforeStart={match.elapsedMsBeforeStart} durationLimitMs={match.durationLimitMs} serverNow={snapshot.asOfServer} /><small>Partida {match.ordinal}</small></div><div className="portal-sides">{sideRoster("Amarelo", match.yellow, "yellow")}{sideRoster("Vermelho", match.red, "red")}</div>{(match.keepers.yellow || match.keepers.red || match.ballBoys.length > 0) && <div className="portal-support"><span><strong>Goleiros</strong> {match.keepers.yellow ?? "reservado"} · {match.keepers.red ?? "reservado"}</span>{match.ballBoys.length > 0 && <span><strong>Gandulas</strong> {match.ballBoys.join(" · ")}</span>}</div>}</section> : <section className="panel"><div className="empty"><strong>Nenhuma partida publicada</strong><span>Quando a mesa preparar o jogo, o placar aparecerá aqui.</span></div></section>}
    <section className="portal-section"><div className="panel-head"><div><span className="eyebrow">Fila do campo</span><h2 className="panel-title display">Próximos times</h2></div></div>{snapshot.nextSquads.length ? <div className="portal-next-grid">{snapshot.nextSquads.map((squad) => <article className="squad" key={squad.number}><div className="squad-head"><strong>T{String(squad.number).padStart(2,"0")}</strong><span className="badge">ESPERA</span></div><ol className="roster">{squad.players.map((name, index) => <li key={`${name}-${index}`}><span>{name}</span><small className="muted">{index + 1}</small></li>)}</ol></article>)}</div> : <p className="muted">Sem próximo time confirmado.</p>}</section>
    <section className="portal-section" id="estatisticas"><div className="panel-head"><div><span className="eyebrow">Eventos confirmados</span><h2 className="panel-title display">Rankings e resultados</h2></div><span className="badge">{snapshot.periodLabel}</span></div><nav className="period-tabs" aria-label="Período das estatísticas">{periods.map((item) => <Link className={`period-tab ${snapshot.period === item.key ? "active" : ""}`} key={item.key} href={item.key === "day" ? `?period=day&date=${date ?? snapshot.sessionDate ?? ""}#estatisticas` : `?period=${item.key}#estatisticas`}>{item.label}</Link>)}</nav>{snapshot.period === "day" && <form className="date-filter" method="get"><input type="hidden" name="period" value="day" /><label className="field">Data da sessão<input className="input" type="date" name="date" defaultValue={date ?? snapshot.sessionDate} /></label><button className="button button-secondary">Aplicar</button></form>}
      <div className="portal-stats-grid"><div className="panel"><h3 className="display">Destaques</h3>{snapshot.stats.length ? <div className="ranking-list">{snapshot.stats.map((player, index) => <div className="ranking-row" key={player.name}><span className="ranking-position">{String(index + 1).padStart(2,"0")}</span><span><strong>{player.name}</strong><small>{player.matches} jogos · {player.wins} vitórias · {player.assists} assist.</small></span><strong>{player.goals} gols</strong></div>)}</div> : <p className="muted">Sem autoria pública confirmada neste período.</p>}</div><div className="panel"><h3 className="display">Resultados</h3>{snapshot.results.length ? snapshot.results.map((result) => <div className="result-row" key={`${result.date}-${result.ordinal}`}><span><small>{new Intl.DateTimeFormat("pt-BR").format(new Date(`${result.date}T12:00:00Z`))} · J{result.ordinal}</small><strong>T{result.yellowSquadNumber} Amarelo</strong></span><strong>{result.yellowScore} × {result.redScore}</strong><span className="right"><small>final</small><strong>Vermelho T{result.redSquadNumber}</strong></span></div>) : <p className="muted">Nenhum resultado concluído neste período.</p>}</div></div>
    </section>
    <section className="portal-share"><div><span className="eyebrow">Compartilhamento manual</span><h2 className="display">Leve o placar para o grupo.</h2><p>Você revisa o texto antes de enviar. O Rankaê não lê nem responde mensagens.</p></div><ShareResult text={buildShareSummary(snapshot)} /></section>
    <footer className="portal-footer">Dados esportivos mínimos · sem contribuições, e-mails, telefones ou controles administrativos.</footer>
  </main>;
}

