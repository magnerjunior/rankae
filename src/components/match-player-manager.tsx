"use client";

import { useRef } from "react";

type Option = { id: string; name: string; team: number };

export function MatchPlayerManager({
  name,
  replacements,
  action,
}: {
  name: string;
  replacements: Option[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button className="roster-player-button" type="button" onClick={() => dialog.current?.showModal()}>
        <span>{name}</span><small>Trocar</small>
      </button>
      <dialog ref={dialog} className="modal player-manage-modal" onClick={(event) => { if (event.target === dialog.current) dialog.current?.close(); }}>
        <form className="stack" action={action} onSubmit={() => dialog.current?.close()}>
          <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
          <div className="panel-head">
            <div><span className="eyebrow">Jogador</span><h2 className="panel-title display">{name}</h2></div>
            <button className="menu-close" type="button" onClick={() => dialog.current?.close()} aria-label="Fechar">×</button>
          </div>
          <label className="field">Quem entra?
            <select className="select" name="incomingPlayerId" defaultValue="">
              <option value="">Sem substituto agora</option>
              {replacements.map((player) => <option key={player.id} value={player.id}>{player.name} · T{player.team}</option>)}
            </select>
          </label>
          <label className="check-row leave-day-option">
            <input type="checkbox" name="markLeft" />
            <span><strong>Saiu do ranka de hoje</strong><small>Remove da presença e não volta à fila neste dia.</small></span>
          </label>
          <div className="modal-actions">
            <button className="button button-secondary" type="button" onClick={() => dialog.current?.close()}>Cancelar</button>
            <button className="button button-primary">Confirmar alteração</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
