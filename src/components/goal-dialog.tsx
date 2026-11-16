"use client";

import { useRef, useState, type FormEvent } from "react";
import { kitColors, kitStyle, type KitColor } from "@/domain/ranka/kit-colors";
import { useRouter } from "next/navigation";
import { useMatchScore } from "@/components/optimistic-score";
import type { MatchEventMutationResult } from "@/app/app/rankas/[rankaId]/actions";

type PlayerOption = { id: string; name: string };

export function GoalDialog({ side, kit = side, players, action }: { side: "yellow" | "red"; kit?: KitColor; players: PlayerOption[]; action: (formData: FormData) => Promise<MatchEventMutationResult> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const saving = useRef(false);
  const router = useRouter();
  const { addGoal, rejectGoal } = useMatchScore();
  const [scorer, setScorer] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving.current) return;
    saving.current = true;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const id = crypto.randomUUID();
    formData.set("idempotencyKey", id);
    addGoal(id, side);
    setPending(true);
    setMessage("");
    dialog.current?.close();
    try {
      const result = await action(formData);
      if (result.status === "error") {
        rejectGoal(id);
        setMessage(result.message);
      } else {
        setScorer("");
        form.reset();
        router.refresh();
      }
    } catch {
      rejectGoal(id);
      setMessage("Sem conexão para confirmar o gol. Tente novamente.");
      router.refresh();
    } finally {
      saving.current = false;
      setPending(false);
    }
  };
  return <>
    <button className="goal-button" style={kitStyle(kit)} type="button" disabled={pending} onClick={() => dialog.current?.showModal()}>{pending ? "Salvando…" : "+ gol"}</button>
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
