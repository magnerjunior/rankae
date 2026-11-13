"use client";

import { useState } from "react";
import type { PublicPlayerStat, PublicResult } from "@/domain/public-portal/types";
import { getPublicMatchDetails, type MatchDetails } from "@/app/r/[slug]/match-details";

const metrics = { goals: "Gols", assists: "Assistências", matches: "Jogos", wins: "Vitórias", losses: "Derrotas" } as const;
type Metric = keyof typeof metrics;

export function RankaRanking({ players }: { players: PublicPlayerStat[] }) {
  const [metric, setMetric] = useState<Metric>("goals");
  const [expanded, setExpanded] = useState(false);
  const ranked = players.map((player, id) => ({ player, id })).toSorted((a, b) => b.player[metric] - a.player[metric] || a.player.name.localeCompare(b.player.name, "pt-BR"));
  return <>
    <label className="field ranking-filter">Filtrar ranking por
      <select className="select" value={metric} onChange={(event) => { setMetric(event.target.value as Metric); setExpanded(false); }}>
        {Object.entries(metrics).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
    </label>
    {ranked.length ? ranked.slice(0, expanded ? ranked.length : 10).map(({ player, id }, index) => <div className="ranking-row" key={id}>
      <span className="ranking-position">{index + 1}</span>
      <span><strong>{player.name}</strong><small>{player.matches} jogos · {player.wins} vitórias · {player.losses} derrotas</small></span>
      <strong>{player[metric]} {metrics[metric].toLocaleLowerCase("pt-BR")}</strong>
    </div>) : <p className="muted">Ainda sem estatísticas neste período.</p>}
    {ranked.length > 10 && <button type="button" className="button button-secondary" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "Ver menos" : "Ver mais"}</button>}
  </>;
}

export function RankaResults({ slug, results, internal = false }: { slug: string; results: PublicResult[]; internal?: boolean }) {
  return results.length ? results.map((result, index) => <article className="result-entry" key={result.matchId ?? index}>
    <div className="result-row">
      <span><small>{result.date.split("-").reverse().join("/")} · J{result.ordinal}</small><strong>Amarelo T{result.yellowSquadNumber}</strong></span>
      <strong>{result.yellowScore} × {result.redScore}</strong>
      <span className="right"><small>Final</small><strong>Vermelho T{result.redSquadNumber}</strong></span>
    </div>
    {result.matchId && <MatchDetail slug={slug} matchId={result.matchId} internal={internal} />}
  </article>) : <p className="muted">Nenhum resultado concluído neste período.</p>;
}

function MatchDetail({ slug, matchId, internal }: { slug: string; matchId: string; internal: boolean }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<MatchDetails>();
  return <>
    <button className="button button-secondary button-small" type="button" aria-expanded={open} onClick={async () => {
      setOpen(!open);
      if (open || data || loading) return;
      setLoading(true);
      try { setData(await getPublicMatchDetails(slug, matchId, internal) ?? undefined); } catch { setData(undefined); }
      finally { setLoading(false); }
    }}>{open ? "Fechar detalhes" : "Ver detalhes"}</button>
    {open && <div className="result-details" aria-busy={loading}>
      {loading ? <p role="status">Carregando detalhes…</p> : data ? <>
        <div className="history-rosters">
          <span><strong>Time amarelo</strong>{data.yellow.join(", ") || "Escalação indisponível"}</span>
          <span><strong>Time vermelho</strong>{data.red.join(", ") || "Escalação indisponível"}</span>
        </div>
        <h4>Gols</h4>
        {data.goals.length ? <ul>{data.goals.map((goal, index) => <li key={index}>{Math.floor(goal.ms / 60000)}:{String(Math.floor(goal.ms / 1000) % 60).padStart(2, "0")} · {goal.side === "yellow" ? "Amarelo" : "Vermelho"} · {goal.name ?? "Autoria indisponível"}{goal.kind === "own_goal" ? " (gol contra)" : ""}</li>)}</ul> : <p>Sem gols registrados.</p>}
      </> : <p role="status">Detalhes indisponíveis. Feche e tente novamente.</p>}
    </div>}
  </>;
}
