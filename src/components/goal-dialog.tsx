"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SCORE_EVENT } from "@/components/optimistic-score";
import type { MatchEventMutationResult } from "@/app/app/rankas/[rankaId]/actions";

type PlayerOption = { id: string; name: string };

export function GoalDialog({ matchId, side, players, action }: { matchId: string; side: "yellow" | "red"; players: PlayerOption[]; action: (formData: FormData) => Promise<MatchEventMutationResult> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [scorer, setScorer] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const submit = async (formData: FormData) => {
    if (pending) return;
    setPending(true);
    setMessage("");
    dialog.current?.close();
    window.dispatchEvent(new CustomEvent(SCORE_EVENT, { detail: { matchId, side, delta: 1 } }));
    try {
      const result = await action(formData);
      if (result.status === "error") {
        window.dispatchEvent(new CustomEvent(SCORE_EVENT, { detail: { matchId, side, delta: -1 } }));
        setMessage(result.message);
      } else {
        setScorer("");
        router.refresh();
      }
    } catch {
      window.dispatchEvent(new CustomEvent(SCORE_EVENT, { detail: { matchId, side, delta: -1 } }));
      setMessage("Sem conexão para confirmar o gol. Tente novamente.");
    }
    setPending(false);
  };
  return <>
    <button className={`goal-button goal-${side}`} type="button" disabled={pending} onClick={() => dialog.current?.showModal()}>{pending ? "Salvando…" : "+ gol"}</button>
    {message && <span className="inline-error" role="alert">{message}</span>}
    <dialog ref={dialog} className="modal goal-modal" onClick={(event) => { if (event.target === dialog.current) dialog.current?.close(); }}>
      <form className="stack goal-sheet" action={submit}>
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
