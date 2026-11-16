"use client";

import { useRef, useState, type FormEvent } from "react";
import { kitColors, kitStyle, type KitColor } from "@/domain/ranka/kit-colors";
import { useMatchScore } from "@/components/optimistic-score";

type PlayerOption = { id: string; name: string };

export function GoalDialog({ side, kit = side, players }: { side: "yellow" | "red"; kit?: KitColor; players: PlayerOption[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { enqueue, frozenElapsed } = useMatchScore();
  const [scorer, setScorer] = useState("");
  const [message, setMessage] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!enqueue(new FormData(form), side)) {
      setMessage("Aguarde a sincronização ou verifique o armazenamento do aparelho.");
      dialog.current?.close();
      return;
    }
    setScorer("");
    setMessage("");
    form.reset();
    dialog.current?.close();
  }
  return <>
    <button className="goal-button" style={kitStyle(kit)} type="button" disabled={frozenElapsed !== undefined} onClick={() => dialog.current?.showModal()}>+ gol</button>
    {message && <span className="inline-error" role="alert">{message}</span>}
    <dialog ref={dialog} className="modal goal-modal" onClick={(event) => { if (event.target === dialog.current) dialog.current?.close(); }}>
      <form className="stack goal-sheet" onSubmit={submit}>
        <input type="hidden" name="side" value={side} />
        <div className="panel-head"><div><span className="eyebrow">Registrar</span><h2 className="panel-title display">Gol · {kitColors[kit].label}</h2></div><button className="menu-close" type="button" onClick={() => dialog.current?.close()} aria-label="Fechar">×</button></div>
        <label className="field">Tipo<select className="select" name="goalKind"><option value="normal">Normal</option><option value="penalty">Pênalti</option><option value="own_goal">Gol contra</option></select></label>
        <label className="field">Quem marcou?<select className="select" name="scorerPlayerId" value={scorer} onChange={(event) => setScorer(event.target.value)}><option value="">Sem autoria</option>{players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>
        <label className="field">Assistência<select className="select" name="assistPlayerId"><option value="">Sem assistência</option>{players.filter((player) => player.id !== scorer).map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>
        <button className="goal-button" style={kitStyle(kit)}>Confirmar gol</button>
      </form>
    </dialog>
  </>;
}
