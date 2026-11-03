"use client";

import { useMemo, useState } from "react";
import { findPotentialDuplicates } from "@/domain/ranka/rules";
import type { Player } from "@/domain/ranka/types";

export function PlayerCreateForm({ players, action }: { players: Player[]; action: (formData: FormData) => void | Promise<void> }) {
  const [fullName, setFullName] = useState("");
  const [nickname, setNickname] = useState("");
  const [aliases, setAliases] = useState("");
  const possible = useMemo(() => findPotentialDuplicates(players, fullName, [nickname, ...aliases.split(",")]), [players, fullName, nickname, aliases]);
  return <form className="stack" action={action} style={{marginTop: 18}}>
    <div className="field"><label htmlFor="fullName">Nome e sobrenome</label><input className="input" id="fullName" name="fullName" required minLength={2} value={fullName} onChange={(event) => setFullName(event.target.value)} /></div>
    <div className="field"><label htmlFor="nickname">Apelido</label><input className="input" id="nickname" name="nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} /></div>
    <div className="field"><label htmlFor="aliases">Outros aliases</label><input className="input" id="aliases" name="aliases" placeholder="Separe por vírgulas" value={aliases} onChange={(event) => setAliases(event.target.value)} /></div>
    <div className="field"><label htmlFor="role">Preferência</label><select className="select" id="role" name="role" defaultValue="line"><option value="line">Linha</option><option value="keeper">Goleiro</option><option value="either">Qualquer função</option></select></div>
    {possible.length > 0 && <div className="notice notice-warning"><strong>Possível perfil existente</strong><p>{possible.map((player) => `${player.fullName}${player.aliases[0] ? ` (${player.aliases[0]})` : ""}`).join(", ")}</p><label className="check-row"><input type="checkbox" name="confirmPossibleDuplicate" required /> Confirmo que é outra pessoa e quero criar um perfil separado.</label></div>}
    <button className="button button-primary">Salvar jogador</button>
  </form>;
}
