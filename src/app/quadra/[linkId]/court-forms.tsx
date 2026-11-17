"use client";

import { useActionState } from "react";
import { runCourtCommand, unlockCourtDay } from "./actions";
import { LiveTimer } from "@/components/live-timer";
import type { MatchState } from "@/domain/ranka/types";

export function CourtPinForm({ linkId }: { linkId: string }) {
  const [result, action, pending] = useActionState(unlockCourtDay.bind(null, linkId), {});
  return <form action={action} className="panel stack">
    <label className="field">PIN de quatro dígitos<input name="pin" className="input" type="password" inputMode="numeric" minLength={4} maxLength={4} pattern="[0-9]{4}" required /></label>
    <button className="button button-primary" disabled={pending}>Acessar o jogo</button>
    {result.error && <p role="alert">{result.error}</p>}
  </form>;
}

export type CourtDay = {
  name: string; revision: number;
  arrivals: { id: string; name: string; order: number; role: string }[];
  squads: { id: string; number: number; state: string; players: string[] }[];
  match: { ordinal: number; revision: number; state: MatchState; yellow: number; red: number; startedAt?: string; elapsed: number; duration: number; serverNow: string } | null;
};

export function CourtOperations({ linkId, day }: { linkId: string; day: CourtDay }) {
  const [result, action, pending] = useActionState(runCourtCommand.bind(null, linkId), {});
  const game = day.match;
  return <div className="stack">
    {(result.error || result.message) && <p className="notice" role="status">{result.error ?? result.message}</p>}
    <section className="panel">
      <h2 className="display panel-title">Chegada</h2>
      <form action={action} className="court-arrival-form">
        <input type="hidden" name="command" value="arrival" /><input type="hidden" name="revision" value={day.revision} />
        <label className="field">Nome<input className="input" name="name" required minLength={2} maxLength={120} /></label>
        <label className="field">Posição<select className="select" name="role"><option value="line">Linha</option><option value="keeper">Goleiro</option></select></label>
        <button className="button button-primary" disabled={pending}>Adicionar</button>
      </form>
      <ol className="court-arrivals">{day.arrivals.map((entry, index) => <li key={entry.id}>
        <strong>{entry.name}</strong>{entry.role === "keeper" && <small>Goleiro</small>}
        <form action={action} className="arrival-row-actions">
          <input type="hidden" name="command" value="order" /><input type="hidden" name="revision" value={day.revision} /><input type="hidden" name="player" value={entry.id} />
          <button name="position" value={index} disabled={pending || index === 0} aria-label={`Subir ${entry.name}`}>↑</button>
          <button name="position" value={index + 2} disabled={pending || index === day.arrivals.length - 1} aria-label={`Descer ${entry.name}`}>↓</button>
        </form>
      </li>)}</ol>
    </section>
    <section className="panel">
      <h2 className="display panel-title">Times</h2>
      {!game && <form action={action} className="court-arrival-form">
        <input type="hidden" name="revision" value={day.revision} />
        <label className="field">Divisão<select className="select" name="method">
          <option value="shuffle_blocks">Sortear os dois primeiros times</option><option value="pairs">Sortear em pares</option><option value="all">Sortear todos juntos</option><option value="sequential">Ordem de chegada</option>
        </select></label>
        <button className="button button-secondary" name="command" value="draw" disabled={pending || !day.arrivals.length}>Formar times</button>
        {day.squads.length >= 2 && <button className="button button-primary" name="command" value="prepare" disabled={pending}>Preparar jogo</button>}
      </form>}
      <div className="squad-grid">{day.squads.map((squad) => <article className="squad" key={squad.id}><strong>Time {squad.number}</strong><p>{squad.players.join(" · ") || "Sem jogadores"}</p></article>)}</div>
    </section>
    {game && <section className="panel">
      <h2 className="display panel-title">Jogo {game.ordinal} · {game.yellow} × {game.red}</h2>
      {game.state !== "completed" && <div className="timer-bar"><LiveTimer state={game.state} startedAtServer={game.startedAt} elapsedMsBeforeStart={game.elapsed} durationLimitMs={game.duration} serverNow={game.serverNow} /></div>}
      <form action={action} className="cluster">
        <input type="hidden" name="revision" value={game.revision} />
        {game.state === "ready" && <button className="button button-primary" name="command" value="start" disabled={pending}>Iniciar jogo</button>}
        {["live","overtime_live"].includes(game.state) && <button className="button button-secondary" name="command" value="pause" disabled={pending}>Pausar</button>}
        {["paused","overtime_paused"].includes(game.state) && <button className="button button-secondary" name="command" value="resume" disabled={pending}>Retomar</button>}
        {["live","paused","overtime_live","overtime_paused","regulation_ended","tie_break"].includes(game.state) && <button className="button button-secondary" name="command" value="finish" disabled={pending}>Finalizar partida</button>}
        {game.state === "completed" && <>
          {game.yellow === game.red && <label className="field">Desempate<select className="select" name="outcome">
            <option value="">Usar decisão registrada</option><option value="yellow">Lado 1 venceu</option><option value="red">Lado 2 venceu</option><option value="both_out">Saem os dois times</option>
          </select></label>}
          <button className="button button-primary" name="command" value="next" disabled={pending}>Próximo jogo</button>
        </>}
      </form>
      {["live","overtime_live"].includes(game.state) && <form action={action} className="cluster">
        <input type="hidden" name="revision" value={game.revision} /><input type="hidden" name="command" value="goal" />
        <button className="button button-secondary" name="side" value="yellow" disabled={pending}>Gol lado 1</button>
        <button className="button button-secondary" name="side" value="red" disabled={pending}>Gol lado 2</button>
      </form>}
    </section>}
  </div>;
}
