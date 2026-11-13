"use client";

import { useMemo, useState } from "react";
import { findPotentialDuplicates } from "@/domain/ranka/rules";
import type { Player } from "@/domain/ranka/types";

export function PlayerCreateForm({ players, action, requestId }: { players: Player[]; action: (formData: FormData) => void | Promise<void>; requestId: string }) {
  const [fullName, setFullName] = useState("");
  const [nickname, setNickname] = useState("");
  const possible = useMemo(() => findPotentialDuplicates(players, fullName, [nickname]), [players, fullName, nickname]);
  return <form className="stack" action={action} style={{marginTop: 18}}>
    <input type="hidden" name="idempotencyKey" value={requestId} />
    <div className="field"><label htmlFor="fullName">Nome</label><input className="input" id="fullName" name="fullName" required minLength={2} maxLength={120} value={fullName} onChange={(event) => setFullName(event.target.value)} /></div>
    <div className="field"><label htmlFor="nickname">Apelido (opcional)</label><input className="input" id="nickname" name="nickname" maxLength={60} value={nickname} onChange={(event) => setNickname(event.target.value)} /></div>
    <div className="field"><label htmlFor="phone">Telefone (opcional)</label><input className="input" id="phone" name="phone" type="tel" maxLength={25} /></div>
    {possible.length > 0 && <div className="notice notice-warning"><strong>Possível perfil existente</strong><p>{possible.map((player) => `${player.fullName}${player.aliases[0] ? ` (${player.aliases[0]})` : ""}`).join(", ")}</p><label className="check-row"><input type="checkbox" name="confirmPossibleDuplicate" required /> Confirmo que é outra pessoa e quero criar um perfil separado.</label></div>}
    <button className="button button-primary">Salvar jogador</button>
  </form>;
}
