"use client";

import { useRef, useState } from "react";

type PlayerOption = { id: string; name: string };

export function GoalDialog({ side, players, action }: { side: "yellow" | "red"; players: PlayerOption[]; action: (formData: FormData) => void | Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [scorer, setScorer] = useState("");
  return <>
    <button className={`goal-button goal-${side}`} type="button" onClick={() => dialog.current?.showModal()}>+ gol</button>
    <dialog ref={dialog} className="modal goal-modal" onClick={(event) => { if (event.target === dialog.current) dialog.current?.close(); }}>
      <form className="stack goal-sheet" action={action} onSubmit={() => dialog.current?.close()}>
        <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} /><input type="hidden" name="eventType" value="goal" /><input type="hidden" name="side" value={side} />
        <div className="panel-head"><div><span className="eyebrow">Registrar</span><h2 className="panel-title display">Gol {side === "yellow" ? "amarelo" : "vermelho"}</h2></div><button className="menu-close" type="button" onClick={() => dialog.current?.close()} aria-label="Fechar">×</button></div>
        <label className="field">Tipo<select className="select" name="goalKind"><option value="normal">Normal</option><option value="penalty">Pênalti</option><option value="own_goal">Gol contra</option></select></label>
        <label className="field">Quem marcou?<select className="select" name="scorerPlayerId" value={scorer} onChange={(event) => setScorer(event.target.value)}><option value="">Sem autoria</option>{players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>
        <label className="field">Assistência<select className="select" name="assistPlayerId"><option value="">Sem assistência</option>{players.filter((player) => player.id !== scorer).map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>
        <button className={`goal-button goal-${side}`}>Confirmar gol</button>
      </form>
    </dialog>
  </>;
}
