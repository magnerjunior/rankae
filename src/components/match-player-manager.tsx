"use client";

import { useRef } from "react";
import { FastMutationForm } from "@/components/fast-mutation-form";
import type { FastMutationResult } from "@/app/app/rankas/[rankaId]/actions";

type Option = { id: string; name: string; team: number };

export function MatchPlayerManager({
  name,
  replacements,
  action,
  cardAction,
  returning,
}: {
  name: string;
  replacements: Option[];
  action: (formData: FormData) => void | Promise<void>;
  cardAction?: (formData: FormData) => Promise<FastMutationResult>;
  returning?: Option;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button className="roster-player-button" type="button" onClick={() => dialog.current?.showModal()}>
        <span>{name}</span><small>Ações</small>
      </button>
      <dialog ref={dialog} className="modal player-manage-modal" onClick={(event) => { if (event.target === dialog.current) dialog.current?.close(); }}>
          <div className="panel-head">
            <div><span className="eyebrow">Jogador</span><h2 className="panel-title display">{name}</h2></div>
            <button className="menu-close" type="button" onClick={() => dialog.current?.close()} aria-label="Fechar">×</button>
          </div>
        {cardAction && <FastMutationForm className="player-card-actions" action={async (form) => {
          form.set("idempotencyKey", crypto.randomUUID());
          const result = await cardAction(form);
          if (result.status === "success") dialog.current?.close();
          return result;
        }}>
          <button className="button button-secondary" name="cardColor" value="yellow"><i className="match-card yellow" aria-hidden /> Cartão amarelo</button>
          <button className="button button-secondary" name="cardColor" value="red"><i className="match-card red" aria-hidden /> Cartão vermelho</button>
        </FastMutationForm>}
        {returning && <form action={action} onSubmit={() => dialog.current?.close()}>
          <input type="hidden" name="incomingPlayerId" value={returning.id} />
          <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
          <button className="button button-secondary" type="submit">Voltar {returning.name} ao campo</button>
        </form>}
        <form className="stack" action={action} onSubmit={() => dialog.current?.close()}>
          <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
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
